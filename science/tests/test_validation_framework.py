"""The validation framework itself: offline checks pass and unavailable references never pass."""

from __future__ import annotations

from pathlib import Path

import pytest

DATA = Path(__file__).resolve().parents[2] / "data"
pytestmark = pytest.mark.skipif(
    not (DATA / "raw/spice/de440s.bsp").exists() or not (DATA / "raw/lola/ldem_75s_240m.img").exists(), reason="NASA data not downloaded"
)


def test_offline_spice_geometry_and_terrain_checks_pass():
    from moonnav_science.analysis import kernels
    from moonnav_science.validation import horizon_bruteforce_check, spice_checks, visibility_consistency

    kernels()
    recs = spice_checks() + horizon_bruteforce_check() + visibility_consistency()
    assert recs and all(r["result"] == "pass" for r in recs), [r for r in recs if r["result"] != "pass"]
    for r in recs:
        assert {
            "source",
            "product",
            "epochUtc",
            "location",
            "method",
            "moonnav",
            "reference",
            "difference",
            "tolerance",
            "result",
        } <= r.keys()


def test_svs_reference_compared_and_clamped_epochs_are_unavailable():
    from moonnav_science.analysis import kernels
    from moonnav_science.validation import svs_dialamoon

    kernels()
    # Values published by the SVS Dial-a-Moon API for 2026-12-03T00:00 (also stamped on SVS 4930 frame 4033).
    real = {
        "time": "2026-12-03T00:00",
        "distance": 386204.0,
        "subsolar_lon": -104.267,
        "subsolar_lat": -1.462,
        "subearth_lon": 6.823,
        "subearth_lat": 4.1,
    }
    clamped = {**real, "time": "2026-12-31T23:00"}
    out = svs_dialamoon(["2026-12-03T00:00", "2027-07-01T12:00"], fetch=lambda t: real if t.startswith("2026") else clamped)
    assert out[0]["result"] == "pass" and out[0]["difference"]["subEarthDeg"] < 0.01
    assert out[1]["result"] == "unavailable"
    wrong = {**real, "subearth_lat": 5.1}
    assert svs_dialamoon(["2026-12-03T00:00"], fetch=lambda t: wrong)[0]["result"] == "fail"


def test_svs_extended_fields_compared():
    from moonnav_science.analysis import kernels
    from moonnav_science.validation import svs_dialamoon

    kernels()
    # Values published by the SVS Dial-a-Moon API for 2025-06-01T00:00 (retrieved 2026-11-12).
    real = {
        "time": "2025-06-01T00:00",
        "phase": 28.79,
        "diameter": 1867.3,
        "distance": 383839.0,
        "j2000_ra": 9.2386,
        "j2000_dec": 19.2996,
        "subsolar_lon": 122.401,
        "subsolar_lat": 1.497,
        "subearth_lon": 7.336,
        "subearth_lat": -4.076,
    }
    r = svs_dialamoon(["2025-06-01T00:00"], fetch=lambda t: real)[0]
    assert r["result"] == "pass"
    assert r["difference"]["raDecDeg"] <= 0.01 and abs(r["difference"]["illuminatedPct"]) <= 0.1
    bad = {**real, "phase": 30.0}
    assert svs_dialamoon(["2025-06-01T00:00"], fetch=lambda t: bad)[0]["result"] == "fail"


def test_lola_illumination_check_unavailable_without_products(monkeypatch, tmp_path):
    from moonnav_science import illumination, validation

    monkeypatch.setattr(illumination, "_CACHE", {})
    monkeypatch.setattr(validation, "DATA_DIR", tmp_path)
    monkeypatch.setattr(illumination, "ASSETS_DIR", tmp_path / "none")
    out = validation.lola_illumination_checks(n=2)
    assert len(out) == 1 and out[0]["result"] == "unavailable"
