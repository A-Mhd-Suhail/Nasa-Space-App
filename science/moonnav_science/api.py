"""Internal science API (FastAPI). Called only by the Next.js backend-for-frontend.

All routes except /health require `Authorization: Bearer <SCIENCE_SERVICE_TOKEN>`.
"""

from __future__ import annotations

import base64
import hmac
import math
import os
import threading
import time
import uuid
from typing import Any

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import METHOD_VERSION, SOFTWARE_VERSION
from .analysis import AnalysisInputError, Scenario, get_dem, get_horizon, kernels, load_catalog, run_analysis
from .geometry import enu_basis, lat_lon_from_vectors, normalize_lon_east
from .horizon import HorizonParams
from .horizons_live import HorizonsUnavailable, cross_check
from .kernels import parse_utc

# SPICE (CSPICE) is not thread-safe; FastAPI runs sync endpoints in a thread pool.
SPICE_LOCK = threading.RLock()
app = FastAPI(title="MoonNav Science API", version=SOFTWARE_VERSION, docs_url="/docs", redoc_url=None)
TOKEN = os.environ.get("SCIENCE_SERVICE_TOKEN", "")
SYNC_MAX_SAMPLES = 5000


def _err(status: int, code: str, message: str, request_id: str, field: str | None = None) -> JSONResponse:
    body: dict[str, Any] = {"error": {"code": code, "message": message, "requestId": request_id}}
    if field:
        body["error"]["fieldErrors"] = [{"field": field, "message": message}]
    return JSONResponse(status_code=status, content=body)


@app.middleware("http")
async def request_id_mw(request: Request, call_next):  # type: ignore[no-untyped-def]
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex
    request.state.rid = rid
    try:
        resp = await call_next(request)
    except Exception:  # never leak stack traces
        return _err(500, "internal_error", "Unexpected science service error", rid)
    resp.headers["x-request-id"] = rid
    return resp


def require_token(authorization: str = Header(default="")) -> None:
    if not TOKEN:
        raise HTTPException(503, "SCIENCE_SERVICE_TOKEN not configured")
    expected = f"Bearer {TOKEN}"
    if not hmac.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(401, "invalid service token")


@app.exception_handler(AnalysisInputError)
async def input_error(request: Request, exc: AnalysisInputError) -> JSONResponse:
    return _err(422, "invalid_input", str(exc), getattr(request.state, "rid", ""), exc.field)


@app.get("/health")
def health() -> dict[str, Any]:
    out: dict[str, Any] = {"service": "moonnav-science", "methodVersion": METHOD_VERSION, "softwareVersion": SOFTWARE_VERSION}
    try:
        k = kernels()
        out["kernels"] = {"status": "ok", "manifestId": k.manifest_id, "coverageUtc": [k.utc_start, k.utc_stop]}
    except Exception as exc:  # report, don't crash
        out["kernels"] = {"status": "error", "message": str(exc)}
    try:
        dems = [p for p in load_catalog()["products"] if p["kind"] == "dem" and p["status"] == "approved"]
        for p in dems:
            get_dem(p["id"])
        out["terrain"] = {"status": "ok", "products": [p["id"] for p in dems]}
    except Exception as exc:
        out["terrain"] = {"status": "error", "message": str(exc)}
    out["status"] = "ok" if out["kernels"]["status"] == "ok" and out["terrain"]["status"] == "ok" else "degraded"
    return out


@app.get("/v1/products", dependencies=[Depends(require_token)])
def products() -> dict[str, Any]:
    return load_catalog()


@app.get("/v1/terrain/point", dependencies=[Depends(require_token)])
def terrain_point(
    lat: float = Query(..., ge=-90, le=90), lon: float = Query(...), product: str = "lola-ldem-75s-240m-v2"
) -> dict[str, Any]:
    dem = get_dem(product)
    lon = normalize_lon_east(lon)
    h = dem.height_at(lat, lon) if dem.covers(lat) else None
    # local slope from a 3x3 neighbourhood in projected metres
    slope = None
    if h is not None:
        x, y = dem.latlon_to_xy(np.array([lat]), np.array([lon]))
        s = dem.scale_m
        xs = np.array([x[0] - s, x[0] + s, x[0], x[0]])
        ys = np.array([y[0], y[0], y[0] - s, y[0] + s])
        la, lo = dem.xy_to_latlon(xs, ys)
        hh = dem.sample_height(la, lo)
        if np.all(np.isfinite(hh)):
            dzdx = (hh[1] - hh[0]) / (2 * s)
            dzdy = (hh[3] - hh[2]) / (2 * s)
            slope = round(math.degrees(math.atan(math.hypot(dzdx, dzdy))), 2)
    return {
        "latitudeDeg": lat,
        "longitudeEastDeg": lon,
        "heightM": None if h is None else round(h, 2),
        "slopeDeg": slope,
        "slopeMethod": "central differences over 2 x pixel spacing (480 m baseline)",
        "covered": h is not None,
        "message": None if h is not None else "Outside terrain product coverage; no elevation is reported.",
        "product": dem.metadata(),
        "highResolution": _high_res_point(lat, lon) if h is not None else None,
    }


def _high_res_point(lat: float, lon: float) -> dict[str, Any] | None:
    """Finest LOLA tile reading already cached at this point (no network); None if only 240 m exists."""
    from .analysis import MULTIRES_ID as _MR
    from .screening import _terrain_at

    try:
        comp = get_dem(_MR)
    except Exception:  # noqa: BLE001
        return None
    lyr = comp.finest_at(lat, lon)
    if lyr is None or lyr is comp.base_dem:
        return None
    t = _terrain_at(comp, lat, lon)
    return {"productId": lyr.product_id, "resolutionM": lyr.scale_m, "heightM": None if t["heightM"] is None else round(t["heightM"], 2), "slopeDeg": t["slopeDeg"], "roughnessM": t["roughnessM"], "slopeMethod": f"central differences, {2 * lyr.scale_m:.0f} m baseline"}


class HorizonRequest(BaseModel):
    latitudeDeg: float = Field(ge=-90, le=90)
    longitudeEastDeg: float
    observerHeightM: float = Field(default=2.0, ge=0, le=100)
    azimuthStepDeg: float = Field(default=0.5, ge=0.1, le=10)
    maxRadiusM: float = Field(default=300_000, ge=1_000, le=450_000)
    terrainProductId: str = "lola-ldem-75s-240m-v2"


@app.post("/v1/horizon", dependencies=[Depends(require_token)])
def horizon(req: HorizonRequest) -> dict[str, Any]:
    dem = get_dem(req.terrainProductId)
    if not dem.covers(req.latitudeDeg):
        raise AnalysisInputError("site is outside terrain product coverage", "latitudeDeg")
    lon = normalize_lon_east(req.longitudeEastDeg)
    hp = HorizonParams(azimuth_step_deg=req.azimuthStepDeg, max_radius_m=req.maxRadiusM, observer_height_m=req.observerHeightM)
    prof, key, cached = get_horizon(dem, req.latitudeDeg, lon, hp)
    return {"horizon": prof.to_dict(), "cacheKey": key, "cached": cached, "product": dem.metadata(), "methodVersion": METHOD_VERSION}


@app.get("/v1/terrain/patch", dependencies=[Depends(require_token)])
def terrain_patch(
    lat: float = Query(..., ge=-90, le=-75),
    lon: float = Query(...),
    half_size_m: float = Query(20_000, ge=2_000, le=60_000),
    grid: int = Query(161, ge=17, le=401),
    product: str = "lola-ldem-75s-240m-v2",
) -> dict[str, Any]:
    """Height grid in a local ENU tangent frame centred on the site (for 3D display).

    Heights are radius - (R_ref + site height) measured along the local up axis,
    so lunar curvature is included in the display mesh. Missing samples are null.
    """
    dem = get_dem(product)
    lon = normalize_lon_east(lon)
    site_h = dem.height_at(lat, lon)
    if site_h is None:
        raise AnalysisInputError("site is outside terrain product coverage", "lat")
    b = enu_basis(lat, lon)
    R = dem.radius_ref_m
    ax = np.linspace(-half_size_m, half_size_m, grid)
    E, N = np.meshgrid(ax, ax[::-1])  # row 0 = north edge
    d = np.hypot(E, N)
    delta = d / R
    with np.errstate(invalid="ignore", divide="ignore"):
        ue = np.where(d > 0, E / d, 0.0)
        un = np.where(d > 0, N / d, 0.0)
    dirs = ue[..., None] * b.east + un[..., None] * b.north
    pts = np.cos(delta)[..., None] * b.up + np.sin(delta)[..., None] * dirs
    la, lo = lat_lon_from_vectors(pts)
    h = dem.sample_height(la, lo)
    radius = R + h
    up = radius * np.cos(delta) - (R + site_h)
    missing = int(np.sum(~np.isfinite(up)))
    q = np.where(np.isfinite(up), np.round(up * 2), -32768).astype(np.int32)  # 0.5 m quantisation
    q = np.clip(q, -32767, 32767).astype("<i2")
    return {
        "encoding": "int16-le base64, metres = value * 0.5, -32768 = no data, row 0 = north",
        "grid": grid,
        "halfSizeM": half_size_m,
        "spacingM": float(ax[1] - ax[0]),
        "siteHeightM": round(site_h, 2),
        "missingSamples": missing,
        "heights": base64.b64encode(q.tobytes()).decode(),
        "frame": "local ENU tangent plane at site (x=east, y=north, z=up), curvature included",
        "product": dem.metadata(),
        "verticalExaggeration": 1.0,
    }


@app.get("/v1/terrain/profile", dependencies=[Depends(require_token)])
def terrain_profile(
    lat: float = Query(..., ge=-90, le=-75),
    lon: float = Query(...),
    azimuth: float = Query(..., ge=0, lt=360),
    max_m: float = Query(50_000, ge=1_000, le=300_000),
    observer_height_m: float = Query(2.0, ge=0, le=100),
    product: str = "lola-ldem-75s-240m-v2",
) -> dict[str, Any]:
    """Terrain heights and elevation angles along one azimuth (great circle), curvature included."""
    dem = get_dem(product)
    lon = normalize_lon_east(lon)
    site_h = dem.height_at(lat, lon)
    if site_h is None:
        raise AnalysisInputError("site is outside terrain product coverage", "lat")
    b = enu_basis(lat, lon)
    R = dem.radius_ref_m
    d = np.arange(0.0, max_m + 1, dem.scale_m)
    delta = d / R
    az = math.radians(azimuth)
    direction = math.sin(az) * b.east + math.cos(az) * b.north
    pts = np.cos(delta)[:, None] * b.up + np.sin(delta)[:, None] * direction
    la, lo = lat_lon_from_vectors(pts)
    h = dem.sample_height(la, lo)
    obs_r = R + site_h + observer_height_m
    rr = R + h
    with np.errstate(invalid="ignore", divide="ignore"):
        el = np.degrees(np.arctan2(rr * np.cos(delta) - obs_r, rr * np.sin(delta)))
    el[0] = np.nan
    # apparent drop of the reference sphere below the observer's horizontal plane (for display)
    drop = R * (1 - np.cos(delta))

    def clean(a: np.ndarray, nd: int) -> list[float | None]:
        return [None if not np.isfinite(v) else round(float(v), nd) for v in a]

    return {
        "azimuthDeg": azimuth,
        "distanceM": clean(d, 0),
        "heightM": clean(h, 1),
        "elevationAngleDeg": clean(el, 4),
        "curvatureDropM": clean(drop, 1),
        "siteHeightM": round(site_h, 2),
        "observerHeightM": observer_height_m,
        "noDataSamples": int(np.sum(~np.isfinite(h))),
        "product": dem.metadata(),
    }


class AnalyzeRequest(BaseModel):
    scenario: dict[str, Any]


@app.post("/v1/analyze", dependencies=[Depends(require_token)])
def analyze(req: AnalyzeRequest) -> dict[str, Any]:
    sc = Scenario.from_dict(req.scenario)
    try:
        span = (parse_utc(sc.end_utc) - parse_utc(sc.start_utc)).total_seconds()
    except ValueError as exc:
        raise AnalysisInputError(str(exc), "timeRange") from exc
    if span / max(sc.step_s, 1) > SYNC_MAX_SAMPLES:
        raise AnalysisInputError("too large for synchronous analysis; submit a job", "timeRange")
    t0 = time.time()
    with SPICE_LOCK:
        result = run_analysis(sc)
    result["computeSeconds"] = round(time.time() - t0, 3)
    return result


class HorizonsCheckRequest(BaseModel):
    latitudeDeg: float = Field(ge=-90, le=90)
    longitudeEastDeg: float = Field(ge=-360, le=360)
    heightM: float = Field(default=0.0, ge=-10_000, le=12_000)
    startUtc: str
    stopUtc: str
    samples: int = Field(default=13, ge=2, le=200)


@app.post("/v1/validate/horizons", dependencies=[Depends(require_token)])
def validate_horizons(req: HorizonsCheckRequest, request: Request) -> Any:
    """Live cross-check of SPICE Sun/Earth az/el against JPL Horizons for one site."""
    kernels()
    try:
        with SPICE_LOCK:
            return cross_check(req.latitudeDeg, req.longitudeEastDeg, req.heightM, req.startUtc, req.stopUtc, req.samples)
    except HorizonsUnavailable as exc:
        return _err(503, "horizons_unavailable", str(exc), request.state.rid)
    except ValueError as exc:
        raise AnalysisInputError(str(exc), "startUtc") from exc


class EphemerisRequest(BaseModel):
    latitudeDeg: float = Field(ge=-90, le=90)
    longitudeEastDeg: float = Field(ge=-360, le=360)
    utc: str
    terrainProductId: str = "lola-ldem-75s-240m-v2"
    observerHeightM: float = Field(default=2.0, ge=0, le=100)


@app.post("/v1/ephemeris", dependencies=[Depends(require_token)])
def ephemeris_at(req: EphemerisRequest) -> dict[str, Any]:
    """Sun and Earth topocentric geometry at one UTC epoch, with the terrain horizon at each azimuth.

    Terrain checks need LOLA coverage; outside it the terrain fields are null and the state is
    "unknown" (geometric horizon only), never assumed clear.
    """
    from .geometry import validate_lat

    validate_lat(req.latitudeDeg)
    SPICE_LOCK.acquire()
    try:
        return _ephemeris_locked(req)
    finally:
        SPICE_LOCK.release()


def _ephemeris_locked(req: EphemerisRequest) -> dict[str, Any]:
    from .ephemeris import SpiceEphemeris
    from .geometry import MOON_REFERENCE_RADIUS_M, site_vector_m
    from .kernels import utc_to_et
    from .visibility import classify

    lon = normalize_lon_east(req.longitudeEastDeg)
    k = kernels()  # furnishes the leapseconds kernel needed for UTC -> TDB
    try:
        parse_utc(req.utc)
        et = utc_to_et(req.utc)
    except Exception as exc:  # noqa: BLE001 - never echo SPICE internals to clients
        raise AnalysisInputError("invalid UTC time; use ISO-8601 with a Z suffix, e.g. 2026-12-01T06:30:00Z", "utc") from exc
    if not (k.et_start <= et <= k.et_stop):
        raise AnalysisInputError(f"time outside ephemeris kernel coverage ({k.utc_start[:10]} to {k.utc_stop[:10]})", "utc")
    height = 0.0
    profile = None
    terrain_note = None
    try:
        dem = get_dem(req.terrainProductId)
        h = float(dem.sample_height(np.array([req.latitudeDeg]), np.array([lon]))[0])
        if math.isfinite(h):
            height = h
            profile, _key, _hit = get_horizon(dem, req.latitudeDeg, lon, HorizonParams(observer_height_m=req.observerHeightM))
        else:
            terrain_note = "site outside LOLA DEM coverage: geometric horizon only"
    except AnalysisInputError:
        raise
    except Exception as exc:  # noqa: BLE001
        terrain_note = f"terrain unavailable: {type(exc).__name__}"
    site = site_vector_m(req.latitudeDeg, lon, MOON_REFERENCE_RADIUS_M + height + req.observerHeightM) / 1000.0
    eph = SpiceEphemeris(site, enu_basis(req.latitudeDeg, lon), "LT+S")
    out: dict[str, Any] = {"utc": req.utc, "site": {"latitudeDeg": req.latitudeDeg, "longitudeEastDeg": lon, "heightM": height if profile else None}, "bodies": {}}
    for target in ("SUN", "EARTH"):
        g = eph.geometry(target, et)  # type: ignore[arg-type]
        body: dict[str, Any] = {
            "azimuthDeg": g.azimuth_deg, "elevationDeg": g.elevation_deg, "distanceKm": g.distance_km, "angularRadiusDeg": g.angular_radius_deg,
            "aboveGeometricHorizon": g.elevation_deg > 0,
        }
        if profile is not None:
            hz, bound = profile.at(g.azimuth_deg)
            s = classify(g.elevation_deg, g.angular_radius_deg, hz, bound, "any_disk")
            body.update({"terrainHorizonDeg": hz, "state": s.state, "visible": s.lit, "visibleFraction": s.visible_fraction, "clearanceDeg": s.clearance_deg})
        else:
            body.update({"terrainHorizonDeg": None, "state": "unknown" if g.elevation_deg > 0 else "below_horizon", "visible": None if g.elevation_deg > 0 else False})
        out["bodies"][target.lower()] = body
    out["provenance"] = {
        "ephemerisSource": "NAIF SPICE spkcpo (LT+S) in MOON_ME", "kernelManifestId": k.manifest_id, "terrainProductId": req.terrainProductId if profile else None,
        "methodVersion": METHOD_VERSION, "timeScale": "UTC input, converted to TDB (ET) with naif0012.tls", "note": terrain_note,
    }
    return out


# ----------------------------------------------------------------------------------------
# Terrain hazard screening, dynamic suitability and sensitivity (screening.py)
# ----------------------------------------------------------------------------------------
from .analysis import MULTIRES_ID  # noqa: E402
from .screening import HazardThresholds, SuitabilityConfig, date_series, hazard_screen, sensitivity, suitability_grid  # noqa: E402


def _terrain(lat: float, lon: float, fetch: bool = True) -> tuple[Any, Any]:
    validate_lat_ = __import__("moonnav_science.geometry", fromlist=["validate_lat"]).validate_lat
    validate_lat_(lat)
    dem = get_dem(MULTIRES_ID)
    if not dem.covers(lat):
        raise AnalysisInputError(f"site is outside LOLA polar coverage ({dem.metadata()['coverage']})", "latitudeDeg")
    if fetch:
        dem.prepare(lat, lon)
    return dem, dem.base_dem


class HazardRequest(BaseModel):
    latitudeDeg: float = Field(ge=-90, le=-75)
    longitudeEastDeg: float = Field(ge=-360, le=360)
    halfSizeM: float = Field(default=1000.0, ge=50, le=10_000)
    slopeCautionDeg: float = Field(default=8.0, ge=0, le=60)
    slopeMaxDeg: float = Field(default=15.0, ge=0, le=60)
    roughnessCautionM: float = Field(default=0.5, ge=0, le=50)
    roughnessMaxM: float = Field(default=1.5, ge=0, le=50)
    landingRadiusM: float = Field(default=100.0, ge=5, le=5000)


@app.post("/v1/terrain/hazards", dependencies=[Depends(require_token)])
def terrain_hazards(req: HazardRequest) -> dict[str, Any]:
    lon = normalize_lon_east(req.longitudeEastDeg)
    dem, _ = _terrain(req.latitudeDeg, lon)
    th = HazardThresholds(req.slopeCautionDeg, req.slopeMaxDeg, req.roughnessCautionM, req.roughnessMaxM, req.landingRadiusM)
    out = hazard_screen(dem, req.latitudeDeg, lon, req.halfSizeM, th)
    out["productMetadata"] = {lyr.product_id: {"pixelSpacingM": lyr.scale_m} for lyr in dem.layers}
    return out


class SuitabilityRequest(BaseModel):
    latitudeDeg: float = Field(ge=-90, le=-75)
    longitudeEastDeg: float = Field(ge=-360, le=360)
    startUtc: str
    endUtc: str
    stepSeconds: int = Field(default=3600, ge=600, le=86_400)
    gridSize: int = Field(default=7, ge=1, le=21)
    halfSizeM: float = Field(default=3000.0, ge=0, le=60_000)
    config: dict[str, Any] | None = None


@app.post("/v1/suitability/grid", dependencies=[Depends(require_token)])
def suitability(req: SuitabilityRequest) -> dict[str, Any]:
    lon = normalize_lon_east(req.longitudeEastDeg)
    dem, base = _terrain(req.latitudeDeg, lon)
    with SPICE_LOCK:
        kernels()
        try:
            return suitability_grid(dem, base, req.latitudeDeg, lon, req.halfSizeM, req.gridSize, req.startUtc, req.endUtc, req.stepSeconds, SuitabilityConfig.from_dict(req.config))
        except ValueError as exc:
            raise AnalysisInputError(str(exc), "window") from exc


class MatrixSite(BaseModel):
    key: str = Field(max_length=80)
    latitudeDeg: float = Field(ge=-90, le=-75)
    longitudeEastDeg: float = Field(ge=-360, le=360)


class MatrixRequest(BaseModel):
    sites: list[MatrixSite] = Field(min_length=1, max_length=8)
    startsUtc: list[str] = Field(min_length=1, max_length=8)
    hours: float = Field(default=168.0, gt=0, le=24 * 31)
    stepSeconds: int = Field(default=3600, ge=600, le=86_400)
    config: dict[str, Any] | None = None


@app.post("/v1/suitability/matrix", dependencies=[Depends(require_token)])
def suitability_matrix(req: MatrixRequest) -> dict[str, Any]:
    cfg = SuitabilityConfig.from_dict(req.config)
    rows = []
    for s in req.sites:
        lon = normalize_lon_east(s.longitudeEastDeg)
        dem, base = _terrain(s.latitudeDeg, lon)
        with SPICE_LOCK:
            kernels()
            try:
                res = date_series(dem, base, s.latitudeDeg, lon, req.startsUtc, req.hours, req.stepSeconds, cfg)
            except ValueError as exc:
                raise AnalysisInputError(str(exc), "sites") from exc
        rows.append({"key": s.key, "latitudeDeg": s.latitudeDeg, "longitudeEastDeg": lon, "cells": res})
    return {"rows": rows, "startsUtc": req.startsUtc, "hours": req.hours, "stepSeconds": req.stepSeconds, "config": req.config or {},
            "method": "per site: finest-LOLA terrain stencil, 240 m horizon (1 deg / 300 km), SPICE LT+S Sun/Earth, any-disk visibility; hard constraints then weighted score"}


class SensitivityRequest(BaseModel):
    latitudeDeg: float = Field(ge=-90, le=-75)
    longitudeEastDeg: float = Field(ge=-360, le=360)
    startUtc: str
    hours: float = Field(default=168.0, gt=0, le=24 * 31)
    stepSeconds: int = Field(default=3600, ge=600, le=86_400)
    spacingM: float = Field(default=500.0, ge=50, le=20_000)
    gridSize: int = Field(default=5, ge=3, le=9)
    dayShifts: list[float] | None = Field(default=None, max_length=15)
    config: dict[str, Any] | None = None


@app.post("/v1/sensitivity", dependencies=[Depends(require_token)])
def sensitivity_ep(req: SensitivityRequest) -> dict[str, Any]:
    if req.gridSize % 2 == 0:
        raise AnalysisInputError("gridSize must be odd so the original point is the centre", "gridSize")
    lon = normalize_lon_east(req.longitudeEastDeg)
    dem, base = _terrain(req.latitudeDeg, lon)
    with SPICE_LOCK:
        kernels()
        try:
            return sensitivity(dem, base, req.latitudeDeg, lon, req.startUtc, req.hours, req.stepSeconds, SuitabilityConfig.from_dict(req.config), req.spacingM, req.gridSize, req.dayShifts)
        except ValueError as exc:
            raise AnalysisInputError(str(exc), "window") from exc
