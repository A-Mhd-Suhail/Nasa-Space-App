"""Analysis-level solar checks: irradiance, surface incidence, terrain-aligned panels, darkness accounting."""

from __future__ import annotations

from pathlib import Path

import pytest

DATA = Path(__file__).resolve().parents[2] / "data"
pytestmark = pytest.mark.skipif(not (DATA / "raw/spice/de440s.bsp").exists(), reason="SPICE kernels not downloaded")


def run(lat: float, lon: float, days: int = 3, step: int = 1800, panel: dict | None = None) -> dict:  # type: ignore[type-arg]
    from moonnav_science.analysis import Scenario, kernels, run_analysis

    kernels()
    d = {
        "site": {"latitudeDeg": lat, "longitudeEastDeg": lon},
        "timeRange": {"startUtc": "2026-12-10T00:00:00Z", "endUtc": f"2026-12-{10 + days}T00:00:00Z", "sampleStepSeconds": step},
        "assumptions": {"solarPanel": panel} if panel else {},
    }
    return run_analysis(Scenario.from_dict(d))


def test_irradiance_is_inverse_square_solar_constant_scaled_by_distance() -> None:
    r = run(-85.98, 358.33, days=1)
    for row in r["timeseries"][:5]:
        d_au = row["sunDistanceKm"] / 149_597_870.7
        assert row["sunIrradianceWm2"] == pytest.approx(1361.0 / d_au**2, rel=2e-4)
        assert 1300 < row["sunIrradianceWm2"] < 1420  # physical range over the year (Earth-Moon at perihelion/aphelion)


def test_terrain_irradiance_never_exceeds_available_and_is_zero_when_the_sun_is_blocked() -> None:
    r = run(-85.98, 358.33)
    n_lit = n_dark = 0
    for row in r["timeseries"]:
        ti = row["terrainIrradianceWm2"]
        assert ti is not None and 0.0 <= ti <= row["sunIrradianceWm2"] + 1e-6
        if row["sunState"] in ("terrain_blocked", "below_horizon"):
            n_dark += 1
            assert ti == 0.0
        if row["sunState"] in ("visible", "partial"):
            n_lit += 1
            if row["surfaceIncidenceDeg"] < 89.0 and row["sunVisibleFraction"] > 0.05:
                assert ti > 0.0  # facing the Sun with a visible disk gives non-zero irradiance
            if row["surfaceIncidenceDeg"] >= 90.0:
                assert ti == 0.0  # Sun behind the local slope: self-shadowed even if the disk is visible
    assert n_lit > 0 and n_dark > 0  # the window contains both lit and dark samples
    assert r["surface"]["meanTerrainIrradianceWm2"] <= r["surface"]["peakTerrainIrradianceWm2"] <= 1420
    assert r["surface"]["terrain"]["status"] == "ok"


def test_incidence_angle_consistent_with_slope_and_sun_elevation_on_flat_ground() -> None:
    r = run(-85.98, 358.33, days=1)
    slope = r["surface"]["terrain"]["slopeDeg"]
    for row in r["timeseries"]:
        if row["sunElDeg"] > 5:
            # incidence >= |zenith angle - slope| and <= zenith angle + slope (spherical triangle inequality)
            zen = 90.0 - row["sunElDeg"]
            assert abs(zen - slope) - 0.05 <= row["surfaceIncidenceDeg"] <= zen + slope + 0.05


def test_terrain_aligned_panel_equals_surface_irradiance_scaled_by_area_and_efficiency() -> None:
    panel = {"areaM2": 2.0, "efficiency": 0.25, "derating": 0.8, "orientation": "terrain_aligned"}
    r = run(-85.98, 358.33, days=2, panel=panel)
    for row in r["timeseries"]:
        assert row["panelIrradianceWm2"] == pytest.approx(row["terrainIrradianceWm2"], abs=0.02)
        assert row["powerW"] == pytest.approx(row["terrainIrradianceWm2"] * 2.0 * 0.25 * 0.8, abs=0.02)
    assert r["power"]["status"] == "calculated_idealized" and r["power"]["peakW"] >= r["power"]["meanW"] >= 0


def test_tracking_panel_never_produces_less_than_a_fixed_one() -> None:
    fixed = run(
        -85.98,
        358.33,
        days=2,
        panel={"areaM2": 1, "efficiency": 0.3, "derating": 1, "orientation": "fixed", "normalAzimuthDeg": 180, "normalElevationDeg": 60},
    )
    track = run(-85.98, 358.33, days=2, panel={"areaM2": 1, "efficiency": 0.3, "derating": 1, "orientation": "two_axis_tracking"})
    assert track["power"]["energyWh"] >= fixed["power"]["energyWh"] - 1e-6


def test_time_accounting_visible_plus_dark_plus_unknown_equals_the_window() -> None:
    for site in [(-85.98, 358.33), (-84.6, 31.0), (-89.67, 129.78), (-89.45, 222.69)]:
        r = run(*site)
        total = 3 * 86400.0
        for body in ("sun", "earth"):
            b = r[body]
            acc = b["totalVisibleSeconds"] + b["unknownSeconds"] + b["totalDarkSeconds"]
            assert acc == pytest.approx(total, abs=1.0), (site, body, acc)
            assert b["longestDarkS"] <= b["totalDarkSeconds"] + 1e-6 and b["longestVisibleS"] <= b["totalVisibleSeconds"] + 1e-6
            assert b["interruptionCount"] <= b["darkIntervalCount"]


def test_permanently_shadowed_floor_reports_one_continuous_dark_period_and_zero_energy() -> None:
    r = run(-89.67, 129.78, panel={"areaM2": 1, "efficiency": 0.3, "derating": 1, "orientation": "two_axis_tracking"})
    assert r["sun"]["totalVisibleSeconds"] == 0 and r["sun"]["longestDarkS"] == pytest.approx(3 * 86400.0, abs=1.0)
    assert r["power"]["energyWh"] == 0 and r["surface"]["peakTerrainIrradianceWm2"] == 0


def test_terrain_aligned_panel_without_dem_heights_is_a_typed_error(monkeypatch: pytest.MonkeyPatch) -> None:
    import moonnav_science.analysis as an

    monkeypatch.setattr(an, "terrain_normal", lambda *a, **k: an.TerrainNormal(0, 0, 1, 0, None, 0, "unavailable"))
    with pytest.raises(an.AnalysisInputError):
        run(-85.98, 358.33, days=1, panel={"areaM2": 1, "efficiency": 0.3, "derating": 1, "orientation": "terrain_aligned"})
