"""Local terrain surface normal and solar incidence on the real (sloped) ground.

The site's surface normal comes from the DEM, not from the sphere: heights are sampled at +-baseline/2 metres east,
west, north and south of the site along the local ENU axes (central differences), and
    n_enu = normalise(-dh/dE, -dh/dN, 1).
Slope is the angle between n and local up; "aspect" is the azimuth the surface FACES (the downhill direction).
Incidence angle = angle between n and the direction to the Sun. A Sun behind the local slope (n . s <= 0) gives zero
direct irradiance on that surface: this is self-shadowing by the local slope, separate from the far-field terrain horizon.
Resolution caveat: the baseline is never finer than the DEM; a 5 m DEM gives a 10 m baseline, a 240 m DEM 480 m, so
the normal represents terrain at that scale, not at lander-foot scale.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from .geometry import az_el_from_enu, enu_basis, lat_lon_from_vectors, unit_radial


@dataclass(frozen=True)
class TerrainNormal:
    east: float
    north: float
    up: float
    slope_deg: float
    aspect_deg: float | None  # azimuth the surface faces; None on (numerically) flat ground
    baseline_m: float
    status: str  # "ok" | "unavailable"

    def vector(self) -> np.ndarray[Any, np.dtype[np.float64]]:
        return np.array([self.east, self.north, self.up])

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "slopeDeg": None if self.status != "ok" else round(self.slope_deg, 3),
            "aspectDeg": None if self.aspect_deg is None else round(self.aspect_deg, 2),
            "normalEnu": None if self.status != "ok" else [round(self.east, 5), round(self.north, 5), round(self.up, 5)],
            "baselineM": self.baseline_m,
            "method": "central differences of DEM heights along local east/north; aspect = downhill azimuth",
        }


UNAVAILABLE = TerrainNormal(0.0, 0.0, 1.0, 0.0, None, 0.0, "unavailable")


def terrain_normal(dem: Any, lat_deg: float, lon_deg: float, baseline_m: float) -> TerrainNormal:
    """Surface normal at a site from any DEM exposing sample_height(lat, lon) and radius_ref_m (NaN = no data)."""
    b = enu_basis(lat_deg, lon_deg)
    p = unit_radial(lat_deg, lon_deg) * float(dem.radius_ref_m)
    h = baseline_m / 2.0
    pts = np.array([p + h * b.east, p - h * b.east, p + h * b.north, p - h * b.north])
    pts = pts / np.linalg.norm(pts, axis=1, keepdims=True)
    lat, lon = lat_lon_from_vectors(pts)
    z = np.asarray(dem.sample_height(lat, lon), dtype=float)
    if not np.all(np.isfinite(z)):
        return TerrainNormal(0.0, 0.0, 1.0, 0.0, None, baseline_m, "unavailable")
    dzde = (z[0] - z[1]) / baseline_m
    dzdn = (z[2] - z[3]) / baseline_m
    n = np.array([-dzde, -dzdn, 1.0])
    n = n / np.linalg.norm(n)
    slope = math.degrees(math.acos(max(-1.0, min(1.0, float(n[2])))))
    aspect = None if slope < 1e-6 else az_el_from_enu(float(n[0]), float(n[1]), float(n[2]))[0]
    return TerrainNormal(float(n[0]), float(n[1]), float(n[2]), slope, aspect, baseline_m, "ok")


def incidence_cos(normal_enu: np.ndarray[Any, np.dtype[np.float64]], sun_az_deg: float, sun_el_deg: float) -> float:
    """cos(angle between a surface normal and the Sun direction); may be negative (Sun behind the surface)."""
    az, el = math.radians(sun_az_deg), math.radians(sun_el_deg)
    s = np.array([math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el)])
    return float(normal_enu @ s)
