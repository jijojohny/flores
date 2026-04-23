// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IAgentCreditScore {
    function getTier(uint256 agentId) external view returns (string memory);
    function getTierBorrowLimit(string memory tier) external view returns (uint256);
    function recordRepayment(uint256 agentId, bool onTime) external;
    function recordLiquidation(uint256 agentId, uint256 slashScorePoints) external;
}

interface IIdentityRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @notice USDC pool with utilization-based borrow APR, per-block interest accrual,
/// partial repay (interest first), top-ups, and strike-based liquidation / cooldown.
contract MicroLendingPool is Ownable {

    IERC20             public usdc;
    IAgentCreditScore  public creditScore;
    IIdentityRegistry  public identityRegistry;

    uint256 internal constant WAD = 1e18;
    /// @dev ~12s blocks → ~2.628M blocks/year
    uint256 public blocksPerYear = 2_628_000;

    /// @notice Annual borrow APR at 0% utilization (WAD, e.g. 0.02e18 = 2%).
    uint256 public baseAprWad = 0.02e18;
    /// @notice Added to APR as utilization (WAD) approaches 100%.
    uint256 public slopeAprWad = 0.25e18;
    uint256 public maxAprWad = 0.6e18;

    uint256 public loanDurationBlocks = 50_400;
    /// @notice Slash points passed to AgentCreditScore on each liquidation.
    uint256 public liquidationSlashScorePoints = 120;
    uint256 public maxStrikesBeforeForever = 3;
    uint256 public borrowCooldownBlocks = 5_000;
    /// @notice Per strike, reduce max borrow limit by this many bps (2500 = 25%).
    uint256 public borrowLimitReductionBpsPerStrike = 2_500;
    /// @notice Max cumulative borrow-limit reduction from strikes (bps).
    uint256 public borrowLimitMaxReductionBps = 7_500;

    struct Loan {
        uint256 principal;
        uint256 interestOwed;
        uint256 lastAccrualBlock;
        uint256 issuedBlock;
        uint256 dueBlock;
        bool    active;
    }

    mapping(uint256 => Loan)    public activeLoans;
    mapping(uint256 => uint256) public defaultStrikeCount;
    mapping(uint256 => uint256) public borrowCooldownEndBlock;
    mapping(uint256 => bool)    public borrowFrozenForever;
    mapping(address => uint256) public lenderDeposits;

    uint256 public poolBalance;
    uint256 public totalPrincipalOutstanding;
    uint256 public totalLoansIssued;
    uint256 public totalLoansRepaid;
    uint256 public totalActiveLoans;

    event Deposited(address indexed lender, uint256 amount);
    event Withdrawn(address indexed lender, uint256 amount);
    event LoanIssued(uint256 indexed agentId, uint256 amount, string tier);
    event LoanDrawn(uint256 indexed agentId, uint256 addAmount, uint256 newPrincipal);
    event LoanRepaid(uint256 indexed agentId, uint256 principalPaid, uint256 interestPaid, bool closed, bool onTime);
    event LoanLiquidated(uint256 indexed agentId, uint256 principalLost, uint256 interestForgiven, uint256 strikes);

    constructor(address _usdc, address _creditScore, address _identityRegistry) Ownable(msg.sender) {
        usdc             = IERC20(_usdc);
        creditScore      = IAgentCreditScore(_creditScore);
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    // ─── Owner tuning ─────────────────────────────────────────────

    function setRateParams(uint256 _baseAprWad, uint256 _slopeAprWad, uint256 _maxAprWad) external onlyOwner {
        require(_maxAprWad >= _baseAprWad, "max<base");
        baseAprWad = _baseAprWad;
        slopeAprWad = _slopeAprWad;
        maxAprWad = _maxAprWad;
    }

    function setLoanDuration(uint256 _loanDurationBlocks) external onlyOwner {
        loanDurationBlocks = _loanDurationBlocks;
    }

    function setBlocksPerYear(uint256 _blocksPerYear) external onlyOwner {
        require(_blocksPerYear > 0, "blocksPerYear");
        blocksPerYear = _blocksPerYear;
    }

    function setLiquidationParams(
        uint256 _slashPoints,
        uint256 _maxStrikes,
        uint256 _cooldownBlocks,
        uint256 _reductionBpsPerStrike,
        uint256 _maxReductionBps
    ) external onlyOwner {
        liquidationSlashScorePoints = _slashPoints;
        maxStrikesBeforeForever = _maxStrikes;
        borrowCooldownBlocks = _cooldownBlocks;
        borrowLimitReductionBpsPerStrike = _reductionBpsPerStrike;
        borrowLimitMaxReductionBps = _maxReductionBps;
    }

    // ─── Lender actions ───────────────────────────────────────────

    function deposit(uint256 amount) external {
        usdc.transferFrom(msg.sender, address(this), amount);
        lenderDeposits[msg.sender] += amount;
        poolBalance += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        require(lenderDeposits[msg.sender] >= amount, "Exceeds deposit");
        require(poolBalance >= amount, "Insufficient liquidity");
        lenderDeposits[msg.sender] -= amount;
        poolBalance -= amount;
        usdc.transfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ─── Views ────────────────────────────────────────────────────

    function utilizationWad() public view returns (uint256) {
        uint256 assets = poolBalance + totalPrincipalOutstanding;
        if (assets == 0) return 0;
        return totalPrincipalOutstanding * WAD / assets;
    }

    function currentBorrowAprWad() public view returns (uint256) {
        uint256 u = utilizationWad();
        uint256 apr = baseAprWad + (u * slopeAprWad / WAD);
        if (apr > maxAprWad) apr = maxAprWad;
        return apr;
    }

    function getEffectiveBorrowLimitBps(uint256 agentId) public view returns (uint256) {
        if (borrowFrozenForever[agentId]) return 0;
        uint256 strikes = defaultStrikeCount[agentId];
        uint256 reduction = strikes * borrowLimitReductionBpsPerStrike;
        if (reduction > borrowLimitMaxReductionBps) reduction = borrowLimitMaxReductionBps;
        return 10_000 - reduction;
    }

    function _accrue(Loan storage loan) internal {
        if (!loan.active || loan.principal == 0) {
            loan.lastAccrualBlock = block.number;
            return;
        }
        uint256 dt = block.number - loan.lastAccrualBlock;
        if (dt == 0) return;
        uint256 apr = currentBorrowAprWad();
        loan.interestOwed += (loan.principal * apr * dt) / (WAD * blocksPerYear);
        loan.lastAccrualBlock = block.number;
    }

    function totalDebt(uint256 agentId) public view returns (uint256 principal, uint256 interest, uint256 total) {
        Loan memory l = activeLoans[agentId];
        if (!l.active) return (0, 0, 0);
        uint256 intr = l.interestOwed;
        if (l.principal > 0 && block.number > l.lastAccrualBlock) {
            uint256 dt = block.number - l.lastAccrualBlock;
            uint256 apr = currentBorrowAprWad();
            intr += (l.principal * apr * dt) / (WAD * blocksPerYear);
        }
        return (l.principal, intr, l.principal + intr);
    }

    function getPoolStats() external view returns (
        uint256 balance,
        uint256 issued,
        uint256 repaid,
        uint256 active
    ) {
        return (poolBalance, totalLoansIssued, totalLoansRepaid, totalActiveLoans);
    }

    function getLoan(uint256 agentId) external view returns (Loan memory) {
        return activeLoans[agentId];
    }

    /// @dev Backward-compatible name: true if permanently frozen after max strikes.
    function hasDefaulted(uint256 agentId) external view returns (bool) {
        return borrowFrozenForever[agentId];
    }

    // ─── Borrowing ────────────────────────────────────────────────

    function _requireBorrowAllowed(uint256 agentId) internal view {
        require(!borrowFrozenForever[agentId], "Borrowing frozen");
        require(block.number >= borrowCooldownEndBlock[agentId], "In borrow cooldown");
    }

    function _tierBorrowCap(uint256 agentId) internal view returns (uint256) {
        string memory tier = creditScore.getTier(agentId);
        uint256 lim = creditScore.getTierBorrowLimit(tier);
        require(lim > 0, "Tier D: no credit available");
        uint256 bps = getEffectiveBorrowLimitBps(agentId);
        return lim * bps / 10_000;
    }

    /// @notice Open a new loan (no active loan).
    function requestLoan(uint256 agentId, uint256 amount) external {
        require(identityRegistry.ownerOf(agentId) == msg.sender, "Not agent owner");
        _requireBorrowAllowed(agentId);
        require(!activeLoans[agentId].active, "Active loan already exists");

        uint256 cap = _tierBorrowCap(agentId);
        require(amount <= cap, "Amount exceeds tier limit");
        require(amount <= poolBalance, "Insufficient pool liquidity");

        poolBalance -= amount;
        totalPrincipalOutstanding += amount;
        totalLoansIssued++;
        totalActiveLoans++;

        string memory tier = creditScore.getTier(agentId);
        activeLoans[agentId] = Loan({
            principal:          amount,
            interestOwed:       0,
            lastAccrualBlock:   block.number,
            issuedBlock:        block.number,
            dueBlock:           block.number + loanDurationBlocks,
            active:             true
        });

        usdc.transfer(msg.sender, amount);
        emit LoanIssued(agentId, amount, tier);
    }

    /// @notice Increase principal on an existing loan (before due).
    function drawMore(uint256 agentId, uint256 amount) external {
        require(identityRegistry.ownerOf(agentId) == msg.sender, "Not agent owner");
        Loan storage loan = activeLoans[agentId];
        require(loan.active, "No active loan");
        require(block.number <= loan.dueBlock, "Past due: repay or await liquidation");

        _accrue(loan);

        uint256 cap = _tierBorrowCap(agentId);
        require(loan.principal + amount <= cap, "Exceeds tier limit");
        require(amount <= poolBalance, "Insufficient pool liquidity");

        poolBalance -= amount;
        totalPrincipalOutstanding += amount;
        loan.principal += amount;

        usdc.transfer(msg.sender, amount);
        emit LoanDrawn(agentId, amount, loan.principal);
    }

    // ─── Repay (partial allowed; interest first) ─────────────────

    /// @param maxPayment 0 = settle entire debt (principal + accrued interest).
    function repayLoan(uint256 agentId, uint256 maxPayment) external {
        Loan storage loan = activeLoans[agentId];
        require(loan.active, "No active loan");
        require(identityRegistry.ownerOf(agentId) == msg.sender, "Not agent owner");

        _accrue(loan);

        uint256 interest = loan.interestOwed;
        uint256 principal = loan.principal;
        uint256 debt = interest + principal;
        require(debt > 0, "Nothing owed");

        uint256 pay = maxPayment == 0 ? debt : maxPayment;
        require(pay <= debt, "Overpay");
        require(pay > 0, "Zero pay");

        usdc.transferFrom(msg.sender, address(this), pay);

        uint256 toInterest = pay <= interest ? pay : interest;
        uint256 toPrincipal = pay - toInterest;

        loan.interestOwed = interest - toInterest;
        loan.principal = principal - toPrincipal;
        poolBalance += pay;
        totalPrincipalOutstanding -= toPrincipal;

        bool closed = (loan.principal == 0 && loan.interestOwed == 0);
        bool onTime = block.number <= loan.dueBlock;

        if (closed) {
            totalLoansRepaid++;
            totalActiveLoans--;
            delete activeLoans[agentId];
            creditScore.recordRepayment(agentId, onTime);
        }

        emit LoanRepaid(agentId, toPrincipal, toInterest, closed, onTime);
    }

    // ─── Liquidation / default ────────────────────────────────────

    /// @notice After dueBlock: write off debt, slash credit, strikes & cooldown (or permanent freeze).
    function liquidateOverdue(uint256 agentId) public {
        Loan storage loan = activeLoans[agentId];
        require(loan.active, "No active loan");
        require(block.number > loan.dueBlock, "Loan not yet overdue");

        _accrue(loan);

        uint256 p = loan.principal;
        uint256 intr = loan.interestOwed;

        totalPrincipalOutstanding -= p;
        totalActiveLoans--;

        delete activeLoans[agentId];

        creditScore.recordLiquidation(agentId, liquidationSlashScorePoints);

        uint256 strikes = defaultStrikeCount[agentId] + 1;
        defaultStrikeCount[agentId] = strikes;

        if (strikes >= maxStrikesBeforeForever) {
            borrowFrozenForever[agentId] = true;
        } else {
            borrowCooldownEndBlock[agentId] = block.number + borrowCooldownBlocks;
        }

        emit LoanLiquidated(agentId, p, intr, strikes);
    }

    /// @notice Alias for liquidateOverdue (backward compatibility).
    function markDefault(uint256 agentId) external {
        liquidateOverdue(agentId);
    }
}
