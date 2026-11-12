"""Link margin against the standard free-space formulae (independent form: 20log10(d_km)+20log10(f_MHz)+32.44)."""

from __future__ import annotations

import math
import os

import pytest

from moonnav_science.link_budget import LinkAssumptions, fspl_db, margin_db

A = LinkAssumptions(
    frequency_hz=2.2e9, eirp_dbw=20.0, receiver_g_over_t_db_k=30.0, data_rate_bps=1e5, required_eb_n0_db=2.5, other_losses_db=3.0
)


def test_fspl_matches_the_textbook_engineering_form() -> None:
    for d_km, f_hz in [(384_400, 2.2e9), (357_000, 8.4e9), (406_700, 26e9)]:
        ref = 20 * math.log10(d_km) + 20 * math.log10(f_hz / 1e6) + 32.44
        assert fspl_db(d_km, f_hz) == pytest.approx(ref, abs=0.01)


def test_margin_hand_calculation() -> None:
    # C/N0 = 20 - 210.99 - 3 + 30 + 228.6 = 64.61 dB-Hz; Eb/N0 = 64.61 - 50 = 14.61; margin = 12.11 dB
    assert margin_db(A, 384_400) == pytest.approx(12.11, abs=0.03)


def test_margin_falls_6db_per_doubled_frequency_and_distance_and_3db_per_doubled_rate() -> None:
    base = margin_db(A, 384_400)
    assert margin_db(LinkAssumptions(4.4e9, 20, 30, 1e5, 2.5, 3), 384_400) == pytest.approx(base - 6.02, abs=0.01)
    assert margin_db(A, 768_800) == pytest.approx(base - 6.02, abs=0.01)
    assert margin_db(LinkAssumptions(2.2e9, 20, 30, 2e5, 2.5, 3), 384_400) == pytest.approx(base - 3.01, abs=0.01)


def test_validation_rejects_out_of_range_values() -> None:
    assert LinkAssumptions(1e3, 20, 30, 1e5, 2.5).validate()
    assert LinkAssumptions(2.2e9, 20, 30, 0, 2.5).validate()
    assert not A.validate()


def test_api_requires_token_validates_and_labels_the_result() -> None:
    os.environ.setdefault("SCIENCE_SERVICE_TOKEN", "x" * 32)
    from fastapi.testclient import TestClient

    from moonnav_science import api

    api.TOKEN = os.environ["SCIENCE_SERVICE_TOKEN"]
    c = TestClient(api.app)
    h = {"Authorization": f"Bearer {api.TOKEN}"}
    body = {
        "frequencyHz": 2.2e9,
        "eirpDbw": 20,
        "receiverGOverTDbK": 30,
        "dataRateBps": 1e5,
        "requiredEbN0Db": 2.5,
        "otherLossesDb": 3,
        "distancesKm": [357_000, 384_400, 406_700],
    }
    assert c.post("/v1/link-budget", json=body).status_code == 401
    r = c.post("/v1/link-budget", json=body, headers=h)
    assert r.status_code == 200
    j = r.json()
    assert j["marginDb"][0] > j["marginDb"][1] > j["marginDb"][2] and j["summary"]["fractionPositive"] == 1.0
    assert "Not a mission link analysis" in j["label"] and j["notModelled"]
    assert c.post("/v1/link-budget", json={**body, "distancesKm": [10]}, headers=h).status_code == 422
    raw = '{"frequencyHz": NaN, "eirpDbw": 20, "receiverGOverTDbK": 30, "dataRateBps": 1e5, "requiredEbN0Db": 2.5, "distancesKm": [384400]}'
    assert c.post("/v1/link-budget", content=raw, headers={**h, "content-type": "application/json"}).status_code == 422
    assert c.post("/v1/link-budget", json={**body, "dataRateBps": 0}, headers=h).status_code == 422
