#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["Pillow"]
# ///
"""
Convert world_map_bw.png to a bitmask for the Mondeto smart contract.

Land (black pixels) = 1, Water (white pixels) = 0.
Dimensions and word count are derived from the image.

Pixel ID = y * width + x, matching the contract's pixelId() function.
"""

import json
import sys
from pathlib import Path

from PIL import Image

THRESHOLD = 128  # below this = land (black), above = water (white)


def generate_land_mask(image_path: str) -> tuple[int, int, list[int]]:
    img = Image.open(image_path).convert("L")  # grayscale
    width, height = img.size
    total_pixels = width * height
    words = (total_pixels + 255) // 256

    pixels = img.load()
    mask = [0] * words

    for y in range(height):
        for x in range(width):
            pixel_id = y * width + x
            brightness = pixels[x, y]

            if brightness < THRESHOLD:  # black = land
                word_index = pixel_id // 256
                bit_index = pixel_id % 256
                mask[word_index] |= 1 << bit_index

    return width, height, mask


def main():
    script_dir = Path(__file__).parent
    image_path = script_dir / "world_map_bw.png"

    if not image_path.exists():
        print(f"Error: {image_path} not found", file=sys.stderr)
        sys.exit(1)

    width, height, mask = generate_land_mask(str(image_path))
    total_pixels = width * height

    # Count land pixels
    land_count = sum(bin(w).count("1") for w in mask)
    print(f"Image: {width}x{height} ({total_pixels} pixels, {len(mask)} words)", file=sys.stderr)
    print(f"Land pixels: {land_count} / {total_pixels}", file=sys.stderr)

    sol_path = script_dir / "land_mask.json"
    with open(sol_path, "w") as f:
        json.dump({"width": width, "height": height, "mask": mask}, f)
    print(f"Solidity-compatible mask written to {sol_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
