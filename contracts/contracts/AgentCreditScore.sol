// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice On-chain credit scoring for AI agents.
/// Scores are built from nanopayment transaction history recorded by authorized callers
/// (DataAgent, ComputeAgent servers, and the MicroLendingPool).
contract AgentCreditScore {

    address public owner;
    mapping(address => bool) public authorizedRecorders;

    struct Profile {
        uint256 totalTransactions;
        uint256 totalVolumeWei;      // 18-decimal units (Arc native USDC precision)
        uint256 successfulRepayments;
        uint256 defaults;
        uint256 firstActivityBlock;
        uint256 lastActivityBlock;
    }

    mapping(uint256 => Profile) public profiles;

    event TransactionRecorded(uint256 indexed agentId, uint256 amountWei, address recorder);
    event RepaymentRecorded(uint256 indexed agentId, bool onTime);
    event RecorderUpdated(address indexed recorder, bool authorized);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedRecorders[msg.sender], "Not authorized recorder");
        _;
    }

    constructor() {
        owner = msg.sender;
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

    // ─── Recording ────────────────────────────────────────────────

    /// @notice Record a completed nanopayment for an agent (called by service agents after payment).
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

    /// @notice Record a loan repayment outcome (called by MicroLendingPool).
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

    // ─── Scoring ──────────────────────────────────────────────────

    /// @notice Calculate credit score 0–900.
    /// Component breakdown (chosen so 8 demo iterations visibly move the tier):
    ///   Volume score  (0–300): 1 pt per 0.1 USDC cumulative, cap 300 ($30)
    ///   Tx count      (0–300): 10 pts per tx, cap 300 (30 txs)
    ///   Repayment     (0–300): 300 if clean record, 150 if no loans yet, -100 per default
    function getCreditScore(uint256 agentId) public view returns (uint256 score) {
        Profile storage p = profiles[agentId];

        // Volume: 1 pt per 0.1 USDC (1e17 wei), cap 300
        uint256 volumeScore = p.totalVolumeWei / 1e17;
        if (volumeScore > 300) volumeScore = 300;

        // Tx count: 10 pts each, cap 300
        uint256 txScore = p.totalTransactions * 10;
        if (txScore > 300) txScore = 300;

        // Repayment
        uint256 repayScore = 150; // neutral: no loans yet
        if (p.successfulRepayments > 0 && p.defaults == 0) {
            repayScore = 300;
        } else if (p.defaults > 0) {
            uint256 penalty = p.defaults * 100;
            repayScore = penalty >= 150 ? 0 : 150 - penalty;
        }

        score = volumeScore + txScore + repayScore;
    }

    /// @notice Return tier string: "A" | "B" | "C" | "D"
    function getTier(uint256 agentId) public view returns (string memory) {
        uint256 score = getCreditScore(agentId);
        if (score >= 750) return "A";
        if (score >= 500) return "B";
        if (score >= 250) return "C";
        return "D";
    }

    function getProfile(uint256 agentId) external view returns (Profile memory) {
        return profiles[agentId];
    }
}
