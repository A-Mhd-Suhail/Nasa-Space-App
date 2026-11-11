"""Site coordinates and local East-North-Up (ENU) geometry.

Conventions (see docs/SCIENTIFIC_METHODS.md):
- Body: Moon (NAIF 301). Body-fixed frame: MOON_ME (mean Earth / polar axis,
  aligned to DE421 ME, which is the frame of the LOLA gridded products).
- Latitude: planetocentric, degrees, north positive.
- Longitude: east positive, canonical range [0, 360).
- Reference surface: sphere of radius 1737.4 km (the LOLA DEM reference radius).
- Azimuth: degrees clockwise from local north (0 N, 90 E, 180 S, 270 W).
- Elevation: degrees above the local horizontal plane (perpendicular to the
  radial "up" vector of the reference sphere).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

MOON_REFERENCE_RADIUS_M = 1_737_400.0

Vec3 = NDArray[np.float64]


def normalize_lon_east(lon_deg: float) -> float:
    """Return an east-positive longitude in [0, 360)."""
    if not math.isfinite(lon_deg):
        raise ValueError("longitude must be finite")
    v = lon_deg % 360.0
    return 0.0 if v == 360.0 else v


def west_to_east_lon(lon_west_deg: float) -> float:
    """Convert a west-positive longitude to the canonical east-positive form."""
    return normalize_lon_east(-lon_west_deg)


def validate_lat(lat_deg: float) -> float:
    if not math.isfinite(lat_deg) or lat_deg < -90.0 or lat_deg > 90.0:
        raise ValueError("latitude must be within [-90, 90] degrees")
    return lat_deg


def unit_radial(lat_deg: float, lon_deg: float) -> Vec3:
    la, lo = math.radians(lat_deg), math.radians(lon_deg)
    return np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])


def site_vector_m(lat_deg: float, lon_deg: float, radius_m: float) -> Vec3:
    """Body-fixed Cartesian position (metres) of a point at a given radius."""
    return unit_radial(lat_deg, lon_deg) * radius_m


@dataclass(frozen=True)
class EnuBasis:
    east: Vec3
    north: Vec3
    up: Vec3

    def to_enu(self, v: Vec3) -> Vec3:
        return np.array([float(v @ self.east), float(v @ self.north), float(v @ self.up)])

    def direction(self, azimuth_deg: float, elevation_deg: float = 0.0) -> Vec3:
        az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
        return math.cos(el) * (math.sin(az) * self.east + math.cos(az) * self.north) + math.sin(el) * self.up


def enu_basis(lat_deg: float, lon_deg: float) -> EnuBasis:
    """Local ENU basis on the reference sphere.

    At exactly +/-90 deg latitude, "north" is defined via the supplied longitude:
    the formulas below stay finite and give north pointing along the meridian
    `lon_deg` (toward the equator at the south pole). This is documented and
    tested so polar sites have a deterministic azimuth origin.
    """
    la, lo = math.radians(lat_deg), math.radians(lon_deg)
    east = np.array([-math.sin(lo), math.cos(lo), 0.0])
    north = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
    up = unit_radial(lat_deg, lon_deg)
    return EnuBasis(east=east, north=north, up=up)


def az_el_from_enu(e: float, n: float, u: float) -> tuple[float, float]:
    horizontal = math.hypot(e, n)
    az = (math.degrees(math.atan2(e, n)) + 360.0) % 360.0
    el = math.degrees(math.atan2(u, horizontal))
    return az, el


def az_el_dist(basis: EnuBasis, vec_site_to_target: Vec3) -> tuple[float, float, float]:
    enu = basis.to_enu(vec_site_to_target)
    az, el = az_el_from_enu(float(enu[0]), float(enu[1]), float(enu[2]))
    return az, el, float(np.linalg.norm(vec_site_to_target))


def lat_lon_from_vectors(p: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Planetocentric lat / east lon (deg) of an (..., 3) array of vectors."""
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    lat = np.degrees(np.arctan2(z, np.hypot(x, y)))
    lon = np.degrees(np.arctan2(y, x)) % 360.0
    return lat, lon


def angular_radius_deg(body_radius_km: float, distance_km: float) -> float:
    if distance_km <= body_radius_km:
        raise ValueError("observer inside body")
    return math.degrees(math.asin(body_radius_km / distance_km))
