"""Download the LOLA team's polar illumination products (Mazarico et al. 2011; NASA GSFC PGDA product 69)
from the LOLA PDS data node, using parallel HTTP byte ranges, and verify their size against the PDS label.

Products (south pole, 120 m/px, 75 S - pole, polar stereographic, 1737.4 km sphere, release 201608):
  LPSR_75S_120M_201608      permanent shadow (1) / not (0)
  AVGVISIB_75S_120M_201608  average solar visibility over an 18.6-year nutation cycle (0..1)
  AVGVISIB_75S_120M_201608_EARTH  average Earth visibility (0..1)
Usage: cd science && uv run python scripts/fetch_illumination.py
"""

from __future__ import annotations

import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "science"))
from moonnav_science.dem import _num, parse_pds3_label  # noqa: E402

BASE = "http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG"
OUT = ROOT / "data/raw/illum"
NAMES = ["LPSR_75S_120M_201608", "AVGVISIB_75S_120M_201608", "AVGVISIB_75S_120M_201608_EARTH"]
PARTS = 8


def _verify(name: str, data: bytes) -> None:
    """Fail if the file does not match the SHA-256 pinned in science/catalog/products.json."""
    cat = json.loads((ROOT / "science/catalog/products.json").read_text())
    want = next((p["sha256"] for p in cat["products"] if p.get("productId") == name), None)
    got = hashlib.sha256(data).hexdigest()
    if want and got != want:
        raise RuntimeError(f"{name}: sha256 {got} does not match catalogue {want}")


def fetch(name: str, client: httpx.Client) -> str:
    lbl = OUT / f"{name}.LBL"
    if not lbl.exists():
        lbl.write_bytes(client.get(f"{BASE}/{name}.LBL").raise_for_status().content)
    label = parse_pds3_label(lbl.read_text(encoding="latin-1"))
    size = int(_num(label, "LINES")) * int(_num(label, "LINE_SAMPLES")) * 2
    img = OUT / f"{name}.IMG"
    if img.exists() and img.stat().st_size == size:
        _verify(name, img.read_bytes())
        return f"{name}: cached, checksum OK"
    chunk = -(-size // PARTS)

    def part(i: int) -> bytes:
        a, b = i * chunk, min(size, (i + 1) * chunk) - 1
        for _ in range(4):
            try:
                r = client.get(f"{BASE}/{name}.IMG", headers={"Range": f"bytes={a}-{b}"})
                if r.status_code == 206 and len(r.content) == b - a + 1:
                    return r.content
            except httpx.HTTPError:
                pass
        raise RuntimeError(f"{name}: range {a}-{b} failed")

    with ThreadPoolExecutor(PARTS) as pool:
        data = b"".join(pool.map(part, range(PARTS)))
    if len(data) != size:
        raise RuntimeError(f"{name}: size {len(data)} != label {size}")
    _verify(name, data)
    tmp = img.with_suffix(".part")
    tmp.write_bytes(data)
    tmp.replace(img)
    return f"{name}: {size} bytes sha256 {hashlib.sha256(data).hexdigest()}"


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=600, headers={"User-Agent": "MoonNav (NASA Space Apps research prototype)"}) as c:
        for n in NAMES:
            print(fetch(n, c), flush=True)
