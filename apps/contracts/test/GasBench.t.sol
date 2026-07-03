// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Mondeto} from "../src/Mondeto.sol";
import {MockUSDT} from "./mocks/MockUSDT.sol";

/// @notice Gas benchmarks. Run with: forge test --match-contract GasBench --gas-report
contract GasBench is Test {
    Mondeto public mondeto;
    MockUSDT public usdt;
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);

    uint256 constant INITIAL_PRICE = 100_000;
    uint256 constant MIN_PRICE = 1;
    uint256 constant INITIAL_FEE_RATE = 500;

    function setUp() public {
        usdt = new MockUSDT();

        // All pixels are land for buy benchmarks
        uint256[] memory mask = new uint256[](235);
        for (uint256 i; i < 235; ++i) {
            mask[i] = type(uint256).max;
        }

        Mondeto impl = new Mondeto(300, 200, 14 days);
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdt);
        bytes memory initData =
            abi.encodeCall(Mondeto.initialize, (tokens, INITIAL_PRICE, MIN_PRICE, INITIAL_FEE_RATE, mask));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        mondeto = Mondeto(address(proxy));

        usdt.mint(alice, 1_000_000_000e6);
        usdt.mint(bob, 1_000_000_000e6);
        vm.prank(alice);
        usdt.approve(address(mondeto), type(uint256).max);
        vm.prank(bob);
        usdt.approve(address(mondeto), type(uint256).max);
    }

    // ========== buyPixels ==========

    function _buyN(uint256 n) internal {
        uint256[] memory ids = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            ids[i] = i;
        }
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);
    }

    function test_buyPixels_1() public {
        _buyN(1);
    }

    function test_buyPixels_10() public {
        _buyN(10);
    }

    function test_buyPixels_50() public {
        _buyN(50);
    }

    function test_buyPixels_100() public {
        _buyN(100);
    }

    function test_buyPixels_200() public {
        _buyN(200);
    }

    // Bulk buy where all pixels have the same previous owner (aggregation best case)
    function test_buyPixels_100_sameOwner() public {
        _buyN(100);
        uint256[] memory ids = new uint256[](100);
        for (uint256 i; i < 100; ++i) {
            ids[i] = i;
        }
        vm.prank(bob);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);
    }

    // ========== getPixelBatch ==========

    function test_getPixelBatch_10x10() public view {
        mondeto.getPixelBatch(0, 0, 10, 10);
    }

    function test_getPixelBatch_50x50() public view {
        mondeto.getPixelBatch(0, 0, 50, 50);
    }

    function test_getPixelBatch_100x100() public view {
        mondeto.getPixelBatch(0, 0, 100, 100);
    }

    function test_getPixelBatch_300x30() public view {
        mondeto.getPixelBatch(0, 0, 300, 30);
    }

    function test_getPixelBatch_300x200() public view {
        mondeto.getPixelBatch(0, 0, 300, 200);
    }

    // ========== rectanglePrice ==========

    function test_rectanglePrice_10x10() public view {
        mondeto.rectanglePrice(0, 0, 10, 10);
    }

    function test_rectanglePrice_50x50() public view {
        mondeto.rectanglePrice(0, 0, 50, 50);
    }

    function test_rectanglePrice_100x100() public view {
        mondeto.rectanglePrice(0, 0, 100, 100);
    }

    function test_rectanglePrice_300x200() public view {
        mondeto.rectanglePrice(0, 0, 300, 200);
    }
}
