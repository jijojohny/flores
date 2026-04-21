// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test ERC-20 USDC for the lending pool.
/// Arc's native USDC is the gas token (not an ERC-20 contract address),
/// so we deploy this for pool accounting during the demo.
contract MockUSDC is ERC20 {
    constructor() ERC20("Test USDC", "USDC") {}

    // 18 decimals — matches Arc's native USDC precision
    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function mintTo(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
