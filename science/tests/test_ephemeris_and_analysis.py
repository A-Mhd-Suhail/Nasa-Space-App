"""SPICE ephemeris vs independent JPL Horizons reference, time conversion, and full analysis."""

import json
from pathlib import Path

import pytest

from moonnav_science.analysis import AnalysisInputError, Scenario, kernels, run_analysis
from moonnav_science.ephemeris import SpiceEphemeris, angular_separation_deg, parse_horizons_azel
from moonnav_science.geometry import enu_basis, site_vector_m
from moonnav_science.kernels import et_to_utc, parse_utc, utc_to_et

FIX = Path(__file__).parent / "fixtures"
KERNELS_PRESENT = (Path(__file__).resolve().parents[2] / "data" / "raw" / "spice" / "de440s.bsp").exists()
pytestmark = pytest.mark.skipif(not KERNELS_PRESENT, reason="SPICE kernels not downloaded")

MONTHS = {m: i + 1 for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}


def _iso(h: str) -> str:
    d, t = h.split()
    y, mon, day = d.split("-")
    return f"{y}-{MONTHS[mon]:02d}-{day}T{t}Z"


def test_utc_et_roundtrip_and_known_offset():
    kernels()
    et = utc_to_et("2000-01-01T12:00:00Z")
    # J2000 epoch is 2000-01-01 12:00:00 TDB = 11:58:55.816 UTC -> ET(12:00 UTC) = 64.184 s
    assert et == pytest.approx(64.184, abs=1e-3)
    assert et_to_utc(utc_to_et("2026-11-15T10:00:00Z")) == "2026-11-15T10:00:00Z"
    with pytest.raises(ValueError):
        parse_utc("2026-11-15T10:00:00+02:00")
    with pytest.raises(ValueError):
        parse_utc("2026-11-15T10:00:00")


@pytest.mark.parametrize("case", ["south_pole", "mons_mouton", "shackleton_rim_like"])
@pytest.mark.parametrize("target", ["SUN", "EARTH"])
def test_spice_matches_horizons(case, target):
    kernels()
    req = json.loads((FIX / f"horizons_{case}_{target.lower()}.request.json").read_text())
    rows = parse_horizons_azel((FIX / f"horizons_{case}_{target.lower()}.txt").read_text())
    assert len(rows) == 15
    s = req["site"]
    site = site_vector_m(s["lat"], s["lonEast"], (1737.4 + s["heightKm"]) * 1000) / 1000
    eph = SpiceEphemeris(site, enu_basis(s["lat"], s["lonEast"]), "LT+S")
    worst = 0.0
    for utc, az, el in rows:
        g = eph.geometry(target, utc_to_et(_iso(utc)))
        sep = angular_separation_deg(g.azimuth_deg, g.elevation_deg, az, el)
        worst = max(worst, sep)
    # Independent JPL Horizons observer tables agree to better than 0.01 deg.
    assert worst < 0.01, f"max separation {worst:.5f} deg"


SCEN = {
    "site": {"latitudeDeg": -84.6, "longitudeEastDeg": 31.0},
    "timeRange": {"startUtc": "2026-11-15T00:00:00Z", "endUtc": "2026-11-22T00:00:00Z", "sampleStepSeconds": 600},
    "assumptions": {"antennaMinimumElevationDeg": None, "solarPanel": None},
}


def test_analysis_without_panel_reports_no_energy():
    r = run_analysis(Scenario.from_dict(SCEN))
    assert r["power"]["status"] == "not_calculated_missing_panel_assumptions"
    assert r["power"]["energyWh"] is None
    assert all(row["powerW"] is None for row in r["timeseries"])
    assert "not RF link" in r["earth"]["label"]
    assert r["provenance"]["terrainProductId"] == "lola-ldem-75s-240m-v2"
    assert r["provenance"]["methodVersion"]


def test_analysis_is_deterministic():
    a = run_analysis(Scenario.from_dict(SCEN))
    b = run_analysis(Scenario.from_dict(SCEN))
    assert a["sun"]["visibleIntervals"] == b["sun"]["visibleIntervals"]
    assert a["timeseries"] == b["timeseries"]


def test_sampling_sensitivity_intervals_converge():
    totals = {}
    for step in (3600, 900, 300):
        d = json.loads(json.dumps(SCEN))
        d["timeRange"]["sampleStepSeconds"] = step
        d["options"] = {"refineToleranceSeconds": 5}
        r = run_analysis(Scenario.from_dict(d))
        totals[step] = r["sun"]["totalVisibleSeconds"]
    # With bisection refinement, coarse and fine sampling agree within a few tolerances
    # unless a sub-step interval is missed entirely at the coarsest setting.
    assert abs(totals[900] - totals[300]) < 60
    assert abs(totals[3600] - totals[300]) < 3600


def test_dte_mask_reduces_windows_and_is_separate_from_rf():
    d = json.loads(json.dumps(SCEN))
    d["assumptions"]["antennaMinimumElevationDeg"] = 5.0
    r = run_analysis(Scenario.from_dict(d))
    assert r["earth"]["dte"]["totalVisibleSeconds"] <= r["earth"]["totalVisibleSeconds"]
    assert "geometric" in r["earth"]["label"].lower()


def test_panel_energy_present_only_with_assumptions():
    d = json.loads(json.dumps(SCEN))
    d["assumptions"]["solarPanel"] = {"areaM2": 1, "efficiency": 0.3, "derating": 0.85, "orientation": "two_axis_tracking"}
    r = run_analysis(Scenario.from_dict(d))
    assert r["power"]["status"] == "calculated_idealized"
    assert r["power"]["energyWh"] > 0
    # Power is zero whenever the Sun is fully blocked
    for row in r["timeseries"]:
        if row["sunState"] in ("terrain_blocked", "below_horizon"):
            assert row["powerW"] == 0


@pytest.mark.parametrize(
    "bad,field",
    [
        ({"site": {"latitudeDeg": -60, "longitudeEastDeg": 0}}, "site"),
        (
            {"timeRange": {"startUtc": "2026-11-22T00:00:00Z", "endUtc": "2026-11-15T00:00:00Z", "sampleStepSeconds": 600}},
            "timeRange.endUtc",
        ),
        ({"timeRange": {"startUtc": "2200-01-01T00:00:00Z", "endUtc": "2200-01-02T00:00:00Z", "sampleStepSeconds": 600}}, "timeRange"),
        ({"timeRange": {"startUtc": "2026-01-01T00:00:00Z", "endUtc": "2027-01-01T00:00:00Z", "sampleStepSeconds": 60}}, "timeRange"),
    ],
)
def test_invalid_inputs_raise_typed_errors(bad, field):
    d = json.loads(json.dumps(SCEN)) | bad
    with pytest.raises(AnalysisInputError) as ei:
        run_analysis(Scenario.from_dict(d))
    assert ei.value.field == field
