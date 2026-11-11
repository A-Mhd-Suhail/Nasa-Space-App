"""Fetch JPL Horizons observer tables used as independent reference fixtures.

Run: uv run python scripts/fetch_horizons_fixtures.py
Stores raw request parameters and raw responses (never edited) in tests/fixtures/.
"""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from moonnav_science.ephemeris import HORIZONS_API, horizons_params  # noqa: E402

CASES = [
    # name, lat, lon_east, height_km
    ("south_pole", -90.0, 0.0, 1.2966),
    ("mons_mouton", -84.6, 31.0, 5.04252),
    ("shackleton_rim_like", -89.45, 222.69, 1.5),
]
OUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures"

for name, lat, lon, hkm in CASES:
    for target in ("SUN", "EARTH"):
        params = horizons_params(target, lat, lon, hkm, "2026-11-15 00:00", "2026-11-22 00:00", "12 h")
        r = httpx.get(HORIZONS_API, params=params, timeout=60)
        r.raise_for_status()
        stem = f"horizons_{name}_{target.lower()}"
        (OUT / f"{stem}.txt").write_text(r.text)
        (OUT / f"{stem}.request.json").write_text(
            json.dumps(
                {
                    "url": HORIZONS_API,
                    "params": params,
                    "site": {"lat": lat, "lonEast": lon, "heightKm": hkm},
                    "retrievedAtUtc": datetime.now(UTC).isoformat(timespec="seconds"),
                    "httpStatus": r.status_code,
                },
                indent=2,
            )
        )
        print(stem, r.status_code, len(r.text))
