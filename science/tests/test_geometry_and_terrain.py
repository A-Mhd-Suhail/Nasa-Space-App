"""Unit tests: coordinates, ENU, azimuth conventions, DEM decoding, horizon, visibility, power."""

import math
from pathlib import Path

import numpy as np
import pytest

from moonnav_science.dem import DemValidationError, PolarDem, parse_pds3_label
from moonnav_science.geometry import (
    az_el_dist,
    az_el_from_enu,
    enu_basis,
    normalize_lon_east,
    site_vector_m,
    west_to_east_lon,
)
from moonnav_science.horizon import HorizonParams, compute_horizon
from moonnav_science.power import PanelAssumptions, incidence_cosine, integrate_wh, irradiance_w_m2, power_w
from moonnav_science.visibility import classify, disk_fraction_above, extract_intervals

DATA = Path(__file__).resolve().parents[2] / "data" / "raw" / "lola"
R = 1_737_400.0


# --- coordinates ----------------------------------------------------------
def test_longitude_normalisation_and_west_conversion():
    assert normalize_lon_east(-30.0) == 330.0
    assert normalize_lon_east(360.0) == 0.0
    assert normalize_lon_east(725.0) == 5.0
    assert west_to_east_lon(30.0) == 330.0
    assert west_to_east_lon(-30.0) == 30.0
    with pytest.raises(ValueError):
        normalize_lon_east(float("nan"))


@pytest.mark.parametrize("e,n,az", [(0, 1, 0), (1, 0, 90), (0, -1, 180), (-1, 0, 270)])
def test_cardinal_azimuths(e, n, az):
    a, el = az_el_from_enu(e, n, 0)
    assert a == pytest.approx(az)
    assert el == pytest.approx(0)


def test_azimuth_wraps_near_360():
    a, _ = az_el_from_enu(-1e-6, 1.0, 0)
    assert 359.9 < a < 360.0
    a2, _ = az_el_from_enu(1e-6, 1.0, 0)
    assert 0.0 <= a2 < 0.1


@pytest.mark.parametrize("u,el", [(1, 45.0), (-1, -45.0), (0, 0.0)])
def test_known_vector_elevation(u, el):
    _, e = az_el_from_enu(0.0, 1.0, u)
    assert e == pytest.approx(el)


def test_enu_is_orthonormal_including_pole():
    for lat, lon in [(-89.67, 129.78), (-90.0, 0.0), (-90.0, 90.0), (0.0, 0.0), (45, 200)]:
        b = enu_basis(lat, lon)
        M = np.vstack([b.east, b.north, b.up])
        assert np.allclose(M @ M.T, np.eye(3), atol=1e-12)
        # right-handed: east x north = up
        assert np.allclose(np.cross(b.east, b.north), b.up, atol=1e-12)


def test_zenith_target_has_90_deg_elevation():
    b = enu_basis(-85.0, 40.0)
    site = site_vector_m(-85.0, 40.0, R)
    target = site + b.up * 1e6
    _, el, d = az_el_dist(b, target - site)
    assert el == pytest.approx(90.0)
    assert d == pytest.approx(1e6)


def test_north_at_south_pole_points_along_meridian():
    b = enu_basis(-90.0, 0.0)
    # From the south pole, the 0-deg meridian direction is +X in the body frame.
    assert np.allclose(b.north, [1, 0, 0], atol=1e-12)
    assert np.allclose(b.east, [0, 1, 0], atol=1e-12)


# --- synthetic DEM ----------------------------------------------------------
class SyntheticDem:
    """Height function on the reference sphere (unit-test fixture only; NOT LOLA)."""

    radius_ref_m = R
    scale_m = 100.0

    def __init__(self, fn):
        self.fn = fn

    def sample_height(self, lat, lon):
        return self.fn(np.asarray(lat, float), np.asarray(lon, float))


def _dist_from(lat0, lon0, lat, lon):
    a = np.radians
    c = np.sin(a(lat0)) * np.sin(a(lat)) + np.cos(a(lat0)) * np.cos(a(lat)) * np.cos(a(lon - lon0))
    return R * np.arccos(np.clip(c, -1, 1))


def test_open_flat_sphere_horizon_is_curvature_dip():
    dem = SyntheticDem(lambda lat, lon: np.zeros_like(lat))
    hp = HorizonParams(azimuth_step_deg=10, max_radius_m=50_000, observer_height_m=2.0)
    prof = compute_horizon(dem, -60.0, 10.0, hp)
    # For a smooth sphere the steepest visible point is the first sample; all horizons are slightly negative.
    assert np.all(prof.elevation_deg < 0)
    assert np.all(prof.elevation_deg > -1.5)
    assert all(s == "complete" for s in prof.status)


def test_single_ridge_blocks_low_target_but_not_high():
    lat0, lon0 = -60.0, 10.0

    def ridge(lat, lon):
        d = _dist_from(lat0, lon0, lat, lon)
        # 1000 m wall 10-11 km away, only toward the north (lat greater than site)
        return np.where((d > 10_000) & (d < 11_000) & (lat > lat0), 1000.0, 0.0)

    prof = compute_horizon(SyntheticDem(ridge), lat0, lon0, HorizonParams(azimuth_step_deg=1, max_radius_m=20_000))
    h_north, _ = prof.at(0.0)
    h_south, _ = prof.at(180.0)
    expected = math.degrees(math.atan2(1000 - 2.0, 10_000))  # ~5.7 deg, minus curvature
    assert h_north == pytest.approx(expected, abs=0.2)
    assert h_south < 0
    blocked = classify(center_el=3.0, radius=0.27, horizon=h_north, unseen_bound=float("nan"), rule="any_disk")
    assert blocked.state == "terrain_blocked" and blocked.lit is False
    clear = classify(center_el=8.0, radius=0.27, horizon=h_north, unseen_bound=float("nan"), rule="any_disk")
    assert clear.state == "visible" and clear.lit is True


def test_curvature_lowers_distant_mountain():
    lat0, lon0 = -60.0, 10.0
    near = SyntheticDem(lambda la, lo: np.where(np.abs(_dist_from(lat0, lon0, la, lo) - 20_000) < 150, 2000.0, 0.0))
    far = SyntheticDem(lambda la, lo: np.where(np.abs(_dist_from(lat0, lon0, la, lo) - 150_000) < 150, 2000.0 * 7.5, 0.0))
    hp = HorizonParams(azimuth_step_deg=30, max_radius_m=160_000)
    h_near = compute_horizon(near, lat0, lon0, hp).elevation_deg[0]
    h_far = compute_horizon(far, lat0, lon0, hp).elevation_deg[0]
    # Same height/distance ratio, but the farther one sits lower because of curvature drop (~ d/(2R)).
    flat_angle = math.degrees(math.atan(2000 / 20_000))
    assert h_near == pytest.approx(flat_angle, abs=0.5)
    assert h_far < h_near - 1.5


def test_crater_rim_from_floor():
    lat0, lon0 = -70.0, 100.0

    def crater(lat, lon):
        d = _dist_from(lat0, lon0, lat, lon)
        return np.where(d < 5_000, -2000.0, np.where(d < 6_000, 500.0, 0.0))

    prof = compute_horizon(SyntheticDem(crater), lat0, lon0, HorizonParams(azimuth_step_deg=5, max_radius_m=20_000))
    assert np.all(prof.elevation_deg > 15)  # surrounded by a high rim in every direction


def test_no_data_gap_makes_result_unknown_not_clear():
    lat0, lon0 = -60.0, 10.0

    def gappy(lat, lon):
        d = _dist_from(lat0, lon0, lat, lon)
        return np.where(d > 5_000, np.nan, 0.0)

    prof = compute_horizon(SyntheticDem(gappy), lat0, lon0, HorizonParams(azimuth_step_deg=10, max_radius_m=50_000))
    assert all(s == "truncated" for s in prof.status)
    h, bound = prof.at(45.0)
    assert math.isfinite(bound) and bound > h
    # Sun 1 deg above the known horizon but below what unseen terrain could reach -> unknown
    v = classify(center_el=h + 1.0, radius=0.27, horizon=h, unseen_bound=bound, rule="any_disk")
    assert v.state == "unknown" and v.lit is None
    # Far above any possible terrain -> decisively visible
    v2 = classify(center_el=bound + 5, radius=0.27, horizon=h, unseen_bound=bound, rule="any_disk")
    assert v2.state == "visible"


def test_azimuth_interpolation_wraps():
    dem = SyntheticDem(lambda la, lo: np.zeros_like(la))
    prof = compute_horizon(dem, -60, 10, HorizonParams(azimuth_step_deg=10, max_radius_m=5_000))
    prof.elevation_deg[:] = 0.0
    prof.elevation_deg[-1] = 10.0  # 350 deg
    h, _ = prof.at(355.0)
    assert h == pytest.approx(5.0)


# --- disk / visibility rules ------------------------------------------------
def test_disk_fraction_and_tangency():
    assert disk_fraction_above(1.0, 0.25, 0.0) == 1.0
    assert disk_fraction_above(-1.0, 0.25, 0.0) == 0.0
    assert disk_fraction_above(0.0, 0.25, 0.0) == pytest.approx(0.5)
    # tangency: top limb exactly on the horizon -> blocked
    v = classify(center_el=-0.25, radius=0.25, horizon=0.0, unseen_bound=float("nan"), rule="any_disk")
    assert v.lit is False
    # half disk: lit under any_disk and center rules differs from full_disk
    for rule, lit in [("any_disk", True), ("full_disk", False)]:
        assert classify(0.1, 0.25, 0.0, float("nan"), rule).lit is lit
    assert classify(0.1, 0.25, 0.0, float("nan"), "center").lit is True
    assert classify(-0.1, 0.25, 0.0, float("nan"), "center").lit is False


def test_below_geometric_horizon_vs_terrain_blocked():
    assert classify(-3.0, 0.27, -1.0, float("nan"), "any_disk").state == "below_horizon"
    assert classify(2.0, 0.27, 4.0, float("nan"), "any_disk").state == "terrain_blocked"


# --- intervals --------------------------------------------------------------
def test_interval_refinement_finds_true_boundaries():
    t_on, t_off = 3_333.3, 7_777.7
    f = lambda t: t_on <= t < t_off  # noqa: E731
    for step in (1000, 300, 60):
        times = list(np.arange(0, 10_000 + 1, step, dtype=float))
        ivs = extract_intervals(times, [f(t) for t in times], f, tol_s=1.0)
        assert len(ivs) == 1
        assert ivs[0].start_et == pytest.approx(t_on, abs=1.0)
        assert ivs[0].end_et == pytest.approx(t_off, abs=1.0)
        assert ivs[0].start_refined and ivs[0].end_refined


def test_interval_open_at_edges_and_unknown():
    times = [0.0, 10.0, 20.0, 30.0]
    states = [True, True, None, False]
    f = lambda t: True if t < 15 else (None if t < 25 else False)  # noqa: E731
    ivs = extract_intervals(times, states, f, tol_s=0.5)
    assert [i.kind for i in ivs] == ["visible", "unknown"]
    assert ivs[0].start_refined is False


# --- power --------------------------------------------------------------------
def test_panel_incidence_max_when_aligned_zero_when_facing_away():
    b = enu_basis(-85, 0)
    p = PanelAssumptions(1.0, 0.3, 1.0, "fixed", normal_azimuth_deg=90, normal_elevation_deg=0)
    assert incidence_cosine(p, b, 90, 0) == pytest.approx(1.0)
    assert incidence_cosine(p, b, 270, 0) == 0.0
    assert incidence_cosine(p, b, 180, 0) == pytest.approx(0.0, abs=1e-12)


def test_energy_integration_constant_power():
    t = [0.0, 1800.0, 3600.0]
    assert integrate_wh(t, [100.0, 100.0, 100.0]) == pytest.approx(100.0)


def test_power_formula_and_cap():
    p = PanelAssumptions(2.0, 0.3, 0.9, "two_axis_tracking", max_output_w=500)
    s = irradiance_w_m2(149_597_870.7)
    assert s == pytest.approx(1361.0)
    assert power_w(p, s, 1.0, 1.0) == pytest.approx(min(1361 * 2 * 0.3 * 0.9, 500))
    assert power_w(p, s, 1.0, 0.0) == 0.0


def test_panel_validation_requires_orientation():
    assert PanelAssumptions(1, 0.3, 0.9, "fixed").validate()


# --- real LOLA product ---------------------------------------------------------
lola_available = (DATA / "ldem_75s_240m.img").exists()


@pytest.mark.skipif(not lola_available, reason="LOLA product not downloaded (scripts/fetch_data.sh)")
class TestRealLola:
    dem = PolarDem.open(DATA / "ldem_75s_240m.img", DATA / "ldem_75s_240m.lbl", "lola-ldem-75s-240m-v2") if lola_available else None

    def test_label_keywords_and_scale(self):
        d = self.dem
        assert d.scale_m == 240 and d.lines == 3812 and d.scaling_factor == 0.5
        assert d.radius_ref_m == 1_737_400.0
        assert "DE421" in d.frame_name

    def test_projection_roundtrip(self):
        lat = np.array([-89.9, -85.0, -80.0, -76.0])
        lon = np.array([0.0, 129.78, 271.66, 359.0])
        x, y = self.dem.latlon_to_xy(lat, lon)
        la2, lo2 = self.dem.xy_to_latlon(x, y)
        assert np.allclose(la2, lat, atol=1e-9)
        assert np.allclose(lo2, lon, atol=1e-9)

    def test_known_features(self):
        # Shackleton floor is deep, its rim/pole region high; Shoemaker has a flat ~-3.9 km floor.
        assert self.dem.height_at(-89.67, 129.78) < -2000
        assert self.dem.height_at(-90.0, 0.0) > 1000
        assert -4300 < self.dem.height_at(-88.137, 45.911) < -3500

    def test_outside_coverage_is_null_not_zero(self):
        assert self.dem.height_at(-70.0, 0.0) is None
        assert not self.dem.covers(-74.0)

    def test_scale_applied(self):
        raw = np.fromfile(DATA / "ldem_75s_240m.img", dtype="<i2", count=10, offset=2 * (1905 * 3812 + 1905))
        assert self.dem.data[1905, 1905] == pytest.approx(raw[0] * 0.5)


def test_label_parser_rejects_bad_projection(tmp_path):
    lbl = tmp_path / "x.lbl"
    lbl.write_text(
        'LINES = 2\nLINE_SAMPLES = 2\nSAMPLE_TYPE = LSB_INTEGER\nSAMPLE_BITS = 16\nSCALING_FACTOR = 0.5\nOFFSET = 1737400.\nMAP_PROJECTION_TYPE = "SIMPLE CYLINDRICAL"\nA_AXIS_RADIUS = 1737.4 <km>\nCENTER_LATITUDE = -90\nCENTER_LONGITUDE = 0\nMAP_SCALE = 240\nLINE_PROJECTION_OFFSET = 1\nSAMPLE_PROJECTION_OFFSET = 1\nPOSITIVE_LONGITUDE_DIRECTION = "EAST"\nKEYWORD_LATITUDE_TYPE = "PLANETOCENTRIC"\nMAXIMUM_LATITUDE = -75\nCOORDINATE_SYSTEM_NAME = "X"\n'
    )
    img = tmp_path / "x.img"
    img.write_bytes(b"\0" * 8)
    with pytest.raises(DemValidationError):
        PolarDem.open(img, lbl, "x")
    assert parse_pds3_label('A = 1.5 <km>\nB = "x y"')["A"] == "1.5"


# --- higher-resolution DEM (LDEM_875S_5M) reader path -------------------------
# The PolarDem reader is product-agnostic: any PDS3 polar-stereographic LOLA IMG
# with the required label keywords is accepted. This test builds a tiny synthetic
# 5 m/pixel product and verifies the reader handles a different scale, a tighter
# coverage bound (87.5 S → pole), and the same no-data semantics as the 240 m
# product — proving the LDEM_875S_5M catalogue entry is wired correctly.
class TestHigherResDem:
    @pytest.fixture(scope="class")
    def dem_5m(self, tmp_path_factory):
        d = tmp_path_factory.mktemp("ldem5m")
        img = d / "ldem_875s_5m.img"
        lbl = d / "ldem_875s_5m.lbl"
        # 200 x 200 grid at 5 m/pixel (a small but valid PDS3 polar product).
        lines = samples = 200
        # A gentle ridge so the data is non-trivial.
        yy = np.mgrid[0:lines, 0:samples][0]
        heights = ((yy - 100) * 0.1).astype("int16")  # metres-ish, scaled by 0.5
        img.write_bytes(heights.astype("<i2").tobytes())
        lbl.write_text(
            f'PDS_VERSION_ID = PDS3\n'
            f'LINES = {lines}\nLINE_SAMPLES = {samples}\n'
            f'SAMPLE_TYPE = LSB_INTEGER\nSAMPLE_BITS = 16\n'
            f'SCALING_FACTOR = 0.5 <m/pixel>\nOFFSET = 1737400. <m>\n'
            f'MAP_PROJECTION_TYPE = "POLAR STEREOGRAPHIC"\n'
            f'A_AXIS_RADIUS = 1737.4 <km>\nB_AXIS_RADIUS = 1737.4 <km>\n'
            f'CENTER_LATITUDE = -90.0\nCENTER_LONGITUDE = 0.0\n'
            f'MAP_SCALE = 5.0 <m/pixel>\n'
            f'LINE_PROJECTION_OFFSET = 100.0\nSAMPLE_PROJECTION_OFFSET = 100.0\n'
            f'POSITIVE_LONGITUDE_DIRECTION = "EAST"\n'
            f'KEYWORD_LATITUDE_TYPE = "PLANETOCENTRIC"\n'
            f'MAXIMUM_LATITUDE = -87.5\n'
            f'COORDINATE_SYSTEM_NAME = "MEAN EARTH/POLAR AXIS OF DE421"\n'
            f'DATA_SET_ID = "LRO-L-LOLA-4-GDR-V1.0"\n'
            f'PRODUCT_VERSION_ID = "V1.0"\n'
        )
        return PolarDem.open(img, lbl, "lola-ldem-875s-5m-v1")

    def test_reader_accepts_5m_scale(self, dem_5m):
        assert dem_5m.scale_m == 5.0
        assert dem_5m.lines == 200 and dem_5m.samples == 200
        assert dem_5m.scaling_factor == 0.5
        assert dem_5m.radius_ref_m == 1_737_400.0
        assert dem_5m.max_abs_lat_edge == 87.5
        assert dem_5m.pole == -1

    def test_coverage_gate_is_87_5s(self, dem_5m):
        assert dem_5m.covers(-89.0)
        assert dem_5m.covers(-87.5)
        assert not dem_5m.covers(-87.0)
        assert not dem_5m.covers(-70.0)

    def test_height_at_pole_is_finite_inside_coverage(self, dem_5m):
        # The pole is at the centre of the grid (row=100, col=100).
        h = dem_5m.height_at(-90.0, 0.0)
        assert h is not None and math.isfinite(h)

    def test_outside_coverage_is_null_not_zero(self, dem_5m):
        assert dem_5m.height_at(-70.0, 0.0) is None
        assert dem_5m.height_at(-80.0, 123.0) is None

    def test_metadata_advertises_5m(self, dem_5m):
        md = dem_5m.metadata()
        assert md["productId"] == "lola-ldem-875s-5m-v1"
        assert md["pixelSpacingM"] == 5.0
        assert "87.5" in md["coverage"]

