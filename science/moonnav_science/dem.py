"""LOLA polar stereographic DEM reader (PDS3 IMG + label).

Reads the binary image described by its PDS3 label, verifies the keywords we
depend on, and exposes bilinear sampling with explicit no-data handling.
No pixel is ever silently converted to zero: samples outside coverage or
touching invalid pixels come back as NaN and are reported by callers.
"""

from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

REQUIRED_KEYS = (
    "LINES",
    "LINE_SAMPLES",
    "SAMPLE_TYPE",
    "SAMPLE_BITS",
    "SCALING_FACTOR",
    "OFFSET",
    "MAP_PROJECTION_TYPE",
    "A_AXIS_RADIUS",
    "CENTER_LATITUDE",
    "CENTER_LONGITUDE",
    "MAP_SCALE",
    "LINE_PROJECTION_OFFSET",
    "SAMPLE_PROJECTION_OFFSET",
    "POSITIVE_LONGITUDE_DIRECTION",
    "KEYWORD_LATITUDE_TYPE",
    "MAXIMUM_LATITUDE",
    "COORDINATE_SYSTEM_NAME",
)


class DemValidationError(ValueError):
    pass


def parse_pds3_label(text: str) -> dict[str, str]:
    """Minimal PDS3 keyword parser (first occurrence wins; units stripped)."""
    out: dict[str, str] = {}
    joined = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    for m in re.finditer(r"^\s*\^?([A-Z_][A-Z0-9_]*)\s*=\s*(\"[^\"]*\"|'[^']*'|[^\n]*)", joined, re.M):
        key, raw = m.group(1), m.group(2).strip()
        if key in out:
            continue
        val = raw.strip("\"'")
        val = re.sub(r"\s*<[^>]*>\s*$", "", val).strip()
        out[key] = val
    return out


def _num(label: dict[str, str], key: str) -> float:
    try:
        return float(label[key].rstrip("."))
    except (KeyError, ValueError) as exc:
        raise DemValidationError(f"label keyword {key} missing or not numeric") from exc


@dataclass
class PolarDem:
    product_id: str
    img_path: Path
    label: dict[str, str]
    lines: int
    samples: int
    scale_m: float
    line_offset: float
    sample_offset: float
    radius_ref_m: float
    scaling_factor: float
    pole: int  # -1 south, +1 north
    max_abs_lat_edge: float
    frame_name: str
    data: NDArray[np.float32] = field(repr=False)
    sha256: str = ""

    @classmethod
    def open(cls, img_path: Path, lbl_path: Path, product_id: str, compute_checksum: bool = True) -> PolarDem:
        label = parse_pds3_label(lbl_path.read_text(encoding="latin-1"))
        missing = [k for k in REQUIRED_KEYS if k not in label]
        if missing:
            raise DemValidationError(f"label missing keywords: {missing}")
        if label["MAP_PROJECTION_TYPE"].upper() != "POLAR STEREOGRAPHIC":
            raise DemValidationError("unsupported projection")
        if label["SAMPLE_TYPE"].upper() != "LSB_INTEGER" or int(_num(label, "SAMPLE_BITS")) != 16:
            raise DemValidationError("unsupported sample type")
        if label["POSITIVE_LONGITUDE_DIRECTION"].upper() != "EAST":
            raise DemValidationError("expected east-positive longitudes")
        if label["KEYWORD_LATITUDE_TYPE"].upper() != "PLANETOCENTRIC":
            raise DemValidationError("expected planetocentric latitude")
        a = _num(label, "A_AXIS_RADIUS")
        b = _num(label, "B_AXIS_RADIUS") if "B_AXIS_RADIUS" in label else a
        if a != b:
            raise DemValidationError("only spherical projections are supported")
        if _num(label, "CENTER_LONGITUDE") != 0.0:
            raise DemValidationError("only CENTER_LONGITUDE = 0 is supported")
        center_lat = _num(label, "CENTER_LATITUDE")
        if abs(center_lat) != 90.0:
            raise DemValidationError("expected polar projection centre")
        lines, samples = int(_num(label, "LINES")), int(_num(label, "LINE_SAMPLES"))
        expected = lines * samples * 2
        size = img_path.stat().st_size
        if size != expected:
            raise DemValidationError(f"IMG size {size} != expected {expected}")
        raw = np.fromfile(img_path, dtype="<i2").reshape(lines, samples)
        data = raw.astype(np.float32) * np.float32(_num(label, "SCALING_FACTOR"))
        sha = hashlib.sha256(img_path.read_bytes()).hexdigest() if compute_checksum else ""
        return cls(
            product_id=product_id,
            img_path=img_path,
            label=label,
            lines=lines,
            samples=samples,
            scale_m=_num(label, "MAP_SCALE"),
            line_offset=_num(label, "LINE_PROJECTION_OFFSET"),
            sample_offset=_num(label, "SAMPLE_PROJECTION_OFFSET"),
            radius_ref_m=_num(label, "OFFSET"),
            scaling_factor=_num(label, "SCALING_FACTOR"),
            pole=-1 if center_lat < 0 else 1,
            max_abs_lat_edge=abs(_num(label, "MAXIMUM_LATITUDE")),
            frame_name=label["COORDINATE_SYSTEM_NAME"],
            data=data,
            sha256=sha,
        )

    # --- projection -------------------------------------------------------
    def latlon_to_xy(self, lat: NDArray[np.float64], lon: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        """Projected metres (PDS DSMAP_POLAR spherical formulas)."""
        la, lo = np.radians(lat), np.radians(lon)
        R = self.radius_ref_m
        if self.pole < 0:
            r = 2 * R * np.tan(np.pi / 4 + la / 2)
            return r * np.sin(lo), r * np.cos(lo)
        r = 2 * R * np.tan(np.pi / 4 - la / 2)
        return r * np.sin(lo), -r * np.cos(lo)

    def xy_to_latlon(self, x: NDArray[np.float64], y: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        R = self.radius_ref_m
        rho = np.hypot(x, y)
        c = 2 * np.arctan(rho / (2 * R))
        if self.pole < 0:
            lat = -90.0 + np.degrees(c)
            lon = np.degrees(np.arctan2(x, y)) % 360.0
        else:
            lat = 90.0 - np.degrees(c)
            lon = np.degrees(np.arctan2(x, -y)) % 360.0
        return lat, lon

    def xy_to_pixel(self, x: NDArray[np.float64], y: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        """0-based fractional (row, col) of pixel centres."""
        return self.line_offset - y / self.scale_m, self.sample_offset + x / self.scale_m

    def pixel_to_xy(self, row: NDArray[np.float64], col: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        return (col - self.sample_offset) * self.scale_m, (self.line_offset - row) * self.scale_m

    # --- sampling ---------------------------------------------------------
    def sample_height(self, lat: NDArray[np.float64], lon: NDArray[np.float64]) -> NDArray[np.float64]:
        """Bilinear height (m, relative to reference radius). NaN outside coverage."""
        lat = np.asarray(lat, dtype=np.float64)
        lon = np.asarray(lon, dtype=np.float64)
        x, y = self.latlon_to_xy(lat, lon)
        row, col = self.xy_to_pixel(x, y)
        return self._bilinear(row, col, lat)

    def _bilinear(self, row: NDArray[np.float64], col: NDArray[np.float64], lat: NDArray[np.float64]) -> NDArray[np.float64]:
        r0 = np.floor(row).astype(np.int64)
        c0 = np.floor(col).astype(np.int64)
        fr, fc = row - r0, col - c0
        ok = (r0 >= 0) & (c0 >= 0) & (r0 + 1 < self.lines) & (c0 + 1 < self.samples)
        # Corners of the square grid lie beyond the labelled latitude bound;
        # those pixels are not trustworthy coverage.
        if self.pole < 0:
            ok &= lat <= -self.max_abs_lat_edge
        else:
            ok &= lat >= self.max_abs_lat_edge
        out = np.full(row.shape, np.nan, dtype=np.float64)
        if not np.any(ok):
            return out
        rr, cc, a, b = r0[ok], c0[ok], fr[ok], fc[ok]
        d = self.data
        v00, v01 = d[rr, cc].astype(np.float64), d[rr, cc + 1].astype(np.float64)
        v10, v11 = d[rr + 1, cc].astype(np.float64), d[rr + 1, cc + 1].astype(np.float64)
        out[ok] = (1 - a) * (1 - b) * v00 + (1 - a) * b * v01 + a * (1 - b) * v10 + a * b * v11
        return out

    def height_at(self, lat_deg: float, lon_deg: float) -> float | None:
        v = float(self.sample_height(np.array([lat_deg]), np.array([lon_deg]))[0])
        return None if math.isnan(v) else v

    def covers(self, lat_deg: float) -> bool:
        return lat_deg <= -self.max_abs_lat_edge if self.pole < 0 else lat_deg >= self.max_abs_lat_edge

    def metadata(self) -> dict[str, object]:
        return {
            "productId": self.product_id,
            "dataSetId": self.label.get("DATA_SET_ID"),
            "productVersion": self.label.get("PRODUCT_VERSION_ID"),
            "fileName": self.label.get("FILE_NAME"),
            "projection": "POLAR STEREOGRAPHIC (spherical)",
            "frame": self.frame_name,
            "referenceRadiusM": self.radius_ref_m,
            "pixelSpacingM": self.scale_m,
            "scalingFactor": self.scaling_factor,
            "lines": self.lines,
            "samples": self.samples,
            "latitudeType": "planetocentric",
            "longitudeConvention": "east-positive",
            "coverage": f"{'south' if self.pole < 0 else 'north'} of {self.max_abs_lat_edge} deg {'S' if self.pole < 0 else 'N'}",
            "noDataPolicy": "outside labelled coverage -> null (never zero)",
            "sha256": self.sha256,
        }
