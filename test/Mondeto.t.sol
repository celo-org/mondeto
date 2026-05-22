// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Mondeto} from "../src/Mondeto.sol";
import {MockUSDT} from "./mocks/MockUSDT.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockCUSD} from "./mocks/MockCUSD.sol";

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
        bytes memory initData = abi.encodeCall(
            Mondeto.initialize,
            (tokens, INITIAL_PRICE, MIN_PRICE, INITIAL_FEE_RATE, mask)
        );
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
        mondeto.buyPixels(ids, address(usdt));

        // Price should now be doubled
        uint256 price = mondeto.priceOf(0, 0);
        assertEq(price, INITIAL_PRICE * 2);
    }

    function test_priceHalvesAfterEpoch() public {
        // Warp forward 1 epoch
        vm.warp(block.timestamp + HALVING_TIME);

        uint256 price = mondeto.priceOf(0, 0);
        assertEq(price, INITIAL_PRICE / 2);
    }

    function test_priceDecaysGradually() public {
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
        // Warp forward many epochs
        vm.warp(block.timestamp + HALVING_TIME * 200);

        uint256 price = mondeto.priceOf(0, 0);
        assertEq(price, MIN_PRICE);
    }

    function test_priceAfterSaleAndEpoch() public {
        // Buy once at epoch 0 → saleCount=1
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt));

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
        mondeto.buyPixels(ids, address(usdt));

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
        mondeto.buyPixels(ids, address(usdt));

        // Bob buys from alice
        uint256 aliceBalBefore = usdt.balanceOf(alice);
        vm.prank(bob);
        mondeto.buyPixels(ids, address(usdt));

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
        mondeto.buyPixels(ids, address(usdt));

        // Bob bulk-buys both from alice — should aggregate into one transfer
        uint256 aliceBalBefore = usdt.balanceOf(alice);
        vm.prank(bob);
        mondeto.buyPixels(ids, address(usdt));

        // Alice received aggregated payment for both pixels, minus fee each
        uint256 totalPrice = INITIAL_PRICE * 2 * 2;
        uint256 totalFee = totalPrice * INITIAL_FEE_RATE / 10000;
        assertEq(usdt.balanceOf(alice) - aliceBalBefore, totalPrice - totalFee);
    }

    function test_revertOnInvalidPixelId() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 60_000; // out of bounds

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Mondeto.InvalidPixelId.selector, 60_000));
        mondeto.buyPixels(ids, address(usdt));
    }

    function test_revertOnWaterPixel() public {
        // Pixel 1024 is water in our test mask
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1024;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Mondeto.NotLand.selector, 1024));
        mondeto.buyPixels(ids, address(usdt));
    }

    function test_selfBuy() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        // Alice buys pixel
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt));

        // Alice buys her own pixel again
        uint256 aliceBalBefore = usdt.balanceOf(alice);
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt));

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
        mondeto.buyPixels(ids, address(usdt));
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
            color0 := or(or(shl(16, byte(0, mload(add(ptr, 21)))), shl(8, byte(0, mload(add(ptr, 22))))), byte(0, mload(add(ptr, 23))))
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

    function test_setInitialPrice() public {
        mondeto.setInitialPrice(200_000);
        assertEq(mondeto.initialPrice(), 200_000);

        // Price of unowned pixel should now reflect new initial price
        assertEq(mondeto.priceOf(0, 0), 200_000);
    }

    function test_setInitialPriceRevertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        mondeto.setInitialPrice(200_000);
    }

    function test_setFeeRate() public {
        // Owner sets to 500 (5%)
        mondeto.setFeeRate(500);
        assertEq(mondeto.feeRate(), 500);

        // Non-owner reverts with OwnableUnauthorizedAccount
        vm.prank(alice);
        vm.expectRevert();
        mondeto.setFeeRate(100);

        // Above 10000 reverts
        vm.expectRevert(Mondeto.InvalidFeeRate.selector);
        mondeto.setFeeRate(10001);

        // Zero is valid
        mondeto.setFeeRate(0);
        assertEq(mondeto.feeRate(), 0);
    }

    function test_feeFlowToTreasury() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        // Alice buys unowned pixel → full INITIAL_PRICE to treasury
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt));
        assertEq(usdt.balanceOf(address(mondeto)), INITIAL_PRICE);

        // Bob buys from alice: price = INITIAL_PRICE * 2
        // fee = price * INITIAL_FEE_RATE / 10_000
        // alice receives price - fee
        uint256 price = INITIAL_PRICE * 2;
        uint256 fee = price * INITIAL_FEE_RATE / 10000;
        uint256 aliceBalBefore = usdt.balanceOf(alice);
        vm.prank(bob);
        mondeto.buyPixels(ids, address(usdt));

        assertEq(usdt.balanceOf(alice) - aliceBalBefore, price - fee);
        assertEq(usdt.balanceOf(address(mondeto)), INITIAL_PRICE + fee);
    }

    function test_buyEmpty() public {
        uint256[] memory ids = new uint256[](0);
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt)); // should not revert
    }

    function test_buyDuplicatePixels() public {
        // Buy pixel 0 twice in a single call: [0, 0]
        uint256[] memory ids = new uint256[](2);
        ids[0] = 0;
        ids[1] = 0;

        uint256 aliceBalBefore = usdt.balanceOf(alice);
        vm.prank(alice);
        mondeto.buyPixels(ids, address(usdt));

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
        bytes memory initData = abi.encodeCall(
            Mondeto.initialize,
            (tokens, INITIAL_PRICE, MIN_PRICE, INITIAL_FEE_RATE, badMask)
        );
        vm.expectRevert(Mondeto.InvalidMaskLength.selector);
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
        mondeto.buyPixels(ids, address(usdt));

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
        mondeto.buyPixels(ids, address(usdc));

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
        mondeto.buyPixels(ids, address(cusd));
        assertEq(cusd.balanceOf(address(mondeto)), INITIAL_PRICE * scale);

        // Owned: fee to treasury, remainder to previous owner — both scaled.
        uint256 price = INITIAL_PRICE * 2;
        uint256 fee = price * INITIAL_FEE_RATE / 10000;
        uint256 aliceBalBefore = cusd.balanceOf(alice);
        vm.prank(bob);
        mondeto.buyPixels(ids, address(cusd));

        assertEq(cusd.balanceOf(alice) - aliceBalBefore, (price - fee) * scale);
        assertEq(cusd.balanceOf(address(mondeto)), (INITIAL_PRICE + fee) * scale);
    }

    function test_revertOnNonAcceptedToken() public {
        MockUSDT stray = new MockUSDT(); // not registered
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Mondeto.TokenNotAccepted.selector, address(stray)));
        mondeto.buyPixels(ids, address(stray));
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
        mondeto.buyPixels(ids, address(extra));
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
        mondeto.buyPixels(ids, address(usdc));
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
        mondeto.buyPixels(ids, address(cusd));

        uint256 amount = INITIAL_PRICE * 1e12;
        uint256 balBefore = cusd.balanceOf(owner);
        mondeto.withdraw(address(cusd), owner, amount);
        assertEq(cusd.balanceOf(owner) - balBefore, amount);
    }

    // ========== Fuzz ==========

    function testFuzz_priceNeverReverts(uint8 saleCount, uint64 timeElapsed) public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        uint8 buys = uint8(bound(saleCount, 0, 10));

        // Warp far into the future so each buy costs minPrice
        vm.warp(block.timestamp + 182 days * 300);

        for (uint8 i; i < buys; ++i) {
            vm.prank(i % 2 == 0 ? alice : bob);
            mondeto.buyPixels(ids, address(usdt));
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
        mondeto.buyPixels(ids, address(usdt));

        (address pixelOwner,) = mondeto.pixels(pixelIdx);
        assertEq(pixelOwner, alice);
    }

    // ========== saleCount saturation ==========

    function test_saleCountSaturatesAt255() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        // Warp far into the future so price is minPrice regardless of saleCount
        vm.warp(block.timestamp + 182 days * 300);

        // Buy 256 times alternating alice and bob
        for (uint256 i; i < 256; ++i) {
            vm.prank(i % 2 == 0 ? alice : bob);
            mondeto.buyPixels(ids, address(usdt));
        }

        // saleCount should saturate at 255, not wrap to 0
        (, uint8 saleCount) = mondeto.pixels(0);
        assertEq(saleCount, 255);
    }
}
