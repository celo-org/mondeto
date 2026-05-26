# /// script
# requires-python = ">=3.10"
# dependencies = ["cairosvg", "Pillow"]
# ///

import cairosvg
from PIL import Image
import io

TARGET_HEIGHT = 100

# Render SVG to PNG at high resolution
png_data = cairosvg.svg2png(
    url="Blank_world_map_Equal_Earth_projection.svg",
    output_height=TARGET_HEIGHT,
    background_color="white",
)

img = Image.open(io.BytesIO(png_data)).convert("L")  # grayscale

# Threshold to pure black and white (countries are gray #c0c0c0 = 192)
bw = img.point(lambda p: 255 if p > 240 else 0, mode="1")

# Find non-empty columns (columns that have at least one black pixel)
pixels = bw.load()
w, h = bw.size

left = None
right = None
for x in range(w):
    for y in range(h):
        if pixels[x, y] == 0:  # black pixel
            if left is None:
                left = x
            right = x
            break

if left is None:
    print("No non-empty columns found!")
else:
    cropped = bw.crop((left, 0, right + 1, h))
    cropped.save("world_map_bw.png")
    print(f"Original: {w}x{h}, Cropped: {cropped.size[0]}x{cropped.size[1]}")
    print(f"Trimmed columns: {left} from left, {w - 1 - right} from right")
    print("Saved to world_map_bw.png")
