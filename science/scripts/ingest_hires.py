"""Pre-fetch high-resolution LOLA tiles around every catalogued candidate site.

For each site in src/data/sites.json and each tiled product (5 m south of 87.5 S, 20 m south
of 85 S, 40 m south of 80 S) that covers it, fetch the tiles within RADIUS_M using multipart
byte ranges from the PDS file. Writes data/tiles/manifest.json with per-site coverage.
Usage: cd science && uv run python scripts/ingest_hires.py [radius_m]
"""

from __future__ import annotations

import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "science"))
from moonnav_science.analysis import MULTIRES_ID, NEAR_FIELD_M, TILE_CACHE, get_dem  # noqa: E402

radius = float(sys.argv[1]) if len(sys.argv) > 1 else NEAR_FIELD_M + 1500.0
sites = json.loads((ROOT / "src/data/sites.json").read_text())["sites"]
dem = get_dem(MULTIRES_ID)
report = []
for s in sites:
    t0 = time.time()
    res = dem.prepare(s["latitudeDeg"], s["longitudeEastDeg"], radius)
    finest = dem.near_scale(s["latitudeDeg"], s["longitudeEastDeg"])
    report.append(
        {
            "site": s["key"],
            "latitudeDeg": s["latitudeDeg"],
            "longitudeEastDeg": s["longitudeEastDeg"],
            "finestResolutionM": finest,
            "layers": res,
            "seconds": round(time.time() - t0, 1),
        }
    )
    print(f"{s['key']:<14} finest {finest:>5.0f} m  {res}", flush=True)
manifest = {
    "generatedAtUtc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "radiusM": radius,
    "products": [lyr.metadata() for lyr in dem.tiled],
    "sites": report,
}
(TILE_CACHE / "manifest.json").write_text(json.dumps(manifest, indent=1))
print("manifest written:", TILE_CACHE / "manifest.json")
