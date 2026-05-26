# Mondeto Contract API

A 170×100 pixel world map on Celo. Every land pixel is ownable on-chain. Currency is USDT (6 decimals).

## Coordinate System

Pixels are addressed in two ways:

- **(x, y)** — column/row, zero-indexed. `(0,0)` is top-left, `(169,99)` is bottom-right.
- **pixel ID** — `id = y * WIDTH + x` (row-major). IDs run 0–16999.

Most write functions accept IDs; view helpers accept (x, y).

---

## Reading State

### `config()`

Fetch all constants in one call. Do this once at startup.

```solidity
function config() external view returns (
    uint16 width,           // 170
    uint16 height,          // 100
    uint256 halvingTime,    // 182 days in seconds
    uint256 initialPrice,   // base price in USDT micro-units
    uint256 minPrice,       // price floor in USDT micro-units
    uint256 deployTimestamp // used for price calculations
)
```

### `getPixelBatch(x, y, w, h)`

Bulk-fetch pixel state for a rectangle. Returns tightly-packed bytes — **only land pixels are included**, water pixels are silently skipped.

Each land pixel occupies exactly 24 bytes:

| Bytes | Field      | Type    |
|-------|------------|---------|
| 0–19  | owner      | address |
| 20    | saleCount  | uint8   |
| 21–23 | color      | uint24  |

To decode, iterate the rectangle in row-major order (row = y..y+h, col = x..x+w). For each coordinate, check `isLand(col, row)` — if true, consume the next 24-byte record.

**Unowned pixels** have `owner = address(0)` and `color = 0`.

### `pixels(id)`

Single pixel lookup: returns `(address owner, uint8 saleCount)`.

### `profiles(address)`

Returns `(uint24 color, bytes label, bytes url)` for a wallet.

### `isLand(x, y)`

Returns `true` if the pixel is purchasable. Water pixels always revert with `NotLand` if you try to buy them.

---

## Pricing

Prices are in **USDT micro-units** (1 = 0.000001 USDT). Every sale doubles the price. Every `HALVING_TIME` (182 days) without a sale, the price halves, down to `minPrice`.

### Getting a price

| Method | Use case |
|--------|----------|
| `priceOf(x, y)` | Single pixel, on-chain (one RPC call per pixel) |
| `selectionPrice(ids[])` | Arbitrary set of pixels, on-chain total |
| `rectanglePrice(x, y, w, h)` | Rectangle total, on-chain |
| Compute client-side | After calling `getPixelBatch` — avoids per-pixel RPCs |

### Client-side price formula

After fetching `config()` once:

```js
function pixelPrice(saleCount, config, blockTimestamp) {
  const { halvingTime, initialPrice, minPrice, deployTimestamp } = config;
  const elapsed = blockTimestamp - deployTimestamp;
  const epochStart = elapsed / halvingTime;          // integer division
  const remainder  = elapsed % halvingTime;

  const pStart = discretePrice(saleCount, epochStart,     initialPrice, minPrice);
  const pEnd   = discretePrice(saleCount, epochStart + 1, initialPrice, minPrice);

  // Linear interpolation within the epoch
  return pStart - (pStart - pEnd) * remainder / halvingTime;
}

function discretePrice(saleCount, epoch, initialPrice, minPrice) {
  if (saleCount >= epoch) {
    const shift = saleCount - epoch;
    if (shift >= 128) return BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    return initialPrice << BigInt(shift);
  } else {
    const shift = epoch - saleCount;
    if (shift >= 128) return minPrice;
    const p = initialPrice >> BigInt(shift);
    return p < minPrice ? minPrice : p;
  }
}
```

Use `BigInt` (JS) or equivalent — prices can overflow 64-bit integers for high-`saleCount` pixels.

---

## Writing State

### `buyPixels(ids[])`

Purchase one or more pixels in a single transaction.

```solidity
function buyPixels(uint256[] calldata ids) external
```

**Before calling:**

1. Compute the total price (`selectionPrice` or client-side formula).
2. Call `usdt.approve(mondetoProxy, totalCost)` — the contract pulls USDT via `transferFrom`.

**Payment routing:**
- Unowned pixel → USDT goes to the **contract treasury**
- Owned pixel → USDT goes **directly to the previous owner** (no royalty, no fee)
- Buying your own pixel → net-zero transfer (you pay yourself), but `saleCount` still increments

**Gotchas:**
- Pixel IDs must be valid land pixels. Any water pixel or out-of-range ID reverts the **entire** transaction.
- Prices are read at the moment of execution. If the block you estimated on has passed, the price may differ slightly (time-based decay). Always approve a small buffer (~1%) or re-query just before sending.
- `saleCount` saturates at 255 — it cannot overflow, but extremely hot pixels have astronomically high prices.
- Gas scales linearly with the number of pixels. The aggregation loop is O(n²) on unique owners — fine up to ~100 pixels per tx, gets expensive beyond that.

### `updateProfile(color, label, url)`

Set your display name and color. Can be called independently of buying pixels.

```solidity
function updateProfile(uint24 color, string calldata label, string calldata url) external
```

- `color` — 24-bit RGB, e.g. `0xFF5733`
- `label` — max **64 bytes** (not characters — multibyte UTF-8 counts against this)
- `url` — max **64 bytes**
- Calling this again overwrites all fields; there is no partial update.

---

## Events

```solidity
event PixelsPurchased(address indexed buyer, uint256[] ids, uint256 totalCost);
event ProfileUpdated(address indexed user, uint24 color, bytes label, bytes url);
```

Index `PixelsPurchased` to track ownership history. Note `totalCost` is in USDT micro-units.

---

## Common Pitfalls

**Stale price estimate.** Prices decay continuously with time. Compute price and send the transaction in the same block if possible. For UIs, fetch price at submission time, not page load.

**Approval too small.** If you approve exactly the estimated total and the price ticks up by even 1 unit, the transaction reverts. Approve `estimatedTotal * 101 / 100` and let the contract pull only what it needs.

**Buying water.** `NotLand(id)` reverts the whole batch. Always validate against `isLand` or the land mask before building your ID list.

**Proxy address vs. implementation.** Always interact with the **proxy** address. The implementation address changes on upgrades. Never call `initialize()` on the implementation directly.

**Profile color vs. pixel color.** `getPixelBatch` returns the owner's profile color, not a per-pixel color. If an address has no profile set, color is `0` (black).

---

## Gas Reference

| Action | Approximate gas |
|--------|----------------|
| `buyPixels` — 1 pixel (unowned) | ~85k |
| `buyPixels` — 1 pixel (owned, new owner) | ~95k |
| `buyPixels` — N pixels, same owner | ~85k + ~25k per additional pixel |
| `updateProfile` | ~50k |
| `getPixelBatch` (read-only) | free |
