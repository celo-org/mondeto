#!/usr/bin/env python3
"""Compute Mondeto leaderboard winners and optionally pay rewards.

Requires: foundry (cast) installed. No Python dependencies beyond stdlib.

Env vars:
    PROXY_ADDRESS   Mondeto proxy contract address
    ETH_RPC_URL     RPC endpoint (same env var cast uses)
    REWARD_AMOUNT   Per-winner reward in USDT smallest units (6 decimals)

For --broadcast mode:
    PRIVATE_KEY     Sender private key (must hold >= 3x REWARD_AMOUNT USDT)

Usage:
    # Dry run — compute and print winners:
    PROXY_ADDRESS=0x... ETH_RPC_URL=https://... REWARD_AMOUNT=1000000 \
        python3 script/pay_leaders.py

    # Send payments:
    PROXY_ADDRESS=0x... ETH_RPC_URL=https://... REWARD_AMOUNT=1000000 \
        PRIVATE_KEY=0x... python3 script/pay_leaders.py --broadcast
"""

from __future__ import annotations

import os
import subprocess
import sys
from collections import deque

ZERO = "0x" + "00" * 20


# ---------------------------------------------------------------------------
# RPC helpers (shell out to cast)
# ---------------------------------------------------------------------------

def cast_call(proxy: str, sig: str, args: list | None = None) -> str:
    """Call a view function via cast and return stdout.

    cast reads ETH_RPC_URL from the environment automatically.
    """
    cmd = ["cast", "call", proxy, sig]
    if args:
        cmd.extend(str(a) for a in args)
    r = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return r.stdout.strip()


def cast_block_timestamp() -> int:
    r = subprocess.run(
        ["cast", "block", "latest", "--field", "timestamp"],
        capture_output=True, text=True, check=True,
    )
    return int(r.stdout.strip(), 0)


# ---------------------------------------------------------------------------
# ABI decoding helpers
# ---------------------------------------------------------------------------

def _strip_0x(h: str) -> str:
    return h[2:] if h.startswith("0x") else h


def _word(hex_str: str, i: int) -> int:
    """Read the i-th 32-byte word from a hex string."""
    return int(hex_str[i * 64 : (i + 1) * 64], 16)


def decode_uint256_array(raw_hex: str) -> list[int]:
    h = _strip_0x(raw_hex)
    length = _word(h, 1)
    return [_word(h, 2 + i) for i in range(length)]


def decode_bytes(raw_hex: str) -> bytes:
    h = _strip_0x(raw_hex)
    length = _word(h, 1)
    return bytes.fromhex(h[128 : 128 + length * 2])


def parse_profile_label(cast_output: str) -> str:
    """Parse label from cast's decoded profiles() output.

    cast returns 3 lines: color (decimal), label (0x hex), url (0x hex).
    """
    lines = cast_output.strip().splitlines()
    if len(lines) < 2:
        return ""
    label_hex = _strip_0x(lines[1].strip())
    if not label_hex:
        return ""
    return bytes.fromhex(label_hex).decode("utf-8", errors="replace")


def resolve_label(proxy: str, addr: str) -> str:
    """Return profile label for addr, or empty string."""
    if addr == ZERO:
        return ""
    try:
        raw = cast_call(proxy, "profiles(address)(uint24,bytes,bytes)", [addr])
        return parse_profile_label(raw)
    except subprocess.CalledProcessError:
        return ""


def fmt_addr(addr: str, label: str) -> str:
    """Format address with label if available."""
    if label:
        return f"{addr}  ({label})"
    return addr


# ---------------------------------------------------------------------------
# Read contract state
# ---------------------------------------------------------------------------

def read_config(proxy: str) -> dict:
    h = _strip_0x(cast_call(proxy, "config()"))
    return dict(
        width=_word(h, 0),
        height=_word(h, 1),
        halvingTime=_word(h, 2),
        initialPrice=_word(h, 3),
        minPrice=_word(h, 4),
        deployTimestamp=_word(h, 5),
        feeRate=_word(h, 6),
    )


def read_usdt_address(proxy: str) -> str:
    return cast_call(proxy, "usdt()(address)")


def read_land_mask(proxy: str) -> list[int]:
    return decode_uint256_array(cast_call(proxy, "getLandMask()"))


def read_pixel_batch(proxy: str, w: int, h: int) -> bytes:
    raw = cast_call(
        proxy,
        "getPixelBatch(uint16,uint16,uint16,uint16)",
        [0, 0, w, h],
    )
    return decode_bytes(raw)


# ---------------------------------------------------------------------------
# Decode pixel data (mirrors contractReads.ts decodePixelBatch)
# ---------------------------------------------------------------------------

def decode_pixels(
    batch: bytes, mask: list[int], width: int, height: int
) -> tuple[list[str], list[int]]:
    """Return (owners, sale_counts) arrays indexed by pixel id."""
    total = width * height
    owners = [ZERO] * total
    sale_counts = [0] * total
    offset = 0
    for row in range(height):
        for col in range(width):
            pid = row * width + col
            if mask[pid >> 8] & (1 << (pid & 255)) == 0:
                continue
            if offset + 24 > len(batch):
                break
            owners[pid] = "0x" + batch[offset : offset + 20].hex()
            sale_counts[pid] = batch[offset + 20]
            offset += 24
    return owners, sale_counts


# ---------------------------------------------------------------------------
# Price formula (mirrors Mondeto._price / _discretePrice)
# ---------------------------------------------------------------------------

def discrete_price(sale_count: int, epoch: int, ip: int, mp: int) -> int:
    if sale_count >= epoch:
        shift = sale_count - epoch
        if shift >= 128:
            return (1 << 256) - 1  # type(uint256).max
        return ip << shift
    else:
        shift = epoch - sale_count
        if shift >= 128:
            return mp
        p = ip >> shift
        return max(p, mp)


def price_of(sale_count: int, elapsed: int, ip: int, mp: int, ht: int) -> int:
    epoch_start = elapsed // ht
    remainder = elapsed - epoch_start * ht
    p_start = discrete_price(sale_count, epoch_start, ip, mp)
    if remainder == 0:
        return p_start
    if p_start >= (1 << 256) - 1:
        return p_start
    p_end = discrete_price(sale_count, epoch_start + 1, ip, mp)
    return p_start - (p_start - p_end) * remainder // ht


# ---------------------------------------------------------------------------
# Leaderboard: Area (total pixel count per owner)
# ---------------------------------------------------------------------------

def leaderboard_area(owners: list[str]) -> tuple[str, int]:
    counts: dict[str, int] = {}
    for o in owners:
        if o == ZERO:
            continue
        counts[o] = counts.get(o, 0) + 1
    if not counts:
        return ZERO, 0
    winner = max(counts, key=counts.__getitem__)
    return winner, counts[winner]


# ---------------------------------------------------------------------------
# Leaderboard: Empire (largest contiguous territory per owner)
# ---------------------------------------------------------------------------

def leaderboard_empire(
    owners: list[str], width: int, height: int
) -> tuple[str, int]:
    total = width * height
    visited = [False] * total
    best: dict[str, int] = {}

    for pid in range(total):
        o = owners[pid]
        if o == ZERO or visited[pid]:
            continue

        # BFS flood fill
        size = 0
        q = deque([pid])
        while q:
            cur = q.popleft()
            if visited[cur]:
                continue
            if owners[cur] != o:
                continue
            visited[cur] = True
            size += 1
            x, y = cur % width, cur // width
            if x > 0:
                q.append(cur - 1)
            if x < width - 1:
                q.append(cur + 1)
            if y > 0:
                q.append(cur - width)
            if y < height - 1:
                q.append(cur + width)

        if o not in best or size > best[o]:
            best[o] = size

    if not best:
        return ZERO, 0
    winner = max(best, key=best.__getitem__)
    return winner, best[winner]


# ---------------------------------------------------------------------------
# Leaderboard: Tycoons / Hot Pix (most expensive single pixel per owner)
# ---------------------------------------------------------------------------

def leaderboard_tycoons(
    owners: list[str],
    sale_counts: list[int],
    elapsed: int,
    ip: int,
    mp: int,
    ht: int,
) -> tuple[str, int]:
    best: dict[str, int] = {}
    for pid, o in enumerate(owners):
        if o == ZERO:
            continue
        p = price_of(sale_counts[pid], elapsed, ip, mp, ht)
        if o not in best or p > best[o]:
            best[o] = p
    if not best:
        return ZERO, 0
    winner = max(best, key=best.__getitem__)
    return winner, best[winner]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    proxy = os.environ["PROXY_ADDRESS"]
    reward = int(os.environ["REWARD_AMOUNT"])
    broadcast = "--broadcast" in sys.argv

    print("Reading contract state...")
    cfg = read_config(proxy)
    usdt = read_usdt_address(proxy)
    mask = read_land_mask(proxy)
    batch = read_pixel_batch(proxy, cfg["width"], cfg["height"])
    block_ts = cast_block_timestamp()

    print("Decoding pixels...")
    owners, sale_counts = decode_pixels(batch, mask, cfg["width"], cfg["height"])
    elapsed = block_ts - cfg["deployTimestamp"]

    print("Computing leaderboards...")
    area_addr, area_val = leaderboard_area(owners)
    empire_addr, empire_val = leaderboard_empire(owners, cfg["width"], cfg["height"])
    tycoon_addr, tycoon_val = leaderboard_tycoons(
        owners, sale_counts, elapsed,
        cfg["initialPrice"], cfg["minPrice"], cfg["halvingTime"],
    )

    print("Resolving player profiles...")
    winner_addrs = {area_addr, empire_addr, tycoon_addr} - {ZERO}
    labels = {a: resolve_label(proxy, a) for a in winner_addrs}

    print()
    print("=== Leaderboard Winners ===")
    print(f"  Area:    {fmt_addr(area_addr, labels.get(area_addr, ''))}  ({area_val} px)")
    print(f"  Empire:  {fmt_addr(empire_addr, labels.get(empire_addr, ''))}  ({empire_val} px)")
    print(f"  Tycoon:  {fmt_addr(tycoon_addr, labels.get(tycoon_addr, ''))}  ({tycoon_val / 1e6:.2f} USDT)")
    print(f"  Reward:  {reward} ({reward / 1e6:.2f} USDT each)")
    print()

    if not broadcast:
        print("Dry run. Use --broadcast to send payments.")
        return

    pk = os.environ["PRIVATE_KEY"]
    winners = [("area", area_addr), ("empire", empire_addr), ("tycoon", tycoon_addr)]

    # Fetch starting nonce once; increment manually to avoid race.
    sender = subprocess.run(
        ["cast", "wallet", "address", "--private-key", pk],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    nonce = int(subprocess.run(
        ["cast", "nonce", sender],
        capture_output=True, text=True, check=True,
    ).stdout.strip(), 0)

    for label, addr in winners:
        if addr == ZERO:
            print(f"  Skipping {label}: no winner")
            continue
        name = labels.get(addr, "")
        display = fmt_addr(addr, name)
        print(f"  Paying {label} winner {display} (nonce {nonce})...")
        subprocess.run(
            [
                "cast", "send", usdt,
                "transfer(address,uint256)(bool)",
                addr, str(reward),
                "--private-key", pk,
                "--nonce", str(nonce),
            ],
            check=True,
        )
        nonce += 1
        print(f"    Done.")


if __name__ == "__main__":
    main()
