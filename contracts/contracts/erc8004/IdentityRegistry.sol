// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice ERC-8004 Identity Registry. Each minted token represents one agent identity.
contract IdentityRegistry is ERC721 {
    mapping(uint256 => string) private _agentURIs;
    uint256 private _nextId = 1;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string agentURI);

    constructor() ERC721("AgentIdentity", "AID") {}

    /// @notice Register a new agent. Returns the assigned agentId (tokenId).
    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = _nextId++;
        _safeMint(msg.sender, agentId);
        _agentURIs[agentId] = agentURI;
        emit AgentRegistered(agentId, msg.sender, agentURI);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _agentURIs[tokenId];
    }

    function setAgentURI(uint256 tokenId, string calldata agentURI) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        _agentURIs[tokenId] = agentURI;
    }

    function totalSupply() external view returns (uint256) {
        return _nextId - 1;
    }
}
