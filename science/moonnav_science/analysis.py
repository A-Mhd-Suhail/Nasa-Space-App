"""Analysis orchestration: scenario -> typed result with provenance."""

from __future__ import annotations

import hashlib
import json
import math
import os
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import numpy as np

from . import METHOD_VERSION, SOFTWARE_VERSION
from .dem import PolarDem
from .ephemeris import CorrectionMode, SpiceEphemeris
from .geometry import enu_basis, normalize_lon_east, site_vector_m, validate_lat
from .horizon import HorizonParams, HorizonProfile, compute_horizon, compute_horizon_multires
from .kernels import LoadedKernels, check_coverage, et_to_utc, load_kernels, utc_to_et
from .power import PanelAssumptions, incidence_cosine, integrate_wh, irradiance_w_m2, power_w
from .tiles import MultiResDem, TiledPolarDem, TileFetchError, available_tiled
from .visibility import VisibilityRule, VisibilitySample, classify, extract_intervals

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("MOONNAV_DATA_DIR", ROOT / "data"))
CATALOG_PATH = Path(__file__).resolve().parents[1] / "catalog" / "products.json"
KERNEL_MANIFEST = Path(__file__).resolve().parents[1] / "catalog" / "kernels.json"
MAX_SAMPLES = 20_000


class AnalysisInputError(ValueError):
    def __init__(self, message: str, field: str | None = None):
        super().__init__(message)
        self.field = field


@dataclass
class Scenario:
    lat_deg: float
    lon_east_deg: float
    start_utc: str
    end_utc: str
    step_s: int = 600
    observer_height_m: float = 2.0
    terrain_product_id: str = "lola-ldem-75s-240m-v2"
    correction: CorrectionMode = "LT+S"
    sun_rule: VisibilityRule = "any_disk"
    earth_rule: VisibilityRule = "any_disk"
    antenna_min_elevation_deg: float | None = None
    panel: PanelAssumptions | None = None
    refine_tolerance_s: float = 10.0
    horizon_azimuth_step_deg: float = 0.5
    horizon_max_radius_m: float = 300_000.0

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Scenario:
        site = d.get("site") or {}
        tr = d.get("timeRange") or {}
        a = d.get("assumptions") or {}
        o = d.get("options") or {}
        panel = None
        sp_ = a.get("solarPanel")
        if sp_:
            panel = PanelAssumptions(
                area_m2=float(sp_["areaM2"]),
                efficiency=float(sp_["efficiency"]),
                derating=float(sp_["derating"]),
                orientation=sp_.get("orientation", "fixed"),
                normal_azimuth_deg=sp_.get("normalAzimuthDeg"),
                normal_elevation_deg=sp_.get("normalElevationDeg"),
                max_output_w=sp_.get("maxOutputW"),
            )
        try:
            return cls(
                lat_deg=float(site["latitudeDeg"]),
                lon_east_deg=float(site["longitudeEastDeg"]),
                observer_height_m=float(site.get("observerHeightM", 2.0)),
                start_utc=str(tr["startUtc"]),
                end_utc=str(tr["endUtc"]),
                step_s=int(tr.get("sampleStepSeconds", 600)),
                terrain_product_id=str((d.get("products") or {}).get("terrainProductId", "lola-ldem-75s-240m-v2")),
                antenna_min_elevation_deg=a.get("antennaMinimumElevationDeg"),
                panel=panel,
                sun_rule=o.get("sunVisibilityRule", "any_disk"),
                earth_rule=o.get("earthVisibilityRule", "any_disk"),
                correction=o.get("aberrationCorrection", "LT+S"),
                refine_tolerance_s=float(o.get("refineToleranceSeconds", 10.0)),
                horizon_azimuth_step_deg=float(o.get("horizonAzimuthStepDeg", 0.5)),
                horizon_max_radius_m=float(o.get("horizonMaxRadiusM", 300_000.0)),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise AnalysisInputError(f"invalid scenario: {exc}") from exc


# ---------------------------------------------------------------------------
# Product registry
# ---------------------------------------------------------------------------
_DEMS: dict[str, Any] = {}
MULTIRES_ID = "lola-multires-v1"
TILE_CACHE = DATA_DIR / "tiles"
NEAR_FIELD_M = 6000.0


class MultiResTerrain(MultiResDem):
    """Finest-available LOLA terrain: cached 5/20/40 m PDS tiles over the 240 m base product.

    Site-level operations (projection helpers, coverage) delegate to the 240 m base so every
    existing endpoint keeps working; heights come from the finest product with a valid sample.
    """

    def __init__(self, tiled: list[TiledPolarDem], base: PolarDem) -> None:
        super().__init__([*tiled, base], MULTIRES_ID)
        self.tiled = tiled
        self.base_dem = base
        self.frame_name = base.frame_name
        self.sha256 = base.sha256
        self.latlon_to_xy = base.latlon_to_xy
        self.xy_to_latlon = base.xy_to_latlon
        self.covers = base.covers

    def height_at(self, lat: float, lon: float) -> float | None:
        v = float(self.sample_height(np.array([lat]), np.array([lon]))[0])
        return None if math.isnan(v) else v

    def prepare(self, lat: float, lon: float, radius_m: float = NEAR_FIELD_M + 1500.0, fetch: bool = True) -> list[dict[str, Any]]:
        """Fetch (bounded) the high-resolution tiles needed around a site; failures degrade to coarser layers."""
        out = []
        for t in self.tiled:
            if not t.covers(lat):
                continue
            try:
                out.append(t.ensure_region(lat, lon, radius_m) if fetch else {"productId": t.product_id, "fetched": 0})
            except (TileFetchError, OSError) as exc:
                out.append({"productId": t.product_id, "error": str(exc)})
        return out

    def near_scale(self, lat: float, lon: float) -> float:
        lyr = self.finest_at(lat, lon)
        return float(lyr.scale_m) if lyr is not None else float(self.base_dem.scale_m)

    def metadata(self) -> dict[str, object]:
        return {
            "productId": MULTIRES_ID,
            "fileName": "LOLA multi-resolution composite",
            "dataSetId": "LRO-L-LOLA-4-GDR-V1.0",
            "productVersion": "V2.0",
            "pixelSpacingM": self.base_dem.scale_m,
            "frame": self.frame_name,
            "referenceRadiusM": self.radius_ref_m,
            "layers": [lyr.metadata() for lyr in self.layers],
            "rule": "finest product with a valid sample wins; never zero-filled",
            "coverage": self.base_dem.metadata()["coverage"],
            "sha256": self.sha256,
        }


def load_catalog() -> dict[str, Any]:
    return json.loads(CATALOG_PATH.read_text())


def get_dem(product_id: str) -> Any:
    if product_id in _DEMS:
        return _DEMS[product_id]
    if product_id == MULTIRES_ID:
        TILE_CACHE.mkdir(parents=True, exist_ok=True)
        tiled: list[TiledPolarDem] = []
        from .tiles import TILED_PRODUCTS

        for pid in TILED_PRODUCTS:  # labels are fetched once from PDS and cached
            try:
                tiled.append(TiledPolarDem.open(pid, TILE_CACHE))
            except Exception:  # noqa: BLE001 - an unreachable label just removes that layer
                continue
        tiled.sort(key=lambda d: d.scale_m)
        comp = MultiResTerrain(tiled or available_tiled(TILE_CACHE), get_dem("lola-ldem-75s-240m-v2"))
        _DEMS[product_id] = comp
        return comp
    cat = load_catalog()
    prod = next((p for p in cat["products"] if p["id"] == product_id), None)
    if prod is None or prod["kind"] != "dem":
        raise AnalysisInputError(f"unknown terrain product {product_id}", "products.terrainProductId")
    if prod["status"] != "approved":
        raise AnalysisInputError(f"terrain product {product_id} is not approved", "products.terrainProductId")
    img = DATA_DIR / prod["localPath"]
    lbl = DATA_DIR / prod["labelPath"]
    dem = PolarDem.open(img, lbl, product_id)
    if dem.sha256 != prod["sha256"]:
        raise RuntimeError(f"checksum mismatch for {product_id}")
    _DEMS[product_id] = dem
    return dem


def kernels() -> LoadedKernels:
    return load_kernels(KERNEL_MANIFEST, DATA_DIR / "raw" / "spice")


# ---------------------------------------------------------------------------
# Horizon cache
# ---------------------------------------------------------------------------
def horizon_cache_key(product_id: str, lat: float, lon: float, params: HorizonParams) -> str:
    raw = json.dumps([product_id, round(lat, 6), round(lon, 6), params.as_dict(), METHOD_VERSION], sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


_HORIZONS: dict[str, HorizonProfile] = {}


def get_horizon(dem: PolarDem, lat: float, lon: float, params: HorizonParams) -> tuple[HorizonProfile, str, bool]:
    """Horizon profile keyed by product, site, parameters and method version (in-process cache)."""
    if isinstance(dem, MultiResTerrain):
        dem.prepare(lat, lon)
        tiles_sig = ",".join(f"{t.product_id}:{len(list(t.cache_dir.glob('t*_*.npy')))}" for t in dem.tiled if t.covers(lat))
        key = horizon_cache_key(dem.product_id + "|" + tiles_sig, lat, lon, params)
        if key in _HORIZONS:
            return _HORIZONS[key], key, True
        prof = compute_horizon_multires(dem, dem.base_dem, dem.near_scale(lat, lon), lat, lon, params, NEAR_FIELD_M)
    else:
        key = horizon_cache_key(dem.product_id, lat, lon, params)
        if key in _HORIZONS:
            return _HORIZONS[key], key, True
        prof = compute_horizon(dem, lat, lon, params)
    if len(_HORIZONS) > 256:
        _HORIZONS.pop(next(iter(_HORIZONS)))
    _HORIZONS[key] = prof
    return prof, key, False


# ---------------------------------------------------------------------------
# Core analysis
# ---------------------------------------------------------------------------
def _r(v: float | None, nd: int = 4) -> float | None:
    return None if v is None or not math.isfinite(v) else round(v, nd)


ProgressCallback = Callable[[str, float], None]


def _noop_progress(stage: str, fraction: float) -> None:
    pass


def run_analysis(sc: Scenario, progress: ProgressCallback = _noop_progress) -> dict[str, Any]:
    warnings: list[str] = []
    progress("validating_input", 0.02)
    validate_lat(sc.lat_deg)
    lon = normalize_lon_east(sc.lon_east_deg)
    if sc.step_s < 30 or sc.step_s > 86_400:
        raise AnalysisInputError("sampleStepSeconds must be between 30 and 86400", "timeRange.sampleStepSeconds")
    if not (0 <= sc.observer_height_m <= 100):
        raise AnalysisInputError("observer height must be between 0 and 100 m", "site.observerHeightM")
    if sc.antenna_min_elevation_deg is not None and not (-10 <= sc.antenna_min_elevation_deg <= 90):
        raise AnalysisInputError("antenna mask must be between -10 and 90 deg", "assumptions.antennaMinimumElevationDeg")
    if sc.panel is not None:
        errs = sc.panel.validate()
        if errs:
            raise AnalysisInputError("; ".join(errs), "assumptions.solarPanel")

    progress("loading_spice_kernels", 0.08)
    k = kernels()
    warnings.extend(getattr(k, "notes", []))
    try:
        et0, et1 = utc_to_et(sc.start_utc), utc_to_et(sc.end_utc)
    except Exception as exc:  # spice raises its own error types
        raise AnalysisInputError(f"could not parse UTC times: {exc}", "timeRange") from exc
    if et1 <= et0:
        raise AnalysisInputError("endUtc must be after startUtc", "timeRange.endUtc")
    try:
        check_coverage(k, et0, et1)
    except Exception as exc:
        raise AnalysisInputError(str(exc), "timeRange") from exc
    n = int(math.floor((et1 - et0) / sc.step_s)) + 1
    if n > MAX_SAMPLES:
        raise AnalysisInputError(f"too many samples ({n}); increase the step or shorten the interval (max {MAX_SAMPLES})", "timeRange")

    progress("loading_dem", 0.15)
    dem = get_dem(sc.terrain_product_id)
    if not dem.covers(sc.lat_deg):
        raise AnalysisInputError(f"site is outside terrain product coverage ({dem.metadata()['coverage']})", "site")
    hp = HorizonParams(
        azimuth_step_deg=sc.horizon_azimuth_step_deg, max_radius_m=sc.horizon_max_radius_m, observer_height_m=sc.observer_height_m
    )
    progress("computing_terrain_horizon", 0.25)
    horizon, horizon_key, _ = get_horizon(dem, sc.lat_deg, lon, hp)
    if horizon.notes:
        warnings.extend(horizon.notes)

    site_r_m = dem.radius_ref_m + horizon.site_height_m + sc.observer_height_m
    site_km = site_vector_m(sc.lat_deg, lon, site_r_m) / 1000.0
    basis = enu_basis(sc.lat_deg, lon)
    eph = SpiceEphemeris(site_km, basis, sc.correction)

    def eval_body(target: Literal["SUN", "EARTH"], et: float, rule: VisibilityRule) -> tuple[Any, VisibilitySample]:
        g = eph.geometry(target, et)
        h, bound = horizon.at(g.azimuth_deg)
        return g, classify(g.elevation_deg, g.angular_radius_deg, h, bound, rule)

    mask = sc.antenna_min_elevation_deg

    def sun_lit(et: float) -> bool | None:
        return eval_body("SUN", et, sc.sun_rule)[1].lit

    def earth_lit(et: float) -> bool | None:
        return eval_body("EARTH", et, sc.earth_rule)[1].lit

    def dte_ok(et: float) -> bool | None:
        g, v = eval_body("EARTH", et, sc.earth_rule)
        if v.lit is None:
            return None
        return bool(v.lit and (mask is None or g.elevation_deg >= mask))

    times = [et0 + i * sc.step_s for i in range(n)]
    if times[-1] < et1:
        times.append(et1)
    progress("sampling_sun_and_earth", 0.45)
    rows: list[dict[str, Any]] = []
    sun_states: list[bool | None] = []
    earth_states: list[bool | None] = []
    dte_states: list[bool | None] = []
    watts: list[float] = []
    sun_el_vis: list[float] = []
    for et in times:
        gs, vs = eval_body("SUN", et, sc.sun_rule)
        ge, ve = eval_body("EARTH", et, sc.earth_rule)
        dte = None if ve.lit is None else bool(ve.lit and (mask is None or ge.elevation_deg >= mask))
        earth_state: str = ve.state
        if ve.lit and mask is not None and ge.elevation_deg < mask:
            earth_state = "below_antenna_mask"
        w = None
        if sc.panel is not None:
            if vs.visible_fraction is None:
                w = None
            else:
                cosi = incidence_cosine(sc.panel, basis, gs.azimuth_deg, gs.elevation_deg)
                w = power_w(sc.panel, irradiance_w_m2(gs.distance_km), cosi, vs.visible_fraction)
        sun_states.append(vs.lit)
        earth_states.append(ve.lit)
        dte_states.append(dte)
        if vs.lit:
            sun_el_vis.append(gs.elevation_deg)
        if w is not None:
            watts.append(w)
        rows.append(
            {
                "utc": et_to_utc(et),
                "sunAzDeg": _r(gs.azimuth_deg),
                "sunElDeg": _r(gs.elevation_deg),
                "sunHorizonDeg": _r(vs.horizon_deg),
                "sunState": vs.state,
                "sunVisibleFraction": _r(vs.visible_fraction),
                "sunDistanceKm": _r(gs.distance_km, 0),
                "earthAzDeg": _r(ge.azimuth_deg),
                "earthElDeg": _r(ge.elevation_deg),
                "earthHorizonDeg": _r(ve.horizon_deg),
                "earthState": earth_state,
                "dteGeometric": dte,
                "powerW": _r(w, 3) if w is not None else None,
            }
        )

    tol = sc.refine_tolerance_s
    progress("extracting_sun_intervals", 0.75)
    sun_iv = extract_intervals(times, sun_states, sun_lit, tol)
    earth_iv = extract_intervals(times, earth_states, earth_lit, tol)
    dte_iv = extract_intervals(times, dte_states, dte_ok, tol)
    total_s = et1 - et0

    def iv_json(ivs: list[Any]) -> list[dict[str, Any]]:
        return [
            {
                "startUtc": et_to_utc(i.start_et),
                "endUtc": et_to_utc(i.end_et),
                "durationS": round(i.end_et - i.start_et, 1),
                "kind": i.kind,
                "startRefined": i.start_refined,
                "endRefined": i.end_refined,
            }
            for i in ivs
        ]

    def summary(ivs: list[Any]) -> dict[str, Any]:
        vis = [i for i in ivs if i.kind == "visible"]
        unk = [i for i in ivs if i.kind == "unknown"]
        tv = sum(i.end_et - i.start_et for i in vis)
        tu = sum(i.end_et - i.start_et for i in unk)
        return {
            "totalVisibleSeconds": round(tv, 1),
            "fractionVisible": round(tv / total_s, 5),
            "intervalCount": len(vis),
            "unknownSeconds": round(tu, 1),
            "unknownIntervalCount": len(unk),
        }

    def next_transition(states: list[bool | None]) -> str | None:
        for i in range(1, len(states)):
            if states[i] != states[0]:
                return rows[i]["utc"]
        return None

    first = rows[0]
    progress("integrating_solar_power", 0.85)
    power: dict[str, Any]
    if sc.panel is None:
        power = {
            "status": "not_calculated_missing_panel_assumptions",
            "energyWh": None,
            "message": "Provide panel area, efficiency, derating and orientation to estimate energy. Sunlight hours are not electrical output.",
        }
    else:
        valid_t = [t for t, r in zip(times, rows, strict=True) if r["powerW"] is not None]
        energy = integrate_wh(valid_t, watts) if len(valid_t) == len(times) else None
        power = {
            "status": "calculated_idealized" if energy is not None else "partial_unknown_samples",
            "energyWh": _r(energy, 2) if energy is not None else None,
            "peakW": _r(max(watts), 2) if watts else None,
            "meanW": _r(float(np.mean(watts)), 3) if watts else None,
            "integration": f"trapezoidal over {sc.step_s} s samples",
            "assumptions": {
                "areaM2": sc.panel.area_m2,
                "efficiency": sc.panel.efficiency,
                "derating": sc.panel.derating,
                "orientation": sc.panel.orientation,
                "normalAzimuthDeg": sc.panel.normal_azimuth_deg,
                "normalElevationDeg": sc.panel.normal_elevation_deg,
                "maxOutputW": sc.panel.max_output_w,
                "irradianceModel": "TSI 1361 W/m2 at 1 AU scaled by inverse-square Sun distance",
                "notModelled": ["temperature", "dust", "battery/storage", "wiring/MPPT beyond derating", "reflected light"],
            },
        }

    unknown_fraction = sum(1 for s in sun_states + earth_states if s is None) / (2 * len(times))
    trunc = sum(1 for s in horizon.status if s == "truncated")
    res_m = dem.near_scale(sc.lat_deg, lon) if isinstance(dem, MultiResTerrain) else dem.scale_m
    reasons = [
        f"DEM pixel spacing {res_m:.0f} m limits near-field horizon fidelity"
        if res_m > 20
        else f"near-field terrain at {res_m:.0f} m (LOLA high-resolution tiles), far field at 240 m"
    ]
    if trunc:
        reasons.append(f"{trunc} horizon rays truncated by DEM coverage")
    if unknown_fraction > 0:
        reasons.append(f"{unknown_fraction:.1%} of body-samples unknown")
    if unknown_fraction == 0 and trunc == 0:
        quality = "high" if res_m <= 20 else "medium"
    elif unknown_fraction < 0.05:
        quality = "low"
    else:
        quality = "insufficient"

    return {
        "status": "completed",
        "quality": quality,
        "qualityRule": "high requires DEM <= 20 m; medium = 240 m DEM with full horizon coverage and no unknown samples; low = <5% unknown; else insufficient",
        "qualityReasons": reasons,
        "site": {
            "latitudeDeg": sc.lat_deg,
            "longitudeEastDeg": lon,
            "heightM": round(horizon.site_height_m, 2),
            "observerHeightM": sc.observer_height_m,
            "datum": f"sphere R={dem.radius_ref_m / 1000:.1f} km ({dem.frame_name})",
            "latitudeType": "planetocentric",
        },
        "timeRange": {
            "startUtc": et_to_utc(et0),
            "endUtc": et_to_utc(et1),
            "sampleStepSeconds": sc.step_s,
            "sampleCount": len(times),
            "refineToleranceSeconds": tol,
            "timeScale": "UTC in/out; TDB internally via LSK",
        },
        "sun": {
            "currentAzimuthDeg": first["sunAzDeg"],
            "currentElevationDeg": first["sunElDeg"],
            "terrainHorizonDeg": first["sunHorizonDeg"],
            "visibilityState": first["sunState"],
            "visibilityRule": sc.sun_rule,
            "visibleIntervals": iv_json(sun_iv),
            **summary(sun_iv),
            "elevationDuringVisibleDeg": {
                "min": _r(min(sun_el_vis)) if sun_el_vis else None,
                "max": _r(max(sun_el_vis)) if sun_el_vis else None,
                "mean": _r(float(np.mean(sun_el_vis))) if sun_el_vis else None,
                "definition": "centre elevation over samples classified lit",
            },
            "nextTransitionUtc": next_transition(sun_states),
        },
        "earth": {
            "currentAzimuthDeg": first["earthAzDeg"],
            "currentElevationDeg": first["earthElDeg"],
            "terrainHorizonDeg": first["earthHorizonDeg"],
            "geometricDteState": first["earthState"],
            "visibilityRule": sc.earth_rule,
            "antennaMinimumElevationDeg": mask,
            "visibleIntervals": iv_json(earth_iv),
            **summary(earth_iv),
            "dteWindows": iv_json(dte_iv),
            "dte": summary(dte_iv),
            "nextTransitionUtc": next_transition(dte_states),
            "label": "Geometric Direct-to-Earth Visibility (line of sight only; not RF link availability)",
        },
        "power": power,
        "horizon": horizon.to_dict() | {"cacheKey": horizon_key},
        "timeseries": rows,
        "provenance": {
            "ephemerisSource": eph.name,
            "aberrationCorrection": sc.correction,
            "bodyFixedFrame": "MOON_ME (alias of MOON_ME_DE440_ME421)",
            "kernelManifestId": k.manifest_id,
            "kernelFiles": [{"fileName": f["fileName"], "sha256": f["sha256"]} for f in k.files],
            "kernelCoverageUtc": [k.utc_start, k.utc_stop],
            "terrainProductId": dem.product_id,
            "terrainProduct": dem.metadata(),
            "methodVersion": METHOD_VERSION,
            "softwareVersion": SOFTWARE_VERSION,
        },
        "warnings": warnings,
    }
