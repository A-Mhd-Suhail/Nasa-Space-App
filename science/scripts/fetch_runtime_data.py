"""Download the data the science API needs at runtime into science/data (used by the Vercel build).

Only the analysis essentials: LOLA LDEM_75S_240M (+ label) and the SPICE kernel set. Every file is
SHA-256 checked against science/catalog/*.json; a mismatch fails the build. High-res tiles are fetched
on demand at runtime into MOONNAV_TILE_CACHE (/tmp on Vercel).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

SCI = Path(__file__).resolve().parents[1]
OUT = SCI / "data" / "raw"
UA = {"User-Agent": "MoonNav build (NASA Space Apps research prototype)"}
LOLA = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img"
LOLA_MIRROR = "https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG"
NAIF_MIRROR = "https://raw.githubusercontent.com/nextorbitlabs/spice-kernels/main"


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def get(dest: Path, urls: list[str], want: str | None) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and (want is None or sha(dest) == want):
        return True
    for u in urls:
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=300) as r:
                dest.write_bytes(r.read())
        except Exception as exc:  # noqa: BLE001
            print(f"  {u}: {type(exc).__name__}", file=sys.stderr)
            continue
        if want is None or sha(dest) == want:
            print(f"OK   {dest.relative_to(SCI)}")
            return True
        print(f"  {u}: checksum mismatch", file=sys.stderr)
        dest.unlink()
    return False


def main() -> None:
    cat = json.loads((SCI / "catalog/products.json").read_text())
    dem = next(p for p in cat["products"] if p["id"] == "lola-ldem-75s-240m-v2")
    ok = get(OUT / "lola/ldem_75s_240m.img", [dem["sourceUrl"], f"{LOLA_MIRROR}/LDEM_75S_240M.IMG"], dem["sha256"])
    ok &= get(OUT / "lola/ldem_75s_240m.lbl", [dem["labelUrl"], f"{LOLA_MIRROR}/LDEM_75S_240M.LBL"], dem.get("labelSha256"))
    ker = json.loads((SCI / "catalog/kernels.json").read_text())
    fk_ok = False
    for k in ker["kernels"]:
        mirror = f"{NAIF_MIRROR}/{k['sourceUrl'].split('/generic_kernels/')[1]}".replace("/fk/satellites/", "/fk/").replace(
            "/spk/planets/", "/spk/"
        )
        got = get(OUT / "spice" / k["fileName"], [k["sourceUrl"], mirror], k["sha256"])
        if k["type"] == "FK":
            fk_ok |= got
        else:
            ok &= got
    if not (ok and fk_ok):
        raise SystemExit("runtime data download failed (see messages above)")
    fetch_illumination_packs()


def fetch_illumination_packs() -> None:
    """LOLA long-term Sun/Earth visibility packs (0.001-rounded) from the private build bucket.

    Optional: without them the API reports these values as "unavailable" (never 0). The PSR pack and
    the PDS labels are committed in science/assets/illum.
    """
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    man = json.loads((SCI / "assets/illum/packed-manifest.json").read_text())
    if not (url and key):
        print("WARNING: no Supabase credentials in the build environment; long-term Sun/Earth lookups will be unavailable")
        return
    headers = {**UA, "apikey": key} if key.startswith("sb_") else {**UA, "apikey": key, "Authorization": f"Bearer {key}"}
    for name, f in man["files"].items():
        dest = SCI / "data/illum-packed" / f"{name}.npz"
        if dest.exists() and sha(dest) == f["sha256"]:
            continue
        try:
            blob = b"".join(
                urllib.request.urlopen(
                    urllib.request.Request(f"{url.rstrip('/')}/storage/v1/object/authenticated/{man['bucket']}/{p}", headers=headers),
                    timeout=300,
                ).read()
                for p in f["parts"]
            )
        except Exception as exc:  # noqa: BLE001
            print(f"WARNING: {name} pack not downloaded ({type(exc).__name__}); lookups will be unavailable")
            continue
        if hashlib.sha256(blob).hexdigest() != f["sha256"]:
            print(f"WARNING: {name} pack checksum mismatch; discarded")
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(blob)
        print(f"OK   {dest.relative_to(SCI)} ({len(blob) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
