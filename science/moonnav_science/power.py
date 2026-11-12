"""Idealized solar-panel power and energy (optional, assumption-driven).

P(t) = S(t) * A * eta * max(0, n . s(t)) * f_vis(t) * derating, capped at P_max
S(t) = TSI_1AU * (1 AU / r_sun(t))^2
Energy uses the trapezoidal rule over the analysis samples.
Thermal, dust, battery and electrical system effects are NOT modelled.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import numpy as np

from .ephemeris import AU_KM
from .geometry import EnuBasis

TSI_1AU_W_M2 = 1361.0  # Kopp & Lean (2011), total solar irradiance at 1 AU


@dataclass(frozen=True)
class PanelAssumptions:
    area_m2: float
    efficiency: float
    derating: float
    orientation: Literal["fixed", "two_axis_tracking", "terrain_aligned"]
    normal_azimuth_deg: float | None = None
    normal_elevation_deg: float | None = None
    max_output_w: float | None = None

    def validate(self) -> list[str]:
        errs = []
        if not (0 < self.area_m2 <= 1000):
            errs.append("area_m2 must be in (0, 1000]")
        if not (0 < self.efficiency <= 0.5):
            errs.append("efficiency must be in (0, 0.5]")
        if not (0 < self.derating <= 1):
            errs.append("derating must be in (0, 1]")
        if self.orientation not in ("fixed", "two_axis_tracking", "terrain_aligned"):
            errs.append("orientation must be fixed, two_axis_tracking or terrain_aligned")
        if self.orientation == "fixed" and (self.normal_azimuth_deg is None or self.normal_elevation_deg is None):
            errs.append("fixed panels need normal_azimuth_deg and normal_elevation_deg")
        if self.max_output_w is not None and self.max_output_w <= 0:
            errs.append("max_output_w must be positive")
        return errs


def irradiance_w_m2(sun_distance_km: float) -> float:
    return TSI_1AU_W_M2 * (AU_KM / sun_distance_km) ** 2


def incidence_cosine(
    p: PanelAssumptions,
    basis: EnuBasis,
    sun_az: float,
    sun_el: float,
    terrain_normal_enu: np.ndarray[Any, np.dtype[np.float64]] | None = None,
) -> float:
    """cos of the angle between the panel normal and the Sun, clamped at 0 (a panel cannot receive negative power).

    fixed: the user's normal azimuth/elevation (tilt = 90 deg - normal elevation); two_axis_tracking: always 1;
    terrain_aligned: the panel lies on the local ground, so its normal is the DEM surface normal (ENU)."""
    if p.orientation == "two_axis_tracking":
        return 1.0
    if p.orientation == "terrain_aligned":
        if terrain_normal_enu is None:
            raise ValueError("terrain_aligned panels need the DEM surface normal")
        az, el = np.radians(sun_az), np.radians(sun_el)
        s_enu = np.array([np.cos(el) * np.sin(az), np.cos(el) * np.cos(az), np.sin(el)])
        return max(0.0, float(terrain_normal_enu @ s_enu))
    assert p.normal_azimuth_deg is not None and p.normal_elevation_deg is not None
    n = basis.direction(p.normal_azimuth_deg, p.normal_elevation_deg)
    s = basis.direction(sun_az, sun_el)
    return max(0.0, float(n @ s))


def power_w(p: PanelAssumptions, irradiance: float, cos_inc: float, visible_fraction: float) -> float:
    w = irradiance * p.area_m2 * p.efficiency * cos_inc * visible_fraction * p.derating
    if p.max_output_w is not None:
        w = min(w, p.max_output_w)
    return w


def integrate_wh(times_s: list[float], watts: list[float]) -> float:
    if len(times_s) < 2:
        return 0.0
    return float(np.trapezoid(np.asarray(watts), np.asarray(times_s))) / 3600.0
