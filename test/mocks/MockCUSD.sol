// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice 18-decimal stablecoin (like Celo Dollar) to exercise per-token decimal scaling.
contract MockCUSD is ERC20 {
    constructor() ERC20("Celo Dollar", "cUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
