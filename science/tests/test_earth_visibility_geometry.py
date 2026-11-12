"""Earth visibility and DTE-window geometry with analytically known answers (Earth disk radius ~0.95 deg)."""

from __future__ import annotations

import math

import pytest

from moonnav_science.visibility import classify, disk_fraction_above, extract_intervals

R_EARTH = 0.95  # deg, typical Earth angular radius from the Moon


def lit(el: float, horizon: float, rule: str = "any_disk") -> bool | None:
    return classify(el, R_EARTH, horizon, float("nan"), rule).lit  # type: ignore[arg-type]


def test_earth_blocked_by_a_ridge_exactly_when_the_whole_disk_is_under_the_ridge_line() -> None:
    horizon = 2.0  # a ridge subtending 2 deg towards Earth
    assert classify(horizon + R_EARTH + 0.01, R_EARTH, horizon, float("nan"), "any_disk").state == "visible"
    assert classify(horizon + R_EARTH - 0.01, R_EARTH, horizon, float("nan"), "any_disk").state == "partial"
    assert classify(horizon - R_EARTH - 0.01, R_EARTH, horizon, float("nan"), "any_disk").state == "terrain_blocked"
    assert (
        classify(-R_EARTH - 0.2, R_EARTH, 0.0, float("nan"), "any_disk").state == "below_horizon"
    )  # geometrically below, no terrain involved


def test_partial_earth_disk_fraction_is_the_circular_segment_area() -> None:
    assert disk_fraction_above(5.0, R_EARTH, 5.0) == pytest.approx(0.5, abs=1e-12)  # horizon through the centre
    # horizon at 1/2 radius above centre: segment area fraction = (acos(0.5) - 0.5 sqrt(0.75)) / pi
    expect_visible = (math.acos(0.5) - 0.5 * math.sqrt(0.75)) / math.pi
    assert disk_fraction_above(5.0, R_EARTH, 5.0 + 0.5 * R_EARTH) == pytest.approx(expect_visible, abs=1e-12)
    assert disk_fraction_above(5.0, R_EARTH, 5.0 - R_EARTH) == pytest.approx(1.0) and disk_fraction_above(
        5.0, R_EARTH, 5.0 + R_EARTH
    ) == pytest.approx(0.0)


def test_visibility_rules_differ_only_in_the_partial_zone() -> None:
    e, h = 1.5, 1.0  # disk straddles the horizon line (partial)
    assert lit(e, h, "any_disk") is True and lit(e, h, "full_disk") is False and lit(e, h, "center") is True
    assert lit(0.5, 1.0, "center") is False  # centre below the line but disk partly above
    assert lit(10.0, 1.0, "full_disk") is True and lit(-5.0, 1.0, "any_disk") is False


def test_unknown_terrain_beyond_dem_coverage_never_reports_visible() -> None:
    s = classify(3.0, R_EARTH, 1.0, 6.0, "any_disk")  # known horizon 1 deg, unseen terrain could reach 6 deg
    assert s.state == "unknown" and s.lit is None
    assert classify(30.0, R_EARTH, 1.0, 6.0, "any_disk").state == "visible"  # clear even in the worst case
    assert classify(3.0, R_EARTH, float("nan"), float("nan"), "any_disk").state == "unknown"


def test_multiple_dte_windows_and_crossing_times_match_the_analytic_roots() -> None:
    """Earth elevation e(t) = 6 sin(2 pi t / T) over two periods; terrain horizon 1 deg: lit when e + r > 1."""
    period, amp, horizon = 86_400.0, 6.0, 1.0
    f = lambda t: (amp * math.sin(2 * math.pi * t / period) + R_EARTH) > horizon  # noqa: E731
    times = [i * 1800.0 for i in range(0, 2 * 48 + 1)]  # 30-minute samples over two days
    iv = [i for i in extract_intervals(times, [f(t) for t in times], f, 1.0) if i.kind == "visible"]
    assert len(iv) == 2  # two separate windows, each starting at the rising crossing
    s = math.asin((horizon - R_EARTH) / amp)  # asin(0.05/6)
    for k, w in enumerate(iv):
        rise = k * period + period * s / (2 * math.pi)
        fall = k * period + period * (math.pi - s) / (2 * math.pi)
        assert w.start_et == pytest.approx(rise, abs=1.0) and w.end_et == pytest.approx(fall, abs=1.0)  # within the 1 s tolerance
        assert w.end_et - w.start_et == pytest.approx(period * (math.pi - 2 * s) / (2 * math.pi), abs=2.0)  # window duration
        assert w.start_refined and w.end_refined
    # the coarse 30-minute sampling alone would put the edges up to 1800 s away: refinement is what makes them exact
    first_sample_in = next(t for t in times if f(t))
    assert abs(first_sample_in - iv[0].start_et) > 1.0


def test_window_clipped_by_the_analysis_bounds_is_flagged_unrefined() -> None:
    f = lambda t: t < 3600.0  # noqa: E731  Earth visible only at the very start
    times = [i * 600.0 for i in range(0, 13)]
    (w,) = [i for i in extract_intervals(times, [f(t) for t in times], f, 1.0) if i.kind == "visible"]
    assert w.start_et == 0.0 and not w.start_refined and w.end_refined and w.end_et == pytest.approx(3600.0, abs=1.0)
