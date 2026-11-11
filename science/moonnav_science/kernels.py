"""SPICE kernel manifest loading, checksum verification and coverage checks."""

from __future__ import annotations

import hashlib
import json
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import spiceypy as sp

_LOCK = threading.Lock()
_LOADED: LoadedKernels | None = None


class KernelError(RuntimeError):
    pass


@dataclass(frozen=True)
class LoadedKernels:
    manifest_id: str
    files: list[dict[str, Any]]  # kernels actually furnished (exactly one FK)
    et_start: float
    et_stop: float
    utc_start: str
    utc_stop: str
    notes: list[str]


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _window_bounds(cell: Any) -> tuple[float, float]:
    n = sp.wncard(cell)
    if n == 0:
        raise KernelError("empty coverage window")
    start, _ = sp.wnfetd(cell, 0)
    _, stop = sp.wnfetd(cell, n - 1)
    return start, stop


def load_kernels(manifest_path: Path, kernel_dir: Path, verify: bool = True) -> LoadedKernels:
    """Load the manifest kernels (once per process), verifying checksums.

    Exactly one MOON_ME frame kernel is furnished: the preferred release when
    present, otherwise the manifest's declared fallback. The chosen set is
    recorded verbatim in provenance so every analysis is reproducible.
    """
    global _LOADED
    with _LOCK:
        if _LOADED is not None:
            return _LOADED
        manifest = json.loads(manifest_path.read_text())
        all_entries = manifest["kernels"]
        fk_entries = [k for k in all_entries if k["type"] == "FK"]
        fixed = [k for k in all_entries if k["type"] != "FK"]
        notes: list[str] = []
        chosen_fk: dict[str, Any] | None = None
        for k in fk_entries:
            p = kernel_dir / k["fileName"]
            if p.exists() and (not verify or _sha256(p) == k["sha256"]):
                chosen_fk = k
                if k is not fk_entries[0]:
                    notes.append(
                        f"Using {k['fileName']} (checksum-verified) instead of {fk_entries[0]['fileName']}: "
                        "preferred FK release not present locally. Same MOON_ME frame chain; see docs/DECISION_LOG.md."
                    )
                break
        if chosen_fk is None:
            missing = ", ".join(k["fileName"] for k in fk_entries)
            raise KernelError(f"no MOON_ME frame kernel present or checksum-valid (checked: {missing}); run scripts/fetch_data.sh")
        files = [*fixed, chosen_fk]
        for k in fixed:
            p = kernel_dir / k["fileName"]
            if not p.exists():
                raise KernelError(f"kernel missing: {k['fileName']} (run scripts/fetch_data.sh)")
            if verify and _sha256(p) != k["sha256"]:
                raise KernelError(f"checksum mismatch for {k['fileName']}")
        sp.kclear()
        for k in files:
            sp.furnsh(str(kernel_dir / k["fileName"]))

        # Coverage = intersection of the SPK coverage for Sun/Earth/Moon and
        # the binary PCK coverage for the lunar orientation.
        spk = next(k for k in files if k["type"] == "SPK")
        bpc = next(k for k in files if k["type"] == "PCK_BINARY")
        starts: list[float] = []
        stops: list[float] = []
        for body in (10, 399, 301):
            cell = sp.cell_double(2000)
            sp.spkcov(str(kernel_dir / spk["fileName"]), body, cell)
            s, e = _window_bounds(cell)
            starts.append(s)
            stops.append(e)
        cell = sp.cell_double(2000)
        sp.pckcov(str(kernel_dir / bpc["fileName"]), 31008, cell)
        s, e = _window_bounds(cell)
        starts.append(s)
        stops.append(e)
        et0, et1 = max(starts), min(stops)
        _LOADED = LoadedKernels(
            manifest_id=manifest["manifestId"],
            files=files,
            et_start=et0,
            et_stop=et1,
            utc_start=sp.et2utc(et0, "ISOC", 0) + "Z",
            utc_stop=sp.et2utc(et1, "ISOC", 0) + "Z",
            notes=notes,
        )
        return _LOADED


def parse_utc(utc_iso: str) -> datetime:
    """Strict ISO-8601 UTC parser: requires 'Z' or a +00:00 offset."""
    s = utc_iso.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None or dt.utcoffset() != timedelta(0):
        raise ValueError("timestamps must be UTC (suffix Z)")
    return dt


def utc_to_et(utc_iso: str) -> float:
    """UTC ISO-8601 string -> ephemeris time (TDB seconds past J2000) via the loaded LSK."""
    dt = parse_utc(utc_iso)
    return float(sp.str2et(dt.strftime("%Y-%m-%dT%H:%M:%S.%f")))


def et_to_utc(et: float, precision: int = 0) -> str:
    return str(sp.et2utc(et, "ISOC", precision)) + "Z"


def check_coverage(k: LoadedKernels, et0: float, et1: float) -> None:
    if et0 < k.et_start or et1 > k.et_stop:
        raise KernelError(f"requested interval outside kernel coverage ({k.utc_start} .. {k.utc_stop})")
