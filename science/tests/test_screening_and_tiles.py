"""Hazard screening, suitability evaluation, multi-resolution DEMs and PDS tile reads."""

from __future__ import annotations

import math
import os
from pathlib import Path

import httpx
import numpy as np
import pytest

from moonnav_science.dem import PolarDem
from moonnav_science.horizon import HorizonParams, compute_horizon, compute_horizon_multires
from moonnav_science.screening import HazardThresholds, SuitabilityConfig, evaluate, hazard_screen, slope_roughness
from moonnav_science.tiles import MultiResDem, _parse_multipart, fetch_ranges

DATA = Path(__file__).resolve().parents[2] / "data"
HAS_KERNELS = (DATA / "raw" / "spice" / "de440s.bsp").exists()


class SynthDem:
    """South-polar stereographic DEM with an analytic height field h(x, y) (metres)."""

    pole = -1
    radius_ref_m = 1_737_400.0
    latlon_to_xy = PolarDem.latlon_to_xy
    xy_to_latlon = PolarDem.xy_to_latlon

    def __init__(
        self, fn, scale_m: float = 20.0, product_id: str = "synth", nan_box: tuple[float, float, float, float] | None = None
    ) -> None:  # type: ignore[no-untyped-def]
        self.fn, self.scale_m, self.product_id, self.nan_box = fn, scale_m, product_id, nan_box

    def covers(self, lat: float) -> bool:
        return lat <= -80

    def sample_height(self, lat, lon):  # type: ignore[no-untyped-def]
        x, y = self.latlon_to_xy(np.asarray(lat, float), np.asarray(lon, float))
        h = self.fn(x, y).astype(float)
        if self.nan_box:
            x0, x1, y0, y1 = self.nan_box
            h[(x >= x0) & (x <= x1) & (y >= y0) & (y <= y1)] = np.nan
        return np.where(np.asarray(lat) <= -80, h, np.nan)


def test_plane_slope_is_exact_and_roughness_zero():
    g = 0.1  # 10 % grade along map x -> 5.7106 deg
    h = np.fromfunction(lambda i, j: g * j * 20.0, (21, 21))
    slope, rough, relief, lap = slope_roughness(h, 20.0)
    inner = (slice(2, -2), slice(2, -2))
    assert np.allclose(slope[inner], math.degrees(math.atan(g)), atol=1e-9)
    assert np.allclose(rough[inner], 0.0, atol=1e-9)
    assert np.allclose(lap[inner], 0.0, atol=1e-9)
    assert np.isnan(slope[0, 0])  # borders are unknown, never zero


def test_hazard_screen_flags_steep_terrain_and_unknown_data():
    lat, lon = -88.0, 30.0
    flat = SynthDem(lambda x, y: 0 * x)
    r = hazard_screen(flat, lat, lon, 400.0, HazardThresholds(landing_radius_m=100))
    assert r["verdict"] == "within_thresholds" and r["summary"]["maxSlopeDeg"] == 0.0
    steep = SynthDem(lambda x, y: 0.4 * x)  # 21.8 deg everywhere
    r = hazard_screen(steep, lat, lon, 400.0)
    assert (
        r["verdict"] == "exceeds" and abs(r["summary"]["maxSlopeDeg"] - math.degrees(math.atan(0.4))) < 1e-3
    )  # summary is rounded to 0.001 deg
    x0, y0 = flat.latlon_to_xy(np.array([lat]), np.array([lon]))
    holey = SynthDem(lambda x, y: 0 * x, nan_box=(x0[0] - 30, x0[0] + 30, y0[0] - 30, y0[0] + 30))
    r = hazard_screen(holey, lat, lon, 400.0)
    assert r["verdict"] == "unknown" and r["summary"]["unknownPctInZone"] > 0
    assert any("never treated as safe" in x for x in r["reasons"])


def test_suitability_missing_data_is_never_a_pass():
    c = SuitabilityConfig()
    ok = {
        "sunPct": 80,
        "dtePct": 90,
        "unknownPct": 0,
        "slopeDeg": 3,
        "roughnessM": 0.2,
        "meanSolarElevationLitDeg": 2.0,
        "longestDarkHours": 10,
    }
    e = evaluate(ok, c)
    assert e["status"] == "pass" and e["score"] is not None
    assert abs(sum(e["breakdown"].values()) - e["score"]) < 0.02
    missing = {**ok, "slopeDeg": None}
    e2 = evaluate(missing, c)
    assert e2["status"] == "unknown" and e2["score"] is None and "slope" in e2["missingForScore"]
    steep = {**ok, "slopeDeg": 25}
    assert evaluate(steep, c)["status"] == "fail"
    dark = {**ok, "sunPct": 0}
    assert evaluate(dark, c)["status"] == "fail"  # sunlight minimum enforced; no sunlight never passes


def test_multires_prefers_finest_valid_sample():
    coarse = SynthDem(lambda x, y: 0 * x + 100.0, scale_m=240.0, product_id="coarse")
    lat, lon = -88.0, 30.0
    x0, y0 = coarse.latlon_to_xy(np.array([lat]), np.array([lon]))
    fine = SynthDem(lambda x, y: 0 * x + 105.0, scale_m=5.0, product_id="fine", nan_box=(x0[0] + 1000, 1e9, -1e9, 1e9))
    m = MultiResDem([fine, coarse])
    la, lo = coarse.xy_to_latlon(np.array([x0[0], x0[0] + 2000]), np.array([y0[0], y0[0]]))
    h, src = m.sample_with_source(la, lo)
    assert h.tolist() == [105.0, 100.0] and src.tolist() == [0, 1]


def test_multires_horizon_sees_a_near_ridge_the_coarse_grid_misses():
    lat, lon = -88.0, 30.0
    base = SynthDem(lambda x, y: 0 * x, scale_m=240.0)
    x0, y0 = base.latlon_to_xy(np.array([lat]), np.array([lon]))
    # 60 m-tall, 40 m-wide wall 1 km east (map +x) of the site: only the fine DEM resolves it.
    fine = SynthDem(lambda x, y: np.where(np.abs(x - (x0[0] + 1000)) < 20, 60.0, 0.0), scale_m=5.0)
    p = HorizonParams(azimuth_step_deg=5.0, max_radius_m=20_000.0, observer_height_m=2.0)
    coarse_h = compute_horizon(base, lat, lon, p)
    multi = compute_horizon_multires(MultiResDem([fine, base]), base, 5.0, lat, lon, p, near_radius_m=3000.0)
    # Map +x is the local east direction only approximately near the pole; check the max over azimuths.
    assert np.nanmax(multi.elevation_deg) > math.degrees(math.atan2(55, 1000)) and np.nanmax(coarse_h.elevation_deg) < 0.5


def test_multipart_byteranges_parser_and_range_assembly():
    boundary = "abc123"
    body = (
        f"--{boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes 0-3/100\r\n\r\n".encode()
        + b"\x01\x02\x03\x04"
        + f"\r\n--{boundary}\r\nContent-Range: bytes 10-11/100\r\n\r\n".encode()
        + b"\x0a\x0b"
        + f"\r\n--{boundary}--\r\n".encode()
    )
    parts = _parse_multipart(body, f"multipart/byteranges; boundary={boundary}")
    assert parts == [(0, 3, b"\x01\x02\x03\x04"), (10, 11, b"\x0a\x0b")]

    def handler(req: httpx.Request) -> httpx.Response:
        assert req.headers["range"] == "bytes=0-3,10-11"
        return httpx.Response(206, content=body, headers={"content-type": f"multipart/byteranges; boundary={boundary}"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as c:
        got = fetch_ranges(c, "https://example.invalid/x.img", [(0, 3), (10, 11)])
    assert got == {0: b"\x01\x02\x03\x04", 10: b"\x0a\x0b"}


@pytest.mark.skipif(
    not (DATA / "tiles" / "lola-ldem-875s-5m-v2").exists() or not (DATA / "raw/lola/ldem_75s_240m.img").exists(),
    reason="high-resolution tiles not ingested",
)
def test_cached_5m_tiles_agree_with_240m_product_at_shackleton():
    from moonnav_science.analysis import get_dem
    from moonnav_science.tiles import TiledPolarDem

    t = TiledPolarDem.open("lola-ldem-875s-5m-v2", DATA / "tiles")
    g = get_dem("lola-ldem-75s-240m-v2")
    la, lo = np.array([-89.67, -89.66, -89.68]), np.array([129.78, 129.9, 129.6])
    fine, coarse = t.sample_height(la, lo), g.sample_height(la, lo)
    ok = np.isfinite(fine)
    assert ok.any()
    # Floor of Shackleton is smooth at km scale: products agree within 20 m.
    assert np.all(np.abs(fine[ok] - coarse[ok]) < 20)


@pytest.mark.skipif(not HAS_KERNELS, reason="SPICE kernels not downloaded")
def test_suitability_grid_endpoints_require_coverage_and_token():
    os.environ.setdefault("SCIENCE_SERVICE_TOKEN", "x" * 32)
    from fastapi.testclient import TestClient

    from moonnav_science import api

    api.TOKEN = os.environ["SCIENCE_SERVICE_TOKEN"]
    c = TestClient(api.app)
    h = {"Authorization": f"Bearer {api.TOKEN}"}
    assert (
        c.post(
            "/v1/suitability/grid",
            json={"latitudeDeg": -60, "longitudeEastDeg": 0, "startUtc": "2026-12-01T00:00:00Z", "endUtc": "2026-12-02T00:00:00Z"},
            headers=h,
        ).status_code
        == 422
    )
    assert (
        c.post(
            "/v1/sensitivity",
            json={"latitudeDeg": -85.98, "longitudeEastDeg": 358.33, "startUtc": "2026-12-01T00:00:00Z", "gridSize": 4},
            headers=h,
        ).status_code
        == 422
    )
    assert c.post("/v1/terrain/hazards", json={"latitudeDeg": -85.98, "longitudeEastDeg": 358.33}).status_code == 401


def test_pds_range_requests_retry_then_give_up_without_substitution(monkeypatch):
    from moonnav_science import tiles

    monkeypatch.setattr(tiles.time, "sleep", lambda s: None)
    calls = {"n": 0}

    def flaky(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503)

    with httpx.Client(transport=httpx.MockTransport(flaky)) as c, pytest.raises(tiles.TileFetchError, match="unreachable"):
        fetch_ranges(c, "https://example.invalid/x.img", [(0, 1)])
    assert calls["n"] == 3

    with (
        httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(404))) as c,
        pytest.raises(tiles.TileFetchError, match="HTTP 404"),
    ):
        fetch_ranges(c, "https://example.invalid/x.img", [(0, 1)])


def test_missing_high_res_tiles_fall_back_to_coarser_terrain():
    from moonnav_science.tiles import TileFetchError

    class Broken(SynthDem):
        def ensure_region(self, *a, **k):  # type: ignore[no-untyped-def]
            raise TileFetchError("PDS unreachable after 3 attempts (HTTP 503)")

    lat, lon = -88.0, 30.0
    base = SynthDem(lambda x, y: 0 * x + 42.0, scale_m=240.0, product_id="base")
    fine = Broken(lambda x, y: 0 * x + np.nan, scale_m=5.0, product_id="fine")
    m = MultiResDem([fine, base])
    h, src = m.sample_with_source(np.array([lat]), np.array([lon]))
    assert h[0] == 42.0 and src[0] == 1  # served by the coarser product, never invented
