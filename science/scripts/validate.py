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
    "## Not compared",
    "- **SVS 4930 rendered illumination frames (pixels):** the frames are published as images without a machine-readable projection/extent, so pixel-level lit/shadow comparison is not performed. The numeric values stamped on those frames (sub-solar point, sub-Earth point, distance) are compared above through the SVS Dial-a-Moon API.",
    "",
]
(ROOT / "docs/VALIDATION_REPORT.md").write_text("\n".join(lines))
print(json.dumps(rep["summary"]))
for r in rep["records"]:
    if r["result"] != "pass":
        print(r["id"], r["result"], r.get("note"), r.get("difference"))
