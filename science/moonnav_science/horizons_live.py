"""Live JPL Horizons cross-check of the SPICE runtime ephemeris.

SPICE (spkcpo in MOON_ME) stays the runtime provider. This module asks the JPL Horizons
API for the apparent (airless) azimuth/elevation of the Sun and Earth seen from the same
lunar surface site and reports the angular separation at each epoch. It is an
independent validation, never a silent substitute: if Horizons is unreachable the
check reports "unavailable" and the SPICE results are unchanged.

Fair use: requests are sequential (Sun, then Earth), bounded to MAX_ROWS rows, cached
in-process by their exact parameters, retried with exponential backoff only on
429/5xx/timeouts, and identified with an application-specific User-Agent.
API reference: https://ssd-api.jpl.nasa.gov/doc/horizons.html
"""

from __future__ import annotations

import math
import time
from collections import OrderedDict
from datetime import UTC, datetime
from typing import Any, Literal

import httpx

from . import SOFTWARE_VERSION
from .ephemeris import HORIZONS_API, SpiceEphemeris, Target, angular_separation_deg, horizons_params, parse_horizons_azel
from .geometry import MOON_REFERENCE_RADIUS_M, enu_basis, normalize_lon_east, site_vector_m, validate_lat
from .kernels import parse_utc, utc_to_et

USER_AGENT = f"MoonNav/{SOFTWARE_VERSION} (NASA Space Apps lunar site navigator; research prototype)"
MAX_ROWS = 200
TIMEOUT_S = 30.0
RETRIES = 3
PASS_DEG = 0.01  # agreement required for "pass"
WARN_DEG = 0.05  # beyond this the check "fails"

_MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
_CACHE_MAX = 128


class HorizonsUnavailable(RuntimeError):
    pass


def horizons_time_to_iso(h: str) -> str:
    d, t = h.split()
    y, mon, day = d.split("-")
    if t.count(":") == 1:
        t += ":00"
    return f"{y}-{_MONTHS[mon]:02d}-{day}T{t}Z"


def _fmt(utc: str) -> str:
    return parse_utc(utc).strftime("%Y-%m-%d %H:%M")


def fetch_azel(
    target: Target, lat: float, lon_east: float, height_km: float, start_utc: str, stop_utc: str, step: str, client: httpx.Client | None = None
) -> tuple[list[tuple[str, float, float]], dict[str, Any]]:
    """Fetch an apparent az/el observer table from Horizons. Returns (rows, meta)."""
    params = horizons_params(target, lat, lon_east, height_km, _fmt(start_utc), _fmt(stop_utc), step)
    params["format"] = "json"
    key = repr(sorted(params.items()))
    if key in _CACHE:
        _CACHE.move_to_end(key)
        hit = _CACHE[key]
        return hit["rows"], {**hit["meta"], "cache": "hit"}
    own = client is None
    c = client or httpx.Client(timeout=TIMEOUT_S, headers={"User-Agent": USER_AGENT})
    last_err = "unknown error"
    try:
        for attempt in range(RETRIES):
            try:
                r = c.get(HORIZONS_API, params=params)
            except httpx.HTTPError as exc:  # timeout / network
                last_err = f"{type(exc).__name__}"
            else:
                if r.status_code == 200:
                    data = r.json()
                    if "error" in data:
                        raise HorizonsUnavailable(f"Horizons rejected the request: {str(data['error'])[:200]}")
                    rows = parse_horizons_azel(str(data.get("result", "")))
                    if not rows:
                        raise HorizonsUnavailable("Horizons returned no ephemeris rows")
                    meta = {
                        "apiVersion": (data.get("signature") or {}).get("version"),
                        "source": (data.get("signature") or {}).get("source"),
                        "retrievedAtUtc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "request": {k: v.strip("'") for k, v in params.items()},
                    }
                    _CACHE[key] = {"rows": rows, "meta": meta}
                    if len(_CACHE) > _CACHE_MAX:
                        _CACHE.popitem(last=False)
                    return rows, {**meta, "cache": "miss"}
                if r.status_code not in (429, 500, 502, 503, 504):
                    raise HorizonsUnavailable(f"Horizons HTTP {r.status_code}")
                last_err = f"HTTP {r.status_code}"
            time.sleep(min(8.0, 1.5 * 2**attempt))
    finally:
        if own:
            c.close()
    raise HorizonsUnavailable(f"Horizons unreachable after {RETRIES} attempts ({last_err})")


def plan_step(start_utc: str, stop_utc: str, samples: int) -> str:
    """Horizons step string giving about `samples` rows (minute resolution, bounded)."""
    span_min = (parse_utc(stop_utc) - parse_utc(start_utc)).total_seconds() / 60.0
    if span_min <= 0:
        raise ValueError("stop must be after start")
    n = max(2, min(samples, MAX_ROWS))
    return f"{max(1, math.ceil(span_min / (n - 1)))}m"


def cross_check(lat: float, lon_east: float, height_m: float, start_utc: str, stop_utc: str, samples: int = 13) -> dict[str, Any]:
    validate_lat(lat)
    lon_east = normalize_lon_east(lon_east)
    step = plan_step(start_utc, stop_utc, samples)
    site_km = site_vector_m(lat, lon_east, MOON_REFERENCE_RADIUS_M + height_m) / 1000.0
    eph = SpiceEphemeris(site_km, enu_basis(lat, lon_east), "LT+S")
    out: dict[str, Any] = {
        "site": {"latitudeDeg": lat, "longitudeEastDeg": lon_east, "heightM": height_m, "heightReference": "1737.4 km sphere (Horizons GEODETIC on the IAU Moon sphere)"},
        "window": {"startUtc": start_utc, "stopUtc": stop_utc, "step": step},
        "method": "Apparent airless az/el: Horizons QUANTITIES=4 (CENTER=coord@301, COORD_TYPE=GEODETIC) vs SPICE spkcpo LT+S in MOON_ME; separation = great-circle angle",
        "thresholdsDeg": {"pass": PASS_DEG, "warn": WARN_DEG},
        "bodies": {},
    }
    worst = 0.0
    with httpx.Client(timeout=TIMEOUT_S, headers={"User-Agent": USER_AGENT}) as client:
        for target in ("SUN", "EARTH"):
            rows, meta = fetch_azel(target, lat, lon_east, height_m / 1000.0, start_utc, stop_utc, step, client)  # type: ignore[arg-type]
            cmp_rows = []
            for utc_h, az_h, el_h in rows[:MAX_ROWS]:
                utc = horizons_time_to_iso(utc_h)
                g = eph.geometry(target, utc_to_et(utc))  # type: ignore[arg-type]
                sep = angular_separation_deg(g.azimuth_deg, g.elevation_deg, az_h, el_h)
                cmp_rows.append({"utc": utc, "horizons": {"azDeg": az_h, "elDeg": el_h}, "spice": {"azDeg": round(g.azimuth_deg, 6), "elDeg": round(g.elevation_deg, 6)}, "separationDeg": round(sep, 6)})
            seps = [r["separationDeg"] for r in cmp_rows]
            mx = max(seps) if seps else math.nan
            worst = max(worst, mx)
            out["bodies"][target.lower()] = {"rows": cmp_rows, "maxSeparationDeg": mx, "meanSeparationDeg": sum(seps) / len(seps) if seps else None, "horizons": meta}
    status: Literal["pass", "warn", "fail"] = "pass" if worst < PASS_DEG else "warn" if worst < WARN_DEG else "fail"
    out["maxSeparationDeg"] = worst
    out["status"] = status
    out["checkedAtUtc"] = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    return out
