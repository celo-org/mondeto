// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Mondeto is UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Immutables (set in constructor, baked into implementation bytecode) ---
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint16 public immutable WIDTH;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint16 public immutable HEIGHT;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable TOTAL_PIXELS;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable LAND_MASK_LENGTH;
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable HALVING_TIME;

    /// @notice Decimal base in which initialPrice/minPrice and every _price() result are
    ///         denominated. Each accepted token's transfer amount is scaled from this base
    ///         to the token's own decimals, treating all accepted coins as 1:1.
    uint8 public constant PRICE_DECIMALS = 6;

    /// @notice Upper bound on the resale fee, in basis points (2000 = 20%). Caps how much
    ///         of an owned-pixel resale the treasury can take, guaranteeing the previous
    ///         owner always keeps at least 80%. Bounds owner power over pending/future sales.
    uint256 public constant MAX_FEE_RATE = 2000;

    // --- Structs ---
    struct PixelData {
        address owner;
        uint8 saleCount;
    }

    struct OwnerProfile {
        uint24 color;
        bytes label;
        bytes url;
    }

    struct TokenConfig {
        bool accepted;
        uint8 decimals;
    }

    // --- State ---
    /// @notice Timestamp at which the halving clock starts. `0` until the first
    ///         `buyPixels` call lands; stamped to `block.timestamp` on that call.
    ///         While `0`, every land pixel costs exactly `initialPrice` regardless
    ///         of wall-clock time.
    uint256 public halvingStartTimestamp;
    uint256 public initialPrice;
    uint256 public minPrice;

    mapping(uint256 => PixelData) public pixels;
    mapping(address => OwnerProfile) public profiles;
    uint256[] public landMask;
    uint256 public feeRate; // basis points (e.g. 300 = 3%); fee goes to contract treasury

    // Accepted dollar stablecoins, all treated as 1:1. `tokenConfig` gives O(1) acceptance
    // + decimals lookup; `acceptedTokens` enumerates the set for views/frontend.
    mapping(address => TokenConfig) public tokenConfig;
    address[] public acceptedTokens;

    // --- Events ---
    /// @param totalCost paid amount in base PRICE_DECIMALS units (scale per-token by decimals)
    event PixelsPurchased(address indexed buyer, address indexed token, uint256[] ids, uint256 totalCost);
    event ProfileUpdated(address indexed user, uint24 color, bytes label, bytes url);
    event AcceptedTokenAdded(address indexed token, uint8 decimals);
    event AcceptedTokenRemoved(address indexed token);
    event FeeRateUpdated(uint256 feeRate);
    /// @notice Emitted when a seller payment could not be delivered (e.g. token blacklist)
    ///         and was retained by the contract instead. `amount` is in PRICE_DECIMALS base units.
    event SellerPaymentRedirected(address indexed seller, address indexed token, uint256 amount);

    // --- Errors ---
    error InvalidPixelId(uint256 id);
    error InvalidCoordinates();
    error OutOfBounds();
    error NotLand(uint256 id);
    error LabelTooLong();
    error UrlTooLong();
    error InvalidMaskLength();
    error InvalidFeeRate();
    error InvalidToken();
    error NoTokens();
    error TokenNotAccepted(address token);
    error TokenAlreadyAccepted(address token);
    error InvalidHalvingTime();
    error InvalidPrice();
    error DeadlineExpired(uint256 deadline);
    error SlippageExceeded(uint256 totalCost, uint256 maxTotalCost);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(uint16 _width, uint16 _height, uint256 _halvingTime) {
        // HALVING_TIME is a divisor in the price formula — zero would panic.
        if (_halvingTime == 0) revert InvalidHalvingTime();
        WIDTH = _width;
        HEIGHT = _height;
        TOTAL_PIXELS = uint256(_width) * _height;
        LAND_MASK_LENGTH = (TOTAL_PIXELS + 255) / 256;
        HALVING_TIME = _halvingTime;
        _disableInitializers();
    }

    function initialize(
        address[] calldata _tokens,
        uint256 _initialPrice,
        uint256 _minPrice,
        uint256 _feeRate,
        uint256[] calldata _landMask
    ) external initializer {
        __Ownable_init(msg.sender);

        if (_landMask.length != LAND_MASK_LENGTH) revert InvalidMaskLength();
        if (_feeRate > MAX_FEE_RATE) revert InvalidFeeRate();
        if (_tokens.length == 0) revert NoTokens();
        if (_minPrice > _initialPrice) revert InvalidPrice();

        initialPrice = _initialPrice;
        minPrice = _minPrice;
        feeRate = _feeRate;

        landMask = _landMask;

        for (uint256 i; i < _tokens.length; ++i) {
            _addAcceptedToken(_tokens[i]);
        }
    }

    // --- Core ---

    /// @param maxTotalCost Upper bound (in PRICE_DECIMALS base units) the buyer will accept for the
    ///        whole batch. Reverts if the execution-time total exceeds it, protecting buyers from
    ///        price increases (e.g. another buyer front-running and bumping saleCount) between the
    ///        off-chain quote and execution. Pass `type(uint256).max` to opt out.
    /// @param deadline Unix timestamp after which the transaction must not execute. Protects against
    ///        a stale transaction landing at a worse price long after it was signed. Pass
    ///        `type(uint256).max` to opt out.
    function buyPixels(uint256[] calldata ids, address token, uint256 maxTotalCost, uint256 deadline)
        external
        nonReentrant
    {
        if (block.timestamp > deadline) revert DeadlineExpired(deadline);

        TokenConfig memory tc = tokenConfig[token];
        if (!tc.accepted) revert TokenNotAccepted(token);

        // Start the halving clock on the first ever buy. Before that, the map
        // sits at initialPrice indefinitely. Empty ids[] is a no-op and must
        // not start the clock.
        uint256 start = halvingStartTimestamp;
        if (start == 0 && ids.length > 0) {
            start = block.timestamp;
            halvingStartTimestamp = start;
        }
        uint256 elapsed = start == 0 ? 0 : block.timestamp - start;
        uint256 _feeRate = feeRate;
        uint256 _initialPrice = initialPrice;
        uint256 _minPrice = minPrice;
        uint256 totalCost;

        // Index 0 is reserved for address(this) (unowned pixel proceeds + fees).
        // Worst case: each pixel has a unique previous owner → ids.length + 1 slots.
        address[] memory recipients = new address[](ids.length + 1);
        uint256[] memory amounts = new uint256[](ids.length + 1);
        uint256 recipientCount = 1;
        recipients[0] = address(this);

        // Cache landMask word to avoid repeated SLOADs for consecutive pixel IDs
        uint256 cachedWordIdx = type(uint256).max;
        uint256 cachedWord;

        for (uint256 i; i < ids.length;) {
            uint256 id = ids[i];
            if (id >= TOTAL_PIXELS) revert InvalidPixelId(id);

            {
                // Inline _isLand with word caching
                uint256 wordIdx = id >> 8;
                if (wordIdx != cachedWordIdx) {
                    cachedWordIdx = wordIdx;
                    cachedWord = landMask[wordIdx];
                }
                if (cachedWord & (1 << (id & 255)) == 0) revert NotLand(id);
            }

            PixelData storage px = pixels[id];
            address prevOwner = px.owner;
            uint8 sc = px.saleCount;
            uint256 price = _price(sc, elapsed, _initialPrice, _minPrice);
            totalCost += price;

            if (prevOwner == address(0)) {
                // Unowned: full price to treasury
                amounts[0] += price;
            } else {
                // Owned: deduct fee, pay remainder to previous owner
                uint256 fee = price * _feeRate / 10000;
                amounts[0] += fee;
                uint256 ownerAmount = price - fee;

                bool found;
                for (uint256 j = 1; j < recipientCount; ++j) {
                    if (recipients[j] == prevOwner) {
                        amounts[j] += ownerAmount;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    recipients[recipientCount] = prevOwner;
                    amounts[recipientCount] = ownerAmount;
                    ++recipientCount;
                }
            }

            // Update pixel state. owner and saleCount share one slot, so write the whole
            // struct at once (single SSTORE) rather than two read-modify-write field stores.
            if (sc < 255) {
                pixels[id] = PixelData({owner: msg.sender, saleCount: sc + 1});
            } else {
                px.owner = msg.sender;
            }

            unchecked {
                ++i;
            }
        }

        if (totalCost > maxTotalCost) revert SlippageExceeded(totalCost, maxTotalCost);

        // Execute transfers, scaling each aggregated (base-unit) amount to the chosen
        // token's decimals. Scaling is linear, so per-recipient scaling == scaling the sum.
        IERC20 t = IERC20(token);
        // Pay sellers (indices 1+). A token may block a transfer to a blacklisted previous owner;
        // rather than reverting the whole batch, keep those proceeds in the contract (the blocked
        // address could not withdraw them anyway). recipients[0] is always address(this), paid last.
        for (uint256 i = 1; i < recipientCount;) {
            uint256 amt = amounts[i];
            if (amt > 0 && !t.trySafeTransferFrom(msg.sender, recipients[i], _scaleToToken(amt, tc.decimals))) {
                amounts[0] += amt; // redirect blocked seller proceeds to the treasury (base units)
                emit SellerPaymentRedirected(recipients[i], token, amt);
            }
            unchecked {
                ++i;
            }
        }
        // Treasury: unowned-pixel proceeds + fees + any redirected seller funds, in one transfer.
        // Uses safeTransferFrom (reverting) so a buyer who cannot pay fails cleanly.
        if (amounts[0] > 0) {
            t.safeTransferFrom(msg.sender, address(this), _scaleToToken(amounts[0], tc.decimals));
        }

        emit PixelsPurchased(msg.sender, token, ids, totalCost);
    }

    function updateProfile(uint24 color, string calldata label, string calldata url) external {
        if (bytes(label).length > 64) revert LabelTooLong();
        if (bytes(url).length > 64) revert UrlTooLong();

        OwnerProfile storage profile = profiles[msg.sender];
        profile.color = color;
        bytes memory labelBytes = bytes(label);
        bytes memory urlBytes = bytes(url);
        profile.label = labelBytes;
        profile.url = urlBytes;
        emit ProfileUpdated(msg.sender, color, labelBytes, urlBytes);
    }

    // --- Views ---

    /// @notice Returns the full land mask. Pixel ID `n` is land if bit `n % 256` of word `n / 256` is set.
    function getLandMask() external view returns (uint256[] memory) {
        return landMask;
    }

    /// @notice Returns the list of accepted stablecoins. All are treated as 1:1; read each
    ///         token's own decimals()/symbol() client-side.
    function getAcceptedTokens() external view returns (address[] memory) {
        return acceptedTokens;
    }

    function currentEpoch() public view returns (uint256) {
        return _elapsed() / HALVING_TIME;
    }

    function pixelId(uint16 x, uint16 y) public view returns (uint256) {
        return uint256(y) * WIDTH + x;
    }

    function priceOf(uint16 x, uint16 y) external view returns (uint256) {
        if (x >= WIDTH || y >= HEIGHT) revert InvalidCoordinates();
        uint256 id = pixelId(x, y);
        if (!_isLand(id)) revert NotLand(id);
        return _price(pixels[id].saleCount, _elapsed(), initialPrice, minPrice);
    }

    function isLand(uint16 x, uint16 y) external view returns (bool) {
        if (x >= WIDTH || y >= HEIGHT) revert InvalidCoordinates();
        return _isLand(pixelId(x, y));
    }

    /// @notice Returns all contract constants and config needed for client-side rendering and
    ///         price computation in a single RPC call.
    function config()
        external
        view
        returns (
            uint16 width,
            uint16 height,
            uint256 halvingTime,
            uint256 _initialPrice,
            uint256 _minPrice,
            uint256 _halvingStartTimestamp,
            uint256 _feeRate
        )
    {
        return (WIDTH, HEIGHT, HALVING_TIME, initialPrice, minPrice, halvingStartTimestamp, feeRate);
    }

    /// @notice Returns packed pixel data for land pixels in a rectangle. Water pixels are skipped.
    ///         Each land pixel is encoded as 24 bytes, concatenated in pixelId order (row-major,
    ///         left-to-right, top-to-bottom):
    ///
    ///           Byte range   Field       Type
    ///           ──────────   ─────       ────
    ///           [0:20]       owner       address
    ///           [20:21]      saleCount   uint8
    ///           [21:24]      color       uint24 (big-endian)
    ///
    ///         To build a full PixelView struct {id, owner, saleCount, price, color, isLand} from
    ///         this data, the caller must:
    ///
    ///         1. Iterate the rectangle in the same row-major order (row = y..y+h, col = x..x+w),
    ///            calling isLand(col, row) for each position. Only land pixels have a corresponding
    ///            24-byte record in the output. Consume the next record when isLand is true.
    ///         2. Compute `id = row * WIDTH + col` from the iteration coordinates.
    ///         3. Decode owner (bytes 0–19), saleCount (byte 20), color (bytes 21–23) from the record.
    ///         4. Compute price client-side from saleCount (if necessary). Call config() once to get
    ///            initialPrice, minPrice, halvingStartTimestamp, and HALVING_TIME, then for each pixel:
    ///              elapsed     = halvingStartTimestamp == 0 ? 0 : block.timestamp - halvingStartTimestamp
    ///              epochStart  = elapsed / HALVING_TIME
    ///              remainder   = elapsed - epochStart * HALVING_TIME
    ///              discreteP(e)= initialPrice << (saleCount - e)   if saleCount >= e
    ///                          = max(initialPrice >> (e - saleCount), minPrice)  otherwise
    ///              price       = pStart - (pStart - pEnd) * remainder / HALVING_TIME
    ///            where pStart = discreteP(epochStart), pEnd = discreteP(epochStart + 1).
    ///            This avoids per-pixel RPC calls.
    function getPixelBatch(uint16 x, uint16 y, uint16 w, uint16 h) external view returns (bytes memory) {
        if (x + w > WIDTH || y + h > HEIGHT) revert OutOfBounds();

        // Over-allocate for max possible pixels, plus 32 bytes of slack: each record is
        // written with a 32-byte mstore (8 bytes wider than the 24-byte record), so the
        // final write must stay within the buffer. Trimmed to the real length after filling.
        bytes memory result = new bytes(uint256(w) * h * 24 + 32);
        uint256 offset;
        address cachedOwner;
        uint24 cachedColor;

        // Cache landMask word to avoid repeated SLOADs for consecutive pixels
        uint256 cachedWordIdx = type(uint256).max;
        uint256 cachedWord;

        for (uint256 row = y; row < uint256(y) + h;) {
            uint256 rowBase = row * WIDTH;
            for (uint256 col = x; col < uint256(x) + w;) {
                uint256 id = rowBase + col;

                {
                    // Inline _isLand with word caching
                    uint256 wordIdx = id >> 8;
                    if (wordIdx != cachedWordIdx) {
                        cachedWordIdx = wordIdx;
                        cachedWord = landMask[wordIdx];
                    }
                    if (cachedWord & (1 << (id & 255)) == 0) {
                        unchecked {
                            ++col;
                        }
                        continue;
                    }
                }

                {
                    PixelData storage px = pixels[id];
                    address owner = px.owner;
                    uint8 sc = px.saleCount;
                    uint24 clr;
                    if (owner != address(0)) {
                        if (owner != cachedOwner) {
                            cachedOwner = owner;
                            cachedColor = profiles[owner].color;
                        }
                        clr = cachedColor;
                    }
                    assembly ("memory-safe") {
                        let ptr := add(add(result, 32), offset)
                        mstore(ptr, or(or(shl(96, owner), shl(88, sc)), shl(64, clr)))
                    }
                    offset += 24;
                }
                unchecked {
                    ++col;
                }
            }
            unchecked {
                ++row;
            }
        }

        // Trim to actual size
        assembly ("memory-safe") { mstore(result, offset) }
        return result;
    }

    function rectanglePrice(uint16 x, uint16 y, uint16 w, uint16 h) external view returns (uint256) {
        if (x + w > WIDTH || y + h > HEIGHT) revert OutOfBounds();

        uint256 elapsed = _elapsed();
        uint256 _initialPrice = initialPrice;
        uint256 _minPrice = minPrice;
        uint256 total;

        uint256 cachedWordIdx = type(uint256).max;
        uint256 cachedWord;

        for (uint256 row = y; row < uint256(y) + h;) {
            uint256 id = row * WIDTH + x;
            for (uint256 col; col < w;) {
                // Inline _isLand with word caching — skip water pixels
                uint256 wordIdx = id >> 8;
                if (wordIdx != cachedWordIdx) {
                    cachedWordIdx = wordIdx;
                    cachedWord = landMask[wordIdx];
                }
                if (cachedWord & (1 << (id & 255)) != 0) {
                    total += _price(pixels[id].saleCount, elapsed, _initialPrice, _minPrice);
                }
                unchecked {
                    ++id;
                    ++col;
                }
            }
            unchecked {
                ++row;
            }
        }
        return total;
    }

    function selectionPrice(uint256[] calldata ids) external view returns (uint256) {
        uint256 elapsed = _elapsed();
        uint256 _initialPrice = initialPrice;
        uint256 _minPrice = minPrice;
        uint256 total;

        uint256 cachedWordIdx = type(uint256).max;
        uint256 cachedWord;

        for (uint256 i; i < ids.length; ++i) {
            uint256 id = ids[i];
            if (id >= TOTAL_PIXELS) revert InvalidPixelId(id);

            uint256 wordIdx = id >> 8;
            if (wordIdx != cachedWordIdx) {
                cachedWordIdx = wordIdx;
                cachedWord = landMask[wordIdx];
            }
            if (cachedWord & (1 << (id & 255)) == 0) revert NotLand(id);

            total += _price(pixels[id].saleCount, elapsed, _initialPrice, _minPrice);
        }
        return total;
    }

    // --- Admin ---

    /// @param amount in the token's own native units (not PRICE_DECIMALS base units).
    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Sweeps the full contract balance of every accepted token to `to`.
    ///         Note: only sweeps currently-accepted tokens — a removed token's leftover
    ///         balance must be pulled with withdraw().
    function withdrawAll(address to) external onlyOwner {
        uint256 len = acceptedTokens.length;
        for (uint256 i; i < len; ++i) {
            IERC20 token = IERC20(acceptedTokens[i]);
            uint256 bal = token.balanceOf(address(this));
            if (bal > 0) token.safeTransfer(to, bal);
        }
    }

    function addAcceptedToken(address token) external onlyOwner {
        _addAcceptedToken(token);
    }

    function removeAcceptedToken(address token) external onlyOwner {
        if (!tokenConfig[token].accepted) revert TokenNotAccepted(token);
        delete tokenConfig[token];

        uint256 len = acceptedTokens.length;
        for (uint256 i; i < len; ++i) {
            if (acceptedTokens[i] == token) {
                acceptedTokens[i] = acceptedTokens[len - 1];
                acceptedTokens.pop();
                break;
            }
        }
        emit AcceptedTokenRemoved(token);
    }

    /// @param _feeRate Fee rate in basis points (100 = 1%), capped at MAX_FEE_RATE (20%).
    function setFeeRate(uint256 _feeRate) external onlyOwner {
        if (_feeRate > MAX_FEE_RATE) revert InvalidFeeRate();
        feeRate = _feeRate;
        emit FeeRateUpdated(_feeRate);
    }

    // --- Internal ---

    function _elapsed() internal view returns (uint256) {
        uint256 start = halvingStartTimestamp;
        return start == 0 ? 0 : block.timestamp - start;
    }

    function _price(uint8 saleCount, uint256 elapsed, uint256 _initialPrice, uint256 _minPrice)
        internal
        view
        returns (uint256)
    {
        uint256 epochStart = elapsed / HALVING_TIME;
        uint256 remainder = elapsed - epochStart * HALVING_TIME;

        uint256 pStart = _discretePrice(saleCount, epochStart, _initialPrice, _minPrice);
        if (remainder == 0) return pStart;
        if (pStart == type(uint256).max) return type(uint256).max;

        uint256 pEnd = _discretePrice(saleCount, epochStart + 1, _initialPrice, _minPrice);

        // Linear interpolation between adjacent power-of-2 price levels
        return pStart - (pStart - pEnd) * remainder / HALVING_TIME;
    }

    function _discretePrice(uint8 saleCount, uint256 epoch, uint256 _initialPrice, uint256 _minPrice)
        internal
        pure
        returns (uint256)
    {
        if (saleCount >= epoch) {
            uint256 shift = saleCount - epoch;
            if (shift >= 128) return type(uint256).max;
            return _initialPrice << shift;
        } else {
            uint256 shift = epoch - saleCount;
            if (shift >= 128) return _minPrice;
            uint256 p = _initialPrice >> shift;
            return p < _minPrice ? _minPrice : p;
        }
    }

    function _addAcceptedToken(address token) internal {
        if (token == address(0)) revert InvalidToken();
        if (tokenConfig[token].accepted) revert TokenAlreadyAccepted(token);
        uint8 dec = IERC20Metadata(token).decimals(); // reverts if token lacks decimals()
        tokenConfig[token] = TokenConfig({accepted: true, decimals: dec});
        acceptedTokens.push(token);
        emit AcceptedTokenAdded(token, dec);
    }

    /// @notice Scales a base PRICE_DECIMALS amount to a token's own decimals (1:1 value).
    ///         Scale-up is exact; scale-down (sub-PRICE_DECIMALS tokens) truncates dust.
    function _scaleToToken(uint256 baseAmount, uint8 dec) internal pure returns (uint256) {
        if (dec >= PRICE_DECIMALS) return baseAmount * (10 ** (uint256(dec) - PRICE_DECIMALS));
        return baseAmount / (10 ** (PRICE_DECIMALS - uint256(dec)));
    }

    function _isLand(uint256 id) internal view returns (bool) {
        return landMask[id >> 8] & (1 << (id & 255)) != 0;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
