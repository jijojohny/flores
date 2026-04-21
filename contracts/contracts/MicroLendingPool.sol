// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAgentCreditScore {
    function getTier(uint256 agentId) external view returns (string memory);
    function recordRepayment(uint256 agentId, bool onTime) external;
}

interface IIdentityRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @notice USDC micro-lending pool for AI agents.
/// Agents borrow based on their credit tier and repay from task revenue.
contract MicroLendingPool {

    IERC20             public usdc;
    IAgentCreditScore  public creditScore;
    IIdentityRegistry  public identityRegistry;

    struct Loan {
        uint256 amount;
        uint256 issuedBlock;
        uint256 dueBlock;    // issuedBlock + ~50400 blocks (~7 days at 12s/block)
        bool    active;
    }

    mapping(uint256 => Loan)    public activeLoans;
    mapping(uint256 => bool)    public hasDefaulted;   // persists after loan cleared
    mapping(address => uint256) public lenderDeposits;

    uint256 public poolBalance;
    uint256 public totalLoansIssued;
    uint256 public totalLoansRepaid;
    uint256 public totalActiveLoans;

    // Tier loan limits in 18-decimal USDC units
    uint256 private constant TIER_A_LIMIT = 100 ether;  // 100 USDC
    uint256 private constant TIER_B_LIMIT =  50 ether;  //  50 USDC
    uint256 private constant TIER_C_LIMIT =  20 ether;  //  20 USDC
    uint256 private constant LOAN_DURATION = 50400;     // blocks

    event Deposited(address indexed lender, uint256 amount);
    event Withdrawn(address indexed lender, uint256 amount);
    event LoanIssued(uint256 indexed agentId, uint256 amount, string tier);
    event LoanRepaid(uint256 indexed agentId, uint256 amount, bool onTime);
    event LoanDefaulted(uint256 indexed agentId);

    constructor(address _usdc, address _creditScore, address _identityRegistry) {
        usdc             = IERC20(_usdc);
        creditScore      = IAgentCreditScore(_creditScore);
        identityRegistry = IIdentityRegistry(_identityRegistry);
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

    // ─── Agent borrowing ──────────────────────────────────────────

    /// @notice Request a micro-loan. Caller must own the agentId NFT.
    function requestLoan(uint256 agentId, uint256 amount) external {
        // Bug Fix #2: verify caller owns this agent identity
        require(identityRegistry.ownerOf(agentId) == msg.sender, "Not agent owner");
        // Bug Fix #3: permanently block defaulted agents
        require(!hasDefaulted[agentId], "Agent has defaulted - credit frozen");
        require(!activeLoans[agentId].active, "Active loan already exists");

        string memory tier = creditScore.getTier(agentId);
        uint256 limit = _tierLimit(tier);
        require(limit > 0, "Tier D: no credit available");
        require(amount <= limit, "Amount exceeds tier limit");
        require(amount <= poolBalance, "Insufficient pool liquidity");

        poolBalance -= amount;
        activeLoans[agentId] = Loan({
            amount:       amount,
            issuedBlock:  block.number,
            dueBlock:     block.number + LOAN_DURATION,
            active:       true
        });
        totalLoansIssued++;
        totalActiveLoans++;

        usdc.transfer(msg.sender, amount);
        emit LoanIssued(agentId, amount, tier);
    }

    /// @notice Repay an active loan.
    function repayLoan(uint256 agentId) external {
        Loan storage loan = activeLoans[agentId];
        require(loan.active, "No active loan");

        uint256 amount = loan.amount;
        bool onTime = block.number <= loan.dueBlock;

        usdc.transferFrom(msg.sender, address(this), amount);
        poolBalance += amount;

        delete activeLoans[agentId];
        totalLoansRepaid++;
        totalActiveLoans--;

        // MicroLendingPool is an authorized recorder on AgentCreditScore
        creditScore.recordRepayment(agentId, onTime);
        emit LoanRepaid(agentId, amount, onTime);
    }

    /// @notice Mark an overdue loan as defaulted. Can be called by anyone after dueBlock passes.
    function markDefault(uint256 agentId) external {
        Loan storage loan = activeLoans[agentId];
        require(loan.active, "No active loan");
        require(block.number > loan.dueBlock, "Loan not yet overdue");

        // Bug Fix #3: set hasDefaulted BEFORE deleting the loan
        hasDefaulted[agentId] = true;
        delete activeLoans[agentId];
        totalActiveLoans--;

        creditScore.recordRepayment(agentId, false);
        emit LoanDefaulted(agentId);
    }

    // ─── Views ────────────────────────────────────────────────────

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

    // ─── Internal ─────────────────────────────────────────────────

    function _tierLimit(string memory tier) internal pure returns (uint256) {
        bytes32 t = keccak256(bytes(tier));
        if (t == keccak256("A")) return TIER_A_LIMIT;
        if (t == keccak256("B")) return TIER_B_LIMIT;
        if (t == keccak256("C")) return TIER_C_LIMIT;
        return 0;
    }
}
