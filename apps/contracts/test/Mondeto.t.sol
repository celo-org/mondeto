// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Mondeto} from "../src/Mondeto.sol";
import {MockUSDT} from "./mocks/MockUSDT.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockCUSD} from "./mocks/MockCUSD.sol";
import {MockBlacklistToken} from "./mocks/MockBlacklistToken.sol";

// Minimal V2 for upgrade test
contract MondetoV2 is Mondeto(300, 200, 14 days) {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract MondetoTest is Test {
    Mondeto public mondeto;
    MockUSDT public usdt;
    MockUSDC public usdc;
    MockCUSD public cusd;

    address public owner = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);

    event FeeRateUpdated(uint256 feeRate);

    uint256 public constant INITIAL_PRICE = 100_000; // 0.10 USDT
    uint256 public constant MIN_PRICE = 1; // 0.000001 USDT
    uint256 public constant INITIAL_FEE_RATE = 500; // 5% in basis points
    uint256 public constant HALVING_TIME = 14 days;

    function setUp() public {
        usdt = new MockUSDT();
        usdc = new MockUSDC();
        cusd = new MockCUSD();

        // Land mask: mark pixels 0-1023 as land (first 4 words fully set)
        uint256[] memory mask = new uint256[](235);
        mask[0] = type(uint256).max;
        mask[1] = type(uint256).max;
        mask[2] = type(uint256).max;
        mask[3] = type(uint256).max;

        // Deploy implementation + proxy with the accepted-token set
        address[] memory tokens = new address[](3);
        tokens[0] = address(usdt); // 6 decimals
        tokens[1] = address(usdc); // 6 decimals
        tokens[2] = address(cusd); // 18 decimals
        Mondeto impl = new Mondeto(300, 200, HALVING_TIME);
        bytes memory initData =
            abi.encodeCall(Mondeto.initialize, (tokens, INITIAL_PRICE, MIN_PRICE, INITIAL_FEE_RATE, mask));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        mondeto = Mondeto(address(proxy));

        // Fund accounts and approve every accepted token for alice and bob
        address[2] memory users = [alice, bob];
        for (uint256 i; i < users.length; ++i) {
            usdt.mint(users[i], 1_000_000e6); // 1M USDT
            usdc.mint(users[i], 1_000_000e6); // 1M USDC
            cusd.mint(users[i], 1_000_000e18); // 1M cUSD
            vm.startPrank(users[i]);
            usdt.approve(address(mondeto), type(uint256).max);
            usdc.approve(address(mondeto), type(uint256).max);
            cusd.approve(address(mondeto), type(uint256).max);
            vm.stopPrank();
        }
    }

    // ========== Price Math ==========

    /// @dev Boots the halving clock by buying a pixel other than (0,0), so price
    ///      tests against (0,0) see a saleCount of 0 with an active clock.
    function _startHalving() internal {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1; // (1, 0)
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);
    }

    function test_priceAtEpoch0() public view {
        // Unowned pixel at epoch 0 should cost initialPrice
        uint256 price = mondeto.priceOf(0, 0);
        assertEq(price, INITIAL_PRICE);
    }

    function test_priceDoublesAfterSale() public {
        // Buy pixel (0,0) as alice
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // Price should now be doubled
        uint256 price = mondeto.priceOf(0, 0);
        assertEq(price, INITIAL_PRICE * 2);
    }

    function test_priceHalvesAfterEpoch() public {
        _startHalving();

        // Warp forward 1 epoch
        vm.warp(block.timestamp + HALVING_TIME);

        uint256 price = mondeto.priceOf(0, 0);
        assertEq(price, INITIAL_PRICE / 2);
    }

    function test_priceDecaysGradually() public {
        _startHalving();

        // At epoch 0: price = INITIAL_PRICE
        uint256 priceStart = mondeto.priceOf(0, 0);
        assertEq(priceStart, INITIAL_PRICE);

        // At 25% through epoch: price should be 75% of the way from start to end
        // (linear interp from INITIAL_PRICE to INITIAL_PRICE/2)
        vm.warp(block.timestamp + HALVING_TIME / 4);
        uint256 priceQuarter = mondeto.priceOf(0, 0);
        assertEq(priceQuarter, INITIAL_PRICE - (INITIAL_PRICE - INITIAL_PRICE / 2) / 4);

        // At 50% through epoch: midpoint between INITIAL_PRICE and INITIAL_PRICE/2
        vm.warp(block.timestamp - HALVING_TIME / 4 + HALVING_TIME / 2);
        uint256 priceHalf = mondeto.priceOf(0, 0);
        assertEq(priceHalf, INITIAL_PRICE - (INITIAL_PRICE - INITIAL_PRICE / 2) / 2);

        // Price should be strictly decreasing
        assertGt(priceStart, priceQuarter);
        assertGt(priceQuarter, priceHalf);
    }

    function test_priceFloorsAtMinPrice() public {
        _startHalving();

        // Warp forward many epochs
        vm.warp(block.timestamp + HALVING_TIME * 200);

        uint256 price = mondeto.priceOf(0, 0);
        assertEq(price, MIN_PRICE);
    }

    function test_priceDoesNotDecayBeforeFirstBuy() public {
        // Warp 10 halvings forward with nobody having bought yet
        vm.warp(block.timestamp + HALVING_TIME * 10);

        assertEq(mondeto.priceOf(0, 0), INITIAL_PRICE);
        assertEq(mondeto.currentEpoch(), 0);
        assertEq(mondeto.halvingStartTimestamp(), 0);
    }

    function test_firstBuyStartsHalvingClock() public {
        // Warp before any purchase
        vm.warp(block.timestamp + 100 days);
        uint256 firstBuyTime = block.timestamp;

        // Buy pixel 0 (pixel (1,0) stays unowned for the post-warp check)
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // Halving clock now starts at the first-buy timestamp
        assertEq(mondeto.halvingStartTimestamp(), firstBuyTime);

        // Warp 1 halving forward; pixel (1,0) (saleCount=0) is now at half price
        vm.warp(block.timestamp + HALVING_TIME);
        assertEq(mondeto.priceOf(1, 0), INITIAL_PRICE / 2);
    }

    function test_emptyBuyDoesNotStartHalvingClock() public {
        // Empty buyPixels must not boot the clock — otherwise anyone could grief
        uint256[] memory ids = new uint256[](0);
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);
        assertEq(mondeto.halvingStartTimestamp(), 0);
    }

    function test_priceAfterSaleAndEpoch() public {
        // Buy once at epoch 0 → saleCount=1
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // saleCount=1, epoch=0 → price = initial << 1 = 200_000
        assertEq(mondeto.priceOf(0, 0), INITIAL_PRICE * 2);

        // Warp 1 epoch → saleCount=1, epoch=1 → price = initial << 0 = initial
        vm.warp(block.timestamp + HALVING_TIME);
        assertEq(mondeto.priceOf(0, 0), INITIAL_PRICE);

        // Warp another epoch → saleCount=1, epoch=2 → price = initial >> 1
        vm.warp(block.timestamp + HALVING_TIME);
        assertEq(mondeto.priceOf(0, 0), INITIAL_PRICE / 2);
    }

    // ========== Buy Mechanics ==========

    function test_buyUnownedPixel() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        uint256 contractBalBefore = usdt.balanceOf(address(mondeto));

        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // USDT went to contract (treasury)
        assertEq(usdt.balanceOf(address(mondeto)) - contractBalBefore, INITIAL_PRICE);

        // Pixel is now owned by alice
        (address pixelOwner, uint8 saleCount) = mondeto.pixels(0);
        assertEq(pixelOwner, alice);
        assertEq(saleCount, 1);
    }

    function test_buyOwnedPixel() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        // Alice buys first
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // Bob buys from alice
        uint256 aliceBalBefore = usdt.balanceOf(alice);
        vm.prank(bob);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // Alice received payment (price was doubled), minus fee to contract
        uint256 price = INITIAL_PRICE * 2;
        uint256 fee = price * INITIAL_FEE_RATE / 10000;
        assertEq(usdt.balanceOf(alice) - aliceBalBefore, price - fee);

        (address pixelOwner,) = mondeto.pixels(0);
        assertEq(pixelOwner, bob);
    }

    function test_bulkBuyAggregation() public {
        // Alice buys pixels 0 and 1
        uint256[] memory ids = new uint256[](2);
        ids[0] = 0;
        ids[1] = 1;

        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // Bob bulk-buys both from alice — should aggregate into one transfer
        uint256 aliceBalBefore = usdt.balanceOf(alice);
        vm.prank(bob);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // Alice received aggregated payment for both pixels, minus fee each
        uint256 totalPrice = INITIAL_PRICE * 2 * 2;
        uint256 totalFee = totalPrice * INITIAL_FEE_RATE / 10000;
        assertEq(usdt.balanceOf(alice) - aliceBalBefore, totalPrice - totalFee);
    }

    // ========== Slippage & Deadline ==========

    function test_revertWhenTotalCostExceedsMax() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        // Alice buys at INITIAL_PRICE, bumping saleCount so the next price doubles.
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // Bob quoted INITIAL_PRICE off-chain but the execution-time price is now 2x.
        // Capping maxTotalCost at the stale quote must revert rather than overpay.
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Mondeto.SlippageExceeded.selector, INITIAL_PRICE * 2, INITIAL_PRICE));
        mondeto.buyPixels(ids, address(usdt), INITIAL_PRICE, type(uint256).max);
    }

    function test_buySucceedsWhenTotalCostEqualsMax() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        // An exact-match cap (totalCost == maxTotalCost) must NOT revert.
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), INITIAL_PRICE, type(uint256).max);

        (address pixelOwner,) = mondeto.pixels(0);
        assertEq(pixelOwner, alice);
    }

    function test_revertWhenDeadlinePassed() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        // Move past the buyer's deadline so the stale transaction is rejected.
        vm.warp(block.timestamp + 1 hours);
        uint256 deadline = block.timestamp - 1;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Mondeto.DeadlineExpired.selector, deadline));
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, deadline);
    }

    function test_buySucceedsAtDeadline() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        // deadline == block.timestamp is still valid (only strictly-later reverts).
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, block.timestamp);

        (address pixelOwner,) = mondeto.pixels(0);
        assertEq(pixelOwner, alice);
    }

    function test_revertOnInvalidPixelId() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 60_000; // out of bounds

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Mondeto.InvalidPixelId.selector, 60_000));
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);
    }

    function test_revertOnWaterPixel() public {
        // Pixel 1024 is water in our test mask
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1024;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Mondeto.NotLand.selector, 1024));
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);
    }

    function test_selfBuy() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        // Alice buys pixel
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // Alice buys her own pixel again
        uint256 aliceBalBefore = usdt.balanceOf(alice);
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // Alice pays full price but only receives price - fee back; fee goes to contract
        uint256 price = INITIAL_PRICE * 2;
        uint256 fee = price * INITIAL_FEE_RATE / 10000;
        (address pixelOwner, uint8 saleCount) = mondeto.pixels(0);
        assertEq(pixelOwner, alice);
        assertEq(saleCount, 2);
        assertEq(usdt.balanceOf(alice), aliceBalBefore - fee);
    }

    // ========== Profile ==========

    function test_updateProfile() public {
        vm.prank(alice);
        mondeto.updateProfile(0xFF0000, "alice", "https://alice.com");

        (uint24 color, bytes memory label, bytes memory url) = mondeto.profiles(alice);
        assertEq(color, 0xFF0000);
        assertEq(label, bytes("alice"));
        assertEq(url, bytes("https://alice.com"));
    }

    function test_revertOnLabelTooLong() public {
        bytes memory longLabel = new bytes(65);
        vm.prank(alice);
        vm.expectRevert(Mondeto.LabelTooLong.selector);
        mondeto.updateProfile(0, string(longLabel), "");
    }

    function test_revertOnUrlTooLong() public {
        bytes memory longUrl = new bytes(65);
        vm.prank(alice);
        vm.expectRevert(Mondeto.UrlTooLong.selector);
        mondeto.updateProfile(0, "", string(longUrl));
    }

    // ========== Views ==========

    function test_getPixelBatch() public {
        // Set profile and buy pixel (0,0)
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        vm.startPrank(alice);
        mondeto.updateProfile(0xFF0000, "alice", "");
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);
        vm.stopPrank();

        bytes memory batch = mondeto.getPixelBatch(0, 0, 2, 1);
        assertEq(batch.length, 48); // 2 pixels * 24 bytes

        // Pixel (0,0) — owned by alice
        address owner0;
        uint8 sc0;
        uint24 color0;
        assembly {
            let ptr := add(batch, 32)
            owner0 := shr(96, mload(ptr))
            sc0 := byte(0, mload(add(ptr, 20)))
            color0 := or(
                or(shl(16, byte(0, mload(add(ptr, 21)))), shl(8, byte(0, mload(add(ptr, 22))))),
                byte(0, mload(add(ptr, 23)))
            )
        }
        assertEq(owner0, alice);
        assertEq(sc0, 1);
        assertEq(color0, 0xFF0000);

        // Pixel (1,0) — unowned
        address owner1;
        assembly {
            let ptr := add(add(batch, 32), 24)
            owner1 := shr(96, mload(ptr))
        }
        assertEq(owner1, address(0));
    }

    function test_rectanglePrice() public view {
        // 2x2 rectangle of unowned pixels at epoch 0
        uint256 total = mondeto.rectanglePrice(0, 0, 2, 2);
        assertEq(total, INITIAL_PRICE * 4);
    }

    function test_selectionPrice() public view {
        uint256[] memory ids = new uint256[](3);
        ids[0] = 0;
        ids[1] = 1;
        ids[2] = 2;

        uint256 total = mondeto.selectionPrice(ids);
        assertEq(total, INITIAL_PRICE * 3);
    }

    // ========== Admin ==========

    function test_withdraw() public {
        // Send some USDT to contract
        usdt.mint(address(mondeto), 1_000e6);

        uint256 balBefore = usdt.balanceOf(owner);
        mondeto.withdraw(address(usdt), owner, 1_000e6);
        assertEq(usdt.balanceOf(owner) - balBefore, 1_000e6);
    }

    function test_withdrawRevertsForNonOwner() public {
        usdt.mint(address(mondeto), 1_000e6);

        vm.prank(alice);
        vm.expectRevert();
        mondeto.withdraw(address(usdt), alice, 1_000e6);
    }

    function test_setFeeRate() public {
        // Owner sets to 500 (5%) and the change is logged
        vm.expectEmit(false, false, false, true);
        emit FeeRateUpdated(500);
        mondeto.setFeeRate(500);
        assertEq(mondeto.feeRate(), 500);

        // Non-owner reverts with OwnableUnauthorizedAccount
        vm.prank(alice);
        vm.expectRevert();
        mondeto.setFeeRate(100);

        // Above MAX_FEE_RATE (20%) reverts
        uint256 maxFeeRate = mondeto.MAX_FEE_RATE();
        vm.expectRevert(Mondeto.InvalidFeeRate.selector);
        mondeto.setFeeRate(maxFeeRate + 1);

        // The cap itself (20%) is accepted
        mondeto.setFeeRate(maxFeeRate);
        assertEq(mondeto.feeRate(), maxFeeRate);

        // Zero is valid
        mondeto.setFeeRate(0);
        assertEq(mondeto.feeRate(), 0);
    }

    function test_feeFlowToTreasury() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        // Alice buys unowned pixel → full INITIAL_PRICE to treasury
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);
        assertEq(usdt.balanceOf(address(mondeto)), INITIAL_PRICE);

        // Bob buys from alice: price = INITIAL_PRICE * 2
        // fee = price * INITIAL_FEE_RATE / 10_000
        // alice receives price - fee
        uint256 price = INITIAL_PRICE * 2;
        uint256 fee = price * INITIAL_FEE_RATE / 10000;
        uint256 aliceBalBefore = usdt.balanceOf(alice);
        vm.prank(bob);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        assertEq(usdt.balanceOf(alice) - aliceBalBefore, price - fee);
        assertEq(usdt.balanceOf(address(mondeto)), INITIAL_PRICE + fee);
    }

    // ========== Blocked seller payments (Q-01) ==========

    event SellerPaymentRedirected(address indexed seller, address indexed token, uint256 amount);

    /// @dev Deploys a blacklisting token, registers it, funds + approves alice and bob.
    function _setUpBlacklistToken() internal returns (MockBlacklistToken bl) {
        bl = new MockBlacklistToken();
        mondeto.addAcceptedToken(address(bl));
        address[2] memory users = [alice, bob];
        for (uint256 i; i < users.length; ++i) {
            bl.mint(users[i], 1_000_000e6);
            vm.prank(users[i]);
            bl.approve(address(mondeto), type(uint256).max);
        }
    }

    function test_blockedSellerPaymentRedirectedToTreasury() public {
        MockBlacklistToken bl = _setUpBlacklistToken();
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        // Alice buys pixel 0, then becomes blacklisted by the token.
        vm.prank(alice);
        mondeto.buyPixels(ids, address(bl), type(uint256).max, type(uint256).max);
        bl.setBlocked(alice, true);

        uint256 price = INITIAL_PRICE * 2;
        uint256 fee = price * INITIAL_FEE_RATE / 10000;
        uint256 sellerShare = price - fee; // would-be payment to alice
        uint256 aliceBalBefore = bl.balanceOf(alice);
        uint256 contractBalBefore = bl.balanceOf(address(mondeto));

        // Bob buys alice's pixel. Alice's payout is blocked; the purchase still succeeds
        // and the seller's share is retained by the contract instead.
        vm.expectEmit(true, true, false, true);
        emit SellerPaymentRedirected(alice, address(bl), sellerShare);
        vm.prank(bob);
        mondeto.buyPixels(ids, address(bl), type(uint256).max, type(uint256).max);

        // Alice (blocked) received nothing; contract kept fee + redirected seller share.
        assertEq(bl.balanceOf(alice), aliceBalBefore);
        assertEq(bl.balanceOf(address(mondeto)) - contractBalBefore, fee + sellerShare);

        // Pixel ownership transferred to bob despite the blocked payout.
        (address pixelOwner,) = mondeto.pixels(0);
        assertEq(pixelOwner, bob);
    }

    function test_blockedSellerInMixedBatchSucceeds() public {
        MockBlacklistToken bl = _setUpBlacklistToken();

        // Alice owns pixel 0; pixel 1 stays unowned (treasury).
        uint256[] memory aliceIds = new uint256[](1);
        aliceIds[0] = 0;
        vm.prank(alice);
        mondeto.buyPixels(aliceIds, address(bl), type(uint256).max, type(uint256).max);
        bl.setBlocked(alice, true);

        uint256 contractBalBefore = bl.balanceOf(address(mondeto));
        uint256 aliceBalBefore = bl.balanceOf(alice);

        // Bob buys [0 (owned by blocked alice), 1 (unowned)] in one call.
        uint256[] memory ids = new uint256[](2);
        ids[0] = 0;
        ids[1] = 1;
        vm.prank(bob);
        mondeto.buyPixels(ids, address(bl), type(uint256).max, type(uint256).max);

        // pixel 0: price 2x → fee + redirected seller share both stay in contract.
        // pixel 1: unowned at INITIAL_PRICE → full to treasury.
        uint256 ownedPrice = INITIAL_PRICE * 2;
        uint256 unownedPrice = INITIAL_PRICE;
        assertEq(bl.balanceOf(address(mondeto)) - contractBalBefore, ownedPrice + unownedPrice);
        assertEq(bl.balanceOf(alice), aliceBalBefore); // alice (blocked) received nothing

        (address owner0,) = mondeto.pixels(0);
        (address owner1,) = mondeto.pixels(1);
        assertEq(owner0, bob);
        assertEq(owner1, bob);
    }

    function test_unblockedSellerStillPaidWhenAnotherBlocked() public {
        MockBlacklistToken bl = _setUpBlacklistToken();

        // alice owns pixel 0, bob owns pixel 1.
        uint256[] memory id0 = new uint256[](1);
        id0[0] = 0;
        vm.prank(alice);
        mondeto.buyPixels(id0, address(bl), type(uint256).max, type(uint256).max);
        uint256[] memory id1 = new uint256[](1);
        id1[0] = 1;
        vm.prank(bob);
        mondeto.buyPixels(id1, address(bl), type(uint256).max, type(uint256).max);

        // Block only alice. carol buys both pixels.
        bl.setBlocked(alice, true);
        address carol = address(0xCA401);
        bl.mint(carol, 1_000_000e6);
        vm.prank(carol);
        bl.approve(address(mondeto), type(uint256).max);

        uint256 price = INITIAL_PRICE * 2;
        uint256 fee = price * INITIAL_FEE_RATE / 10000;
        uint256 sellerShare = price - fee;
        uint256 bobBalBefore = bl.balanceOf(bob);
        uint256 aliceBalBefore = bl.balanceOf(alice);
        uint256 contractBalBefore = bl.balanceOf(address(mondeto));

        uint256[] memory ids = new uint256[](2);
        ids[0] = 0; // blocked alice
        ids[1] = 1; // unblocked bob
        vm.prank(carol);
        mondeto.buyPixels(ids, address(bl), type(uint256).max, type(uint256).max);

        // bob (not blocked) gets paid; alice's share is retained by the contract.
        assertEq(bl.balanceOf(bob) - bobBalBefore, sellerShare);
        assertEq(bl.balanceOf(alice), aliceBalBefore); // alice (blocked) received nothing
        // contract gains: 2 fees + alice's redirected seller share.
        assertEq(bl.balanceOf(address(mondeto)) - contractBalBefore, fee * 2 + sellerShare);
    }

    function test_blockedBuyerStillReverts() public {
        MockBlacklistToken bl = _setUpBlacklistToken();
        bl.setBlocked(bob, true);

        // bob cannot pay the treasury for an unowned pixel → purchase must revert.
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        vm.prank(bob);
        vm.expectRevert();
        mondeto.buyPixels(ids, address(bl), type(uint256).max, type(uint256).max);
    }

    function test_buyEmpty() public {
        uint256[] memory ids = new uint256[](0);
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max); // should not revert
    }

    function test_buyDuplicatePixels() public {
        // Buy pixel 0 twice in a single call: [0, 0]
        uint256[] memory ids = new uint256[](2);
        ids[0] = 0;
        ids[1] = 0;

        uint256 aliceBalBefore = usdt.balanceOf(alice);
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // First iteration: unowned → price1 = INITIAL_PRICE, goes to treasury
        // Second iteration: owned by alice → price2 = INITIAL_PRICE * 2,
        //   fee = price2 * INITIAL_FEE_RATE / 10000, alice receives price2 - fee
        // Net alice cost: price1 + price2 - (price2 - fee) = price1 + fee
        uint256 price1 = INITIAL_PRICE;
        uint256 price2 = INITIAL_PRICE * 2;
        uint256 fee2 = price2 * INITIAL_FEE_RATE / 10000;
        uint256 netAliceCost = price1 + fee2;
        assertEq(aliceBalBefore - usdt.balanceOf(alice), netAliceCost);

        // saleCount should be 2
        (, uint8 saleCount) = mondeto.pixels(0);
        assertEq(saleCount, 2);
    }

    // ========== Land Mask ==========

    function test_landMaskSetCorrectly() public view {
        assertTrue(mondeto.isLand(0, 0));
        assertTrue(mondeto.isLand(1, 0));
        // Pixel 1024 (x=124, y=3) should be water in our test mask
        // 1024 / 300 = 3 remainder 124, so (124, 3)
        assertFalse(mondeto.isLand(124, 3));
    }

    function test_initializeRejectsInvalidMaskLength() public {
        MockUSDT usdt2 = new MockUSDT();
        Mondeto impl = new Mondeto(300, 200, 14 days);
        uint256[] memory badMask = new uint256[](100);
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdt2);
        bytes memory initData =
            abi.encodeCall(Mondeto.initialize, (tokens, INITIAL_PRICE, MIN_PRICE, INITIAL_FEE_RATE, badMask));
        vm.expectRevert(Mondeto.InvalidMaskLength.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    function test_constructorRejectsZeroHalvingTime() public {
        vm.expectRevert(Mondeto.InvalidHalvingTime.selector);
        new Mondeto(300, 200, 0);
    }

    function test_initializeRejectsMinPriceAboveInitialPrice() public {
        MockUSDT usdt2 = new MockUSDT();
        Mondeto impl = new Mondeto(300, 200, 14 days);
        uint256[] memory mask = new uint256[](235);
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdt2);
        bytes memory initData =
            abi.encodeCall(Mondeto.initialize, (tokens, INITIAL_PRICE, INITIAL_PRICE + 1, INITIAL_FEE_RATE, mask));
        vm.expectRevert(Mondeto.InvalidPrice.selector);
        new ERC1967Proxy(address(impl), initData);
    }

    function test_getPixelBatchSkipsWater() public view {
        // Batch at (123, 3) width 3: pixels 1023 (land), 1024 (water), 1025 (water)
        bytes memory batch = mondeto.getPixelBatch(123, 3, 3, 1);
        assertEq(batch.length, 24); // only 1 land pixel * 24 bytes
    }

    // ========== Upgrade ==========

    function test_cannotInitializeTwice() public {
        uint256[] memory mask = new uint256[](235);
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdt);
        vm.expectRevert();
        mondeto.initialize(tokens, INITIAL_PRICE, MIN_PRICE, INITIAL_FEE_RATE, mask);
    }

    function test_upgradeToV2() public {
        // Buy a pixel first to verify state preservation
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // Deploy V2 and upgrade
        MondetoV2 v2Impl = new MondetoV2();
        mondeto.upgradeToAndCall(address(v2Impl), "");

        // Cast to V2 and check new function
        MondetoV2 mondetoV2 = MondetoV2(address(mondeto));
        assertEq(mondetoV2.version(), 2);

        // Old state preserved
        (address pixelOwner, uint8 saleCount) = mondetoV2.pixels(0);
        assertEq(pixelOwner, alice);
        assertEq(saleCount, 1);
    }

    function test_nonOwnerCannotUpgrade() public {
        MondetoV2 v2Impl = new MondetoV2();

        vm.prank(alice);
        vm.expectRevert();
        mondeto.upgradeToAndCall(address(v2Impl), "");
    }

    // ========== Multi-token ==========

    function test_buyWithAlternate6DecToken() public {
        // USDC is also 6 decimals → maps 1:1 to base price units, like USDT.
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        uint256 contractBalBefore = usdc.balanceOf(address(mondeto));
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdc), type(uint256).max, type(uint256).max);

        assertEq(usdc.balanceOf(address(mondeto)) - contractBalBefore, INITIAL_PRICE);
        (address pixelOwner,) = mondeto.pixels(0);
        assertEq(pixelOwner, alice);
    }

    function test_buyWith18DecTokenScalesUp() public {
        // cUSD is 18 decimals → every transfer is the base amount * 10^12.
        uint256 scale = 1e12;
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        // Unowned: full price to treasury, scaled.
        vm.prank(alice);
        mondeto.buyPixels(ids, address(cusd), type(uint256).max, type(uint256).max);
        assertEq(cusd.balanceOf(address(mondeto)), INITIAL_PRICE * scale);

        // Owned: fee to treasury, remainder to previous owner — both scaled.
        uint256 price = INITIAL_PRICE * 2;
        uint256 fee = price * INITIAL_FEE_RATE / 10000;
        uint256 aliceBalBefore = cusd.balanceOf(alice);
        vm.prank(bob);
        mondeto.buyPixels(ids, address(cusd), type(uint256).max, type(uint256).max);

        assertEq(cusd.balanceOf(alice) - aliceBalBefore, (price - fee) * scale);
        assertEq(cusd.balanceOf(address(mondeto)), (INITIAL_PRICE + fee) * scale);
    }

    function test_revertOnNonAcceptedToken() public {
        MockUSDT stray = new MockUSDT(); // not registered
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Mondeto.TokenNotAccepted.selector, address(stray)));
        mondeto.buyPixels(ids, address(stray), type(uint256).max, type(uint256).max);
    }

    function test_getAcceptedTokens() public view {
        address[] memory tokens = mondeto.getAcceptedTokens();
        assertEq(tokens.length, 3);
        assertEq(tokens[0], address(usdt));
        assertEq(tokens[1], address(usdc));
        assertEq(tokens[2], address(cusd));
    }

    function test_addAcceptedToken() public {
        MockCUSD extra = new MockCUSD();
        mondeto.addAcceptedToken(address(extra));

        (bool accepted, uint8 dec) = mondeto.tokenConfig(address(extra));
        assertTrue(accepted);
        assertEq(dec, 18);
        assertEq(mondeto.getAcceptedTokens().length, 4);

        // Now it can be used to buy.
        extra.mint(alice, 1_000e18);
        vm.startPrank(alice);
        extra.approve(address(mondeto), type(uint256).max);
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        mondeto.buyPixels(ids, address(extra), type(uint256).max, type(uint256).max);
        vm.stopPrank();
        assertEq(extra.balanceOf(address(mondeto)), INITIAL_PRICE * 1e12);
    }

    function test_addAcceptedTokenRevertsOnDuplicate() public {
        vm.expectRevert(abi.encodeWithSelector(Mondeto.TokenAlreadyAccepted.selector, address(usdt)));
        mondeto.addAcceptedToken(address(usdt));
    }

    function test_addAcceptedTokenRevertsOnZero() public {
        vm.expectRevert(Mondeto.InvalidToken.selector);
        mondeto.addAcceptedToken(address(0));
    }

    function test_addAcceptedTokenOnlyOwner() public {
        MockUSDC extra = new MockUSDC();
        vm.prank(alice);
        vm.expectRevert();
        mondeto.addAcceptedToken(address(extra));
    }

    function test_removeAcceptedToken() public {
        mondeto.removeAcceptedToken(address(usdc));

        (bool accepted,) = mondeto.tokenConfig(address(usdc));
        assertFalse(accepted);

        // swap-and-pop: usdc (index 1) replaced by last element (cusd).
        address[] memory tokens = mondeto.getAcceptedTokens();
        assertEq(tokens.length, 2);
        assertEq(tokens[0], address(usdt));
        assertEq(tokens[1], address(cusd));

        // Buying with a removed token now reverts.
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Mondeto.TokenNotAccepted.selector, address(usdc)));
        mondeto.buyPixels(ids, address(usdc), type(uint256).max, type(uint256).max);
    }

    function test_removeAcceptedTokenRevertsIfNotAccepted() public {
        MockUSDT stray = new MockUSDT();
        vm.expectRevert(abi.encodeWithSelector(Mondeto.TokenNotAccepted.selector, address(stray)));
        mondeto.removeAcceptedToken(address(stray));
    }

    function test_withdrawPerToken() public {
        // Buy with cUSD so the treasury holds the 18-dec token, then withdraw it.
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        vm.prank(alice);
        mondeto.buyPixels(ids, address(cusd), type(uint256).max, type(uint256).max);

        uint256 amount = INITIAL_PRICE * 1e12;
        uint256 balBefore = cusd.balanceOf(owner);
        mondeto.withdraw(address(cusd), owner, amount);
        assertEq(cusd.balanceOf(owner) - balBefore, amount);
    }

    function test_withdrawAll() public {
        // Treasury accrues balances across two different accepted tokens.
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max); // INITIAL_PRICE of USDT (6 dec)
        uint256[] memory ids2 = new uint256[](1);
        ids2[0] = 1;
        vm.prank(alice);
        mondeto.buyPixels(ids2, address(cusd), type(uint256).max, type(uint256).max); // INITIAL_PRICE * 1e12 of cUSD (18 dec)

        uint256 usdtExpected = INITIAL_PRICE;
        uint256 cusdExpected = INITIAL_PRICE * 1e12;
        assertEq(usdt.balanceOf(address(mondeto)), usdtExpected);
        assertEq(cusd.balanceOf(address(mondeto)), cusdExpected);

        uint256 usdtBefore = usdt.balanceOf(owner);
        uint256 cusdBefore = cusd.balanceOf(owner);
        mondeto.withdrawAll(owner);

        // Every accepted token's full balance moved to owner; contract is drained.
        assertEq(usdt.balanceOf(owner) - usdtBefore, usdtExpected);
        assertEq(cusd.balanceOf(owner) - cusdBefore, cusdExpected);
        assertEq(usdt.balanceOf(address(mondeto)), 0);
        assertEq(usdc.balanceOf(address(mondeto)), 0);
        assertEq(cusd.balanceOf(address(mondeto)), 0);
    }

    function test_withdrawAllOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        mondeto.withdrawAll(alice);
    }

    // ========== Fuzz ==========

    function testFuzz_priceNeverReverts(uint8 saleCount, uint64 timeElapsed) public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        uint8 buys = uint8(bound(saleCount, 0, 10));

        for (uint8 i; i < buys; ++i) {
            vm.prank(i % 2 == 0 ? alice : bob);
            mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);
            if (i == 0) {
                // First buy starts the halving clock at initialPrice. Warp far
                // forward so subsequent buys floor at minPrice and balances last.
                vm.warp(block.timestamp + 182 days * 300);
            }
        }

        // Warp to fuzzed time and verify priceOf doesn't revert
        vm.warp(block.timestamp + uint256(timeElapsed));
        mondeto.priceOf(0, 0);
    }

    function testFuzz_buyAnyLandPixel(uint16 pixelIdx) public {
        // Bound to land pixels (0-1023 in our test mask)
        pixelIdx = uint16(bound(pixelIdx, 0, 1023));

        uint256[] memory ids = new uint256[](1);
        ids[0] = pixelIdx;

        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        (address pixelOwner,) = mondeto.pixels(pixelIdx);
        assertEq(pixelOwner, alice);
    }

    // ========== saleCount saturation ==========

    function test_saleCountSaturatesAt255() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        // First buy starts the halving clock at initialPrice (saleCount: 0 → 1).
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);

        // Warp far so subsequent buys floor at minPrice (balances would otherwise run out).
        vm.warp(block.timestamp + 182 days * 300);

        // 255 more buys (256 total) — saleCount should saturate at 255.
        for (uint256 i; i < 255; ++i) {
            vm.prank(i % 2 == 0 ? bob : alice);
            mondeto.buyPixels(ids, address(usdt), type(uint256).max, type(uint256).max);
        }

        (, uint8 saleCount) = mondeto.pixels(0);
        assertEq(saleCount, 255);
    }
}
