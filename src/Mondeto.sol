// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
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

    // --- State ---
    IERC20 public usdt;
    uint256 public deployTimestamp;
    uint256 public initialPrice;
    uint256 public minPrice;

    mapping(uint256 => PixelData) public pixels;
    mapping(address => OwnerProfile) public profiles;
    uint256[] public landMask;
    uint256 public feeRate; // basis points (e.g. 300 = 3%); fee goes to contract treasury

    // --- Events ---
    event PixelsPurchased(address indexed buyer, uint256[] ids, uint256 totalCost);
    event ProfileUpdated(address indexed user, uint24 color, bytes label, bytes url);

    // --- Errors ---
    error InvalidPixelId(uint256 id);
    error InvalidCoordinates();
    error OutOfBounds();
    error NotLand(uint256 id);
    error LabelTooLong();
    error UrlTooLong();
    error InvalidMaskLength();
    error InvalidFeeRate();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(uint16 _width, uint16 _height, uint256 _halvingTime) {
        WIDTH = _width;
        HEIGHT = _height;
        TOTAL_PIXELS = uint256(_width) * _height;
        LAND_MASK_LENGTH = (TOTAL_PIXELS + 255) / 256;
        HALVING_TIME = _halvingTime;
        _disableInitializers();
    }

    function initialize(
        address _usdt,
        uint256 _initialPrice,
        uint256 _minPrice,
        uint256 _feeRate,
        uint256[] calldata _landMask
    ) external initializer {
        __Ownable_init(msg.sender);

        if (_landMask.length != LAND_MASK_LENGTH) revert InvalidMaskLength();
        if (_feeRate > 10000) revert InvalidFeeRate();

        usdt = IERC20(_usdt);
        deployTimestamp = block.timestamp;
        initialPrice = _initialPrice;
        minPrice = _minPrice;
        feeRate = _feeRate;

        landMask = _landMask;
    }

    // --- Core ---

    function buyPixels(uint256[] calldata ids) external nonReentrant {
        uint256 elapsed = block.timestamp - deployTimestamp;
        uint256 _feeRate = feeRate;
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
            uint256 price = _price(sc, elapsed, initialPrice, minPrice);
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

            // Update pixel state
            px.owner = msg.sender;
            if (sc < 255) {
                px.saleCount = sc + 1;
            }

            unchecked { ++i; }
        }

        // Execute transfers
        for (uint256 i; i < recipientCount;) {
            if (amounts[i] > 0) {
                usdt.safeTransferFrom(msg.sender, recipients[i], amounts[i]);
            }
            unchecked { ++i; }
        }

        emit PixelsPurchased(msg.sender, ids, totalCost);
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

    function currentEpoch() public view returns (uint256) {
        return (block.timestamp - deployTimestamp) / HALVING_TIME;
    }

    function pixelId(uint16 x, uint16 y) public view returns (uint256) {
        return uint256(y) * WIDTH + x;
    }

    function priceOf(uint16 x, uint16 y) external view returns (uint256) {
        if (x >= WIDTH || y >= HEIGHT) revert InvalidCoordinates();
        uint256 id = pixelId(x, y);
        if (!_isLand(id)) revert NotLand(id);
        return _price(pixels[id].saleCount, block.timestamp - deployTimestamp, initialPrice, minPrice);
    }

    function isLand(uint16 x, uint16 y) external view returns (bool) {
        if (x >= WIDTH || y >= HEIGHT) revert InvalidCoordinates();
        return _isLand(pixelId(x, y));
    }

    /// @notice Returns all contract constants and config needed for client-side rendering and
    ///         price computation in a single RPC call.
    function config() external view returns (
        uint16 width,
        uint16 height,
        uint256 halvingTime,
        uint256 _initialPrice,
        uint256 _minPrice,
        uint256 _deployTimestamp,
        uint256 _feeRate
    ) {
        return (WIDTH, HEIGHT, HALVING_TIME, initialPrice, minPrice, deployTimestamp, feeRate);
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
    ///            initialPrice, minPrice, deployTimestamp, and HALVING_TIME, then for each pixel:
    ///              elapsed     = block.timestamp - deployTimestamp
    ///              epochStart  = elapsed / HALVING_TIME
    ///              remainder   = elapsed - epochStart * HALVING_TIME
    ///              discreteP(e)= initialPrice << (saleCount - e)   if saleCount >= e
    ///                          = max(initialPrice >> (e - saleCount), minPrice)  otherwise
    ///              price       = pStart - (pStart - pEnd) * remainder / HALVING_TIME
    ///            where pStart = discreteP(epochStart), pEnd = discreteP(epochStart + 1).
    ///            This avoids per-pixel RPC calls.
    function getPixelBatch(uint16 x, uint16 y, uint16 w, uint16 h) external view returns (bytes memory) {
        if (x + w > WIDTH || y + h > HEIGHT) revert OutOfBounds();

        // Over-allocate for max possible pixels, trim after filling
        bytes memory result = new bytes(uint256(w) * h * 24);
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
                        unchecked { ++col; }
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
                    assembly {
                        let ptr := add(add(result, 32), offset)
                        mstore(ptr, or(or(shl(96, owner), shl(88, sc)), shl(64, clr)))
                    }
                    offset += 24;
                }
                unchecked { ++col; }
            }
            unchecked { ++row; }
        }

        // Trim to actual size
        assembly { mstore(result, offset) }
        return result;
    }

    function rectanglePrice(uint16 x, uint16 y, uint16 w, uint16 h) external view returns (uint256) {
        if (x + w > WIDTH || y + h > HEIGHT) revert OutOfBounds();

        uint256 elapsed = block.timestamp - deployTimestamp;
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
                unchecked { ++id; ++col; }
            }
            unchecked { ++row; }
        }
        return total;
    }

    function selectionPrice(uint256[] calldata ids) external view returns (uint256) {
        uint256 elapsed = block.timestamp - deployTimestamp;
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

    function withdraw(address to, uint256 amount) external onlyOwner {
        usdt.safeTransfer(to, amount);
    }

    function setInitialPrice(uint256 _initialPrice) external onlyOwner {
        initialPrice = _initialPrice;
    }

    /// @param _feeRate Fee rate in basis points (10000 = 100%, 100 = 1%).
    function setFeeRate(uint256 _feeRate) external onlyOwner {
        if (_feeRate > 10000) revert InvalidFeeRate();
        feeRate = _feeRate;
    }

    // --- Internal ---

    function _price(uint8 saleCount, uint256 elapsed, uint256 _initialPrice, uint256 _minPrice) internal view returns (uint256) {
        uint256 epochStart = elapsed / HALVING_TIME;
        uint256 remainder = elapsed - epochStart * HALVING_TIME;

        uint256 pStart = _discretePrice(saleCount, epochStart, _initialPrice, _minPrice);
        if (remainder == 0) return pStart;
        if (pStart == type(uint256).max) return type(uint256).max;

        uint256 pEnd = _discretePrice(saleCount, epochStart + 1, _initialPrice, _minPrice);

        // Linear interpolation between adjacent power-of-2 price levels
        return pStart - (pStart - pEnd) * remainder / HALVING_TIME;
    }

    function _discretePrice(uint8 saleCount, uint256 epoch, uint256 _initialPrice, uint256 _minPrice) internal pure returns (uint256) {
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

    function _isLand(uint256 id) internal view returns (bool) {
        return landMask[id >> 8] & (1 << (id & 255)) != 0;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
