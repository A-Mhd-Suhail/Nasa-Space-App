"""Reproducible scientific validation of the MoonNav engine against NASA/JPL references.

Every check returns a record with: id, category, source, product, epoch(s), location/frame,
method, MoonNav result, reference result, difference, tolerance and result
("pass" | "fail" | "unavailable"). "unavailable" means the reference could not be obtained
(network, coverage) — it is never converted into a pass.

References
- NASA SVS Dial-a-Moon API (Moon Phase and Libration product family; the same values are
  stamped on SVS 4930 south-pole illumination frames): sub-solar point, sub-Earth point,
  Earth-Moon distance.
- JPL Horizons API: apparent airless azimuth/elevation of the Sun and Earth from lunar sites.
- NAIF SPICE: time-system identities and frame properties.
- NASA PDS LOLA: cross-product (5/20/40 m vs 240 m) and cross-projection (polar stereographic
  vs simple cylindrical LDEM_16) elevation agreement.
"""

from __future__ import annotations

import json
import math
import urllib.request
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import spiceypy as sp

from .analysis import DATA_DIR, MULTIRES_ID, Scenario, get_dem, kernels, run_analysis
from .dem import _num, parse_pds3_label
from .geometry import MOON_REFERENCE_RADIUS_M, az_el_from_enu, enu_basis, site_vector_m
from .horizon import HorizonParams, compute_horizon
from .horizons_live import HorizonsUnavailable, cross_check
from .kernels import utc_to_et

Record = dict[str, Any]
SITES = {
    "south-pole": (-90.0, 0.0),
    "shackleton-dg-ridge": (-89.45, 222.69),
    "de-gerlache-centre": (-88.4849, 271.6553),
    "mons-malapert": (-85.98, 358.33),
    "mons-mouton": (-84.6, 31.0),
}


def rec(
    id_: str,
    category: str,
    source: str,
    product: str,
    epoch: str,
    location: str,
    method: str,
    moonnav: Any,
    reference: Any,
    difference: Any,
    tolerance: str,
    result: str,
    note: str = "",
) -> Record:
    return {
        "id": id_,
        "category": category,
        "source": source,
        "product": product,
        "epochUtc": epoch,
        "location": location,
        "method": method,
        "moonnav": moonnav,
        "reference": reference,
        "difference": difference,
        "tolerance": tolerance,
        "result": result,
        "note": note,
    }


def _wrap(d: float) -> float:
    return (d + 180.0) % 360.0 - 180.0


# ------------------------------------------------------------------------------------ SVS
def svs_dialamoon(epochs: list[str], fetch: Callable[[str], dict[str, Any]] | None = None) -> list[Record]:
    def default_fetch(t: str) -> dict[str, Any]:
        req = urllib.request.Request(
            f"https://svs.gsfc.nasa.gov/api/dialamoon/{t}", headers={"User-Agent": "MoonNav validation (research prototype)"}
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)

    get = fetch or default_fetch
    out: list[Record] = []
    for t in epochs:
        loc = "Moon (MOON_ME planetocentric), observer Earth centre"
        try:
            d = get(t)
        except Exception as exc:  # noqa: BLE001
            out.append(
                rec(
                    f"svs-{t}",
                    "SVS",
                    "NASA SVS Dial-a-Moon API",
                    "Moon Phase and Libration",
                    t,
                    loc,
                    "sub-points",
                    None,
                    None,
                    None,
                    "",
                    "unavailable",
                    f"request failed: {type(exc).__name__}",
                )
            )
            continue
        if str(d.get("time", ""))[:16] != t[:16]:
            out.append(
                rec(
                    f"svs-{t}",
                    "SVS",
                    "NASA SVS Dial-a-Moon API",
                    "Moon Phase and Libration",
                    t,
                    loc,
                    "sub-points",
                    None,
                    None,
                    None,
                    "",
                    "unavailable",
                    f"SVS returned {d.get('time')} instead of the requested epoch (outside the published tables)",
                )
            )
            continue
        et = utc_to_et(t + ":00Z")
        se, _, _ = sp.subpnt("INTERCEPT/ELLIPSOID", "MOON", et, "MOON_ME", "LT+S", "EARTH")
        ss, _, _ = sp.subslr("INTERCEPT/ELLIPSOID", "MOON", et, "MOON_ME", "LT+S", "EARTH")
        _, elon, elat = sp.reclat(se)
        _, slon, slat = sp.reclat(ss)
        dist = float(np.linalg.norm(sp.spkpos("MOON", et, "J2000", "LT+S", "EARTH")[0]))
        mn = {
            "subEarthLatDeg": round(math.degrees(elat), 4),
            "subEarthLonDeg": round(math.degrees(elon), 4),
            "subSolarLatDeg": round(math.degrees(slat), 4),
            "subSolarLonDeg": round(math.degrees(slon), 4),
            "distanceKm": round(dist, 1),
        }
        ref = {
            "subEarthLatDeg": d["subearth_lat"],
            "subEarthLonDeg": d["subearth_lon"],
            "subSolarLatDeg": d["subsolar_lat"],
            "subSolarLonDeg": d["subsolar_lon"],
            "distanceKm": d["distance"],
        }
        diff = {
            "subEarthDeg": round(
                math.hypot(
                    mn["subEarthLatDeg"] - ref["subEarthLatDeg"], _wrap(mn["subEarthLonDeg"] - ref["subEarthLonDeg"]) * math.cos(elat)
                ),
                5,
            ),
            "subSolarDeg": round(
                math.hypot(
                    mn["subSolarLatDeg"] - ref["subSolarLatDeg"], _wrap(mn["subSolarLonDeg"] - ref["subSolarLonDeg"]) * math.cos(slat)
                ),
                5,
            ),
            "distanceKm": round(mn["distanceKm"] - ref["distanceKm"], 2),
        }
        ok = diff["subEarthDeg"] <= 0.01 and diff["subSolarDeg"] <= 0.01 and abs(diff["distanceKm"]) <= 2.0
        out.append(
            rec(
                f"svs-{t}",
                "SVS",
                "NASA SVS Dial-a-Moon API (values stamped on SVS 4930 frames)",
                "Moon Phase and Libration",
                t,
                loc,
                "SPICE subpnt/subslr (INTERCEPT/ELLIPSOID, LT+S, observer EARTH, MOON_ME); Earth-Moon distance from spkpos",
                mn,
                ref,
                diff,
                "sub-points <= 0.01 deg (SVS publishes 3 decimals); distance <= 2 km (SVS publishes whole km)",
                "pass" if ok else "fail",
            )
        )
    return out


# ------------------------------------------------------------------------------- Horizons
def horizons(windows: list[tuple[str, str]], samples: int = 5) -> list[Record]:
    out: list[Record] = []
    dem = get_dem("lola-ldem-75s-240m-v2")
    for key, (lat, lon) in SITES.items():
        h = dem.height_at(lat, lon) or 0.0
        for a, b in windows:
            loc = f"{key} {lat:.4f}, {lon:.4f}E, h={h:.0f} m (MOON_ME / Horizons GEODETIC on 1737.4 km sphere)"
            try:
                r = cross_check(lat, lon, h, a, b, samples)
            except HorizonsUnavailable as exc:
                out.append(
                    rec(
                        f"horizons-{key}-{a[:10]}",
                        "JPL Horizons",
                        "JPL Horizons API",
                        "observer table QUANTITIES=4",
                        f"{a}..{b}",
                        loc,
                        "",
                        None,
                        None,
                        None,
                        "",
                        "unavailable",
                        str(exc),
                    )
                )
                continue
            for body in ("sun", "earth"):
                bd = r["bodies"][body]
                out.append(
                    rec(
                        f"horizons-{key}-{a[:10]}-{body}",
                        "JPL Horizons",
                        f"JPL Horizons API v{bd['horizons'].get('apiVersion')}",
                        "apparent airless az/el (CENTER=coord@301)",
                        f"{a}..{b} ({len(bd['rows'])} epochs)",
                        loc,
                        "SPICE spkcpo LT+S in MOON_ME -> ENU az/el; great-circle separation from Horizons",
                        {"rows": len(bd["rows"]), "first": bd["rows"][0]["spice"]},
                        {"first": bd["rows"][0]["horizons"]},
                        {"maxSeparationDeg": bd["maxSeparationDeg"], "meanSeparationDeg": bd["meanSeparationDeg"]},
                        "max separation < 0.01 deg",
                        "pass" if bd["maxSeparationDeg"] < 0.01 else "fail",
                    )
                )
    return out


# ---------------------------------------------------------------------------------- SPICE
def spice_checks() -> list[Record]:
    out: list[Record] = []
    et = utc_to_et("2000-01-01T11:58:55.816Z")
    out.append(
        rec(
            "spice-j2000",
            "SPICE",
            "IAU/NAIF time standards",
            "naif0012.tls",
            "2000-01-01T11:58:55.816Z",
            "-",
            "utc_to_et at the J2000 epoch (TDB 2000-01-01 12:00:00 = UTC 11:58:55.816)",
            {"etSeconds": round(et, 6)},
            {"etSeconds": 0.0},
            {"seconds": round(et, 6)},
            "|ET| <= 0.001 s",
            "pass" if abs(et) <= 1e-3 else "fail",
        )
    )
    t = "2026-12-01T00:00:00Z"
    dt = utc_to_et(t) - (datetime(2026, 12, 1, tzinfo=UTC) - datetime(2000, 1, 1, 12, tzinfo=UTC)).total_seconds()
    out.append(
        rec(
            "spice-deltat-2026",
            "SPICE",
            "IERS leap seconds (37 s since 2017) + TT-TAI 32.184 s",
            "naif0012.tls",
            t,
            "-",
            "ET - UTC(elapsed) = TDB-UTC",
            {"seconds": round(dt, 4)},
            {"seconds": 69.184},
            {"seconds": round(dt - 69.184, 4)},
            "within 0.002 s (TDB-TT periodic term < 1.7 ms)",
            "pass" if abs(dt - 69.184) < 0.002 else "fail",
        )
    )
    m = np.array(sp.pxform("MOON_ME", "J2000", utc_to_et(t)))
    orth = float(np.max(np.abs(m @ m.T - np.eye(3))))
    det = float(np.linalg.det(m))
    out.append(
        rec(
            "spice-frame-orthonormal",
            "SPICE",
            "rotation-matrix identities",
            "moon_pa_de440 + moon_de440 FK",
            t,
            "MOON_ME -> J2000",
            "max|R R^T - I| and det(R)",
            {"maxOrthoError": orth, "det": det},
            {"maxOrthoError": 0, "det": 1},
            {"det": det - 1},
            "<= 1e-12",
            "pass" if orth < 1e-12 and abs(det - 1) < 1e-12 else "fail",
        )
    )
    ets = utc_to_et("2026-01-01T00:00:00Z") + np.arange(0, 366) * 86400.0
    lats, dists = [], []
    for e in ets:
        p, _, _ = sp.subpnt("INTERCEPT/ELLIPSOID", "MOON", float(e), "MOON_ME", "LT+S", "EARTH")
        lats.append(math.degrees(sp.reclat(p)[2]))
        dists.append(float(np.linalg.norm(sp.spkpos("MOON", float(e), "J2000", "NONE", "EARTH")[0])))
    out.append(
        rec(
            "spice-libration-bound",
            "SPICE",
            "lunar physical/optical libration bounds (|latitude libration| < 6.9 deg)",
            "de440s + moon_pa_de440",
            "2026 daily",
            "sub-Earth latitude",
            "range over 366 daily samples",
            {"minDeg": round(min(lats), 3), "maxDeg": round(max(lats), 3)},
            {"absMaxDeg": 6.9},
            {"absMaxDeg": round(max(abs(x) for x in lats), 3)},
            "|lat| < 6.9 deg",
            "pass" if max(abs(x) for x in lats) < 6.9 else "fail",
        )
    )
    out.append(
        rec(
            "spice-distance-bound",
            "SPICE",
            "Earth-Moon distance bounds (perigee > 356,000 km, apogee < 407,000 km)",
            "de440s",
            "2026 daily",
            "Earth-Moon centres",
            "min/max geometric distance",
            {"minKm": round(min(dists)), "maxKm": round(max(dists))},
            {"range": [356000, 407000]},
            None,
            "within range",
            "pass" if min(dists) > 356_000 and max(dists) < 407_000 else "fail",
        )
    )
    # Polar edge cases: ENU orthonormality at the pole and azimuth continuity across 0/360 E.
    b = enu_basis(-90.0, 0.0)
    M = np.stack([b.east, b.north, b.up])
    err = float(np.max(np.abs(M @ M.T - np.eye(3))))
    az1, _ = az_el_from_enu(*enu_basis(-89.0, 359.9999).to_enu(np.array([0.0, 1.0, 0.0])))
    az2, _ = az_el_from_enu(*enu_basis(-89.0, 0.0001).to_enu(np.array([0.0, 1.0, 0.0])))
    out.append(
        rec(
            "geometry-polar-edge",
            "SPICE",
            "analytic geometry",
            "-",
            "-",
            "lat -90 / lon 0-360 seam",
            "ENU orthonormality at the pole; azimuth of a fixed vector across the 0/360 meridian",
            {"enuError": err, "azWestDeg": round(az1, 5), "azEastDeg": round(az2, 5)},
            {"enuError": 0},
            {"azJumpDeg": round(abs(_wrap(az1 - az2)), 5)},
            "enu < 1e-12; jump < 0.001 deg",
            "pass" if err < 1e-12 and abs(_wrap(az1 - az2)) < 1e-3 else "fail",
        )
    )
    return out


# ----------------------------------------------------------------------------------- LOLA
def _ldem16_sampler() -> Callable[[np.ndarray, np.ndarray], np.ndarray] | None:
    img, lbl = DATA_DIR / "raw/lola/ldem_16.img", DATA_DIR / "raw/lola/ldem_16.lbl"
    if not img.exists():
        return None
    L = parse_pds3_label(lbl.read_text(encoding="latin-1"))
    lines, samples, scale = int(_num(L, "LINES")), int(_num(L, "LINE_SAMPLES")), _num(L, "SCALING_FACTOR")
    res, loff, soff = _num(L, "MAP_RESOLUTION"), _num(L, "LINE_PROJECTION_OFFSET"), _num(L, "SAMPLE_PROJECTION_OFFSET")
    clon = _num(L, "CENTER_LONGITUDE")
    data = np.fromfile(img, dtype="<i2").reshape(lines, samples).astype(np.float64) * scale

    def f(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
        # PDS simple cylindrical: line = LINE_PROJECTION_OFFSET - lat*res ; sample = SAMPLE_PROJECTION_OFFSET + (lon - CENTER_LONGITUDE)*res
        row = loff - lat * res
        col = soff + (((lon - clon + 180.0) % 360.0) - 180.0) * res
        r0, c0 = np.floor(row).astype(int), np.floor(col).astype(int)
        fr, fc = row - r0, col - c0
        r1, c1 = np.clip(r0 + 1, 0, lines - 1), (c0 + 1) % samples
        r0, c0 = np.clip(r0, 0, lines - 1), c0 % samples
        return (1 - fr) * ((1 - fc) * data[r0, c0] + fc * data[r0, c1]) + fr * ((1 - fc) * data[r1, c0] + fc * data[r1, c1])

    return f


def lola_checks(rng_seed: int = 7) -> list[Record]:
    out: list[Record] = []
    polar = get_dem("lola-ldem-75s-240m-v2")
    cyl = _ldem16_sampler()
    rng = np.random.default_rng(rng_seed)
    if cyl is None:
        out.append(
            rec(
                "lola-projection",
                "LOLA",
                "NASA PDS",
                "LDEM_16",
                "-",
                "-",
                "",
                None,
                None,
                None,
                "",
                "unavailable",
                "ldem_16.img not downloaded",
            )
        )
    else:
        lat = rng.uniform(-84.0, -76.0, 400)
        lon = rng.uniform(0, 360, 400)
        a, b = polar.sample_height(lat, lon), cyl(lat, lon)
        d = np.abs(a - b)
        med, p95 = float(np.median(d)), float(np.percentile(d, 95))
        out.append(
            rec(
                "lola-projection",
                "LOLA",
                "NASA PDS LOLA GDR (two products, two projections)",
                "LDEM_75S_240M (polar stereographic) vs LDEM_16 (simple cylindrical, 1.9 km)",
                "-",
                "400 random points 76-84 S",
                "independent readers; a projection or longitude-convention error would produce km-scale differences",
                {"medianAbsDiffM": round(med, 1)},
                {"expected": "agreement limited by the 1.9 km cylindrical grid"},
                {"medianAbsDiffM": round(med, 1), "p95AbsDiffM": round(p95, 1)},
                "median <= 100 m and p95 <= 600 m",
                "pass" if med <= 100 and p95 <= 600 else "fail",
            )
        )
    comp = get_dem(MULTIRES_ID)
    for t in comp.tiled:
        tiles = sorted(t.cache_dir.glob("t*_*.npy"))
        if not tiles:
            out.append(
                rec(
                    f"lola-{t.product_id}",
                    "LOLA",
                    "NASA PDS",
                    t.product_id,
                    "-",
                    "-",
                    "",
                    None,
                    None,
                    None,
                    "",
                    "unavailable",
                    "no tiles ingested",
                )
            )
            continue
        pts = []
        for p in tiles[:: max(1, len(tiles) // 12)]:
            tr, tc = (int(x) for x in p.stem.split("_")[1:3])
            rows = tr * 512 + rng.uniform(20, 490, 40)
            cols = tc * 512 + rng.uniform(20, 490, 40)
            x, y = t.pixel_to_xy(rows, cols)
            la, lo = t.xy_to_latlon(x, y)
            pts.append((la, lo))
        la = np.concatenate([p[0] for p in pts])
        lo = np.concatenate([p[1] for p in pts])
        fine, coarse = t.sample_height(la, lo), polar.sample_height(la, lo)
        ok = np.isfinite(fine) & np.isfinite(coarse)
        d = np.abs(fine[ok] - coarse[ok])
        med, p95 = float(np.median(d)), float(np.percentile(d, 95))
        out.append(
            rec(
                f"lola-{t.product_id}",
                "LOLA",
                "NASA PDS LOLA GDR (tile reads by HTTP byte range)",
                f"{t.product_id} ({t.scale_m:.0f} m) vs LDEM_75S_240M",
                "-",
                f"{int(ok.sum())} points in {len(tiles)} cached tiles",
                "same-projection products at different resolution; differences reflect sub-240 m topography",
                {"medianAbsDiffM": round(med, 2)},
                {"product": "LDEM_75S_240M"},
                {"medianAbsDiffM": round(med, 2), "p95AbsDiffM": round(p95, 2)},
                "median <= 15 m and p95 <= 120 m",
                "pass" if med <= 15 and p95 <= 120 else "fail",
            )
        )
    sites = json.loads((Path(__file__).resolve().parents[2] / "src/data/sites.json").read_text())["sites"]
    worst = max(abs((polar.height_at(s["latitudeDeg"], s["longitudeEastDeg"]) or 0) - s["heightM"]) for s in sites)
    out.append(
        rec(
            "lola-catalogue-heights",
            "LOLA",
            "MoonNav site catalogue vs DEM reader",
            "LDEM_75S_240M",
            "-",
            f"{len(sites)} catalogue sites",
            "catalogue heights were derived from the same product; re-reading must reproduce them",
            {"maxAbsDiffM": round(worst, 3)},
            {"maxAbsDiffM": 0},
            {"maxAbsDiffM": round(worst, 3)},
            "<= 0.5 m",
            "pass" if worst <= 0.5 else "fail",
        )
    )
    return out


def horizon_bruteforce_check() -> list[Record]:
    """Compare the vectorised horizon with an independent scalar ray march using explicit 3D chords."""
    dem = get_dem("lola-ldem-75s-240m-v2")
    lat, lon = SITES["mons-malapert"]
    p = HorizonParams(azimuth_step_deg=1.0, max_radius_m=60_000.0, observer_height_m=2.0)
    prof = compute_horizon(dem, lat, lon, p)
    R = dem.radius_ref_m
    h0 = dem.height_at(lat, lon) or 0.0
    obs = site_vector_m(lat, lon, R + h0 + 2.0)
    b = enu_basis(lat, lon)
    diffs = []
    for az in (0.0, 45.0, 90.0, 135.0, 180.0, 225.0, 270.0, 315.0):
        best = -90.0
        dvec = math.sin(math.radians(az)) * b.east + math.cos(math.radians(az)) * b.north
        for dist in np.arange(dem.scale_m, 60_000.0 + 1, dem.scale_m):
            ang = dist / R
            u = math.cos(ang) * b.up + math.sin(ang) * dvec
            plat = math.degrees(math.asin(u[2]))
            plon = math.degrees(math.atan2(u[1], u[0])) % 360
            hh = dem.height_at(plat, plon)
            if hh is None:
                break
            v = u * (R + hh) - obs
            e = v @ b.east, v @ b.north, v @ b.up
            best = max(best, math.degrees(math.atan2(e[2], math.hypot(e[0], e[1]))))
        i = int(round(az / p.azimuth_step_deg))
        diffs.append(abs(best - float(prof.elevation_deg[i])))
    mx = max(diffs)
    return [
        rec(
            "horizon-bruteforce",
            "LOLA",
            "independent scalar ray march (3D chord geometry)",
            "LDEM_75S_240M",
            "-",
            "Mons Malapert, 8 azimuths, 60 km",
            "vectorised compute_horizon vs explicit per-sample 3D vectors",
            {"maxElevationDiffDeg": round(mx, 6)},
            {"maxElevationDiffDeg": 0},
            {"maxDeg": round(mx, 6)},
            "<= 0.01 deg",
            "pass" if mx <= 0.01 else "fail",
        )
    ]


def visibility_consistency() -> list[Record]:
    """Analysis states vs an independent recomputation from SPICE vectors + horizon at the same epochs."""
    lat, lon = SITES["mons-malapert"]
    sc = Scenario.from_dict(
        {
            "site": {"latitudeDeg": lat, "longitudeEastDeg": lon},
            "timeRange": {"startUtc": "2026-12-15T00:00:00Z", "endUtc": "2026-12-17T00:00:00Z", "sampleStepSeconds": 7200},
            "assumptions": {},
        }
    )
    r = run_analysis(sc)
    dem = get_dem("lola-ldem-75s-240m-v2")
    prof = compute_horizon(dem, lat, lon, HorizonParams())
    h0 = r["site"]["heightM"]
    site_km = site_vector_m(lat, lon, MOON_REFERENCE_RADIUS_M + h0 + 2.0) / 1000.0
    b = enu_basis(lat, lon)
    mism = 0
    rows = r["timeseries"][::2]
    for row in rows:
        et = utc_to_et(row["utc"])
        st, _ = sp.spkcpo("SUN", et, "MOON_ME", "OBSERVER", "LT+S", [float(x) for x in site_km], "MOON", "MOON_ME")
        v = np.asarray(st[:3])
        az, el = az_el_from_enu(*b.to_enu(v))
        hz, _ = prof.at(az)
        rad = math.degrees(math.asin(695_700.0 / float(np.linalg.norm(v))))
        mine = el + rad > hz
        theirs = row["sunState"] in ("visible", "partial")
        mism += int(mine != theirs)
    return [
        rec(
            "visibility-consistency",
            "SPICE+LOLA",
            "independent recomputation",
            "SPICE + LDEM_75S_240M",
            "2026-12-15..17",
            "Mons Malapert",
            "analysis sunState vs (el + disk radius > horizon(az))",
            {"samples": len(rows), "mismatches": mism},
            {"mismatches": 0},
            {"mismatches": mism},
            "0 mismatches",
            "pass" if mism == 0 else "fail",
        )
    ]


def run_all(live: bool = True) -> dict[str, Any]:
    kernels()
    records: list[Record] = []
    records += spice_checks()
    records += lola_checks()
    records += horizon_bruteforce_check()
    records += visibility_consistency()
    if live:
        records += svs_dialamoon(
            ["2024-03-10T12:00", "2025-06-01T00:00", "2026-01-15T06:00", "2026-06-21T12:00", "2026-12-03T00:00", "2027-07-01T12:00"]
        )
        records += horizons([("2026-12-01T00:00:00Z", "2026-12-08T00:00:00Z"), ("2027-06-15T00:00:00Z", "2027-06-22T00:00:00Z")])
    summary = {k: sum(1 for r in records if r["result"] == k) for k in ("pass", "fail", "unavailable")}
    return {
        "kind": "moonnav.validation-report",
        "generatedAtUtc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "live": live,
        "summary": summary,
        "records": records,
        "statement": "Independent comparisons against published NASA/JPL references. Passing these checks does not mean NASA has certified or endorsed MoonNav.",
    }
