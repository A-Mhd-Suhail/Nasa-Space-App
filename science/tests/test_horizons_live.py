"""Live JPL Horizons adapter (mocked transport) and the single-epoch ephemeris endpoint."""

from __future__ import annotations

import os
from pathlib import Path

import httpx
import pytest

from moonnav_science import horizons_live as hl

FIX = Path(__file__).parent / "fixtures"
DATA_OK = (Path(__file__).resolve().parents[2] / "data" / "raw" / "spice" / "de440s.bsp").exists()


def _transport(statuses: list[int], body: dict) -> tuple[httpx.MockTransport, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        code = statuses.pop(0) if statuses else 200
        return httpx.Response(code, json=body if code == 200 else {"message": "busy"})

    return httpx.MockTransport(handler), seen


def _fixture_body() -> dict:
    return {"signature": {"version": "1.2", "source": "NASA/JPL Horizons API"}, "result": (FIX / "horizons_south_pole_sun.txt").read_text()}


def test_fetch_parses_rows_sets_user_agent_and_caches(monkeypatch):
    monkeypatch.setattr(hl.time, "sleep", lambda s: None)
    hl._CACHE.clear()
    t, seen = _transport([], _fixture_body())
    with httpx.Client(transport=t, headers={"User-Agent": hl.USER_AGENT}) as c:
        rows, meta = hl.fetch_azel("SUN", -90.0, 0.0, 0.0, "2026-11-15T00:00:00Z", "2026-11-16T00:00:00Z", "2h", c)
        assert len(rows) == 15 and meta["apiVersion"] == "1.2" and meta["cache"] == "miss"
        assert seen[0].headers["user-agent"].startswith("MoonNav/")
        q = dict(seen[0].url.params)
        assert q["CENTER"] == "'coord@301'" and q["COORD_TYPE"] == "'GEODETIC'" and q["QUANTITIES"] == "'4'"
        _, meta2 = hl.fetch_azel("SUN", -90.0, 0.0, 0.0, "2026-11-15T00:00:00Z", "2026-11-16T00:00:00Z", "2h", c)
        assert meta2["cache"] == "hit" and len(seen) == 1


def test_fetch_retries_with_backoff_then_succeeds(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr(hl.time, "sleep", lambda s: sleeps.append(s))
    hl._CACHE.clear()
    t, seen = _transport([503, 429], _fixture_body())
    with httpx.Client(transport=t) as c:
        rows, _ = hl.fetch_azel("SUN", -89.0, 10.0, 0.0, "2026-11-15T00:00:00Z", "2026-11-16T00:00:00Z", "2h", c)
    assert len(rows) == 15 and len(seen) == 3 and sleeps == [1.5, 3.0]


def test_fetch_gives_up_and_never_substitutes_data(monkeypatch):
    monkeypatch.setattr(hl.time, "sleep", lambda s: None)
    hl._CACHE.clear()
    t, _ = _transport([503, 503, 503], _fixture_body())
    with httpx.Client(transport=t) as c, pytest.raises(hl.HorizonsUnavailable):
        hl.fetch_azel("SUN", -89.0, 11.0, 0.0, "2026-11-15T00:00:00Z", "2026-11-16T00:00:00Z", "2h", c)


def test_non_retryable_error_is_reported():
    hl._CACHE.clear()
    t, seen = _transport([400], _fixture_body())
    with httpx.Client(transport=t) as c, pytest.raises(hl.HorizonsUnavailable, match="HTTP 400"):
        hl.fetch_azel("SUN", -89.0, 12.0, 0.0, "2026-11-15T00:00:00Z", "2026-11-16T00:00:00Z", "2h", c)
    assert len(seen) == 1


def test_step_planning_is_bounded():
    assert hl.plan_step("2026-11-15T00:00:00Z", "2026-11-16T00:00:00Z", 13) == "120m"
    assert hl.plan_step("2026-11-15T00:00:00Z", "2026-11-15T00:10:00Z", 1000) == "1m"
    with pytest.raises(ValueError):
        hl.plan_step("2026-11-16T00:00:00Z", "2026-11-15T00:00:00Z", 5)
    assert hl.horizons_time_to_iso("2026-Nov-15 02:00") == "2026-11-15T02:00:00Z"


@pytest.mark.skipif(not DATA_OK, reason="SPICE kernels / LOLA DEM not downloaded (npm run data:fetch)")
def test_ephemeris_endpoint_returns_terrain_aware_geometry():
    os.environ.setdefault("SCIENCE_SERVICE_TOKEN", "x" * 32)
    from fastapi.testclient import TestClient

    from moonnav_science import api

    api.TOKEN = os.environ["SCIENCE_SERVICE_TOKEN"]
    c = TestClient(api.app)
    h = {"Authorization": f"Bearer {api.TOKEN}"}
    r = c.post("/v1/ephemeris", json={"latitudeDeg": -89.45, "longitudeEastDeg": 222.69, "utc": "2026-12-01T00:00:00Z"}, headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    for b in ("sun", "earth"):
        g = d["bodies"][b]
        assert 0 <= g["azimuthDeg"] < 360 and -90 <= g["elevationDeg"] <= 90
        assert g["terrainHorizonDeg"] is not None and g["state"] in {"visible", "partial", "terrain_blocked", "below_horizon", "unknown"}
    # Near the pole the Sun stays within ~1.6 deg of the horizon.
    assert abs(d["bodies"]["sun"]["elevationDeg"]) < 2.5
    # Outside LOLA 75S coverage: geometry only, terrain state unknown (never "visible").
    r2 = c.post("/v1/ephemeris", json={"latitudeDeg": 0.0, "longitudeEastDeg": 0.0, "utc": "2026-12-01T00:00:00Z"}, headers=h).json()
    assert r2["bodies"]["earth"]["terrainHorizonDeg"] is None and r2["bodies"]["earth"]["state"] in {"unknown", "below_horizon"}
    assert (
        c.post("/v1/ephemeris", json={"latitudeDeg": -95, "longitudeEastDeg": 0, "utc": "2026-12-01T00:00:00Z"}, headers=h).status_code
        == 422
    )
    assert c.post("/v1/ephemeris", json={"latitudeDeg": -89, "longitudeEastDeg": 0, "utc": "2026-12-01T00:00:00Z"}).status_code == 401
