"""Build 2D map overlays from the LOLA team's illumination products (display only).

public/data/lola_psr_75s_240m.png       PSR mask: a 240 m display cell is shaded if >= 2 of its 4 120 m source
                                        pixels are permanent shadow; transparent elsewhere; grey outside coverage corners.
public/data/lola_avgsun_75s_240m.webp   18.6-year average solar visibility (2x2 mean of the 120 m product).
public/data/illumination_meta.json      provenance, display rule and checksums.
Point queries in the app use the full 120 m products (science/moonnav_science/illumination.py).
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "science"))
from moonnav_science.illumination import SOURCE, raster  # noqa: E402

DATA = ROOT / "data"
OUT = ROOT / "public/data"
psr, sun = raster("psr", DATA), raster("sun", DATA)
assert psr is not None and sun is not None, "run scripts/fetch_illumination.py first"
n = psr.lines // 2

# Coverage mask: inside the labelled 75 S bound (circle inscribed in the square grid).
yy, xx = np.mgrid[0:n, 0:n]
rho = np.hypot((xx + 0.5 - n / 2) * 240.0, (yy + 0.5 - n / 2) * 240.0)
lat_edge = -psr.max_abs_lat_edge
rho_edge = 2 * psr.radius_ref_m * np.tan(np.pi / 4 + np.radians(lat_edge) / 2)
inside = rho <= rho_edge

p = (np.asarray(psr.data, dtype=np.int32) > 0).reshape(n, 2, n, 2).sum(axis=(1, 3))  # count of PSR sub-pixels (0..4)
mask = (p >= 2) & inside
rgba = np.zeros((n, n, 4), dtype=np.uint8)
rgba[mask] = (60, 92, 176, 215)  # cool blue, distinct from the warm terrain palette
buf = io.BytesIO()
Image.fromarray(rgba, "RGBA").save(buf, format="PNG", optimize=True)
(OUT / "lola_psr_75s_240m.png").write_bytes(buf.getvalue())
psr_sha = hashlib.sha256(buf.getvalue()).hexdigest()

v = (np.asarray(sun.data, dtype=np.float64) * sun.value_scale + sun.value_offset).reshape(n, 2, n, 2).mean(axis=(1, 3))
t = np.clip(v, 0, 1)
stops = np.array([[20, 22, 40], [60, 50, 110], [170, 90, 70], [235, 175, 70], [255, 245, 200]], dtype=np.float64)
x = t * (len(stops) - 1)
i = np.minimum(np.floor(x).astype(int), len(stops) - 2)
f = (x - i)[..., None]
rgb = stops[i] * (1 - f) + stops[i + 1] * f
a = np.where(inside, 205, 0).astype(np.uint8)
img = np.dstack([rgb.astype(np.uint8), a])
buf = io.BytesIO()
Image.fromarray(img, "RGBA").save(buf, format="WEBP", quality=88, method=6)
(OUT / "lola_avgsun_75s_240m.webp").write_bytes(buf.getvalue())
sun_sha = hashlib.sha256(buf.getvalue()).hexdigest()

meta = {
    "kind": "moonnav.illumination-layers",
    "generatedAtUtc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "source": SOURCE,
    "extentM": [-457440.0, -457440.0, 457440.0, 457440.0],
    "displayResolutionM": 240.0,
    "sourceResolutionM": psr.scale_m,
    "layers": {
        "psr": {
            "file": "/data/lola_psr_75s_240m.png",
            "sha256": psr_sha,
            "product": psr.metadata()["product"],
            "productVersion": psr.metadata()["productVersion"],
            "displayRule": "240 m display cell shaded when >= 2 of 4 source 120 m pixels are permanent shadow",
            "psrAreaKm2_source": round(float((np.asarray(psr.data) > 0).sum()) * 0.12**2, 1),
        },
        "sunAverage": {
            "file": "/data/lola_avgsun_75s_240m.webp",
            "sha256": sun_sha,
            "product": sun.metadata()["product"],
            "productVersion": sun.metadata()["productVersion"],
            "displayRule": "2x2 mean of the 120 m average solar visibility (0..1)",
            "ramp": "dark violet 0 -> copper 0.5 -> pale gold 1",
        },
    },
}
(OUT / "illumination_meta.json").write_text(json.dumps(meta, indent=1))
print(
    json.dumps({k: (len((OUT / Path(v["file"]).name).read_bytes()) // 1024, "KB") for k, v in meta["layers"].items()}),
    meta["layers"]["psr"]["psrAreaKm2_source"],
    "km2 PSR (75S-pole, source)",
)
