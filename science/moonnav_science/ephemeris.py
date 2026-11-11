"""Ephemeris providers.

`SpiceEphemeris` computes topocentric Sun / Earth vectors from a lunar surface
site with NAIF SPICE (spkcpo, constant-position observer in MOON_ME).
`HorizonsClient` builds and parses JPL Horizons observer-table requests for
independent cross-checks; it is never silently substituted for SPICE.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Literal, Protocol

import numpy as np
import spiceypy as sp

from .geometry import EnuBasis, Vec3, angular_radius_deg, az_el_dist

BODY_FIXED_FRAME = "MOON_ME"
SUN_RADIUS_KM = 695_700.0  # IAU 2015 Resolution B3 nominal solar radius
AU_KM = 149_597_870.7

Target = Literal["SUN", "EARTH"]
CorrectionMode = Literal["NONE", "LT", "LT+S"]


@dataclass(frozen=True)
class TargetGeometry:
    azimuth_deg: float
    elevation_deg: float
    distance_km: float
    angular_radius_deg: float


class EphemerisProvider(Protocol):
    name: str

    def geometry(self, target: Target, et: float) -> TargetGeometry: ...


class SpiceEphemeris:
    """Topocentric geometry for a fixed lunar surface site."""

    name = "NAIF SPICE (spkcpo, MOON_ME)"

    def __init__(self, site_vec_km: Vec3, basis: EnuBasis, correction: CorrectionMode = "LT+S") -> None:
        self.site = [float(v) for v in site_vec_km]
        self.basis = basis
        self.correction = correction
        radii = sp.bodvrd("EARTH", "RADII", 3)[1]
        self.earth_radius_km = float(radii[0])

    def vector(self, target: Target, et: float) -> Vec3:
        state, _lt = sp.spkcpo(target, et, BODY_FIXED_FRAME, "OBSERVER", self.correction, self.site, "MOON", BODY_FIXED_FRAME)
        return np.asarray(state[:3], dtype=np.float64)

    def geometry(self, target: Target, et: float) -> TargetGeometry:
        v = self.vector(target, et)
        az, el, dist = az_el_dist(self.basis, v)
        radius = SUN_RADIUS_KM if target == "SUN" else self.earth_radius_km
        return TargetGeometry(az, el, dist, angular_radius_deg(radius, dist))


# --------------------------------------------------------------------------
# JPL Horizons observer-table adapter (cross-check only)
# --------------------------------------------------------------------------
HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api"


def horizons_params(
    target: Target, lat_deg: float, lon_east_deg: float, height_km: float, start_utc: str, stop_utc: str, step: str
) -> dict[str, str]:
    """Observer-table request for a lunar topocentric site.

    Syntax verified against the Horizons API manual: CENTER='coord@301',
    COORD_TYPE='GEODETIC', SITE_COORD='E-lon,lat,h(km)', QUANTITIES='4'
    (apparent azimuth & elevation, airless).
    """
    cmd = "10" if target == "SUN" else "399"
    return {
        "format": "text",
        "COMMAND": f"'{cmd}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon_east_deg:.6f},{lat_deg:.6f},{height_km:.6f}'",
        "START_TIME": f"'{start_utc}'",
        "STOP_TIME": f"'{stop_utc}'",
        "STEP_SIZE": f"'{step}'",
        "QUANTITIES": "'4'",
        "ANG_FORMAT": "'DEG'",
        "TIME_DIGITS": "'SECONDS'",
        "CSV_FORMAT": "'YES'",
        "APPARENT": "'AIRLESS'",
    }


_ROW = re.compile(r"^\s*(\d{4}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*,[^,]*,[^,]*,\s*([-\d.]+)\s*,\s*([-\d.]+)")


def parse_horizons_azel(text: str) -> list[tuple[str, float, float]]:
    """Parse rows between $$SOE and $$EOE into (utc, az_deg, el_deg)."""
    if "$$SOE" not in text:
        raise ValueError("Horizons response has no $$SOE marker")
    body = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows: list[tuple[str, float, float]] = []
    for line in body.strip().splitlines():
        m = _ROW.match(line)
        if m:
            rows.append((m.group(1), float(m.group(2)), float(m.group(3))))
    return rows


def angular_separation_deg(az1: float, el1: float, az2: float, el2: float) -> float:
    a1, e1, a2, e2 = map(math.radians, (az1, el1, az2, el2))
    c = math.sin(e1) * math.sin(e2) + math.cos(e1) * math.cos(e2) * math.cos(a1 - a2)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))
