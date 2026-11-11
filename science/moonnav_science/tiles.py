"""High-resolution LOLA polar DEMs read as tiles straight from NASA PDS.

The PDS Geosciences Node serves the polar stereographic LDEM products as plain PDS3
IMG files over HTTPS with byte-range support. A tile of T x T pixels is fetched with
multipart byte ranges (one range per image row), stored unchanged (int16 DN) in a
local cache next to a JSON sidecar recording the source URL, label checksum, exact
byte ranges, retrieval time and a SHA-256 of the tile bytes. Nothing is resampled at
ingestion: heights are DN * SCALING_FACTOR metres relative to the label OFFSET sphere.

`TiledPolarDem` samples heights only where a tile is cached (NaN elsewhere, never 0).
`MultiResDem` combines several products, always using the finest product that has a
valid sample and recording which product served each value.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import httpx
import numpy as np
from numpy.typing import NDArray

from . import SOFTWARE_VERSION
from .dem import REQUIRED_KEYS, DemValidationError, PolarDem, _num, parse_pds3_label

TILE = 512
ROWS_PER_REQUEST = 128
USER_AGENT = f"MoonNav/{SOFTWARE_VERSION} (NASA Space Apps lunar site navigator; research prototype)"
PDS_POLAR = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img"

# Products verified on the PDS Geosciences Node (2026-11-11): file sizes and labels checked.
TILED_PRODUCTS: dict[str, dict[str, Any]] = {
    "lola-ldem-875s-5m-v2": {"file": "ldem_875s_5m", "bytes": 1_840_545_792, "scaleM": 5.0, "edgeLat": -87.5},
    "lola-ldem-85s-20m-v2": {"file": "ldem_85s_20m", "bytes": 460_136_448, "scaleM": 20.0, "edgeLat": -85.0},
    "lola-ldem-80s-40m-v2": {"file": "ldem_80s_40m", "bytes": 462_080_000, "scaleM": 40.0, "edgeLat": -80.0},
}


class TileFetchError(RuntimeError):
    pass


def _parse_multipart(body: bytes, content_type: str) -> list[tuple[int, int, bytes]]:
    """Parse a multipart/byteranges body into (start, end_inclusive, data) parts."""
    m = re.search(r"boundary=\"?([^\";]+)\"?", content_type)
    if not m:
        raise TileFetchError("multipart response without boundary")
    sep = b"--" + m.group(1).encode()
    parts: list[tuple[int, int, bytes]] = []
    for chunk in body.split(sep)[1:]:
        if chunk.startswith(b"--"):
            break
        head, _, data = chunk.partition(b"\r\n\r\n")
        cr = re.search(rb"Content-Range:\s*bytes\s+(\d+)-(\d+)/", head, re.I)
        if not cr:
            continue
        a, b = int(cr.group(1)), int(cr.group(2))
        parts.append((a, b, data[: b - a + 1]))
    return parts


def fetch_ranges(client: httpx.Client, url: str, ranges: list[tuple[int, int]], retries: int = 3) -> dict[int, bytes]:
    """Fetch byte ranges (inclusive) and return {start: bytes}. Handles merged/coalesced parts."""
    header = "bytes=" + ",".join(f"{a}-{b}" for a, b in ranges)
    last = "unknown"
    for attempt in range(retries):
        try:
            r = client.get(url, headers={"Range": header})
        except httpx.HTTPError as exc:
            last = type(exc).__name__
        else:
            if r.status_code == 206:
                ct = r.headers.get("content-type", "")
                if ct.startswith("multipart/byteranges"):
                    parts = _parse_multipart(r.content, ct)
                else:
                    cr = re.search(r"bytes\s+(\d+)-(\d+)/", r.headers.get("content-range", ""))
                    if not cr:
                        raise TileFetchError("206 without Content-Range")
                    parts = [(int(cr.group(1)), int(cr.group(2)), r.content)]
                out: dict[int, bytes] = {}
                for a, b in ranges:
                    src = next((p for p in parts if p[0] <= a and p[1] >= b), None)
                    if src is None:
                        raise TileFetchError(f"range {a}-{b} missing from response")
                    out[a] = src[2][a - src[0] : b - src[0] + 1]
                return out
            if r.status_code not in (429, 500, 502, 503, 504):
                raise TileFetchError(f"PDS HTTP {r.status_code}")
            last = f"HTTP {r.status_code}"
        time.sleep(min(8.0, 1.5 * 2**attempt))
    raise TileFetchError(f"PDS unreachable after {retries} attempts ({last})")


@dataclass
class TiledPolarDem:
    """Polar stereographic LOLA DEM backed by cached tiles of the official PDS file."""

    product_id: str
    url: str
    label: dict[str, str]
    label_sha256: str
    cache_dir: Path
    lines: int
    samples: int
    scale_m: float
    line_offset: float
    sample_offset: float
    radius_ref_m: float
    scaling_factor: float
    max_abs_lat_edge: float
    frame_name: str
    _lru: OrderedDict[tuple[int, int], NDArray[np.int16]] = field(default_factory=OrderedDict, repr=False)
    lru_max: int = 64

    # Reuse the projection maths of the validated full-file reader.
    # Same projection maths as the validated full-file reader (PolarDem), applied to this product's label.
    def latlon_to_xy(self, lat: NDArray[np.float64], lon: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        return PolarDem.latlon_to_xy(cast(Any, self), lat, lon)

    def xy_to_latlon(self, x: NDArray[np.float64], y: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        return PolarDem.xy_to_latlon(cast(Any, self), x, y)

    def xy_to_pixel(self, x: NDArray[np.float64], y: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        return PolarDem.xy_to_pixel(cast(Any, self), x, y)

    def pixel_to_xy(self, row: NDArray[np.float64], col: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        return PolarDem.pixel_to_xy(cast(Any, self), row, col)

    pole = -1

    @classmethod
    def open(cls, product_id: str, cache_root: Path, client: httpx.Client | None = None) -> TiledPolarDem:
        spec = TILED_PRODUCTS[product_id]
        cache = cache_root / product_id
        cache.mkdir(parents=True, exist_ok=True)
        lbl_path = cache / f"{spec['file']}.lbl"
        url = f"{PDS_POLAR}/{spec['file']}.img"
        if not lbl_path.exists():
            own = client is None
            c = client or httpx.Client(timeout=60, headers={"User-Agent": USER_AGENT}, follow_redirects=True)
            try:
                r = c.get(f"{PDS_POLAR}/{spec['file']}.lbl")
                if r.status_code != 200:
                    raise TileFetchError(f"label HTTP {r.status_code}")
                lbl_path.write_bytes(r.content)
            finally:
                if own:
                    c.close()
        text = lbl_path.read_text(encoding="latin-1")
        label = parse_pds3_label(text)
        missing = [k for k in REQUIRED_KEYS if k not in label]
        if missing:
            raise DemValidationError(f"label missing keywords: {missing}")
        if label["MAP_PROJECTION_TYPE"].upper() != "POLAR STEREOGRAPHIC" or _num(label, "CENTER_LATITUDE") != -90.0:
            raise DemValidationError("expected south polar stereographic product")
        if label["SAMPLE_TYPE"].upper() != "LSB_INTEGER" or int(_num(label, "SAMPLE_BITS")) != 16:
            raise DemValidationError("unsupported sample type")
        if label["POSITIVE_LONGITUDE_DIRECTION"].upper() != "EAST" or label["KEYWORD_LATITUDE_TYPE"].upper() != "PLANETOCENTRIC":
            raise DemValidationError("expected east-positive planetocentric product")
        lines, samples = int(_num(label, "LINES")), int(_num(label, "LINE_SAMPLES"))
        if lines * samples * 2 != spec["bytes"]:
            raise DemValidationError(f"label geometry {lines}x{samples} does not match the PDS file size {spec['bytes']}")
        if abs(_num(label, "MAP_SCALE") - spec["scaleM"]) > 1e-9:
            raise DemValidationError("unexpected MAP_SCALE")
        return cls(
            product_id=product_id,
            url=url,
            label=label,
            label_sha256=hashlib.sha256(lbl_path.read_bytes()).hexdigest(),
            cache_dir=cache,
            lines=lines,
            samples=samples,
            scale_m=_num(label, "MAP_SCALE"),
            line_offset=_num(label, "LINE_PROJECTION_OFFSET"),
            sample_offset=_num(label, "SAMPLE_PROJECTION_OFFSET"),
            radius_ref_m=_num(label, "OFFSET"),
            scaling_factor=_num(label, "SCALING_FACTOR"),
            max_abs_lat_edge=abs(_num(label, "MAXIMUM_LATITUDE")),
            frame_name=label["COORDINATE_SYSTEM_NAME"],
        )

    # --- tile cache ---------------------------------------------------------
    def _tile_path(self, tr: int, tc: int) -> Path:
        return self.cache_dir / f"t{TILE}_{tr:04d}_{tc:04d}.npy"

    def has_tile(self, tr: int, tc: int) -> bool:
        return self._tile_path(tr, tc).exists()

    def _load_tile(self, tr: int, tc: int) -> NDArray[np.int16] | None:
        key = (tr, tc)
        if key in self._lru:
            self._lru.move_to_end(key)
            return self._lru[key]
        p = self._tile_path(tr, tc)
        if not p.exists():
            return None
        arr = np.load(p, mmap_mode="r")
        self._lru[key] = arr
        if len(self._lru) > self.lru_max:
            self._lru.popitem(last=False)
        return arr

    def fetch_tile(self, tr: int, tc: int, client: httpx.Client) -> dict[str, Any]:
        """Download one tile with multipart range requests and store it with provenance."""
        r0, c0 = tr * TILE, tc * TILE
        if r0 >= self.lines or c0 >= self.samples or r0 < 0 or c0 < 0:
            raise ValueError("tile outside image")
        nr, nc = min(TILE, self.lines - r0), min(TILE, self.samples - c0)
        out = np.empty((nr, nc), dtype="<i2")
        ranges_all = [((r0 + i) * self.samples * 2 + c0 * 2, (r0 + i) * self.samples * 2 + (c0 + nc) * 2 - 1) for i in range(nr)]
        for k in range(0, nr, ROWS_PER_REQUEST):
            chunk = ranges_all[k : k + ROWS_PER_REQUEST]
            got = fetch_ranges(client, self.url, chunk)
            for i, (a, _b) in enumerate(chunk):
                out[k + i] = np.frombuffer(got[a], dtype="<i2")
        p = self._tile_path(tr, tc)
        tmp = p.with_suffix(".tmp.npy")
        np.save(tmp, out)
        tmp.replace(p)
        meta = {
            "productId": self.product_id,
            "sourceUrl": self.url,
            "labelSha256": self.label_sha256,
            "tile": [tr, tc],
            "tileSize": TILE,
            "rows": [r0, r0 + nr - 1],
            "cols": [c0, c0 + nc - 1],
            "byteRangeCount": len(ranges_all),
            "dtype": "int16 DN (height = DN * SCALING_FACTOR m)",
            "scalingFactor": self.scaling_factor,
            "sha256": hashlib.sha256(out.tobytes()).hexdigest(),
            "retrievedAtUtc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        p.with_suffix(".json").write_text(json.dumps(meta, indent=1))
        self._lru.pop((tr, tc), None)
        return meta

    def tiles_for_region(self, lat: float, lon: float, radius_m: float) -> list[tuple[int, int]]:
        x, y = self.latlon_to_xy(np.array([lat]), np.array([lon]))
        row, col = self.xy_to_pixel(x, y)
        rpx = radius_m / self.scale_m
        rs = range(max(0, int((row[0] - rpx) // TILE)), min((self.lines - 1) // TILE, int((row[0] + rpx) // TILE)) + 1)
        cs = range(max(0, int((col[0] - rpx) // TILE)), min((self.samples - 1) // TILE, int((col[0] + rpx) // TILE)) + 1)
        return [(r, c) for r in rs for c in cs]

    def ensure_region(
        self, lat: float, lon: float, radius_m: float, client: httpx.Client | None = None, max_new_tiles: int = 64
    ) -> dict[str, Any]:
        """Fetch missing tiles around a point (bounded). Returns a coverage summary."""
        if not self.covers(lat):
            return {"productId": self.product_id, "covered": False, "fetched": 0, "cached": 0, "missing": 0}
        need = self.tiles_for_region(lat, lon, radius_m)
        todo = [t for t in need if not self.has_tile(*t)]
        own = client is None
        c = client or httpx.Client(timeout=120, headers={"User-Agent": USER_AGENT}, follow_redirects=True)
        fetched = 0
        try:
            for t in todo[:max_new_tiles]:
                self.fetch_tile(*t, client=c)
                fetched += 1
        finally:
            if own:
                c.close()
        return {
            "productId": self.product_id,
            "covered": True,
            "tiles": len(need),
            "fetched": fetched,
            "cached": len(need) - len(todo),
            "missing": max(0, len(todo) - max_new_tiles),
        }

    # --- sampling ---------------------------------------------------------
    def covers(self, lat_deg: float) -> bool:
        return lat_deg <= -self.max_abs_lat_edge

    def _px(self, r: NDArray[np.int64], c: NDArray[np.int64]) -> NDArray[np.float64]:
        out = np.full(r.shape, np.nan)
        inside = (r >= 0) & (c >= 0) & (r < self.lines) & (c < self.samples)
        tr, tc = np.where(inside, r // TILE, -1), np.where(inside, c // TILE, -1)
        for key in set(zip(tr[inside].tolist(), tc[inside].tolist(), strict=True)):
            tile = self._load_tile(*key)
            if tile is None:
                continue
            sel = inside & (tr == key[0]) & (tc == key[1])
            out[sel] = tile[r[sel] - key[0] * TILE, c[sel] - key[1] * TILE].astype(np.float64) * self.scaling_factor
        return out

    def sample_height(self, lat: NDArray[np.float64], lon: NDArray[np.float64]) -> NDArray[np.float64]:
        """Bilinear height (m above the reference sphere); NaN where no cached tile or outside coverage."""
        lat = np.asarray(lat, dtype=np.float64)
        lon = np.asarray(lon, dtype=np.float64)
        x, y = self.latlon_to_xy(lat, lon)
        row, col = self.xy_to_pixel(x, y)
        r0, c0 = np.floor(row).astype(np.int64), np.floor(col).astype(np.int64)
        fr, fc = row - r0, col - c0
        v00, v01, v10, v11 = self._px(r0, c0), self._px(r0, c0 + 1), self._px(r0 + 1, c0), self._px(r0 + 1, c0 + 1)
        out = (1 - fr) * (1 - fc) * v00 + (1 - fr) * fc * v01 + fr * (1 - fc) * v10 + fr * fc * v11
        return np.where(lat <= -self.max_abs_lat_edge, out, np.nan)

    def metadata(self) -> dict[str, object]:
        tiles = sorted(self.cache_dir.glob(f"t{TILE}_*.npy"))
        return {
            "productId": self.product_id,
            "dataSetId": self.label.get("DATA_SET_ID"),
            "productVersion": self.label.get("PRODUCT_VERSION_ID"),
            "fileName": self.label.get("FILE_NAME") or self.url.rsplit("/", 1)[-1].upper(),
            "sourceUrl": self.url,
            "labelSha256": self.label_sha256,
            "projection": "POLAR STEREOGRAPHIC (spherical)",
            "frame": self.frame_name,
            "referenceRadiusM": self.radius_ref_m,
            "pixelSpacingM": self.scale_m,
            "lines": self.lines,
            "samples": self.samples,
            "coverage": f"south of {self.max_abs_lat_edge} deg S",
            "access": "HTTP byte-range tiles of the PDS file, cached",
            "cachedTiles": len(tiles),
            "cachedAreaKm2": round(len(tiles) * (TILE * self.scale_m / 1000) ** 2, 1),
            "noDataPolicy": "no cached tile or outside coverage -> null (never zero)",
        }


class MultiResDem:
    """Finest-available composite over several DEMs (ordered fine -> coarse)."""

    def __init__(self, layers: list[Any], product_id: str = "lola-multires-v1") -> None:
        if not layers:
            raise ValueError("at least one DEM layer is required")
        self.layers = layers
        self.product_id = product_id
        self.base = layers[-1]
        self.radius_ref_m = self.base.radius_ref_m
        if any(abs(lyr.radius_ref_m - self.radius_ref_m) > 1e-6 for lyr in layers):
            raise ValueError("layers use different reference radii")
        self.scale_m = self.base.scale_m

    def sample_with_source(self, lat: NDArray[np.float64], lon: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.int64]]:
        lat = np.asarray(lat, dtype=np.float64)
        lon = np.asarray(lon, dtype=np.float64)
        out = np.full(lat.shape, np.nan)
        src = np.full(lat.shape, -1, dtype=np.int64)
        for i, lyr in enumerate(self.layers):
            todo = np.isnan(out)
            if not np.any(todo):
                break
            v = lyr.sample_height(lat[todo], lon[todo])
            got = np.isfinite(v)
            idx = np.flatnonzero(todo)[got]
            out.flat[idx] = v[got]
            src.flat[idx] = i
        return out, src

    def sample_height(self, lat: NDArray[np.float64], lon: NDArray[np.float64]) -> NDArray[np.float64]:
        return self.sample_with_source(lat, lon)[0]

    def finest_at(self, lat: float, lon: float) -> Any:
        _, src = self.sample_with_source(np.array([lat]), np.array([lon]))
        return self.layers[int(src[0])] if src[0] >= 0 else None


def available_tiled(cache_root: Path) -> list[TiledPolarDem]:
    """Tiled products whose label is cached (opening never touches the network in that case)."""
    out = []
    for pid, spec in TILED_PRODUCTS.items():
        if (cache_root / pid / f"{spec['file']}.lbl").exists():
            out.append(TiledPolarDem.open(pid, cache_root))
    return sorted(out, key=lambda d: d.scale_m)


def metres_per_degree_lat(radius_m: float) -> float:
    return radius_m * math.pi / 180.0
