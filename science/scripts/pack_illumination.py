"""Pack the LOLA illumination products for serverless hosting (run once after `npm run data:illum`).

- LPSR (binary): bit-packed, lossless -> science/assets/illum/LPSR_75S_120M_201608.npz (committed, ~0.4 MB).
- AVGVISIB / _EARTH: rounded to 0.001 (0.1 percentage point; max error 0.0005, below the precision
  MoonNav displays) -> data/illum-packed/*.npz, uploaded to private storage for the Vercel build.
PDS labels are copied next to the packs so the reader keeps the original projection metadata.
"""

from __future__ import annotations

import hashlib
import shutil
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "science"))
from moonnav_science.dem import _num, parse_pds3_label  # noqa: E402

RAW = ROOT / "data/raw/illum"
ASSETS = ROOT / "science/assets/illum"
PACKED = ROOT / "data/illum-packed"
N = 7624


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    PACKED.mkdir(parents=True, exist_ok=True)
    for name in ("LPSR_75S_120M_201608", "AVGVISIB_75S_120M_201608", "AVGVISIB_75S_120M_201608_EARTH"):
        shutil.copy(RAW / f"{name}.LBL", ASSETS / f"{name}.LBL")
        dn = np.fromfile(RAW / f"{name}.IMG", dtype="<i2").reshape(N, N)
        if name.startswith("LPSR"):
            out = ASSETS / f"{name}.npz"
            np.savez_compressed(out, bits=np.packbits(dn > 0), shape=np.array([N, N]))
        else:
            out = PACKED / f"{name}.npz"
            label = parse_pds3_label((RAW / f"{name}.LBL").read_text(encoding="latin-1"))
            value = dn.astype(np.float64) * _num(label, "SCALING_FACTOR") + _num(label, "OFFSET")  # from the label, never assumed
            q = np.rint(value * 1000.0).astype(np.uint16)
            np.savez_compressed(out, q=q)
        print(out.relative_to(ROOT), round(out.stat().st_size / 1e6, 1), "MB sha256", hashlib.sha256(out.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
