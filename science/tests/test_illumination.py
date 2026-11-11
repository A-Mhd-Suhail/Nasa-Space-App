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
