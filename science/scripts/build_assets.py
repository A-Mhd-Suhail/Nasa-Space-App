"""Build every derived, versioned web asset from the approved source products.

Outputs (all under ../public/data unless --out is given):
- map layers (480 m/px, 2x2 block mean of LDEM_75S_240M):
    lola_75s_240m_hillshade.webp, lola_75s_240m_elevation.webp, lola_75s_240m_slope.webp, map_meta.json
- src/data/sites.json        : IAU Gazetteer south-polar feature centres + LOLA height at centre
- public/data/demo/<site>.json + demo/index.json : precomputed demonstration analyses (labelled)
- public/data/terrain/<site>.json : local terrain patches for the 3D view
- public/data/terrain/regional_75s.json : south polar cap grid for the regional 3D view
- public/data/feasibility/grid.json : precomputed feasibility grid (moonnav.feasibility-grid)

Run:  uv run python scripts/build_assets.py [--out DIR] [--skip-grid] [--grid-size N]
The full feasibility grid (61x61 cells) is a long job; --skip-grid rebuilds everything else.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "science"))

from PIL import Image  # noqa: E402

from moonnav_science import METHOD_VERSION  # noqa: E402
from moonnav_science.analysis import Scenario, get_dem, get_horizon, kernels, run_analysis  # noqa: E402
from moonnav_science.api import terrain_patch  # noqa: E402
from moonnav_science.geometry import normalize_lon_east  # noqa: E402
from moonnav_science.horizon import HorizonParams  # noqa: E402

PRODUCT = "lola-ldem-75s-240m-v2"
DEMO_WINDOW = ("2026-11-15T00:00:00Z", "2026-12-15T00:00:00Z", 1800)
GRID_WINDOW = ("2026-11-15T00:00:00Z", "2026-12-15T00:00:00Z", 7200)
GRID_METHOD = METHOD_VERSION + "+grid-1"

FEATURES = [
    # Values copied from the IAU/USGS Gazetteer export (MOON_nomenclature_center_pts, retrieved 2026-11-10).
    ("shackleton", "Shackleton", "Crater", -89.670000, 129.780000, 20.92, 5450),
    ("de-gerlache", "de Gerlache", "Crater", -88.484900, 271.655300, 32.71, 1439),
    ("spudis", "Spudis", "Crater", -89.510000, 275.390000, 13.0, 16007),
    ("shoemaker", "Shoemaker", "Crater", -88.137000, 45.911000, 51.82, 5494),
    ("faustini", "Faustini", "Crater", -87.183200, 84.309900, 42.48, 1919),
    ("haworth", "Haworth", "Crater", -87.450000, 354.830000, 51.42, 14502),
    ("slater", "Slater", "Crater", -88.079200, 111.288100, 25.12, 15325),
    ("henson", "Henson", "Crater", -88.570000, 229.370000, 43.0, 16004),
    ("sverdrup", "Sverdrup", "Crater", -88.320900, 206.612500, 32.83, 5782),
    ("nobile", "Nobile", "Crater", -85.275200, 53.272500, 79.27, 4321),
    ("cabeus", "Cabeus", "Crater", -85.330300, 317.867300, 100.58, 953),
    ("amundsen", "Amundsen", "Crater", -84.439800, 83.069100, 103.39, 247),
    ("malapert", "Malapert", "Crater", -84.999800, 11.403100, 72.38, 3603),
    ("mons-malapert", "Mons Malapert", "Mons", -85.980000, 358.330000, 67.0, 16338),
    ("mons-mouton", "Mons Mouton", "Mons", -84.600000, 31.000000, 130.0, 16070),
    ("mons-kocher", "Mons Kocher", "Mons", -85.460000, 241.940000, 67.0, 16394),
]
FEATURED = ["mons-mouton", "mons-malapert", "shackleton", "de-gerlache"]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_webp(path: Path, rgba: np.ndarray) -> str:
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", quality=90, method=4)
    return sha256_file(path)


def build_maps(out: Path) -> dict:
    dem = get_dem(PRODUCT)
    d = dem.data.astype(np.float64)
    n = dem.lines // 2 * 2
    z = d[:n, :n].reshape(n // 2, 2, n // 2, 2).mean(axis=(1, 3))
    px = dem.scale_m * 2
    gy, gx = np.gradient(z, px)
    # hillshade, light from map-up-left (azimuth 315 deg in image space), 45 deg altitude
    az, alt = np.radians(315.0), np.radians(45.0)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    hs = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    hs = np.clip(hs, 0, 1)
    rows, cols = np.mgrid[0 : n // 2, 0 : n // 2]
    xr, yr = dem.pixel_to_xy(rows * 2 + 0.5, cols * 2 + 0.5)
    lat, _ = dem.xy_to_latlon(xr, yr)
    inside = lat <= -75.0
    alpha = np.where(inside, 255, 0).astype(np.uint8)

    grey = np.where(inside, 25 + hs * 215, 0).astype(np.uint8)
    hs_sha = write_webp(out / "lola_75s_240m_hillshade.webp", np.dstack([grey, grey, grey, alpha]))

    # colour elevation (perceptual blue->teal->sand ramp), with hillshade modulation
    lo, hi = -6000.0, 6000.0
    t = np.clip((z - lo) / (hi - lo), 0, 1)
    stops = np.array([[18, 32, 68], [32, 92, 128], [60, 150, 150], [170, 170, 120], [230, 200, 150], [250, 245, 235]], float)
    idx = t * (len(stops) - 1)
    i0 = np.floor(idx).astype(int).clip(0, len(stops) - 2)
    f = (idx - i0)[..., None]
    col = stops[i0] * (1 - f) + stops[i0 + 1] * f
    col = col * (0.55 + 0.45 * hs[..., None])
    rgba = np.dstack([np.where(inside[..., None], col, 0).astype(np.uint8), alpha])
    el_sha = write_webp(out / "lola_75s_240m_elevation.webp", rgba)

    # slope ramp 0-30 deg (visual context for hazard screening, never a certified safety product)
    slope_deg = np.degrees(slope)
    s_t = np.clip(slope_deg / 30.0, 0, 1)
    s_stops = np.array([[240, 244, 250], [186, 210, 220], [133, 176, 190], [92, 138, 158], [58, 98, 120]], float)
    si = s_t * (len(s_stops) - 1)
    si0 = np.floor(si).astype(int).clip(0, len(s_stops) - 2)
    sf = (si - si0)[..., None]
    scol = s_stops[si0] * (1 - sf) + s_stops[si0 + 1] * sf
    scol = scol * (0.6 + 0.4 * hs[..., None])
    srgba = np.dstack([np.where(inside[..., None], scol, 0).astype(np.uint8), alpha])
    slope_sha = write_webp(out / "lola_75s_240m_slope.webp", srgba)

    half = (n / 2) * px / 2
    extent = [
        -(dem.sample_offset + 0.5) * dem.scale_m,
        -(dem.line_offset + 0.5) * dem.scale_m,
        (n - 0.5 - dem.sample_offset) * dem.scale_m,
        (n - 0.5 - dem.line_offset) * dem.scale_m,
    ]
    meta = {
        "projection": {
            "name": "LOLA south polar stereographic (spherical)",
            "code": "MOONNAV:LOLA-SPS",
            "radiusM": dem.radius_ref_m,
            "centerLatitude": -90,
            "centerLongitude": 0,
            "formula": "x = 2R tan(pi/4 + lat/2) sin(lon); y = 2R tan(pi/4 + lat/2) cos(lon)",
        },
        "extentM": extent,
        "approxHalfWidthM": half,
        "pixelSpacingM": px,
        "layers": {
            "hillshade": {
                "file": "/data/lola_75s_240m_hillshade.webp",
                "sha256": hs_sha,
                "label": "LOLA hillshade (derived visual)",
                "kind": "derived-visual",
            },
            "elevation": {
                "file": "/data/lola_75s_240m_elevation.webp",
                "sha256": el_sha,
                "label": "LOLA elevation colour (-6 km to +6 km)",
                "kind": "derived-visual",
                "rangeM": [lo, hi],
            },
            "slope": {
                "file": "/data/lola_75s_240m_slope.webp",
                "sha256": slope_sha,
                "label": "LOLA slope (0-30 deg, 480 m baseline)",
                "kind": "derived-visual",
                "rangeDeg": [0, 30],
            },
        },
        "sourceProduct": dem.metadata(),
        "processing": "2x2 block mean of source heights; gradient hillshade (sun az 315 deg image-space, alt 45 deg). Visual only: analyses always use the full-resolution source.",
        "generatedAtUtc": datetime.now(UTC).isoformat(timespec="seconds"),
        "generator": "science/scripts/build_assets.py",
    }
    (out / "map_meta.json").write_text(json.dumps(meta, indent=2))
    return meta


def build_sites(out: Path) -> list[dict]:
    dem = get_dem(PRODUCT)
    sites = [
        {
            "key": "south-pole",
            "name": "Lunar South Pole (reference point)",
            "featureType": "Reference point",
            "latitudeDeg": -90.0,
            "longitudeEastDeg": 0.0,
            "diameterKm": None,
            "source": "Definition (planetocentric -90 deg)",
            "sourceUrl": None,
            "heightM": round(float(dem.height_at(-90.0, 0.0)), 1),
            "note": "Geometric pole; azimuth origin follows the 0 deg meridian.",
        }
    ]
    for key, name, ftype, lat, lon, diam, fid in FEATURES:
        h = dem.height_at(lat, lon)
        sites.append(
            {
                "key": key,
                "name": name,
                "featureType": ftype,
                "latitudeDeg": lat,
                "longitudeEastDeg": lon,
                "diameterKm": diam,
                "source": "IAU WGPSN / USGS Gazetteer of Planetary Nomenclature (feature centre)",
                "sourceUrl": f"https://planetarynames.wr.usgs.gov/Feature/{fid}",
                "heightM": None if h is None else round(float(h), 1),
                "note": "Named-feature centre, not an official landing site."
                + (" Crater-centre floors are often permanently shadowed." if ftype == "Crater" else ""),
            }
        )
    (out / "sites.json").write_text(
        json.dumps(
            {
                "generatedAtUtc": datetime.now(UTC).isoformat(timespec="seconds"),
                "heightSource": PRODUCT,
                "coordinateConvention": "planetocentric latitude, east-positive longitude 0-360, MOON_ME frame",
                "sites": sites,
            },
            indent=2,
        )
    )
    return sites


def build_demos(out: Path, sites: list[dict]) -> None:
    demo_dir = out / "demo"
    terrain_dir = out / "terrain"
    demo_dir.mkdir(exist_ok=True)
    terrain_dir.mkdir(exist_ok=True)
    index = []
    for s in sites:
        if s["key"] not in FEATURED:
            continue
        sc = Scenario.from_dict(
            {
                "site": {"latitudeDeg": s["latitudeDeg"], "longitudeEastDeg": s["longitudeEastDeg"], "observerHeightM": 2.0},
                "timeRange": {"startUtc": DEMO_WINDOW[0], "endUtc": DEMO_WINDOW[1], "sampleStepSeconds": DEMO_WINDOW[2]},
                "assumptions": {"antennaMinimumElevationDeg": 5.0},
            }
        )
        r = run_analysis(sc)
        r["demo"] = {
            "label": "Precomputed demonstration",
            "generatedAtUtc": datetime.now(UTC).isoformat(timespec="seconds"),
            "siteKey": s["key"],
            "methodVersion": METHOD_VERSION,
        }
        (demo_dir / f"{s['key']}.json").write_text(json.dumps(r, separators=(",", ":")))
        patch = terrain_patch(lat=s["latitudeDeg"], lon=s["longitudeEastDeg"], half_size_m=20_000, grid=161, product=PRODUCT)
        (terrain_dir / f"{s['key']}.json").write_text(json.dumps(patch, separators=(",", ":")))
        index.append(
            {
                "siteKey": s["key"],
                "name": s["name"],
                "sunFraction": r["sun"]["fractionVisible"],
                "earthFraction": r["earth"]["fractionVisible"],
                "quality": r["quality"],
            }
        )
        print("demo", s["key"], r["sun"]["fractionVisible"], r["earth"]["fractionVisible"], r["quality"], flush=True)
    (demo_dir / "index.json").write_text(
        json.dumps({"window": DEMO_WINDOW, "generatedAtUtc": datetime.now(UTC).isoformat(timespec="seconds"), "items": index}, indent=2)
    )


def build_regional(out: Path) -> None:
    """South polar cap grid for the regional 3D view (row 0 = 0 deg E edge / map up)."""
    dem = get_dem(PRODUCT)
    g = 320
    half = dem.scale_m * dem.samples / 2
    xs = np.linspace(-half, half, g)
    ys = np.linspace(half, -half, g)  # row 0 = north edge = lon 0
    X, Y = np.meshgrid(xs, ys)
    lat, lon = dem.xy_to_latlon(X, Y)
    h = dem.sample_height(lat, lon)
    q = np.where(np.isfinite(h), np.round(h * 2), -32768).astype(np.int32)
    q = np.clip(q, -32767, 32767).astype("<i2")
    payload = {
        "encoding": "int16-le base64, metres = value * 0.5, -32768 = outside coverage, row 0 = 0E edge (map up)",
        "grid": g,
        "extentM": half,
        "projection": "LOLA south polar stereographic; client places each sample on the 1737.4 km sphere (see src/lib/lunar.ts toLatLon)",
        "radiusM": 1_737_400.0,
        "heights": base64.b64encode(q.tobytes()).decode(),
        "product": dem.metadata(),
        "generatedAtUtc": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    (out / "terrain" / "regional_75s.json").write_text(json.dumps(payload, separators=(",", ":")))
    print("regional cap", g, "grid, missing", int(np.sum(~np.isfinite(h))), flush=True)


GRID_COLUMNS = [
    "row",
    "col",
    "lat",
    "lon",
    "heightM",
    "slopeDeg",
    "sunFraction",
    "longestDarkHours",
    "dteFraction",
    "unknownFraction",
    "truncatedRays",
]


def build_feasibility_grid(out: Path, size: int = 61, spacing_m: float = 6_000.0) -> None:
    """Precomputed screening grid: per-cell sunlight/DTE fractions over the demo window.

    Method notes:
    - horizon per cell: 1.0 deg azimuth step, 150 km radius (coarser than the analysis default -> cached cheaply)
    - window: GRID_WINDOW sampled every 7200 s (361 samples)
    - unknown samples are excluded from fractions and reported in unknownFraction (never filled with zero)
    """
    t0 = time.time()
    dem = get_dem(PRODUCT)
    half = (size - 1) / 2 * spacing_m
    xs = np.linspace(-half, half, size)
    ys = np.linspace(half, -half, size)
    rows: list[list[float]] = []
    hp = HorizonParams(azimuth_step_deg=1.0, max_radius_m=150_000.0, observer_height_m=2.0)
    total = size * size
    k = kernels()
    for r_i, y in enumerate(ys):
        for c_i, x in enumerate(xs):
            lat, lon = dem.xy_to_latlon(np.array([x]), np.array([y]))
            lat, lon = float(lat[0]), float(lon[0])
            if lat > -75.0:
                rows.append(
                    [r_i, c_i, round(float(lat), 5), round(float(normalize_lon_east(float(lon))), 5), None, None, None, None, None, 1.0, 0]
                )
                continue
            h = dem.height_at(float(lat), float(lon))
            if h is None:
                rows.append(
                    [r_i, c_i, round(float(lat), 5), round(float(normalize_lon_east(float(lon))), 5), None, None, None, None, None, 1.0, 0]
                )
                continue
            prof2, _, _ = get_horizon(dem, float(lat), float(normalize_lon_east(float(lon))), hp)
            sc = Scenario.from_dict(
                {
                    "site": {"latitudeDeg": float(lat), "longitudeEastDeg": float(normalize_lon_east(float(lon))), "observerHeightM": 2.0},
                    "timeRange": {"startUtc": GRID_WINDOW[0], "endUtc": GRID_WINDOW[1], "sampleStepSeconds": GRID_WINDOW[2]},
                    "assumptions": {"antennaMinimumElevationDeg": 5.0},
                    "options": {
                        "sunVisibilityRule": "any_disk",
                        "earthVisibilityRule": "any_disk",
                        "aberrationCorrection": "LT+S",
                        "horizonAzimuthStepDeg": 1.0,
                        "horizonMaxRadiusM": 150_000.0,
                        "refineToleranceSeconds": 300.0,
                    },
                }
            )
            # get_horizon above warms the in-process cache with the identical params run_analysis will use
            res = run_analysis(sc)
            sun_f = res["sun"]["fractionVisible"]
            dte_f = res["earth"]["dte"]["fractionVisible"]
            unk = res["sun"]["unknownSeconds"] + res["earth"]["unknownSeconds"]
            dur = 30 * 86400.0
            # longest run of consecutive dark samples (sample-based, documented as such)
            dark = [row["sunState"] not in ("visible", "partial") for row in res["timeseries"]]
            longest = 0
            cur = 0
            for dd in dark:
                cur = cur + 1 if dd else 0
                longest = max(longest, cur)
            slope = None
            sx, sy = dem.latlon_to_xy(np.array([lat]), np.array([lon]))
            s = dem.scale_m
            la, lo = dem.xy_to_latlon(np.array([sx[0] - s, sx[0] + s, sx[0], sx[0]]), np.array([sy[0], sy[0], sy[0] - s, sy[0] + s]))
            hh = dem.sample_height(la, lo)
            if np.all(np.isfinite(hh)):
                dzdx = (hh[1] - hh[0]) / (2 * s)
                dzdy = (hh[3] - hh[2]) / (2 * s)
                slope = float(np.degrees(np.arctan(np.hypot(dzdx, dzdy))))
            rows.append(
                [
                    r_i,
                    c_i,
                    round(float(lat), 5),
                    round(float(normalize_lon_east(float(lon))), 5),
                    round(float(h), 1),
                    None if slope is None else round(slope, 2),
                    round(sun_f, 4),
                    round(longest * GRID_WINDOW[2] / 3600.0, 1),
                    round(dte_f, 4),
                    round(unk / (2 * dur), 4),
                    prof2.truncated_count()
                    if hasattr(prof2, "truncated_count")
                    else int(sum(1 for s_ in prof2.status if s_ == "truncated")),
                ]
            )
        done = (r_i + 1) * size
        print(f"grid {done}/{total} rows ({(time.time() - t0):.0f}s)", flush=True)

    payload = {
        "kind": "moonnav.feasibility-grid",
        "methodVersion": GRID_METHOD,
        "window": {
            "startUtc": GRID_WINDOW[0],
            "endUtc": GRID_WINDOW[1],
            "sampleStepSeconds": GRID_WINDOW[2],
            "sampleCount": int((30 * 86400) / GRID_WINDOW[2]) + 1,
        },
        "grid": {
            "projection": "polar stereographic (south), same plane as the LOLA product",
            "halfSizeM": half,
            "spacingM": spacing_m,
            "size": size,
        },
        "assumptions": {
            "observerHeightM": 2.0,
            "antennaMinimumElevationDeg": 5.0,
            "sunRule": "any_disk",
            "earthRule": "any_disk",
            "aberrationCorrection": "LT+S",
            "horizonAzimuthStepDeg": 1.0,
            "horizonMaxRadiusM": 150_000.0,
            "slopeMethod": "central differences over 2 x pixel spacing (480 m baseline)",
            "fractions": "sample-based over the window; unknown samples excluded and reported",
        },
        "provenance": {
            "kernelManifestId": k.manifest_id,
            "terrainProductId": PRODUCT,
            "terrainSha256": dem.sha256,
            "methodVersion": GRID_METHOD,
        },
        "columns": GRID_COLUMNS,
        "rows": rows,
        "generatedAtUtc": datetime.now(UTC).isoformat(timespec="seconds"),
        "computeSeconds": round(time.time() - t0, 1),
    }
    (out / "feasibility").mkdir(exist_ok=True)
    (out / "feasibility" / "grid.json").write_text(json.dumps(payload, separators=(",", ":")))
    print("grid done:", len(rows), "cells in", round(time.time() - t0, 1), "s", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--out", default=str(ROOT / "public" / "data"), help="output root (default public/data; sites.json goes to ../src/data)"
    )
    ap.add_argument("--skip-grid", action="store_true", help="skip the long feasibility-grid build")
    ap.add_argument("--grid-size", type=int, default=61, help="feasibility grid edge length (61 = shipped product)")
    ap.add_argument("--only-grid", action="store_true", help="only rebuild the feasibility grid")
    a = ap.parse_args()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    kernels()
    if not a.only_grid:
        m = build_maps(out)
        print("map extent", m["extentM"], flush=True)
        sites = build_sites(out if a.out != str(ROOT / "public" / "data") else ROOT / "src" / "data")
        print("sites", len(sites), flush=True)
        build_demos(out, sites)
        build_regional(out)
    if not a.skip_grid:
        build_feasibility_grid(out, size=a.grid_size)


if __name__ == "__main__":
    main()
