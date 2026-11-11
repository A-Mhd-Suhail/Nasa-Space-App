"""LOLA polar illumination products (Mazarico et al. 2011; NASA GSFC PGDA product 69, PDS LOLA node).

- LPSR_75S_120M_201608: permanently shadowed regions, binary (1 = permanent shadow, 0 = not),
  computed by the LOLA team from LOLA topography with hourly Sun positions over an 18.6-year
  lunar nutation cycle. 120 m/px, 75 S - pole, south polar stereographic, 1737.4 km sphere.
- AVGVISIB_75S_120M_201608[_EARTH]: average fraction of the Sun's (Earth's) disk visible over the
  same period (0..1).

MoonNav treats these as *source* layers (label "Source data"): it does not derive PSR boundaries
from its own short-window analyses. Outside the 75 S coverage, or in the square-grid corners beyond
the labelled latitude bound, values are NaN (unknown), never 0.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

import numpy as np
from numpy.typing import NDArray

from .dem import DemValidationError, PolarDem, _num, parse_pds3_label

PRODUCTS = {
    "psr": "LPSR_75S_120M_201608",
    "sun": "AVGVISIB_75S_120M_201608",
    "earth": "AVGVISIB_75S_120M_201608_EARTH",
}
SOURCE = {
    "provider": "NASA GSFC / LRO LOLA team (PGDA product 69; PDS LOLA data node)",
    "reference": "Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Torrence, M.H. (2011), Illumination conditions of the lunar polar regions using LOLA topography, Icarus 211, 1066-1081",
    "url": "https://pgda.gsfc.nasa.gov/products/69",
    "archiveUrl": "http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/",
}


@dataclass
class IllumRaster:
    name: str
    label: dict[str, str]
    lines: int
    samples: int
    scale_m: float
    line_offset: float
    sample_offset: float
    radius_ref_m: float  # projection sphere (A_AXIS_RADIUS), NOT the value OFFSET
    value_scale: float
    value_offset: float
    max_abs_lat_edge: float
    data: NDArray[np.int16] = field(repr=False)
    sha256: str = ""
    pole = -1

    @classmethod
    def open(cls, img: Path, lbl: Path, checksum: bool = False) -> IllumRaster:
        label = parse_pds3_label(lbl.read_text(encoding="latin-1"))
        if label.get("MAP_PROJECTION_TYPE", "").upper() != "POLAR STEREOGRAPHIC" or _num(label, "CENTER_LATITUDE") != -90.0:
            raise DemValidationError("expected a south polar stereographic product")
        if label.get("SAMPLE_TYPE", "").upper() != "LSB_INTEGER" or int(_num(label, "SAMPLE_BITS")) != 16:
            raise DemValidationError("unsupported sample type")
        lines, samples = int(_num(label, "LINES")), int(_num(label, "LINE_SAMPLES"))
        if img.stat().st_size != lines * samples * 2:
            raise DemValidationError(f"{img.name}: size does not match label")
        data = np.memmap(img, dtype="<i2", mode="r", shape=(lines, samples))
        sha = hashlib.sha256(img.read_bytes()).hexdigest() if checksum else ""
        return cls(
            name=label.get("FILE_NAME", img.name).replace(".IMG", ""),
            label=label,
            lines=lines,
            samples=samples,
            scale_m=_num(label, "MAP_SCALE"),
            line_offset=_num(label, "LINE_PROJECTION_OFFSET"),
            sample_offset=_num(label, "SAMPLE_PROJECTION_OFFSET"),
            radius_ref_m=_num(label, "A_AXIS_RADIUS") * 1000.0,
            value_scale=_num(label, "SCALING_FACTOR"),
            value_offset=_num(label, "OFFSET"),
            max_abs_lat_edge=abs(_num(label, "MAXIMUM_LATITUDE")),
            data=data,
            sha256=sha,
        )

    def latlon_to_xy(self, lat: NDArray[np.float64], lon: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        return PolarDem.latlon_to_xy(cast(Any, self), lat, lon)

    def xy_to_pixel(self, x: NDArray[np.float64], y: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        return PolarDem.xy_to_pixel(cast(Any, self), x, y)

    def value_at(self, lat: float, lon: float) -> float | None:
        """Nearest-pixel physical value (products are pixel-registered); None outside coverage."""
        if not (lat <= -self.max_abs_lat_edge):
            return None
        x, y = self.latlon_to_xy(np.array([lat]), np.array([lon]))
        row, col = self.xy_to_pixel(x, y)
        r, c = int(math.floor(row[0] + 0.5)), int(math.floor(col[0] + 0.5))
        if not (0 <= r < self.lines and 0 <= c < self.samples):
            return None
        return float(self.data[r, c]) * self.value_scale + self.value_offset

    def metadata(self) -> dict[str, Any]:
        return {
            "product": self.name,
            "productVersion": self.label.get("PRODUCT_VERSION_ID"),
            "dataSetId": self.label.get("DATA_SET_ID"),
            "resolutionM": self.scale_m,
            "coverage": f"{self.max_abs_lat_edge} S to pole",
            "projection": "south polar stereographic (spherical, R = 1737.4 km)",
            "inputTopographyPeriod": f"{self.label.get('START_TIME', '?')[:10]} .. {self.label.get('STOP_TIME', '?')[:10]}",
            **SOURCE,
        }


_CACHE: dict[str, IllumRaster] = {}


def raster(kind: str, data_dir: Path) -> IllumRaster | None:
    """Open a product if it has been downloaded (scripts/fetch_illumination.py); None otherwise."""
    if kind in _CACHE:
        return _CACHE[kind]
    name = PRODUCTS[kind]
    img, lbl = data_dir / "raw/illum" / f"{name}.IMG", data_dir / "raw/illum" / f"{name}.LBL"
    if not img.exists() or not lbl.exists():
        return None
    r = IllumRaster.open(img, lbl)
    _CACHE[kind] = r
    return r


def point(lat: float, lon: float, data_dir: Path) -> dict[str, Any]:
    out: dict[str, Any] = {"latitudeDeg": lat, "longitudeEastDeg": lon}
    for kind, key in (("psr", "permanentShadow"), ("sun", "averageSunVisibility"), ("earth", "averageEarthVisibility")):
        r = raster(kind, data_dir)
        if r is None:
            out[key] = None
            out[f"{key}Status"] = "unavailable (product not downloaded)"
            continue
        v = r.value_at(lat, lon)
        if v is None:
            out[key] = None
            out[f"{key}Status"] = "unknown (outside product coverage)"
        elif kind == "psr":
            out[key] = bool(round(v) == 1)
            out[f"{key}Status"] = "source data"
        else:
            out[key] = round(v, 4)
            out[f"{key}Status"] = "source data"
        out[f"{key}Product"] = r.metadata()
    out["caveat"] = (
        "Permanent shadow here is the LOLA team's 120 m product averaged over an 18.6-year cycle. A PSR flag is not evidence of water ice, "
        "and a nearby PSR does not make a site unsafe; sub-pixel shadows (< 120 m) are not represented."
    )
    return out
