# /// script
# requires-python = ">=3.10"
# dependencies = ["cairosvg", "Pillow"]
# ///
"""Render the Equal Earth world SVG to a black-and-white PNG.

Default mode renders the whole world. Pass ``--continent <name>`` to render
only that country class's countries from the Equal-Earth SVG — kept around
for future per-country map rendering.

Geographic continent maps use a separate path: see ``generate_continents.py``
(Natural Earth subunits).
"""

import argparse
import io
import re
import sys
from pathlib import Path

import cairosvg
from PIL import Image

from continents import CONTINENTS

SCRIPT_DIR = Path(__file__).parent
SVG_PATH = SCRIPT_DIR / "Blank_world_map_Equal_Earth_projection.svg"
DEFAULT_HEIGHT = 100


def _all_country_codes(svg_text: str) -> set[str]:
    """All 3-letter country/territory class codes used in the SVG."""
    return set(re.findall(r'class="([A-Z]{3})(?: [A-Z]{2})?"', svg_text))


def render_png(continent: str | None, height: int = DEFAULT_HEIGHT) -> Image.Image:
    """Render the Equal-Earth world SVG to a 1-bit BW image.

    If ``continent`` is set, mask out countries not in that continent's
    country-class list (see continents.py). Used for per-country/country-list
    maps, not for geographic continent maps — see ``generate_continents.py``.
    """
    kwargs = {"output_height": height, "background_color": "white"}

    if continent is None:
        png_data = cairosvg.svg2png(url=str(SVG_PATH), **kwargs)
    else:
        svg_text = SVG_PATH.read_text()
        keep = set(CONTINENTS[continent])
        # Every country class NOT in this continent is forced white. This is needed
        # because some territories are nested inside other country groups
        # (e.g. <g class="GRL"> sits inside <g class="DNK">), so a `fill` set on
        # the parent would otherwise be inherited by the descendant.
        hide = sorted(_all_country_codes(svg_text) - keep)
        keep_sel = ", ".join(f".{c}" for c in sorted(keep))
        hide_sel = ", ".join(f".{c}" for c in hide)
        extra = (
            "<style type=\"text/css\">"
            ".country { fill:#ffffff !important; stroke:#ffffff !important; }"
            f"{hide_sel} {{ fill:#ffffff !important; stroke:#ffffff !important; }}"
            f"{keep_sel} {{ fill:#c0c0c0 !important; stroke:none !important; }}"
            "</style>"
        )
        svg_text = svg_text.replace("</style>", "</style>" + extra, 1)
        png_data = cairosvg.svg2png(bytestring=svg_text.encode("utf-8"), **kwargs)

    img = Image.open(io.BytesIO(png_data)).convert("L")
    return img.point(lambda p: 255 if p > 240 else 0, mode="1")


def drop_small_components(bw: Image.Image, *, min_size: int) -> Image.Image:
    """Whiten land components smaller than min_size pixels."""
    w, h = bw.size
    pixels = bw.load()
    seen = [[False] * h for _ in range(w)]
    components: list[list[tuple[int, int]]] = []
    for sx in range(w):
        for sy in range(h):
            if seen[sx][sy] or pixels[sx, sy] != 0:
                continue
            stack = [(sx, sy)]
            comp: list[tuple[int, int]] = []
            while stack:
                x, y = stack.pop()
                if x < 0 or x >= w or y < 0 or y >= h:
                    continue
                if seen[x][y] or pixels[x, y] != 0:
                    continue
                seen[x][y] = True
                comp.append((x, y))
                stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
            components.append(comp)

    for comp in components:
        if len(comp) < min_size:
            for x, y in comp:
                pixels[x, y] = 255
    return bw


def crop(bw: Image.Image, *, both_axes: bool) -> Image.Image:
    """Crop empty borders. both_axes=False crops only columns (matches world map convention)."""
    pixels = bw.load()
    w, h = bw.size
    left = right = top = bottom = None
    for x in range(w):
        for y in range(h):
            if pixels[x, y] == 0:
                if left is None or x < left:
                    left = x
                if right is None or x > right:
                    right = x
                if top is None or y < top:
                    top = y
                if bottom is None or y > bottom:
                    bottom = y
    if left is None:
        raise ValueError("rendered image contains no land pixels")
    if both_axes:
        return bw.crop((left, top, right + 1, bottom + 1))
    return bw.crop((left, 0, right + 1, h))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--continent",
        choices=sorted(CONTINENTS),
        help="Render only this country-class continent (see continents.py).",
    )
    parser.add_argument(
        "-o", "--output",
        help="Output PNG path. Defaults to world_map_bw.png or world_map_bw_<continent>.png.",
    )
    args = parser.parse_args()

    bw = render_png(args.continent)
    if args.continent is not None:
        bw = drop_small_components(bw, min_size=5)
    out = crop(bw, both_axes=args.continent is not None)

    if args.output:
        out_path = Path(args.output)
    elif args.continent:
        out_path = SCRIPT_DIR / "continents" / f"{args.continent}.png"
    else:
        out_path = SCRIPT_DIR / "world_map_bw.png"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path)
    land = sum(1 for x in range(out.size[0]) for y in range(out.size[1]) if out.load()[x, y] == 0)
    print(
        f"{args.continent or 'world'}: {out.size[0]}x{out.size[1]} "
        f"({land} land px) -> {out_path}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
