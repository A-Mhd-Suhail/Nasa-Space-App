"""Curvature-aware terrain horizon profile from a DEM.

For each azimuth bin a ray is traced along the great circle leaving the site.
Each sample is placed at its true 3D body-fixed position
(reference radius + DEM height) and its elevation angle is measured from the
observer in the local ENU frame. The horizon is the maximum elevation angle
along the ray. Rays that leave DEM coverage are "truncated": the profile then
carries an upper bound for terrain beyond the coverage edge so visibility can
be reported as unknown instead of clear.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal, Protocol

import numpy as np
from numpy.typing import NDArray

from .geometry import enu_basis, lat_lon_from_vectors

# Upper bound for any lunar topography relative to the 1737.4 km sphere
# (the highest point on the Moon is about +10.8 km). Used only for bounding
# the effect of terrain beyond DEM coverage.
MAX_LUNAR_HEIGHT_BOUND_M = 11_000.0


class HeightSampler(Protocol):
    radius_ref_m: float
    scale_m: float

    def sample_height(self, lat: NDArray[np.float64], lon: NDArray[np.float64]) -> NDArray[np.float64]: ...


RayStatus = Literal["complete", "truncated"]


@dataclass
class HorizonParams:
    azimuth_step_deg: float = 0.5
    max_radius_m: float = 300_000.0
    radial_step_m: float | None = None  # default = DEM pixel spacing
    min_distance_m: float | None = None  # default = DEM pixel spacing
    observer_height_m: float = 2.0
    interpolation: str = "bilinear"

    def as_dict(self) -> dict[str, object]:
        return {
            "azimuthStepDeg": self.azimuth_step_deg,
            "maxRadiusM": self.max_radius_m,
            "radialStepM": self.radial_step_m,
            "minDistanceM": self.min_distance_m,
            "observerHeightM": self.observer_height_m,
            "interpolation": self.interpolation,
            "curvature": "true 3D body-fixed geometry on 1737.4 km reference sphere",
        }


@dataclass
class HorizonProfile:
    azimuths_deg: NDArray[np.float64]
    elevation_deg: NDArray[np.float64]  # max over covered part of the ray
    blocking_distance_m: NDArray[np.float64]
    coverage_distance_m: NDArray[np.float64]
    status: list[RayStatus]
    beyond_bound_deg: NDArray[np.float64]  # max possible elevation of unseen terrain (NaN if complete)
    site_height_m: float
    observer_radius_m: float
    params: HorizonParams
    notes: list[str] = field(default_factory=list)

    def at(self, azimuth_deg: float) -> tuple[float, float]:
        """Linear interpolation in azimuth. Returns (horizon_deg, unseen_bound_deg|nan)."""
        step = self.params.azimuth_step_deg
        n = len(self.azimuths_deg)
        x = (azimuth_deg % 360.0) / step
        i0 = int(math.floor(x)) % n
        i1 = (i0 + 1) % n
        f = x - math.floor(x)
        h = (1 - f) * self.elevation_deg[i0] + f * self.elevation_deg[i1]
        b0, b1 = self.beyond_bound_deg[i0], self.beyond_bound_deg[i1]
        if math.isnan(b0) and math.isnan(b1):
            bound = math.nan
        else:
            bound = float(np.nanmax([b0, b1]))
        return float(h), bound

    def to_dict(self) -> dict[str, object]:
        def clean(a: NDArray[np.float64], nd: int = 4) -> list[float | None]:
            return [None if not np.isfinite(v) else round(float(v), nd) for v in a]

        return {
            "azimuthsDeg": clean(self.azimuths_deg, 3),
            "elevationDeg": clean(self.elevation_deg),
            "blockingDistanceM": clean(self.blocking_distance_m, 0),
            "coverageDistanceM": clean(self.coverage_distance_m, 0),
            "status": self.status,
            "unseenTerrainBoundDeg": clean(self.beyond_bound_deg),
            "siteHeightM": round(self.site_height_m, 2),
            "observerRadiusM": round(self.observer_radius_m, 2),
            "params": self.params.as_dict(),
            "truncatedRayCount": int(sum(1 for s in self.status if s == "truncated")),
            "notes": self.notes,
        }


def _elev_angle(obs_r: float, sample_r: NDArray[np.float64], delta: NDArray[np.float64]) -> NDArray[np.float64]:
    """Elevation angle (deg) from observer at radius obs_r to a point at radius sample_r,
    separated by central angle delta (rad), in the vertical plane of the great circle."""
    up = sample_r * np.cos(delta) - obs_r
    horiz = sample_r * np.sin(delta)
    return np.degrees(np.arctan2(up, horiz))


def compute_horizon(dem: HeightSampler, lat_deg: float, lon_deg: float, params: HorizonParams | None = None, site_height_m: float | None = None) -> HorizonProfile:
    p = params or HorizonParams()
    R = dem.radius_ref_m
    step = p.radial_step_m or dem.scale_m
    dmin = p.min_distance_m or dem.scale_m
    site_h = float(dem.sample_height(np.array([lat_deg]), np.array([lon_deg]))[0]) if site_height_m is None else float(site_height_m)
    if not math.isfinite(site_h):
        raise ValueError("site is outside DEM coverage or on a no-data pixel")
    obs_r = R + site_h + p.observer_height_m

    basis = enu_basis(lat_deg, lon_deg)
    az = np.arange(0.0, 360.0, p.azimuth_step_deg)
    dists = np.arange(dmin, p.max_radius_m + 0.5 * step, step)
    delta = dists / R  # central angle on the reference sphere

    azr = np.radians(az)[:, None]
    dirs = np.sin(azr)[..., None] * basis.east + np.cos(azr)[..., None] * basis.north  # (A,1,3)
    pts = np.cos(delta)[None, :, None] * basis.up + np.sin(delta)[None, :, None] * dirs  # (A,D,3)
    lat, lon = lat_lon_from_vectors(pts)
    h = dem.sample_height(lat, lon)  # (A,D) with NaN where not covered

    elev = _elev_angle(obs_r, R + h, delta[None, :])
    valid = np.isfinite(elev)
    # A ray is covered up to its first invalid sample.
    first_bad = np.where(valid.all(axis=1), len(dists), np.argmin(valid, axis=1))
    masked = np.where(np.arange(len(dists))[None, :] < first_bad[:, None], elev, -np.inf)
    idx = np.argmax(masked, axis=1)
    hmax = masked[np.arange(len(az)), idx]
    hmax = np.where(np.isfinite(hmax), hmax, np.nan)
    block_d = np.where(np.isfinite(hmax), dists[idx], np.nan)
    cover_d = np.where(first_bad > 0, dists[np.maximum(first_bad - 1, 0)], 0.0)

    status: list[RayStatus] = ["complete" if fb == len(dists) else "truncated" for fb in first_bad]
    bound = np.full(len(az), np.nan)
    for i, fb in enumerate(first_bad):
        if fb < len(dists):
            # Steepest elevation any terrain (<= MAX bound) could have beyond coverage.
            rest = delta[fb:]
            b = _elev_angle(obs_r, np.full(rest.shape, R + MAX_LUNAR_HEIGHT_BOUND_M), rest)
            bound[i] = float(np.max(b))
    notes = []
    n_trunc = sum(1 for s in status if s == "truncated")
    if n_trunc:
        notes.append(f"{n_trunc} of {len(az)} azimuth rays leave DEM coverage before {p.max_radius_m / 1000:.0f} km")
    return HorizonProfile(az, hmax, block_d, cover_d, status, bound, site_h, obs_r, p, notes)


class _Sampler:
    def __init__(self, fn, scale_m: float, radius_ref_m: float) -> None:  # type: ignore[no-untyped-def]
        self.sample_height = fn
        self.scale_m = scale_m
        self.radius_ref_m = radius_ref_m


def compute_horizon_multires(
    composite: HeightSampler, base: HeightSampler, near_scale_m: float, lat_deg: float, lon_deg: float, params: HorizonParams, near_radius_m: float = 6000.0
) -> HorizonProfile:
    """Two-pass horizon: near field from the finest DEM, far field from the base DEM.

    Pass 1 samples `composite` (finest available product, falling back to `base`) every
    2 x near_scale_m out to `near_radius_m`. Pass 2 samples `base` from `near_radius_m`
    to params.max_radius_m at its own spacing. Both passes use the same observer (site
    height from the finest product), so the per-azimuth horizon is the maximum of the two.
    Coverage truncation is inherited from the far-field (base) pass.
    """
    site_h = float(composite.sample_height(np.array([lat_deg]), np.array([lon_deg]))[0])
    if not math.isfinite(site_h):
        raise ValueError("site is outside DEM coverage or on a no-data pixel")
    near_step = 2.0 * near_scale_m
    near_p = HorizonParams(azimuth_step_deg=params.azimuth_step_deg, max_radius_m=near_radius_m, radial_step_m=near_step, min_distance_m=near_step, observer_height_m=params.observer_height_m)
    far_p = HorizonParams(azimuth_step_deg=params.azimuth_step_deg, max_radius_m=params.max_radius_m, radial_step_m=base.scale_m, min_distance_m=near_radius_m, observer_height_m=params.observer_height_m)
    near = compute_horizon(_Sampler(composite.sample_height, near_scale_m, composite.radius_ref_m), lat_deg, lon_deg, near_p, site_height_m=site_h)
    far = compute_horizon(base, lat_deg, lon_deg, far_p, site_height_m=site_h)
    n_el = np.nan_to_num(near.elevation_deg, nan=-np.inf)
    f_el = np.nan_to_num(far.elevation_deg, nan=-np.inf)
    use_near = n_el >= f_el
    elev = np.where(use_near, n_el, f_el)
    elev = np.where(np.isfinite(elev), elev, np.nan)
    block = np.where(use_near, near.blocking_distance_m, far.blocking_distance_m)
    p = HorizonParams(azimuth_step_deg=params.azimuth_step_deg, max_radius_m=params.max_radius_m, radial_step_m=None, min_distance_m=near_step, observer_height_m=params.observer_height_m, interpolation="bilinear")
    notes = list(far.notes) + [
        f"near field 0-{near_radius_m / 1000:.0f} km sampled every {near_step:.0f} m from the finest available LOLA product; far field to {params.max_radius_m / 1000:.0f} km from the {base.scale_m:.0f} m product",
        f"{int(np.sum(use_near & np.isfinite(elev)))} of {len(elev)} azimuths are set by near-field terrain",
    ]
    return HorizonProfile(near.azimuths_deg, elev, block, far.coverage_distance_m, far.status, far.beyond_bound_deg, site_h, near.observer_radius_m, p, notes)
