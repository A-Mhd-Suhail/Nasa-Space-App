#!/usr/bin/env bash
# Download the approved source products and verify them against the versioned catalogue checksums.
#
# Primary sources are the official NASA servers (PDS Geosciences for LOLA, NAIF for SPICE).
# If those are unreachable (restrictive networks do this), each file falls back to a public
# verbatim mirror; every file is SHA-256 verified against science/catalog/*.json either way,
# so a mirror can never silently substitute different bytes.
set -euo pipefail
cd "${MOONNAV_ROOT:-$(dirname "$0")/..}"
mkdir -p data/raw/lola data/raw/spice

L=https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img
L_MIRROR=https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG          # MIT PLT mirror of the PDS LOLA GDR
N=https://naif.jpl.nasa.gov/pub/naif/generic_kernels
N_MIRROR=https://raw.githubusercontent.com/nextorbitlabs/spice-kernels/main  # verbatim NAIF mirror

fetch() { # dest remote...  (tries each remote in order; keeps the first file that exists)
  local dest=$1; shift
  [ -f "$dest" ] && return 0
  local url
  for url in "$@"; do
    if curl -fSL --retry 3 --connect-timeout 15 -o "$dest" "$url"; then return 0; fi
    rm -f "$dest"
  done
  echo "WARNING: could not download $dest (tried: $*)" >&2
  return 1
}

# LOLA GDR DEM (analysis terrain)
fetch data/raw/lola/ldem_75s_240m.img "$L/ldem_75s_240m.img" "$L_MIRROR/LDEM_75S_240M.IMG" || true
fetch data/raw/lola/ldem_75s_240m.lbl "$L/ldem_75s_240m.lbl" "$L_MIRROR/LDEM_75S_240M.LBL" || true
# LOLA GDR global 16 px/deg (whole-Moon relief + cross-projection validation)
fetch data/raw/lola/ldem_16.img "$L/../../cylindrical/img/ldem_16.img" || true
fetch data/raw/lola/ldem_16.lbl "$L/../../cylindrical/img/ldem_16.lbl" || true
# SPICE kernels (fixed set)
fetch data/raw/spice/naif0012.tls "$N/lsk/naif0012.tls" "$N_MIRROR/lsk/naif0012.tls" || true
fetch data/raw/spice/pck00011.tpc "$N/pck/pck00011.tpc" "$N_MIRROR/pck/pck00011.tpc" || true
fetch data/raw/spice/moon_pa_de440_200625.bpc "$N/pck/moon_pa_de440_200625.bpc" "$N_MIRROR/pck/moon_pa_de440_200625.bpc" || true
# MOON_ME frame kernel: prefer the current NAIF release, else the predecessor from the mirror
fetch data/raw/spice/moon_de440_250416.tf "$N/fk/satellites/moon_de440_250416.tf" || true
fetch data/raw/spice/moon_de440_220930.tf "$N/fk/satellites/moon_de440_220930.tf" "$N_MIRROR/fk/moon_de440_220930.tf" || true
fetch data/raw/spice/de440s.bsp "$N/spk/planets/de440s.bsp" "$N_MIRROR/spk/de440s.bsp" || true

python3 - <<'PY'
import hashlib, json, pathlib, sys

def sha(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()

cat = json.load(open("science/catalog/products.json"))
ker = json.load(open("science/catalog/kernels.json"))
ok = True

# Products: every catalogue entry with a localPath must exist and match.
for p in cat["products"]:
    # Only approved products are required locally; "discovered" entries (e.g. the >2 GB
    # 5 m DEM) are fetched later through the curator ingestion workflow.
    if not p.get("localPath") or p.get("status") != "approved":
        continue
    path = pathlib.Path("data") / p["localPath"]
    if not path.exists():
        if p.get("optional"):
            print(f"SKIP {path} (optional; npm run data:illum)")
            continue
        print(f"FAIL {path} (missing)")
        ok = False
        continue
    got = sha(path)
    print(("OK   " if got == p["sha256"] else "FAIL ") + f"{path} (sha256 {'match' if got == p['sha256'] else 'mismatch'})")
    ok &= got == p["sha256"]

# Kernels: all fixed kernels plus at least one checksum-valid MOON_ME frame kernel.
spice_dir = pathlib.Path("data/raw/spice")
fk_slots = [k for k in ker["kernels"] if k["type"] == "FK"]
fixed = [k for k in ker["kernels"] if k["type"] != "FK"]
for k in fixed:
    path = spice_dir / k["fileName"]
    if not path.exists():
        print(f"FAIL {path} (missing)")
        ok = False
        continue
    got = sha(path)
    print(("OK   " if got == k["sha256"] else "FAIL ") + f"{path} (sha256 {'match' if got == k['sha256'] else 'mismatch'})")
    ok &= got == k["sha256"]
fk_ok = False
for k in fk_slots:
    path = spice_dir / k["fileName"]
    if path.exists() and sha(path) == k["sha256"]:
        print(f"OK   {path} (MOON_ME frame kernel)")
        fk_ok = True
for k in fk_slots:
    path = spice_dir / k["fileName"]
    if path.exists() and not fk_ok:
        print(f"FAIL {path} (sha256 mismatch)")
if not fk_ok and not any((spice_dir / k["fileName"]).exists() for k in fk_slots):
    print("FAIL no MOON_ME frame kernel present (tried: " + ", ".join(k["fileName"] for k in fk_slots) + ")")
ok &= fk_ok

print("\nResult: " + ("all source products verified" if ok else "VERIFICATION FAILED"))
sys.exit(0 if ok else 1)
PY
