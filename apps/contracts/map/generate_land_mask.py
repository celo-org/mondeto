#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["Pillow"]
# ///
"""
Convert a BW map PNG to a bitmask for the Mondeto smart contract.

Land (black pixels) = 1, Water (white pixels) = 0.
Dimensions and word count are derived from the image.

Pixel ID = y * width + x, matching the contract's pixelId() function.

Usage: generate_land_mask.py [INPUT_PNG] [OUTPUT_JSON]
Both args default to the world map (world_map_bw.png -> land_mask.json).
"""

import argparse
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "input",
        nargs="?",
        default=str(script_dir / "world_map_bw.png"),
        help="Input BW PNG path",
    )
    parser.add_argument(
        "output",
        nargs="?",
        default=str(script_dir / "land_mask.json"),
        help="Output JSON path",
    )
    args = parser.parse_args()

    image_path = Path(args.input)
    if not image_path.exists():
        print(f"Error: {image_path} not found", file=sys.stderr)
        sys.exit(1)

    width, height, mask = generate_land_mask(str(image_path))
    total_pixels = width * height

    land_count = sum(bin(w).count("1") for w in mask)
    print(
        f"{image_path.name}: {width}x{height} ({total_pixels} px, {len(mask)} words), "
        f"{land_count} land",
        file=sys.stderr,
    )

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump({"width": width, "height": height, "mask": mask}, f)
    print(f"-> {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
