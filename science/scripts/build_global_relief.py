"""Build the browser height maps for the whole-Moon 3D relief from LOLA LDEM_16.

Input : data/raw/lola/ldem_16.img (+ .lbl), NASA PDS LRO-L-LOLA-4-GDR-V1.0, 16 px/deg simple
        cylindrical, heights = DN * SCALING_FACTOR m above the 1737.4 km sphere.
Output: public/data/terrain/global_relief_{4,8}ppd.i16 — little-endian int16 metres, row 0 = 90 N,
        column 0 = 0 deg E, cell centres; produced by exact block means (4x4 -> 4 ppd, 2x2 -> 8 ppd).
        public/data/terrain/global_relief.json — metadata and provenance.
Display only: the science service never reads these files.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "science"))
from moonnav_science.dem import _num, parse_pds3_label  # noqa: E402

img = ROOT / "data/raw/lola/ldem_16.img"
lbl = ROOT / "data/raw/lola/ldem_16.lbl"
label = parse_pds3_label(lbl.read_text(encoding="latin-1"))
lines, samples = int(_num(label, "LINES")), int(_num(label, "LINE_SAMPLES"))
assert label["MAP_PROJECTION_TYPE"].upper() == "SIMPLE CYLINDRICAL", label["MAP_PROJECTION_TYPE"]
assert _num(label, "MAP_RESOLUTION") == 16 and (lines, samples) == (2880, 5760)
assert _num(label, "WESTERNMOST_LONGITUDE") == 0 and _num(label, "MAXIMUM_LATITUDE") == 90
assert label["POSITIVE_LONGITUDE_DIRECTION"].upper() == "EAST"
scale = _num(label, "SCALING_FACTOR")
raw = np.fromfile(img, dtype="<i2")
assert raw.size == lines * samples
h = raw.reshape(lines, samples).astype(np.float64) * scale
out_dir = ROOT / "public/data/terrain"
levels = []
for ppd, k in ((4, 4), (8, 2)):
    m = h.reshape(lines // k, k, samples // k, k).mean(axis=(1, 3))
    q = np.clip(np.round(m), -32768, 32767).astype("<i2")
    name = f"global_relief_{ppd}ppd.i16"
    (out_dir / name).write_bytes(q.tobytes())
    levels.append({"file": name, "width": q.shape[1], "height": q.shape[0], "pixelsPerDegree": ppd, "equatorialSpacingKm": round(2 * np.pi * 1737.4 / (360 * ppd), 2), "sha256": hashlib.sha256(q.tobytes()).hexdigest(), "minM": int(q.min()), "maxM": int(q.max())})
meta = {
    "kind": "moonnav.global-relief",
    "source": {"product": "LDEM_16", "dataSetId": label.get("DATA_SET_ID"), "productVersion": label.get("PRODUCT_VERSION_ID"), "url": "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.img", "sha256": hashlib.sha256(img.read_bytes()).hexdigest(), "labelSha256": hashlib.sha256(lbl.read_bytes()).hexdigest(), "resolution": "16 px/deg (~1.9 km at the equator)"},
    "layout": "int16 LE metres above 1737.4 km sphere; row 0 = 90N, col 0 = 0E (cell centres); simple cylindrical",
    "processing": "exact block mean of LDEM_16 heights (DN*SCALING_FACTOR), rounded to 1 m",
    "frame": label.get("COORDINATE_SYSTEM_NAME"), "referenceRadiusM": _num(label, "OFFSET") if "OFFSET" in label else 1737400.0,
    "levels": levels, "use": "display only (3D globe relief); scientific calculations use the PDS products directly",
    "generatedAtUtc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
}
(out_dir / "global_relief.json").write_text(json.dumps(meta, indent=1))
print(json.dumps(levels))
