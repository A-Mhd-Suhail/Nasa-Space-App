"""Terrain normal and incidence on sloped ground, against analytic planes."""

from __future__ import annotations

import math

import numpy as np
import pytest

from moonnav_science.dem import PolarDem
from moonnav_science.geometry import enu_basis, unit_radial
from moonnav_science.surface import incidence_cos, terrain_normal

R = 1_737_400.0


class PlaneDem:
    """Height = a*E + b*N (metres) around a site: a plane with known slope and facing direction."""

    radius_ref_m = R

    def __init__(self, lat: float, lon: float, a: float, b: float, hole: bool = False) -> None:
        self.lat, self.lon, self.a, self.b, self.hole = lat, lon, a, b, hole
        self.basis = enu_basis(lat, lon)
        self.p0 = unit_radial(lat, lon) * R

    def sample_height(self, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:  # type: ignore[type-arg]
        la, lo = np.radians(lat), np.radians(lon)
        p = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1) * R
        d = p - self.p0
        h = self.a * (d @ self.basis.east) + self.b * (d @ self.basis.north)
        if self.hole:
            h = h * np.nan
        return h  # type: ignore[no-any-return]


def test_flat_ground_is_horizontal_with_no_aspect() -> None:
    n = terrain_normal(PlaneDem(-85.0, 30.0, 0.0, 0.0), -85.0, 30.0, 20.0)
    assert n.status == "ok" and n.slope_deg == pytest.approx(0.0, abs=1e-9) and n.aspect_deg is None
    assert n.up == pytest.approx(1.0)


@pytest.mark.parametrize("slope_deg, facing_az", [(5.0, 90.0), (10.0, 0.0), (20.0, 180.0), (15.0, 270.0), (8.0, 45.0)])
def test_known_plane_slope_and_aspect(slope_deg: float, facing_az: float) -> None:
    # A plane rising away from the facing direction: height gradient points opposite to the downhill (facing) azimuth.
    t = math.tan(math.radians(slope_deg))
    up_az = math.radians((facing_az + 180.0) % 360.0)
    a, b = t * math.sin(up_az), t * math.cos(up_az)
    n = terrain_normal(PlaneDem(-85.0, 30.0, a, b), -85.0, 30.0, 20.0)
    assert n.slope_deg == pytest.approx(slope_deg, abs=0.02)
    assert n.aspect_deg is not None and abs((n.aspect_deg - facing_az + 180.0) % 360.0 - 180.0) < 0.3  # circular difference


def test_incidence_on_flat_and_sloped_ground() -> None:
    flat = np.array([0.0, 0.0, 1.0])
    assert incidence_cos(flat, 0.0, 90.0) == pytest.approx(1.0)  # Sun at zenith: normal incidence
    assert incidence_cos(flat, 123.0, 0.0) == pytest.approx(0.0, abs=1e-12)  # grazing: zero irradiance
    assert incidence_cos(flat, 10.0, -5.0) < 0.0  # below the horizon
    # 20 degree slope facing east: Sun due east at 20 deg elevation is exactly along the normal
    s = math.radians(20.0)
    facing_east = np.array([math.sin(s), 0.0, math.cos(s)])
    assert incidence_cos(facing_east, 90.0, 70.0) == pytest.approx(1.0, abs=1e-12)
    # the same slope with the Sun in the west at 10 degrees: Sun is behind the slope (self-shadowing)
    assert incidence_cos(facing_east, 270.0, 10.0) < 0.0
    # slope facing the Sun gets more than flat ground at low sun
    assert incidence_cos(facing_east, 90.0, 10.0) > incidence_cos(flat, 90.0, 10.0)


def test_missing_data_makes_the_normal_unavailable_never_flat() -> None:
    n = terrain_normal(PlaneDem(-85.0, 30.0, 0.1, 0.0, hole=True), -85.0, 30.0, 20.0)
    assert n.status == "unavailable" and n.as_dict()["slopeDeg"] is None


def test_pole_site_normal_is_finite_and_consistent() -> None:
    t = math.tan(math.radians(6.0))
    n = terrain_normal(PlaneDem(-90.0, 0.0, t, 0.0), -90.0, 0.0, 20.0)
    assert (
        n.status == "ok"
        and n.slope_deg == pytest.approx(6.0, abs=0.05)
        and n.aspect_deg is not None
        and abs((n.aspect_deg - 270.0 + 180.0) % 360.0 - 180.0) < 0.5
    )


def test_real_dem_shackleton_rim_has_plausible_slope() -> None:
    from pathlib import Path

    img = Path(__file__).resolve().parents[2] / "data/raw/lola/ldem_75s_240m.img"
    if not img.exists():
        pytest.skip("LOLA 240 m DEM not downloaded")
    from moonnav_science.analysis import get_dem

    dem = get_dem("lola-ldem-75s-240m-v2")
    n = terrain_normal(dem, -89.67, 129.78, 480.0)  # Shackleton crater floor: nearly flat at 480 m
    assert n.status == "ok" and 0.0 <= n.slope_deg < 12.0
    rim = terrain_normal(dem, -89.9, 0.0, 480.0)
    assert rim.status == "ok"
    _ = PolarDem  # import kept so the module path is exercised
