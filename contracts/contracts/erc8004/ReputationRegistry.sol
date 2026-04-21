// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC-8004 Reputation Registry. Records feedback scores against agent identities.
contract ReputationRegistry {

    struct Feedback {
        address from;
        int128  value;
        uint8   valueDecimals;
        string  tag1;
        string  tag2;
        string  endpoint;
        string  feedbackURI;
        bytes32 feedbackHash;
        uint256 timestamp;
    }

    mapping(uint256 => Feedback[]) public feedbackLog;

    event FeedbackGiven(
        uint256 indexed agentId,
        address indexed from,
        int128  value,
        string  tag1,
        string  tag2
    );

    /// @notice Submit reputation feedback for an agent.
    function giveFeedback(
        uint256 agentId,
        int128  value,
        uint8   valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        feedbackLog[agentId].push(Feedback({
            from:         msg.sender,
            value:        value,
            valueDecimals: valueDecimals,
            tag1:         tag1,
            tag2:         tag2,
            endpoint:     endpoint,
            feedbackURI:  feedbackURI,
            feedbackHash: feedbackHash,
            timestamp:    block.timestamp
        }));
        emit FeedbackGiven(agentId, msg.sender, value, tag1, tag2);
    }

    function getFeedbackCount(uint256 agentId) external view returns (uint256) {
        return feedbackLog[agentId].length;
    }
}
