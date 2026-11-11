"""High-resolution tile download: coverage, caching, concurrent dedup, failures and fast-mode fallback.

Uses a small synthetic PDS image served by an in-process HTTP mock (no network).
"""

from __future__ import annotations

import re
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import numpy as np
import pytest

from moonnav_science import tiles
from moonnav_science.analysis import MultiResTerrain
from moonnav_science.tiles import TILE, TiledPolarDem, TileFetchError

N = 2 * TILE  # 2 x 2 tiles
IMG = ((np.arange(N)[:, None] * 7 + np.arange(N)[None, :]) % 30000).astype("<i2")
RAW = IMG.tobytes()


class Server:
    """Serves byte ranges of RAW (multipart/byteranges, like the PDS node); counts requests."""

    def __init__(self, fail: bool = False, fail_rows_from: int | None = None) -> None:
        self.calls = 0
        self.fail = fail
        self.fail_rows_from = fail_rows_from
        self.lock = threading.Lock()

    def __call__(self, req: httpx.Request) -> httpx.Response:
        with self.lock:
            self.calls += 1
        if self.fail:
            return httpx.Response(404)
        ranges = [(int(a), int(b)) for a, b in re.findall(r"(\d+)-(\d+)", req.headers["range"])]
        if self.fail_rows_from is not None and ranges[0][0] // (N * 2) >= self.fail_rows_from:
            return httpx.Response(404)
        body = b""
        for a, b in ranges:
            body += f"--B\r\nContent-Range: bytes {a}-{b}/{len(RAW)}\r\n\r\n".encode() + RAW[a : b + 1] + b"\r\n"
        body += b"--B--\r\n"
        return httpx.Response(206, content=body, headers={"content-type": "multipart/byteranges; boundary=B"})


def make_dem(tmp: Path) -> TiledPolarDem:
    return TiledPolarDem(
        product_id="synth-20m",
        url="https://example.invalid/synth.img",
        label={},
        label_sha256="x",
        cache_dir=tmp,
        lines=N,
        samples=N,
        scale_m=20.0,
        line_offset=(N - 1) / 2,
        sample_offset=(N - 1) / 2,
        radius_ref_m=1_737_400.0,
        scaling_factor=0.5,
        max_abs_lat_edge=89.4,
        frame_name="MOON_ME",
    )


def test_coverage_then_fetch_then_cached(tmp_path: Path) -> None:
    dem, srv = make_dem(tmp_path), Server()
    before = dem.coverage(-90.0, 0.0, 3000.0)
    assert before["covered"] and before["tiles"] == 4 and before["missing"] == 4 and before["downloadMB"] > 0
    with httpx.Client(transport=httpx.MockTransport(srv)) as c:
        r = dem.ensure_region(-90.0, 0.0, 3000.0, client=c)
        assert r["fetched"] == 4 and r["missing"] == 0 and not r["errors"]
        first = srv.calls
        again = dem.ensure_region(-90.0, 0.0, 3000.0, client=c)
    assert again["fetched"] == 0 and srv.calls == first  # cached: no new requests
    after = dem.coverage(-90.0, 0.0, 3000.0)
    assert after["missing"] == 0 and after["cached"] == 4
    # Tiles hold the exact source bytes, with provenance written next to them.
    assert np.array_equal(np.load(tmp_path / f"t{TILE}_0001_0000.npy"), IMG[TILE:, :TILE])
    assert (tmp_path / f"t{TILE}_0001_0000.json").exists()
    # Heights are DN * scaling factor at the right pixel.
    h = dem.sample_height(np.array([-90.0]), np.array([0.0]))[0]
    assert np.isfinite(h)


def test_outside_coverage_needs_nothing(tmp_path: Path) -> None:
    dem = make_dem(tmp_path)
    assert dem.coverage(-85.0, 0.0, 3000.0)["covered"] is False
    assert dem.ensure_region(-85.0, 0.0, 3000.0)["covered"] is False


def test_concurrent_requests_download_each_tile_once(tmp_path: Path) -> None:
    dem, srv = make_dem(tmp_path), Server()
    per_tile = -(-TILE // tiles.ROWS_PER_REQUEST)
    with httpx.Client(transport=httpx.MockTransport(srv)) as c, ThreadPoolExecutor(6) as pool:
        out = list(pool.map(lambda _: dem.fetch_tile(0, 0, c), range(6)))
    assert srv.calls == per_tile
    assert sum(1 for o in out if o.get("deduplicated")) == 5


def test_total_failure_raises_and_partial_failure_reports(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tiles.time, "sleep", lambda s: None)
    dem = make_dem(tmp_path / "a")
    (tmp_path / "a").mkdir()
    with httpx.Client(transport=httpx.MockTransport(Server(fail=True))) as c, pytest.raises(TileFetchError):
        dem.ensure_region(-90.0, 0.0, 3000.0, client=c)
    assert dem.coverage(-90.0, 0.0, 3000.0)["cached"] == 0  # nothing half-written

    dem2 = make_dem(tmp_path / "b")
    (tmp_path / "b").mkdir()
    with httpx.Client(transport=httpx.MockTransport(Server(fail_rows_from=TILE))) as c:
        r = dem2.ensure_region(-90.0, 0.0, 3000.0, client=c)
    assert r["fetched"] == 2 and r["missing"] == 2 and r["errors"]  # top tiles ok, bottom ones reported


def _terrain(dem: TiledPolarDem) -> MultiResTerrain:
    t = MultiResTerrain.__new__(MultiResTerrain)
    t.tiled = [dem]
    t.radius_ref_m = 1_737_400.0
    return t


def test_prepare_fast_mode_and_fallback_status(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    dem = make_dem(tmp_path)
    terr = _terrain(dem)
    fast = terr.prepare(-90.0, 0.0, 3000.0, fetch=False)
    assert fast[0]["status"] == "fallback" and "fast mode" in fast[0]["reason"]

    def broken(*a, **k):  # type: ignore[no-untyped-def]
        raise TileFetchError("PDS unreachable after 3 attempts (HTTP 503)")

    monkeypatch.setattr(dem, "ensure_region", broken)
    res = terr.prepare(-90.0, 0.0, 3000.0, fetch=True)
    assert res[0]["status"] == "fallback" and "coarser LOLA product used" in res[0]["reason"]


DATA = Path(__file__).resolve().parents[2] / "data"


@pytest.mark.skipif(not (DATA / "raw/lola/ldem_75s_240m.img").exists(), reason="LOLA 240 m DEM not downloaded")
def test_coverage_and_illumination_endpoints() -> None:
    import os

    os.environ.setdefault("SCIENCE_SERVICE_TOKEN", "x" * 32)
    from fastapi.testclient import TestClient

    from moonnav_science import api

    api.TOKEN = os.environ["SCIENCE_SERVICE_TOKEN"]
    c = TestClient(api.app)
    h = {"Authorization": f"Bearer {api.TOKEN}"}
    assert c.get("/v1/terrain/coverage?lat=-89.45&lon=222.69").status_code == 401
    r = c.get("/v1/terrain/coverage?lat=-89.45&lon=222.69&radius_m=1500", headers=h).json()
    assert r["covered"] and r["baseResolutionM"] == 240 and [x["resolutionM"] for x in r["layers"]] == [5, 20, 40]
    assert all(x["cached"] + x["missing"] == x["tiles"] for x in r["layers"] if x["covered"])
    out = c.get("/v1/terrain/coverage?lat=10&lon=0", headers=h).json()
    assert out["covered"] is False and out["finestAvailableResolutionM"] is None
    i = c.get("/v1/illumination/point?lat=0&lon=0", headers=h).json()
    assert i["permanentShadow"] is None  # outside coverage or not downloaded: never "safe"/0
