"""Slope / roughness / relief on synthetic terrain with analytic answers (screening.slope_roughness)."""

from __future__ import annotations

import math

import numpy as np
import pytest

from moonnav_science.screening import slope_roughness

DX = 10.0


def grid(n: int = 81) -> tuple[np.ndarray, np.ndarray]:  # type: ignore[type-arg]
    c = (np.arange(n) - n // 2) * DX
    return np.meshgrid(c, c)


def test_flat_terrain_has_zero_slope_zero_roughness_zero_relief() -> None:
    x, _ = grid()
    s, r, rel, _ = slope_roughness(np.full_like(x, 1234.5), DX)
    inner = (slice(2, -2), slice(2, -2))
    assert (
        np.nanmax(s[inner]) == pytest.approx(0.0, abs=1e-9)
        and np.nanmax(r[inner]) == pytest.approx(0.0, abs=1e-9)
        and np.nanmax(rel[inner]) == 0.0
    )


def test_gaussian_crater_slope_matches_the_analytic_maximum_and_a_flat_floor() -> None:
    x, y = grid(201)
    depth, sigma = 100.0, 300.0
    r = np.hypot(x, y)
    h = -depth * np.exp(-(r**2) / (2 * sigma**2))
    s, _, relief, _ = slope_roughness(h, DX)
    analytic_max = math.degrees(math.atan(depth / sigma * math.exp(-0.5)))  # steepest at r = sigma
    assert np.nanmax(s) == pytest.approx(analytic_max, abs=0.15)
    ring = np.hypot(x, y)[np.nanargmax(s) // s.shape[1], np.nanargmax(s) % s.shape[1]] if False else None  # noqa: F841
    iy, ix = np.unravel_index(np.nanargmax(s), s.shape)
    assert abs(r[iy, ix] - sigma) < 4 * DX  # the steepest wall is on the ring r ~ sigma
    assert s[100, 100] < 0.05  # crater floor centre is flat
    assert np.nanmax(relief) > 0


def test_known_slope_plane_is_recovered_in_every_direction() -> None:
    x, y = grid()
    for slope in (3.0, 12.0, 25.0):
        t = math.tan(math.radians(slope))
        h = t * (0.6 * x + 0.8 * y)  # |grad| = t
        s, rough, _, _ = slope_roughness(h, DX)
        assert np.nanmedian(s) == pytest.approx(slope, abs=1e-6) and np.nanmax(rough) < 1e-9  # a plane has no roughness


def test_roughness_of_white_noise_matches_the_plane_fit_residual_theory() -> None:
    rng = np.random.default_rng(5)
    x, _ = grid(161)
    sigma = 0.30  # metres of noise on a flat surface
    h = rng.normal(0.0, sigma, x.shape)
    _, rough, _, _ = slope_roughness(h, DX)
    # RMS of residuals from a 3x3 plane fit: sigma * sqrt((9 - 3) / 9) in expectation
    assert np.nanmean(rough) == pytest.approx(sigma * math.sqrt(6.0 / 9.0), rel=0.06)


def test_no_data_and_grid_edges_are_nan_never_zero() -> None:
    x, _ = grid()
    h = np.zeros_like(x)
    h[40, 40] = np.nan
    s, r, rel, lap = slope_roughness(h, DX)
    for a in (s, r, rel, lap):
        assert np.isnan(a[0, :]).all() and np.isnan(a[:, 0]).all() and np.isnan(a[-1, :]).all() and np.isnan(a[:, -1]).all()  # boundary
        assert (
            np.isnan(a[40, 40]) and np.isnan(a[39, 40]) and np.isnan(a[41, 40]) and np.isnan(a[40, 39]) and np.isnan(a[40, 41])
        )  # hole + 4-neighbours
        assert np.isfinite(a[20, 20])
    # slope uses 4-neighbour central differences, so diagonal cells stay valid; roughness and relief use the full 3x3 stencil
    assert np.isfinite(s[39, 39]) and np.isnan(r[39:42, 39:42]).all() and np.isnan(rel[39:42, 39:42]).all()
