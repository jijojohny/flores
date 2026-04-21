// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC-8004 Validation Registry. AuditorAgent submits task-completion proofs here.
contract ValidationRegistry {

    struct Validation {
        uint256 agentId;
        uint256 taskId;
        bool    passed;
        string  proofURI;
        address validator;
        uint256 timestamp;
    }

    mapping(uint256 => Validation[]) public validations;

    event ValidationSubmitted(
        uint256 indexed agentId,
        uint256 indexed taskId,
        bool    passed,
        string  proofURI,
        address indexed validator
    );

    /// @notice Submit a validation proof for a task completed by an agent.
    function submitValidation(
        uint256 agentId,
        uint256 taskId,
        bool    passed,
        string calldata proofURI
    ) external {
        validations[agentId].push(Validation({
            agentId:   agentId,
            taskId:    taskId,
            passed:    passed,
            proofURI:  proofURI,
            validator: msg.sender,
            timestamp: block.timestamp
        }));
        emit ValidationSubmitted(agentId, taskId, passed, proofURI, msg.sender);
    }

    function getValidationCount(uint256 agentId) external view returns (uint256) {
        return validations[agentId].length;
    }
}
