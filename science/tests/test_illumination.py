"""LOLA illumination source products (PSR / long-term Sun and Earth visibility)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from moonnav_science import illumination
from moonnav_science.analysis import DATA_DIR
from moonnav_science.dem import DemValidationError
from moonnav_science.illumination import IllumRaster

LABEL = """PDS_VERSION_ID = "PDS3"
PRODUCT_VERSION_ID = "TEST"
FILE_NAME = "SYNTH.IMG"
START_TIME = 2009-07-13T00:00:00
STOP_TIME = 2013-07-18T00:00:00
OBJECT = IMAGE
  LINES = 11
  LINE_SAMPLES = 11
  SAMPLE_TYPE = LSB_INTEGER
  SAMPLE_BITS = 16
  SCALING_FACTOR = 0.000025
  OFFSET = 0.5
END_OBJECT = IMAGE
OBJECT = IMAGE_MAP_PROJECTION
  MAP_PROJECTION_TYPE = "POLAR STEREOGRAPHIC"
  A_AXIS_RADIUS = 1737.4 <km>
  CENTER_LATITUDE = -90 <deg>
  CENTER_LONGITUDE = 0 <deg>
  MAP_SCALE = 1000 <m/pix>
  MAXIMUM_LATITUDE = -88 <deg>
  LINE_PROJECTION_OFFSET = 5.0 <pix>
  SAMPLE_PROJECTION_OFFSET = 5.0 <pix>
END_OBJECT = IMAGE_MAP_PROJECTION
END
"""


def _synth(tmp: Path, label: str = LABEL, size: int = 11 * 11 * 2) -> IllumRaster:
    dn = np.full((11, 11), -20000, dtype="<i2")
    dn[5, 5] = 20000  # only the polar pixel is "permanent shadow"
    img, lbl = tmp / "SYNTH.IMG", tmp / "SYNTH.LBL"
    img.write_bytes(dn.tobytes()[:size])
    lbl.write_text(label)
    return IllumRaster.open(img, lbl)


def test_synthetic_scaling_and_coverage(tmp_path: Path) -> None:
    r = _synth(tmp_path)
    assert r.radius_ref_m == 1737400.0  # projection sphere, not the value OFFSET
    assert r.value_at(-90.0, 0.0) == pytest.approx(1.0)  # DN 20000 * 2.5e-5 + 0.5
    # ~1.5 km from the pole -> a neighbouring pixel, value 0
    assert r.value_at(-89.95, 45.0) == pytest.approx(0.0)
    # outside the labelled latitude bound -> unknown, never 0
    assert r.value_at(-87.0, 0.0) is None
    assert r.value_at(0.0, 0.0) is None


def test_rejects_size_mismatch_and_wrong_projection(tmp_path: Path) -> None:
    with pytest.raises(DemValidationError):
        _synth(tmp_path, size=100)
    with pytest.raises(DemValidationError):
        _synth(tmp_path, label=LABEL.replace("POLAR STEREOGRAPHIC", "EQUIRECTANGULAR"))


def test_point_reports_unavailable_without_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(illumination, "_CACHE", {})
    monkeypatch.setattr(illumination, "ASSETS_DIR", tmp_path / "none")
    out = illumination.point(-89.5, 0.0, tmp_path)
    assert out["permanentShadow"] is None and out["averageSunVisibility"] is None
    assert out["permanentShadowStatus"].startswith("unavailable")


REAL = DATA_DIR / "raw/illum" / "LPSR_75S_120M_201608.IMG"
needs_real = pytest.mark.skipif(not REAL.exists(), reason="LOLA illumination products not downloaded (npm run data:illum)")


@needs_real
def test_real_products_known_sites(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(illumination, "_CACHE", {})
    # Shackleton crater floor: permanently shadowed, no Sun or Earth.
    sh = illumination.point(-89.67, 129.78, DATA_DIR)
    assert sh["permanentShadow"] is True and sh["averageSunVisibility"] == 0
    # Mons Malapert summit: well lit, Earth always visible (near-side limb).
    mm = illumination.point(-85.99, 2.93, DATA_DIR)
    assert mm["permanentShadow"] is False
    assert 0.3 < mm["averageSunVisibility"] < 0.6 and mm["averageEarthVisibility"] > 0.95
    # Shackleton-de Gerlache ridge: among the best-lit polar points.
    assert illumination.point(-89.45, 222.69, DATA_DIR)["averageSunVisibility"] > 0.6
    # outside 75 S coverage -> unknown
    eq = illumination.point(0.0, 0.0, DATA_DIR)
    assert eq["permanentShadow"] is None and "outside" in eq["permanentShadowStatus"]


@needs_real
def test_packed_copies_match_the_original_products(monkeypatch: pytest.MonkeyPatch) -> None:
    packed_sun = DATA_DIR / "illum-packed" / "AVGVISIB_75S_120M_201608.npz"
    psr_o = IllumRaster.open(DATA_DIR / "raw/illum/LPSR_75S_120M_201608.IMG", DATA_DIR / "raw/illum/LPSR_75S_120M_201608.LBL")
    psr_p = IllumRaster.open_packed(
        illumination.ASSETS_DIR / "LPSR_75S_120M_201608.npz", illumination.ASSETS_DIR / "LPSR_75S_120M_201608.LBL"
    )
    assert np.array_equal(psr_p.data.astype(bool), np.asarray(psr_o.data) > 0)  # lossless
    if packed_sun.exists():
        o = IllumRaster.open(DATA_DIR / "raw/illum/AVGVISIB_75S_120M_201608.IMG", DATA_DIR / "raw/illum/AVGVISIB_75S_120M_201608.LBL")
        p = IllumRaster.open_packed(packed_sun, illumination.ASSETS_DIR / "AVGVISIB_75S_120M_201608.LBL")
        rng = np.random.default_rng(3)
        for la, lo in zip(rng.uniform(-89.9, -75.5, 200), rng.uniform(0, 360, 200), strict=True):
            a, b = o.value_at(float(la), float(lo)), p.value_at(float(la), float(lo))
            assert (a is None) == (b is None)
            if a is not None and b is not None:
                assert abs(a - b) <= 0.0005 + 1e-9


# ---- API: boundaries and invalid input -------------------------------------------------------------------------
@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    import os

    os.environ.setdefault("SCIENCE_SERVICE_TOKEN", "x" * 32)
    from fastapi.testclient import TestClient

    from moonnav_science import api

    api.TOKEN = os.environ["SCIENCE_SERVICE_TOKEN"]
    monkeypatch.setattr(illumination, "_CACHE", {})
    return TestClient(api.app), {"Authorization": f"Bearer {api.TOKEN}"}


def test_point_api_requires_the_service_token(client) -> None:
    c, _ = client
    assert c.get("/v1/illumination/point?lat=-89.67&lon=129.78").status_code == 401


@pytest.mark.parametrize(
    "q",
    [
        "lat=-91&lon=0",
        "lat=91&lon=0",
        "lat=abc&lon=0",
        "lat=-89&lon=abc",
        "lat=nan&lon=0",
        "lat=-89&lon=nan",
        "lat=-89&lon=inf",
        "lat=-89",
        "lon=10",
    ],
)
def test_point_api_rejects_invalid_input_with_422_never_500(client, q: str) -> None:
    c, h = client
    assert c.get(f"/v1/illumination/point?{q}", headers=h).status_code == 422


@needs_real
def test_point_api_boundaries_and_longitude_wrap(client) -> None:
    c, h = client
    get = lambda lat, lon: c.get(f"/v1/illumination/point?lat={lat}&lon={lon}", headers=h).json()  # noqa: E731
    # The product edge is exactly 75 S: inside at -75, unknown just north of it, and never reported as 0.
    assert get(-75.0, 10)["averageSunVisibility"] is not None
    north = get(-74.99, 10)
    assert north["permanentShadow"] is None and north["averageSunVisibility"] is None and "outside" in north["permanentShadowStatus"]
    # the pole itself is covered; every longitude is the same point there
    assert get(-90, 0)["permanentShadow"] == get(-90, 123.4)["permanentShadow"]
    # longitude conventions: 129.78 E == -230.22 (west-negative / wrapped)
    base = get(-89.67, 129.78)
    assert base["permanentShadow"] is True
    assert get(-89.67, -230.22)["permanentShadow"] is True
    assert c.get("/v1/illumination/point?lat=-89.67&lon=489.78", headers=h).status_code == 422  # beyond +-360 is rejected, like the web API
    # response shape and provenance are always present for a covered point
    for k in ("averageSunVisibilityProduct", "caveat", "permanentShadowStatus"):
        assert k in base
    assert base["permanentShadowProduct"]["product"] == "LPSR_75S_120M_201608"
