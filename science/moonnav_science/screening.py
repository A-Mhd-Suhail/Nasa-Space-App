"""Terrain hazard screening, dynamic landing-site suitability and sensitivity analysis.

All outputs are preliminary screening indicators computed from NASA LOLA terrain and NAIF
SPICE geometry. They are not landing-safety certifications. Missing data is always
reported as "unknown" and is never counted as safe or as passing a constraint.

Geometry
- Local grids live in the south polar stereographic plane of the LOLA products (metres).
  Within the 75 S cap the projection scale factor differs from 1 by < 0.5 %, documented.
- Sun / Earth: one SPICE `spkpos` per epoch from the Moon centre in MOON_ME (LT+S); for each
  cell the site position is subtracted (parallax), then rotated into that cell's ENU frame.
- Visibility uses each cell's curvature-aware terrain horizon (240 m LOLA, 2 deg azimuth bins,
  150 km radius for grids) and the "any part of the disk above the terrain" rule.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import spiceypy as sp
from numpy.typing import NDArray

from .geometry import MOON_REFERENCE_RADIUS_M, enu_basis, site_vector_m
from .horizon import HorizonParams, HorizonProfile, compute_horizon
from .kernels import et_to_utc, utc_to_et

SUN_RADIUS_KM = 695_700.0

# --------------------------------------------------------------------------------------------
# Hazard screening
# --------------------------------------------------------------------------------------------


@dataclass
class HazardThresholds:
    slope_caution_deg: float = 8.0
    slope_max_deg: float = 15.0
    roughness_caution_m: float = 0.5
    roughness_max_m: float = 1.5
    landing_radius_m: float = 100.0

    def as_dict(self) -> dict[str, float]:
        return {
            "slopeCautionDeg": self.slope_caution_deg,
            "slopeMaxDeg": self.slope_max_deg,
            "roughnessCautionM": self.roughness_caution_m,
            "roughnessMaxM": self.roughness_max_m,
            "landingRadiusM": self.landing_radius_m,
        }


def _grid_latlon(
    dem: Any, lat: float, lon: float, half_m: float, spacing_m: float
) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
    x0, y0 = dem.latlon_to_xy(np.array([lat]), np.array([lon]))
    n = int(round(half_m / spacing_m))
    off = np.arange(-n, n + 1) * spacing_m
    X, Y = np.meshgrid(x0[0] + off, y0[0] - off)  # row 0 = +y (grid north in the map)
    la, lo = dem.xy_to_latlon(X, Y)
    return la, lo, off.astype(np.float64), off.astype(np.float64)


def slope_roughness(
    h: NDArray[np.float64], spacing_m: float
) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64], NDArray[np.float64]]:
    """Slope (deg, central differences, baseline 2 x spacing), roughness (m, RMS of residuals from the
    3x3 best-fit plane), local relief (m, 3x3 max - min) and Laplacian curvature (1/m)."""
    gy, gx = np.gradient(h, spacing_m)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    pad = np.pad(h, 1, mode="edge")
    stack = np.stack([pad[1 + dy : pad.shape[0] - 1 + dy, 1 + dx : pad.shape[1] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
    # Plane fit on a regular 3x3 stencil: z = a + b x + c y. Residual RMS = roughness.
    xs = np.array([dx for dy in (-1, 0, 1) for dx in (-1, 0, 1)], dtype=float) * spacing_m
    ys = np.array([dy for dy in (-1, 0, 1) for dx in (-1, 0, 1)], dtype=float) * spacing_m
    mean = stack.mean(axis=0)
    b = np.tensordot(xs, stack, axes=1) / np.sum(xs**2)
    c = np.tensordot(ys, stack, axes=1) / np.sum(ys**2)
    resid = stack - (mean[None] + b[None] * xs[:, None, None] + c[None] * ys[:, None, None])
    rough = np.sqrt(np.mean(resid**2, axis=0))
    relief = stack.max(axis=0) - stack.min(axis=0)
    lap = np.gradient(np.gradient(h, spacing_m, axis=0), spacing_m, axis=0) + np.gradient(
        np.gradient(h, spacing_m, axis=1), spacing_m, axis=1
    )
    edge = np.zeros_like(h, dtype=bool)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    for a in (slope, rough, relief, lap):
        a[edge | ~np.isfinite(a)] = np.nan
    bad = ~np.isfinite(h)
    nb = np.zeros_like(bad)
    nb[1:-1, 1:-1] = bad[:-2, 1:-1] | bad[2:, 1:-1] | bad[1:-1, :-2] | bad[1:-1, 2:] | bad[1:-1, 1:-1]
    for a in (slope, rough, relief, lap):
        a[nb] = np.nan
    return slope, rough, relief, lap


def hazard_screen(
    dem: Any, lat: float, lon: float, half_m: float = 1000.0, th: HazardThresholds | None = None, max_cells: int = 201
) -> dict[str, Any]:
    th = th or HazardThresholds()
    finest = dem.near_scale(lat, lon) if hasattr(dem, "near_scale") else dem.scale_m
    spacing = max(finest, 2 * half_m / (max_cells - 1))
    la, lo, xs, ys = _grid_latlon(dem, lat, lon, half_m, spacing)
    if hasattr(dem, "sample_with_source"):
        h, src = dem.sample_with_source(la, lo)
        names = [lyr.product_id for lyr in dem.layers]
    else:
        h, src, names = dem.sample_height(la, lo), np.zeros(la.shape, dtype=int), [dem.product_id]
    slope, rough, relief, lap = slope_roughness(h, spacing)
    cls = np.full(h.shape, -1, dtype=np.int8)  # -1 unknown, 0 within thresholds, 1 caution, 2 exceeds
    known = np.isfinite(slope) & np.isfinite(rough)
    hz = (slope > th.slope_max_deg) | (rough > th.roughness_max_m)
    ca = (slope > th.slope_caution_deg) | (rough > th.roughness_caution_m)
    cls[known] = 0
    cls[known & ca] = 1
    cls[known & hz] = 2
    # Rims / ridges: convex (negative Laplacian) and steeper than the caution slope.
    rim = known & (lap < -np.nanpercentile(np.abs(lap), 90)) & (slope > th.slope_caution_deg)
    rr = np.hypot(*np.meshgrid(xs, ys))
    zone = rr <= th.landing_radius_m
    zk = zone & known

    def pct(mask: NDArray[np.bool_], base: NDArray[np.bool_]) -> float | None:
        return None if base.sum() == 0 else round(100.0 * float((mask & base).sum()) / float(base.sum()), 1)

    def fin(a: NDArray[np.float64], f: Any) -> float | None:
        v = a[zk]
        return None if v.size == 0 else round(float(f(v)), 3)

    used = {names[i]: int((src == i).sum()) for i in range(len(names)) if (src == i).any()}
    summary = {
        "landingZoneRadiusM": th.landing_radius_m,
        "cellsInZone": int(zone.sum()),
        "unknownPctInZone": pct(~known, zone),
        "maxSlopeDeg": fin(slope, np.max),
        "meanSlopeDeg": fin(slope, np.mean),
        "maxRoughnessM": fin(rough, np.max),
        "localReliefM": fin(relief, np.max),
        "exceedsPctInZone": pct(cls == 2, zone),
        "cautionPctInZone": pct(cls == 1, zone),
        "rimRidgePctInZone": pct(rim, zone),
    }
    verdict = (
        "unknown"
        if (summary["unknownPctInZone"] or 0) > 0 or zk.sum() == 0
        else "exceeds"
        if (summary["exceedsPctInZone"] or 0) > 0
        else "caution"
        if (summary["cautionPctInZone"] or 0) > 0
        else "within_thresholds"
    )
    reasons = []
    if verdict == "unknown":
        reasons.append("part of the landing zone has no valid elevation (missing data is never treated as safe)")
    if summary["maxSlopeDeg"] is not None and summary["maxSlopeDeg"] > th.slope_max_deg:
        reasons.append(f"slope up to {summary['maxSlopeDeg']:.1f} deg exceeds {th.slope_max_deg} deg")
    elif summary["maxSlopeDeg"] is not None and summary["maxSlopeDeg"] > th.slope_caution_deg:
        reasons.append(f"slope up to {summary['maxSlopeDeg']:.1f} deg exceeds the {th.slope_caution_deg} deg caution level")
    if summary["maxRoughnessM"] is not None and summary["maxRoughnessM"] > th.roughness_caution_m:
        reasons.append(f"roughness up to {summary['maxRoughnessM']:.2f} m over {spacing:.0f} m cells")
    if (summary["rimRidgePctInZone"] or 0) > 0:
        reasons.append("crater rim / ridge signature (steep and convex) inside the zone")
    if spacing > 20:
        reasons.append(f"cell size {spacing:.0f} m cannot resolve boulders or small craters; hazards below this scale are not assessed")

    def q(a: NDArray[np.float64], nd: int) -> list[list[float | None]]:
        return [[None if not math.isfinite(v) else round(float(v), nd) for v in row] for row in a]

    return {
        "center": {"latitudeDeg": lat, "longitudeEastDeg": lon},
        "grid": {
            "spacingM": spacing,
            "size": int(h.shape[0]),
            "halfSizeM": float(xs[-1]),
            "orientation": "south polar stereographic map plane; row 0 toward the 0 deg meridian (map +y)",
        },
        "heightM": q(h, 1),
        "slopeDeg": q(slope, 2),
        "roughnessM": q(rough, 3),
        "reliefM": q(relief, 2),
        "hazardClass": cls.tolist(),
        "rimRidge": rim.astype(int).tolist(),
        "summary": summary,
        "verdict": verdict,
        "reasons": reasons,
        "thresholds": th.as_dict(),
        "productsUsed": used,
        "finestResolutionM": finest,
        "method": "heights: finest LOLA product with a valid sample (bilinear); slope: central differences (baseline 2 x cell); roughness: RMS residual from a 3x3 least-squares plane; rim/ridge: Laplacian in the convex 10% tail with slope above the caution level",
        "disclaimer": "Preliminary terrain screening from orbital altimetry — not a certified landing-hazard assessment.",
    }


# --------------------------------------------------------------------------------------------
# Vectorised Sun / Earth visibility over many sites
# --------------------------------------------------------------------------------------------


@dataclass
class SuitabilityConfig:
    min_sun_pct: float | None = 30.0
    min_dte_pct: float | None = 20.0
    max_slope_deg: float | None = 15.0
    max_roughness_m: float | None = 1.5
    max_unknown_pct: float = 5.0
    max_dark_hours: float | None = None
    antenna_mask_deg: float | None = None
    weights: dict[str, float] = field(
        default_factory=lambda: {"sun": 35.0, "dte": 30.0, "slope": 20.0, "roughness": 10.0, "solarElevation": 5.0}
    )

    @classmethod
    def from_dict(cls, d: dict[str, Any] | None) -> SuitabilityConfig:
        d = d or {}
        c = cls()
        for k_json, k in (
            ("minSunPct", "min_sun_pct"),
            ("minDtePct", "min_dte_pct"),
            ("maxSlopeDeg", "max_slope_deg"),
            ("maxRoughnessM", "max_roughness_m"),
            ("maxUnknownPct", "max_unknown_pct"),
            ("maxDarkHours", "max_dark_hours"),
            ("antennaMaskDeg", "antenna_mask_deg"),
        ):
            if k_json in d:
                setattr(c, k, None if d[k_json] is None else float(d[k_json]))
        if c.max_unknown_pct is None:
            c.max_unknown_pct = 5.0
        if isinstance(d.get("weights"), dict):
            c.weights = {k: max(0.0, float(v)) for k, v in d["weights"].items() if k in c.weights}
        return c


def body_vectors_km(ets: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Sun and Earth positions (km) from the Moon centre in MOON_ME, LT+S, for each epoch."""
    sun = np.array([sp.spkpos("SUN", float(t), "MOON_ME", "LT+S", "MOON")[0] for t in ets])
    earth = np.array([sp.spkpos("EARTH", float(t), "MOON_ME", "LT+S", "MOON")[0] for t in ets])
    return sun, earth


def visibility_series(
    site_km: NDArray[np.float64],
    lat: float,
    lon: float,
    horizon: HorizonProfile,
    sun: NDArray[np.float64],
    earth: NDArray[np.float64],
    earth_radius_km: float,
    mask_deg: float | None,
) -> dict[str, NDArray[Any]]:
    b = enu_basis(lat, lon)
    M = np.stack([b.east, b.north, b.up])
    out: dict[str, NDArray[Any]] = {}
    for name, vec, rad in (("sun", sun, SUN_RADIUS_KM), ("earth", earth, earth_radius_km)):
        v = vec - site_km[None, :]
        enu = v @ M.T
        dist = np.linalg.norm(v, axis=1)
        az = (np.degrees(np.arctan2(enu[:, 0], enu[:, 1])) + 360.0) % 360.0
        el = np.degrees(np.arctan2(enu[:, 2], np.hypot(enu[:, 0], enu[:, 1])))
        r = np.degrees(np.arcsin(rad / dist))
        step = horizon.params.azimuth_step_deg
        n = len(horizon.azimuths_deg)
        x = az / step
        i0 = np.floor(x).astype(int) % n
        i1 = (i0 + 1) % n
        f = x - np.floor(x)
        hz = (1 - f) * horizon.elevation_deg[i0] + f * horizon.elevation_deg[i1]
        bound = np.fmax(horizon.beyond_bound_deg[i0], horizon.beyond_bound_deg[i1])
        known_vis = el + r > hz
        worst = np.where(np.isfinite(bound), el + r > np.fmax(hz, bound), known_vis)
        vis = np.where(np.isfinite(hz), known_vis.astype(float), np.nan)
        unknown = np.isfinite(hz) & (known_vis != worst)
        vis[unknown] = np.nan
        out[f"{name}_el"] = el
        out[f"{name}_az"] = az
        out[f"{name}_vis"] = vis  # 1 visible, 0 blocked, nan unknown
        out[f"{name}_geom"] = (el + r > 0).astype(float)
    dte = out["earth_vis"].copy()
    if mask_deg is not None:
        dte = np.where(np.isfinite(dte), dte * (out["earth_el"] >= mask_deg), np.nan)
    out["dte"] = dte
    return out


def _longest_run_hours(flags: NDArray[np.float64], step_s: float, value: float) -> float:
    best = cur = 0
    for v in flags:
        cur = cur + 1 if v == value else 0
        best = max(best, cur)
    return best * step_s / 3600.0


def site_metrics(series: dict[str, NDArray[Any]], step_s: float) -> dict[str, float | None]:
    n = len(series["sun_vis"])
    window_h = (n - 1) * step_s / 3600.0  # samples include both interval ends

    def frac(a: NDArray[np.float64]) -> float:
        return float(np.nansum(a == 1)) / n

    unknown = float(np.isnan(series["sun_vis"]).sum() + np.isnan(series["earth_vis"]).sum()) / (2 * n)
    lit = series["sun_vis"] == 1
    geom_up = series["sun_geom"] == 1
    blocked_by_terrain = float(np.sum(geom_up & (series["sun_vis"] == 0))) / max(1, int(geom_up.sum())) if geom_up.any() else None
    return {
        "sunPct": round(100 * frac(series["sun_vis"]), 2),
        "sunHours": round(frac(series["sun_vis"]) * window_h, 2),
        "meanSolarElevationLitDeg": round(float(np.mean(series["sun_el"][lit])), 3) if lit.any() else None,
        "earthPct": round(100 * frac(series["earth_vis"]), 2),
        "dtePct": round(100 * frac(series["dte"]), 2),
        "dteHours": round(frac(series["dte"]) * window_h, 2),
        "windowHours": round(window_h, 3),
        "longestDarkHours": round(_longest_run_hours(series["sun_vis"], step_s, 0.0), 2),
        "longestBlackoutHours": round(_longest_run_hours(series["dte"], step_s, 0.0), 2),
        "sunTerrainBlockedPct": None if blocked_by_terrain is None else round(100 * blocked_by_terrain, 2),
        "unknownPct": round(100 * unknown, 2),
    }


def evaluate(m: dict[str, Any], c: SuitabilityConfig) -> dict[str, Any]:
    """Hard constraints first (missing -> unknown, never pass), then an explainable 0-100 score."""
    checks: list[dict[str, Any]] = []

    def chk(key: str, label: str, value: float | None, limit: float | None, ok_fn: Any, unit: str) -> None:
        if limit is None:
            return
        checks.append(
            {
                "key": key,
                "label": label,
                "value": value,
                "limit": limit,
                "unit": unit,
                "result": "unknown" if value is None else ("pass" if ok_fn(value, limit) else "fail"),
            }
        )

    chk("unknown", "Unknown (coverage-limited) time", m.get("unknownPct"), c.max_unknown_pct, lambda v, lim: v <= lim, "%")
    chk("sun", "Direct sunlight", m.get("sunPct"), c.min_sun_pct, lambda v, lim: v >= lim, "%")
    chk("dte", "Geometric direct-to-Earth", m.get("dtePct"), c.min_dte_pct, lambda v, lim: v >= lim, "%")
    chk("dark", "Longest darkness", m.get("longestDarkHours"), c.max_dark_hours, lambda v, lim: v <= lim, "h")
    chk("slope", "Slope", m.get("slopeDeg"), c.max_slope_deg, lambda v, lim: v <= lim, "°")
    chk("roughness", "Roughness", m.get("roughnessM"), c.max_roughness_m, lambda v, lim: v <= lim, "m")
    status = (
        "fail" if any(x["result"] == "fail" for x in checks) else "unknown" if any(x["result"] == "unknown" for x in checks) else "pass"
    )
    w = c.weights
    norm: dict[str, float | None] = {
        "sun": None if m.get("sunPct") is None else m["sunPct"] / 100,
        "dte": None if m.get("dtePct") is None else m["dtePct"] / 100,
        "slope": None if m.get("slopeDeg") is None else max(0.0, 1 - m["slopeDeg"] / (c.max_slope_deg or 30.0)),
        "roughness": None if m.get("roughnessM") is None else max(0.0, 1 - m["roughnessM"] / (c.max_roughness_m or 3.0)),
        "solarElevation": None if m.get("meanSolarElevationLitDeg") is None else min(1.0, max(0.0, m["meanSolarElevationLitDeg"] / 5.0)),
    }
    if m.get("sunPct") == 0:
        norm["solarElevation"] = 0.0
    used = {k: v for k, v in w.items() if v > 0}
    missing = [k for k in used if norm.get(k) is None]
    total = sum(used.values())
    if missing or total == 0:
        score, breakdown = None, None
    else:
        breakdown = {k: round(100 * used[k] * float(norm[k] or 0.0) / total, 2) for k in used}
        score = round(sum(breakdown.values()), 2)
    favourable: list[str] = []
    unfavourable: list[str] = []
    for x in checks:
        (favourable if x["result"] == "pass" else unfavourable).append(
            f"{x['label']} {x['value'] if x['value'] is not None else 'unavailable'}{x['unit']} vs limit {x['limit']}{x['unit']}: {x['result']}"
        )
    return {
        "status": status,
        "checks": checks,
        "score": score,
        "breakdown": breakdown,
        "normalized": norm,
        "missingForScore": missing,
        "favourable": favourable,
        "unfavourable": unfavourable,
    }


def _terrain_at(dem: Any, lat: float, lon: float) -> dict[str, Any]:
    spacing = dem.near_scale(lat, lon) if hasattr(dem, "near_scale") else dem.scale_m
    la, lo, _, _ = _grid_latlon(dem, lat, lon, 2 * spacing, spacing)  # 5 x 5 stencil
    h = dem.sample_height(la, lo)
    slope, rough, _, _ = slope_roughness(h, spacing)
    c = h.shape[0] // 2
    val = lambda a: None if not np.isfinite(a[c, c]) else round(float(a[c, c]), 3)  # noqa: E731
    return {"heightM": val(h), "slopeDeg": val(slope), "roughnessM": val(rough), "terrainResolutionM": spacing}


def time_grid(start_utc: str, end_utc: str, step_s: int, max_samples: int = 2000) -> NDArray[np.float64]:
    e0, e1 = utc_to_et(start_utc), utc_to_et(end_utc)
    if e1 <= e0:
        raise ValueError("end must be after start")
    n = int((e1 - e0) // step_s) + 1
    if n > max_samples:
        raise ValueError(f"too many time samples ({n}); max {max_samples} — increase the step")
    return np.asarray(e0 + np.arange(n) * float(step_s), dtype=np.float64)


def evaluate_point(
    dem: Any,
    base: Any,
    lat: float,
    lon: float,
    sun: NDArray[np.float64],
    earth: NDArray[np.float64],
    step_s: float,
    cfg: SuitabilityConfig,
    earth_radius_km: float,
    hparams: HorizonParams,
    horizon_fn: Any = None,
) -> dict[str, Any]:
    terrain = _terrain_at(dem, lat, lon)
    if terrain["heightM"] is None:
        m: dict[str, Any] = {"sunPct": None, "dtePct": None, "unknownPct": 100.0, **terrain, "covered": False}
        return {"latitudeDeg": lat, "longitudeEastDeg": lon, "metrics": m, "evaluation": evaluate(m, cfg)}
    hz = horizon_fn(lat, lon) if horizon_fn else compute_horizon(base, lat, lon, hparams, site_height_m=terrain["heightM"])
    site_km = site_vector_m(lat, lon, MOON_REFERENCE_RADIUS_M + terrain["heightM"] + hparams.observer_height_m) / 1000.0
    s = visibility_series(site_km, lat, lon, hz, sun, earth, earth_radius_km, cfg.antenna_mask_deg)
    m = {**site_metrics(s, step_s), **terrain, "covered": True, "horizonTruncatedRays": int(sum(1 for x in hz.status if x == "truncated"))}
    return {"latitudeDeg": lat, "longitudeEastDeg": lon, "metrics": m, "evaluation": evaluate(m, cfg)}


def suitability_grid(
    dem: Any, base: Any, lat: float, lon: float, half_m: float, n: int, start_utc: str, end_utc: str, step_s: int, cfg: SuitabilityConfig
) -> dict[str, Any]:
    if n < 1 or n > 21:
        raise ValueError("grid size must be 1-21 cells per side")
    ets = time_grid(start_utc, end_utc, step_s)
    sun, earth = body_vectors_km(ets)
    er = float(sp.bodvrd("EARTH", "RADII", 3)[1][0])
    hp = HorizonParams(azimuth_step_deg=2.0, max_radius_m=150_000.0, observer_height_m=2.0)
    spacing = 0.0 if n == 1 else 2 * half_m / (n - 1)
    x0, y0 = base.latlon_to_xy(np.array([lat]), np.array([lon]))
    cells = []
    for i in range(n):
        for j in range(n):
            x = x0[0] + (j - (n - 1) / 2) * spacing
            y = y0[0] - (i - (n - 1) / 2) * spacing
            la, lo = base.xy_to_latlon(np.array([x]), np.array([y]))
            r = evaluate_point(dem, base, float(la[0]), float(lo[0]), sun, earth, step_s, cfg, er, hp)
            r.update(
                {"row": i, "col": j, "offsetEastM": float((j - (n - 1) / 2) * spacing), "offsetNorthM": float(-(i - (n - 1) / 2) * spacing)}
            )
            cells.append(r)
    ranked = sorted(
        [c for c in cells if c["evaluation"]["status"] == "pass" and c["evaluation"]["score"] is not None],
        key=lambda c: -c["evaluation"]["score"],
    )
    return {
        "center": {"latitudeDeg": lat, "longitudeEastDeg": lon},
        "grid": {
            "size": n,
            "spacingM": spacing,
            "halfSizeM": half_m,
            "plane": "south polar stereographic (map x east of 0 deg meridian, y toward it)",
        },
        "window": {
            "startUtc": start_utc,
            "endUtc": end_utc,
            "stepSeconds": step_s,
            "samples": int(len(ets)),
            "lastSampleUtc": et_to_utc(float(ets[-1])),
        },
        "config": {
            "minSunPct": cfg.min_sun_pct,
            "minDtePct": cfg.min_dte_pct,
            "maxSlopeDeg": cfg.max_slope_deg,
            "maxRoughnessM": cfg.max_roughness_m,
            "maxUnknownPct": cfg.max_unknown_pct,
            "maxDarkHours": cfg.max_dark_hours,
            "antennaMaskDeg": cfg.antenna_mask_deg,
            "weights": cfg.weights,
        },
        "cells": cells,
        "bestPassing": [
            {
                "row": c["row"],
                "col": c["col"],
                "latitudeDeg": c["latitudeDeg"],
                "longitudeEastDeg": c["longitudeEastDeg"],
                "score": c["evaluation"]["score"],
            }
            for c in ranked[:5]
        ],
        "counts": {k: sum(1 for c in cells if c["evaluation"]["status"] == k) for k in ("pass", "fail", "unknown")},
        "method": "per cell: finest-LOLA height/slope/roughness (5x5 stencil); 240 m curvature-aware horizon (2 deg bins, 150 km); SPICE Sun/Earth (LT+S) with per-cell parallax; any-disk visibility",
        "disclaimer": "Simplified MoonNav suitability screening — not an official NASA rating and not a landing-safety certification. Sunlight alone never establishes safety.",
    }


def date_series(
    dem: Any, base: Any, lat: float, lon: float, starts_utc: list[str], hours: float, step_s: int, cfg: SuitabilityConfig
) -> list[dict[str, Any]]:
    """Same site, several analysis windows (each `hours` long)."""
    er = float(sp.bodvrd("EARTH", "RADII", 3)[1][0])
    hp = HorizonParams(azimuth_step_deg=1.0, max_radius_m=300_000.0, observer_height_m=2.0)
    terrain = _terrain_at(dem, lat, lon)
    if terrain["heightM"] is None:
        raise ValueError("site outside terrain coverage")
    hz = compute_horizon(base, lat, lon, hp, site_height_m=terrain["heightM"])
    out = []
    for s in starts_utc:
        e0 = utc_to_et(s)
        ets = time_grid(s, et_to_utc(e0 + hours * 3600), step_s)
        sun, earth = body_vectors_km(ets)
        r = evaluate_point(dem, base, lat, lon, sun, earth, step_s, cfg, er, hp, horizon_fn=lambda _a, _b, hz=hz: hz)
        r["startUtc"] = s
        out.append(r)
    return out


def sensitivity(
    dem: Any,
    base: Any,
    lat: float,
    lon: float,
    start_utc: str,
    hours: float,
    step_s: int,
    cfg: SuitabilityConfig,
    spacing_m: float = 500.0,
    n: int = 5,
    day_shifts: list[float] | None = None,
) -> dict[str, Any]:
    """How results change when the landing point moves (n x n grid, `spacing_m`) or the date shifts.

    Every number comes from an executed calculation; alternatives are only listed when they were
    evaluated and pass the configured hard constraints.
    """
    shifts = day_shifts if day_shifts is not None else [-7, -3.5, -1, 0, 1, 3.5, 7]
    end_utc = et_to_utc(utc_to_et(start_utc) + hours * 3600)
    grid = suitability_grid(dem, base, lat, lon, spacing_m * (n - 1) / 2, n, start_utc, end_utc, step_s, cfg)
    centre = next(c for c in grid["cells"] if c["row"] == (n - 1) // 2 and c["col"] == (n - 1) // 2)
    c0 = centre["metrics"]

    def delta(c: dict[str, Any], k: str) -> float | None:
        a, b = c["metrics"].get(k), c0.get(k)
        return None if a is None or b is None else round(a - b, 3)

    loc = []
    for c in grid["cells"]:
        dist_km = math.hypot(c["offsetEastM"], c["offsetNorthM"]) / 1000
        loc.append(
            {
                **{k: c[k] for k in ("row", "col", "latitudeDeg", "longitudeEastDeg", "offsetEastM", "offsetNorthM")},
                "distanceKm": round(dist_km, 3),
                "sunHours": c["metrics"].get("sunHours"),
                "dteHours": c["metrics"].get("dteHours"),
                "slopeDeg": c["metrics"].get("slopeDeg"),
                "deltaSunHours": delta(c, "sunHours"),
                "deltaDteHours": delta(c, "dteHours"),
                "score": c["evaluation"]["score"],
                "status": c["evaluation"]["status"],
            }
        )

    def rate(key: str) -> float | None:
        vals = [abs(x[key]) / x["distanceKm"] for x in loc if x["distanceKm"] > 0 and x[key] is not None]
        return round(max(vals), 3) if vals else None

    starts = [et_to_utc(utc_to_et(start_utc) + d * 86400) for d in shifts]
    dates = date_series(dem, base, lat, lon, starts, hours, step_s, cfg)
    base_d = next((d for d, s in zip(dates, shifts, strict=True) if s == 0), dates[0])
    date_rows = [
        {
            "dayShift": s,
            "startUtc": d["startUtc"],
            "sunHours": d["metrics"].get("sunHours"),
            "dteHours": d["metrics"].get("dteHours"),
            "meanSolarElevationLitDeg": d["metrics"].get("meanSolarElevationLitDeg"),
            "score": d["evaluation"]["score"],
            "status": d["evaluation"]["status"],
            "deltaSunHours": None
            if d["metrics"].get("sunHours") is None
            else round(d["metrics"]["sunHours"] - base_d["metrics"]["sunHours"], 3),
            "deltaDteHours": None
            if d["metrics"].get("dteHours") is None
            else round(d["metrics"]["dteHours"] - base_d["metrics"]["dteHours"], 3),
        }
        for d, s in zip(dates, shifts, strict=True)
    ]
    base_score = centre["evaluation"]["score"]
    better_loc = sorted(
        [x for x in loc if x["status"] == "pass" and x["score"] is not None and (base_score is None or x["score"] > base_score + 0.05)],
        key=lambda x: -x["score"],
    )[:3]
    better_dates = sorted(
        [
            x
            for x in date_rows
            if x["status"] == "pass"
            and x["score"] is not None
            and (base_d["evaluation"]["score"] is None or x["score"] > base_d["evaluation"]["score"] + 0.05)
        ],
        key=lambda x: -x["score"],
    )[:3]

    def rng(rows: list[dict[str, Any]], k: str) -> list[float] | None:
        v = [r[k] for r in rows if r[k] is not None]
        return [min(v), max(v)] if v else None

    return {
        "original": {
            "latitudeDeg": lat,
            "longitudeEastDeg": lon,
            "startUtc": start_utc,
            "hours": hours,
            "metrics": c0,
            "evaluation": centre["evaluation"],
        },
        "location": {
            "spacingM": spacing_m,
            "size": n,
            "cells": loc,
            "sunHoursRange": rng(loc, "sunHours"),
            "dteHoursRange": rng(loc, "dteHours"),
            "maxSunChangeHoursPerKm": rate("deltaSunHours"),
            "maxDteChangeHoursPerKm": rate("deltaDteHours"),
            "betterAlternatives": better_loc,
        },
        "date": {
            "dayShifts": shifts,
            "rows": date_rows,
            "sunHoursRange": rng(date_rows, "sunHours"),
            "dteHoursRange": rng(date_rows, "dteHours"),
            "betterAlternatives": better_dates,
        },
        "resolution": {
            "timeStepSeconds": step_s,
            "windowHours": hours,
            "gridSpacingM": spacing_m,
            "horizon": "240 m LOLA, 2 deg bins / 150 km (location grid); 1 deg / 300 km (date series)",
            "terrain": "finest LOLA product at each point for height/slope/roughness",
        },
        "window": grid["window"],
    }
