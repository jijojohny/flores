// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice On-chain credit scoring for AI agents.
/// Tier thresholds, borrow limits, score weights, and liquidation slash are owner-tunable.
contract AgentCreditScore is Ownable {

    mapping(address => bool) public authorizedRecorders;

    struct Profile {
        uint256 totalTransactions;
        uint256 totalVolumeWei;
        uint256 successfulRepayments;
        uint256 defaults;
        uint256 firstActivityBlock;
        uint256 lastActivityBlock;
    }

    mapping(uint256 => Profile) public profiles;
    /// @notice Extra score points removed after liquidations (slash reputation).
    mapping(uint256 => uint256) public liquidationSlashScore;

    // ─── Tier score thresholds (owner) ───────────────────────────
    uint256 public tierThresholdA = 750;
    uint256 public tierThresholdB = 500;
    uint256 public tierThresholdC = 250;

    // ─── Tier borrow limits (wei, 18-dec USDC) ───────────────────
    uint256 public tierBorrowLimitA = 100 ether;
    uint256 public tierBorrowLimitB = 50 ether;
    uint256 public tierBorrowLimitC = 20 ether;

    // ─── Score weights (owner) ───────────────────────────────────
    uint256 public volumeWeiPerPoint = 1e17; // 1 pt per 0.1 USDC
    uint256 public volumeScoreCap = 300;
    uint256 public txPointsPerTx = 10;
    uint256 public txScoreCap = 300;
    uint256 public repayNeutralScore = 150;
    uint256 public repayCleanScore = 300;
    uint256 public defaultPenaltyPerDefault = 100;

    event TransactionRecorded(uint256 indexed agentId, uint256 amountWei, address recorder);
    event RepaymentRecorded(uint256 indexed agentId, bool onTime);
    event LiquidationRecorded(uint256 indexed agentId, uint256 slashScorePoints);
    event RecorderUpdated(address indexed recorder, bool authorized);
    event TierParamsUpdated(uint256 thA, uint256 thB, uint256 thC, uint256 limA, uint256 limB, uint256 limC);
    event ScoreWeightsUpdated(
        uint256 volumeWeiPerPoint,
        uint256 volumeScoreCap,
        uint256 txPointsPerTx,
        uint256 txScoreCap,
        uint256 repayNeutral,
        uint256 repayClean,
        uint256 defaultPenalty
    );

    modifier onlyAuthorized() {
        require(authorizedRecorders[msg.sender], "Not authorized recorder");
        _;
    }

    constructor() Ownable(msg.sender) {
        authorizedRecorders[msg.sender] = true;
    }

    // ─── Recorder management ──────────────────────────────────────

    function addAuthorizedRecorder(address recorder) external onlyOwner {
        authorizedRecorders[recorder] = true;
        emit RecorderUpdated(recorder, true);
    }

    function removeAuthorizedRecorder(address recorder) external onlyOwner {
        authorizedRecorders[recorder] = false;
        emit RecorderUpdated(recorder, false);
    }

    // ─── Owner parameter tuning ─────────────────────────────────

    function setTierParams(
        uint256 thA,
        uint256 thB,
        uint256 thC,
        uint256 limA,
        uint256 limB,
        uint256 limC
    ) external onlyOwner {
        require(thA > thB && thB > thC, "Bad tier ordering");
        tierThresholdA = thA;
        tierThresholdB = thB;
        tierThresholdC = thC;
        tierBorrowLimitA = limA;
        tierBorrowLimitB = limB;
        tierBorrowLimitC = limC;
        emit TierParamsUpdated(thA, thB, thC, limA, limB, limC);
    }

    function setScoreWeights(
        uint256 _volumeWeiPerPoint,
        uint256 _volumeScoreCap,
        uint256 _txPointsPerTx,
        uint256 _txScoreCap,
        uint256 _repayNeutral,
        uint256 _repayClean,
        uint256 _defaultPenalty
    ) external onlyOwner {
        require(_volumeWeiPerPoint > 0, "volumeWeiPerPoint");
        volumeWeiPerPoint = _volumeWeiPerPoint;
        volumeScoreCap = _volumeScoreCap;
        txPointsPerTx = _txPointsPerTx;
        txScoreCap = _txScoreCap;
        repayNeutralScore = _repayNeutral;
        repayCleanScore = _repayClean;
        defaultPenaltyPerDefault = _defaultPenalty;
        emit ScoreWeightsUpdated(
            _volumeWeiPerPoint,
            _volumeScoreCap,
            _txPointsPerTx,
            _txScoreCap,
            _repayNeutral,
            _repayClean,
            _defaultPenalty
        );
    }

    // ─── Recording ────────────────────────────────────────────────

    function recordTransaction(uint256 agentId, uint256 amountWei) external onlyAuthorized {
        Profile storage p = profiles[agentId];
        if (p.firstActivityBlock == 0) {
            p.firstActivityBlock = block.number;
        }
        p.totalTransactions++;
        p.totalVolumeWei += amountWei;
        p.lastActivityBlock = block.number;
        emit TransactionRecorded(agentId, amountWei, msg.sender);
    }

    function recordRepayment(uint256 agentId, bool onTime) external onlyAuthorized {
        Profile storage p = profiles[agentId];
        if (onTime) {
            p.successfulRepayments++;
        } else {
            p.defaults++;
        }
        p.lastActivityBlock = block.number;
        emit RepaymentRecorded(agentId, onTime);
    }

    /// @notice Pool-only path: default + reputation slash (does not double-count repay path).
    function recordLiquidation(uint256 agentId, uint256 slashScorePoints) external onlyAuthorized {
        Profile storage p = profiles[agentId];
        p.defaults++;
        p.lastActivityBlock = block.number;
        liquidationSlashScore[agentId] += slashScorePoints;
        emit LiquidationRecorded(agentId, slashScorePoints);
        emit RepaymentRecorded(agentId, false);
    }

    // ─── Scoring ──────────────────────────────────────────────────

    function getCreditScore(uint256 agentId) public view returns (uint256 score) {
        Profile storage p = profiles[agentId];

        uint256 volumeScore = p.totalVolumeWei / volumeWeiPerPoint;
        if (volumeScore > volumeScoreCap) volumeScore = volumeScoreCap;

        uint256 txScore = p.totalTransactions * txPointsPerTx;
        if (txScore > txScoreCap) txScore = txScoreCap;

        uint256 repayScore = repayNeutralScore;
        if (p.successfulRepayments > 0 && p.defaults == 0) {
            repayScore = repayCleanScore;
        } else if (p.defaults > 0) {
            uint256 penalty = p.defaults * defaultPenaltyPerDefault;
            repayScore = penalty >= repayNeutralScore ? 0 : repayNeutralScore - penalty;
        }

        score = volumeScore + txScore + repayScore;
        uint256 slash = liquidationSlashScore[agentId];
        if (slash >= score) return 0;
        return score - slash;
    }

    function getTier(uint256 agentId) public view returns (string memory) {
        uint256 score = getCreditScore(agentId);
        if (score >= tierThresholdA) return "A";
        if (score >= tierThresholdB) return "B";
        if (score >= tierThresholdC) return "C";
        return "D";
    }

    function getTierBorrowLimit(string memory tier) public view returns (uint256) {
        bytes32 t = keccak256(bytes(tier));
        if (t == keccak256("A")) return tierBorrowLimitA;
        if (t == keccak256("B")) return tierBorrowLimitB;
        if (t == keccak256("C")) return tierBorrowLimitC;
        return 0;
    }

    function getTierBorrowLimitForAgent(uint256 agentId) external view returns (uint256) {
        return getTierBorrowLimit(getTier(agentId));
    }

    function getProfile(uint256 agentId) external view returns (Profile memory) {
        return profiles[agentId];
    }
}
