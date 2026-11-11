"""Disk-vs-terrain visibility states and refined visibility intervals."""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

VisibilityRule = Literal["any_disk", "full_disk", "center"]
State = Literal["visible", "partial", "terrain_blocked", "below_horizon", "unknown"]


@dataclass(frozen=True)
class VisibilitySample:
    state: State
    lit: bool | None  # under the selected rule; None = unknown
    visible_fraction: float | None  # fraction of the disk area above the terrain line
    clearance_deg: float | None  # center elevation - terrain horizon
    horizon_deg: float | None


def disk_fraction_above(center_el: float, radius: float, horizon: float) -> float:
    """Fraction of a disk's area above a locally straight horizon line."""
    if radius <= 0:
        return 1.0 if center_el > horizon else 0.0
    d = max(-1.0, min(1.0, (center_el - horizon) / radius))
    return 1.0 - (math.acos(d) - d * math.sqrt(1.0 - d * d)) / math.pi


def _simple(center_el: float, radius: float, horizon: float, rule: VisibilityRule) -> VisibilitySample:
    top, bottom = center_el + radius, center_el - radius
    if top <= horizon:
        state: State = "below_horizon" if top <= 0.0 else "terrain_blocked"
        return VisibilitySample(state, False, 0.0, center_el - horizon, horizon)
    if bottom >= horizon:
        return VisibilitySample("visible", True, 1.0, center_el - horizon, horizon)
    frac = disk_fraction_above(center_el, radius, horizon)
    lit = {"any_disk": True, "full_disk": False, "center": bool(center_el > horizon)}[rule]
    return VisibilitySample("partial", lit, frac, center_el - horizon, horizon)


def classify(center_el: float, radius: float, horizon: float, unseen_bound: float, rule: VisibilityRule) -> VisibilitySample:
    """Compare a body's disk with the terrain horizon at its azimuth.

    `unseen_bound` is the steepest elevation any terrain beyond DEM coverage
    could reach (NaN if the ray is fully covered). The result is computed for
    the known horizon and for the worst case (horizon raised to the bound);
    if the two disagree the state is unknown, never "visible".
    """
    if not math.isfinite(horizon):
        return VisibilitySample("unknown", None, None, None, None)
    known = _simple(center_el, radius, horizon, rule)
    if math.isfinite(unseen_bound) and unseen_bound > horizon:
        worst = _simple(center_el, radius, unseen_bound, rule)
        if worst.lit != known.lit or worst.state != known.state:
            return VisibilitySample("unknown", None, None, known.clearance_deg, horizon)
    return known


@dataclass
class Interval:
    start_et: float
    end_et: float
    kind: Literal["visible", "unknown"]
    start_refined: bool
    end_refined: bool


def tri(v: object) -> bool | None:
    """Normalise numpy/Python truthy values to plain True/False/None."""
    return None if v is None else bool(v)


def refine_transition(f: Callable[[float], bool | None], t0: float, t1: float, v0: bool | None, tol_s: float) -> float:
    """Bisection on a state change between t0 (state v0) and t1."""
    a, b = t0, t1
    v0 = tri(v0)
    while b - a > tol_s:
        m = 0.5 * (a + b)
        if tri(f(m)) is v0:
            a = m
        else:
            b = m
    return 0.5 * (a + b)


def extract_intervals(times: list[float], states: list[bool | None], f: Callable[[float], bool | None], tol_s: float) -> list[Interval]:
    """Build visible / unknown intervals from coarse samples, refining each
    boundary with bisection to `tol_s` seconds."""
    out: list[Interval] = []
    if not times:
        return out
    states = [tri(s) for s in states]
    times = [float(t) for t in times]
    n = len(times)
    i = 0
    while i < n:
        s = states[i]
        if s is False:
            i += 1
            continue
        kind: Literal["visible", "unknown"] = "visible" if s else "unknown"
        j = i
        while j + 1 < n and states[j + 1] is s:
            j += 1
        if i == 0:
            start, sr = times[0], False
        else:
            start, sr = refine_transition(f, times[i - 1], times[i], states[i - 1], tol_s), True
        if j == n - 1:
            end, er = times[-1], False
        else:
            end, er = refine_transition(f, times[j], times[j + 1], s, tol_s), True
        out.append(Interval(start, end, kind, sr, er))
        i = j + 1
    return out
