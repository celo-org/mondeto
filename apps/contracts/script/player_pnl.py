#!/usr/bin/env python3
"""Compute per-player profit & loss from Mondeto pixel trading.

Requires: foundry (cast) installed. No Python dependencies beyond stdlib.

Env vars:
    PROXY_ADDRESS   Mondeto proxy contract address
    ETH_RPC_URL     RPC endpoint (same env var cast uses)

Usage:
    PROXY_ADDRESS=0x7e68c4c7458895ec8ded5a44299e05d0a6d54780 \
        python3 script/player_pnl.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

DEPLOY_BLOCK = "0x3b25aeb"  # 62,020,331

# keccak256("PixelsPurchased(address,uint256[],uint256)")
PIXELS_PURCHASED_TOPIC = (
    "0xcb47c828a4c904ab47ad45ca7b3e0100c7a1c42e56a8c4992a9cf6188fa5e733"
)
# keccak256("Transfer(address,address,uint256)")
TRANSFER_TOPIC = (
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
)


# ---------------------------------------------------------------------------
# RPC helpers
# ---------------------------------------------------------------------------

def cast_call(proxy: str, sig: str, args: list | None = None) -> str:
    cmd = ["cast", "call", proxy, sig]
    if args:
        cmd.extend(str(a) for a in args)
    r = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return r.stdout.strip()


def _strip_0x(h: str) -> str:
    return h[2:] if h.startswith("0x") else h


def _word(hex_str: str, i: int) -> int:
    return int(hex_str[i * 64 : (i + 1) * 64], 16)


def cast_logs(address: str, topics: list[str], from_block: str) -> list[dict]:
    cmd = [
        "cast", "logs", "--json",
        "--from-block", from_block,
        "--address", address,
    ]
    for t in topics:
        cmd.append(t)
    r = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def cast_receipt(tx_hash: str) -> dict:
    r = subprocess.run(
        ["cast", "receipt", "--json", tx_hash],
        capture_output=True, text=True, check=True,
    )
    return json.loads(r.stdout)


# ---------------------------------------------------------------------------
# Profile decoding
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    proxy = os.environ["PROXY_ADDRESS"].lower()
    usdt = cast_call(proxy, "usdt()(address)").lower()

    # --- Step 1: Fetch PixelsPurchased events ---
    print("Fetching PixelsPurchased events...")
    purchase_logs = cast_logs(proxy, [PIXELS_PURCHASED_TOPIC], DEPLOY_BLOCK)
    print(f"  Found {len(purchase_logs)} purchase events")

    spent: dict[str, int] = {}  # buyer -> total spent
    tx_hashes: set[str] = set()

    for log in purchase_logs:
        # topics[1] = buyer (indexed, zero-padded address)
        buyer = "0x" + log["topics"][1][-40:]
        # data: offset to ids array (word 0), totalCost (last word)
        data = _strip_0x(log["data"])
        # Layout: word0 = offset to ids, word1 = totalCost
        # Actually for (uint256[] ids, uint256 totalCost):
        # word0 = offset to ids array, word1 = totalCost,
        # then ids array at the offset
        total_cost = _word(data, 1)
        spent[buyer] = spent.get(buyer, 0) + total_cost
        tx_hashes.add(log["transactionHash"])

    # --- Step 2: Fetch receipts and parse Transfer events for earnings ---
    print(f"Fetching {len(tx_hashes)} transaction receipts...")
    earned: dict[str, int] = {}  # seller -> total earned

    proxy_padded = "0x" + proxy[-40:].zfill(64)

    for i, tx_hash in enumerate(sorted(tx_hashes)):
        if (i + 1) % 20 == 0 or i == 0:
            print(f"  Receipt {i + 1}/{len(tx_hashes)}...")
        receipt = cast_receipt(tx_hash)
        for log in receipt.get("logs", []):
            if log["address"].lower() != usdt:
                continue
            topics = log.get("topics", [])
            if len(topics) < 3 or topics[0] != TRANSFER_TOPIC:
                continue
            to_addr = "0x" + topics[2][-40:]
            if to_addr.lower() == proxy:
                continue  # treasury/fee payment, not seller earnings
            value = int(log["data"], 16)
            earned[to_addr] = earned.get(to_addr, 0) + value

    # --- Step 3: Collect all players and resolve profiles ---
    all_addrs = set(spent.keys()) | set(earned.keys())
    print(f"Resolving {len(all_addrs)} player profiles...")

    labels: dict[str, str] = {}
    for addr in all_addrs:
        try:
            raw = cast_call(proxy, "profiles(address)(uint24,bytes,bytes)", [addr])
            label = parse_profile_label(raw)
            if label:
                labels[addr] = label
        except subprocess.CalledProcessError:
            pass

    # --- Step 4: Build and display table ---
    players = []
    for addr in all_addrs:
        s = spent.get(addr, 0)
        e = earned.get(addr, 0)
        players.append((addr, s, e, e - s))

    # Sort by earned descending
    players.sort(key=lambda x: x[2], reverse=True)

    def fmt_addr(addr: str) -> str:
        if addr in labels:
            return labels[addr][:19]
        return addr[:6] + "..." + addr[-4:]

    print()
    print("=== Mondeto Player P&L (ranked by earnings) ===")
    print()
    print(f"{'#':>3}  {'Player':<19}  {'Spent (USDT)':>12}  {'Earned (USDT)':>13}  {'Net (USDT)':>10}")
    print(f"{'---':>3}  {'-------------------':<19}  {'------------':>12}  {'-------------':>13}  {'----------':>10}")

    for rank, (addr, s, e, net) in enumerate(players, 1):
        name = fmt_addr(addr)
        print(
            f"{rank:>3}  {name:<19}"
            f"  {s / 1e6:>12.2f}"
            f"  {e / 1e6:>13.2f}"
            f"  {net / 1e6:>10.2f}"
        )

    print()
    total_spent = sum(s for _, s, _, _ in players)
    total_earned = sum(e for _, _, e, _ in players)
    print(f"Total volume spent:  {total_spent / 1e6:.2f} USDT")
    print(f"Total volume earned: {total_earned / 1e6:.2f} USDT")


if __name__ == "__main__":
    main()
