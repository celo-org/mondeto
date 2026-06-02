#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["Pillow"]
# ///
"""Render a BW PNG and land-mask JSON for every continent.

Uses Natural Earth's `map_subunits` dataset, which splits transcontinental
countries at conventional geographic boundaries (notably Russia at the
Urals). Each continent is selected by the dataset's `CONTINENT` field on
each subunit feature.

Projections:
  - Antarctica:  azimuthal equidistant from the south pole.
  - others:      equirectangular with cos(latitude) aspect correction at
                 the continent's mid-latitude.

Each continent's rendered raster is sized so its bounding box is
approximately TARGET_PIXELS (matching the 170x100 world map).
"""

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

sys.path.insert(0, str(Path(__file__).parent))
from generate_land_mask import generate_land_mask

DATA_PATH = Path(__file__).parent / "data" / "ne_10m_admin_0_map_subunits.geojson"
OUT_DIR = Path(__file__).parent / "continents"
TARGET_PIXELS = 17_000

# Our internal name -> the value in Natural Earth's CONTINENT property.
CONTINENT_NAMES: dict[str, str] = {
    "africa": "Africa",
    "antarctica": "Antarctica",
    "asia": "Asia",
    "europe": "Europe",
    "north-america": "North America",
    "oceania": "Oceania",
    "south-america": "South America",
}

# Recenter longitudes around this value before equirectangular projection,
# so continents that cross the antimeridian (Asia: Chukotka; Oceania: Fiji
# & Kiribati; North America: the Aleutians) form a single contiguous range
# instead of wrapping. Numbers are the rough longitudinal centroid of the
# continent's main landmass.
CENTER_LON: dict[str, float] = {
    "africa": 20.0,
    "asia": 100.0,
    "europe": 20.0,
    "north-america": -100.0,
    "oceania": 150.0,
    "south-america": -60.0,
}

# Subunit names (Natural Earth's SUBUNIT field) to drop because they're
# isolated specks that distort the bounding box. Svalbard/Jan Mayen sit
# ~1000 km off Norway; Easter Island and Pitcairn are >2000 km past
# French Polynesia.
SKIP_SUBUNITS: dict[str, set[str]] = {
    "europe": {"Svalbard", "Jan Mayen"},
    # Hawaii sits ~3700 km north of the equator while the rest of Oceania
    # is south of it — at our resolution it's a single-pixel speck that
    # doubles the continent's bounding box.
    "oceania": {"Easter Island", "Pitcairn Islands", "Hawaii"},
}

# Drop any polygon whose entire latitude range lies above this threshold.
# Used to strip Arctic-island archipelagos that share a subunit with the
# mainland: Novaya Zemlya and Franz Josef Land are part of NE's "Russia"
# (Europe) feature, so they can't be filtered by subunit name. Mainland
# European Russia maxes out around 70°N at the Kola Peninsula.
DROP_POLYGONS_ABOVE_LAT: dict[str, float] = {
    "europe": 70.0,
}


def iter_polygons(geometry):
    """Yield (exterior_ring, [hole_rings]) for each polygon in a GeoJSON geometry."""
    coords = geometry["coordinates"]
    if geometry["type"] == "Polygon":
        yield coords[0], coords[1:]
    elif geometry["type"] == "MultiPolygon":
        for poly in coords:
            yield poly[0], poly[1:]


def collect_polygons(features, continent_name, skip_subunits, drop_above_lat=None):
    polys = []
    for f in features:
        props = f["properties"]
        if props.get("CONTINENT") != continent_name:
            continue
        if props.get("SUBUNIT") in skip_subunits:
            continue
        for ext, holes in iter_polygons(f["geometry"]):
            if drop_above_lat is not None and min(p[1] for p in ext) > drop_above_lat:
                continue
            polys.append((ext, holes))
    return polys


def shift_lon(polys, center_lon):
    """Shift each longitude into [center_lon - 180, center_lon + 180)."""
    def shift(p):
        lon, lat = p
        lon = ((lon - center_lon + 180) % 360) - 180 + center_lon
        return (lon, lat)
    return [
        ([shift(p) for p in ext], [[shift(p) for p in h] for h in holes])
        for ext, holes in polys
    ]


def project_equirectangular(polys):
    """x = lon * cos(lat_mid), y = -lat. Aspect-corrects at the continent's mid-latitude."""
    lats = [p[1] for ext, holes in polys for ring in (ext, *holes) for p in ring]
    lat_mid = (max(lats) + min(lats)) / 2
    k = math.cos(math.radians(lat_mid))

    def proj(p):
        return (p[0] * k, -p[1])

    return [
        ([proj(p) for p in ext], [[proj(p) for p in h] for h in holes])
        for ext, holes in polys
    ]


def project_polar_south(polys):
    """Azimuthal equidistant from the south pole; lon=0 points up."""
    def proj(p):
        lon, lat = p
        r = 90 + lat                 # 0 at the south pole, 90 at the equator
        theta = math.radians(lon)
        return (r * math.sin(theta), r * math.cos(theta))

    return [
        ([proj(p) for p in ext], [[proj(p) for p in h] for h in holes])
        for ext, holes in polys
    ]


def _render_bbox(polys_xy, x_min, y_min, x_max, y_max, target_pixels, supersample):
    """Render polygons inside the given source-coord bbox to a BW image of
    ~target_pixels area. 0 = land, 255 = water."""
    w_units = x_max - x_min
    h_units = y_max - y_min
    scale = math.sqrt(target_pixels / (w_units * h_units))
    width = max(1, round(w_units * scale))
    height = max(1, round(h_units * scale))

    big = Image.new("L", (width * supersample, height * supersample), 255)
    draw = ImageDraw.Draw(big)
    s = scale * supersample

    def to_px(p):
        return ((p[0] - x_min) * s, (p[1] - y_min) * s)

    for ext, holes in polys_xy:
        draw.polygon([to_px(p) for p in ext], fill=0)
        for hole in holes:
            draw.polygon([to_px(p) for p in hole], fill=255)

    small = big.resize((width, height), Image.LANCZOS)
    return small.point(lambda p: 0 if p < 128 else 255)


def rasterize(polys_xy, target_pixels, supersample=8):
    """Render filled polygons to a BW image of ~target_pixels area.

    Uses two passes. The first renders with the full source-coord bbox; sub-
    pixel islands (Kuril Islands, distant Pacific atolls) disappear during
    LANCZOS downsampling. The second pass tightens the bbox to the rendered
    land's pixel bbox and re-renders, so the final image isn't padded with
    empty ocean around the surviving landmasses.

    Returns a grayscale image: 0 = land, 255 = water.
    """
    xs = [p[0] for ext, holes in polys_xy for ring in (ext, *holes) for p in ring]
    ys = [p[1] for ext, holes in polys_xy for ring in (ext, *holes) for p in ring]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)

    first = _render_bbox(polys_xy, x_min, y_min, x_max, y_max, target_pixels, supersample)
    land_bbox = ImageOps.invert(first).getbbox()
    if land_bbox is None:
        return first
    pw, ph = first.size
    if land_bbox == (0, 0, pw, ph):
        return first

    # Map the tight pixel bbox back to source coordinates and re-render.
    sx = (x_max - x_min) / pw
    sy = (y_max - y_min) / ph
    left, top, right, bottom = land_bbox
    return _render_bbox(
        polys_xy,
        x_min + left * sx,
        y_min + top * sy,
        x_min + right * sx,
        y_min + bottom * sy,
        target_pixels,
        supersample,
    )


def build_continent(name, features):
    polys = collect_polygons(
        features,
        CONTINENT_NAMES[name],
        SKIP_SUBUNITS.get(name, set()),
        DROP_POLYGONS_ABOVE_LAT.get(name),
    )
    if not polys:
        return None

    if name == "antarctica":
        polys_xy = project_polar_south(polys)
    else:
        polys = shift_lon(polys, CENTER_LON[name])
        polys_xy = project_equirectangular(polys)

    img = rasterize(polys_xy, TARGET_PIXELS)
    png_path = OUT_DIR / f"{name}.png"
    img.save(png_path)

    width, height, mask = generate_land_mask(str(png_path))
    with open(OUT_DIR / f"{name}.json", "w") as f:
        json.dump({"width": width, "height": height, "mask": mask}, f)

    land = sum(bin(w).count("1") for w in mask)
    return width, height, land


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(DATA_PATH) as f:
        data = json.load(f)
    features = data["features"]

    for name in CONTINENT_NAMES:
        result = build_continent(name, features)
        if result is None:
            print(f"{name}: skipped (no features)", file=sys.stderr)
            continue
        w, h, land = result
        print(
            f"{name:>14}: {w:>4}x{h:<4} = {w*h:>6} px  ({land:>5} land) "
            f"-> {name}.png, {name}.json",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
