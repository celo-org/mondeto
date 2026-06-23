// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC20 that mimics a stablecoin admin blacklist (e.g. USDT/USDC): any transfer
///         to or from a blocked address reverts. Used to test buyPixels resilience when a
///         previous owner is blacklisted by the payment token. 6 decimals like USDT/USDC.
contract MockBlacklistToken is ERC20 {
    mapping(address => bool) public blocked;

    constructor() ERC20("Blacklist USD", "bUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[from], "blocked sender");
        require(!blocked[to], "blocked recipient");
        super._update(from, to, value);
    }
}
