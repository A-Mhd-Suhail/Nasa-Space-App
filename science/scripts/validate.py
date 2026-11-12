"""Run the MoonNav scientific validation suite and write the report.

Usage: cd science && uv run python scripts/validate.py [--offline]
Writes docs/validation/validation-results.json, docs/VALIDATION_REPORT.md and
public/data/validation.json (shown on the /validation page).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "science"))
from moonnav_science.validation import run_all  # noqa: E402

live = "--offline" not in sys.argv
rep = run_all(live=live)
(ROOT / "docs/validation").mkdir(parents=True, exist_ok=True)
(ROOT / "docs/validation/validation-results.json").write_text(json.dumps(rep, indent=1))
(ROOT / "public/data/validation.json").write_text(json.dumps(rep))


def cell(v: object) -> str:
    if v is None:
        return "—"
    if isinstance(v, dict):
        return "; ".join(f"{k}={cell(x)}" for k, x in v.items())
    return str(v).replace("|", "/")


lines = [
    "# MoonNav scientific validation report",
    "",
    f"Generated {rep['generatedAtUtc']} by `science/scripts/validate.py` ({'live references' if live else 'offline checks only'}). Re-run any time; results are deterministic for offline checks.",
    "",
    f"**Summary:** {rep['summary']['pass']} pass · {rep['summary']['fail']} fail · {rep['summary']['unavailable']} reference unavailable.",
    "",
    f"> {rep['statement']}",
    "",
    "| ID | Category | Reference source | Product | Epoch (UTC) | Location / frame | Method | MoonNav | Reference | Difference | Tolerance | Result |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
]
for r in rep["records"]:
    lines.append(
        "| "
        + " | ".join(
            cell(r[k])
            for k in (
                "id",
                "category",
                "source",
                "product",
                "epochUtc",
                "location",
                "method",
                "moonnav",
                "reference",
                "difference",
                "tolerance",
            )
        )
        + f" | **{r['result'].upper()}**{(' — ' + r['note']) if r.get('note') else ''} |"
    )
lines += [
    "",
    "## How to read the LOLA illumination rows",
    "- The LOLA team's products (Mazarico et al. 2011) average Sun visibility over an 18.6-year cycle at 120 m, from the surface; MoonNav samples 2 years every 6 h with SPICE geometry and a LOLA horizon, 2 m above the surface. Solar geometry at the Moon repeats yearly (the 1.54 deg obliquity does not change with the 18.6-year nodal cycle), so 2 years is representative for the Sun, not for the Earth, which is why Earth visibility is not compared.",
    "- Rim and ridge points can change by 0.5 between adjacent 120 m pixels. For named sites the 3x3 (360 m) neighbourhood range is reported next to the centre pixel; the `ldem240m` value shows how much the 5/20/40 m near-field terrain changes the result.",
    "- Tolerances were fixed before the comparison was run and were not tuned to the results.",
    "",
    "## Further automated checks (pytest, `npm run science:test`: 95 tests)",
    "- **LOLA illumination products:** SHA-256 of the three 116 MB rasters against the catalogue (`npm run data:illum` verifies on every run; a cached verification takes about 0.2 s); size and projection checked against the PDS labels; known-site values (Shackleton floor in permanent shadow with 0% Sun and Earth, Mons Malapert about 43-46% Sun and Earth always visible, the Shackleton-de Gerlache ridge above 60%); nearest-pixel and no-data behaviour on a synthetic raster; points north of 75 S are `unknown`, never 0.",
    "- **Illumination API:** requires the service token; rejects `lat` outside +-90, `lon` outside +-360, non-numbers, NaN and infinity with 422 (never 500); the 75 S product edge (-75 inside, -74.99 unknown); longitude conventions (129.78 E equals -230.22); the pole is longitude-independent.",
    "- **Serverless copies:** the lossless bit-packed PSR raster equals the original IMG exactly; the 0.001-rounded sunlight rasters stay within 0.0005 of the original at 200 random points (the pack scale is read from the PDS label, never assumed).",
    "- **Tile download and terrain fallback:** coverage reporting, cache hits, concurrent downloads of one tile fetch it once, total and partial failure, fast-mode and fallback status; fallback to coarser LOLA data is labelled and never zero-filled.",
    "",
    "## Not compared",
    "- **SVS 4930 rendered illumination frames (pixels):** the frames are published as images without a machine-readable projection, extent or time-to-pixel registration, so a pixel-level lit/shadow comparison would mostly measure registration error. Instead, (1) the numeric values stamped on those frames (sub-solar point, sub-Earth point, distance, RA/Dec, apparent diameter, illuminated fraction) are compared above through the SVS Dial-a-Moon API, and (2) MoonNav's lit/shadow output is compared with the LOLA team's machine-readable, georeferenced illumination rasters (rows `lola-*`).",
    "- **Earth visibility vs AVGVISIB_EARTH:** needs a full 18.6-year run per point; not part of the routine suite.",
    "",
]
(ROOT / "docs/VALIDATION_REPORT.md").write_text("\n".join(lines))
print(json.dumps(rep["summary"]))
for r in rep["records"]:
    if r["result"] != "pass":
        print(r["id"], r["result"], r.get("note"), r.get("difference"))
