import "server-only";
import { createHash } from "node:crypto";

/**
 * Live provenance probes for the four resources the contingency simulator names. Each probe performs a real, documented
 * request and records what came back (status, bytes, SHA-256, version strings, retrieval time). Nothing is scraped, and a
 * resource that has no programmatic data interface is reported honestly as reference-only.
 */
export type SourceRecord = {
  id: "quickmap" | "moon-trek" | "jpl-horizons" | "csa-moon-exploration";
  name: string;
  organisation: string;
  url: string;
  role: "data-integrated" | "reference-only" | "partial";
  usedFor: string;
  retrievedAtUtc: string;
  checks: { label: string; url: string; status: "ok" | "failed"; httpStatus: number | null; bytes: number | null; sha256: string | null; detail: string }[];
  limitation: string;
};

const UA = "MoonNav/0.1 (NASA Space Apps lunar site navigator; research prototype)";
async function probe(url: string, init?: { method?: string; timeoutMs?: number; read?: boolean }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 12_000);
  try {
    const r = await fetch(url, { method: init?.method ?? "GET", headers: { "User-Agent": UA }, signal: ctrl.signal, redirect: "follow", cache: "no-store" });
    const buf = init?.read === false ? null : Buffer.from(await r.arrayBuffer());
    return { ok: r.ok, status: r.status, bytes: buf ? buf.length : null, sha256: buf ? createHash("sha256").update(buf).digest("hex") : null, text: buf && /xml|json|text|html/.test(r.headers.get("content-type") ?? "") ? buf.toString("utf8") : "" };
  } catch (e) {
    return { ok: false, status: null as number | null, bytes: null, sha256: null, text: "", error: (e as Error).name };
  } finally {
    clearTimeout(t);
  }
}
const check = (label: string, url: string, p: Awaited<ReturnType<typeof probe>>, detail: string) => ({ label, url, status: p.ok ? ("ok" as const) : ("failed" as const), httpStatus: p.status, bytes: p.bytes, sha256: p.sha256, detail: p.ok ? detail : `request failed${p.status ? ` (HTTP ${p.status})` : ` (${(p as { error?: string }).error ?? "network error"})`}` });

const TREK_BASE = "https://trek.nasa.gov/tiles/Moon/SP/LRO_WAC_Mosaic_SPole60_100m_v02/1.0.0";
const HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api";

export async function collectSources(): Promise<SourceRecord[]> {
  const now = new Date().toISOString();
  const [cap, tile, lola, hz, qm, csa] = await Promise.all([
    probe(`${TREK_BASE}/WMTSCapabilities.xml`),
    probe(`${TREK_BASE}/default/default028mm/2/1/1.png`),
    probe("https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04/1.0.0/WMTSCapabilities.xml"),
    probe(`${HORIZONS}?format=json&COMMAND='301'&OBJ_DATA='YES'&MAKE_EPHEM='NO'`),
    probe("https://quickmap.lroc.asu.edu/", { read: false }),
    probe("https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/", { read: false }),
  ]);
  let hzVersion = "";
  let hzRadius = "";
  try {
    const j = JSON.parse(hz.text) as { signature?: { version?: string; source?: string }; result?: string };
    hzVersion = `${j.signature?.source ?? "JPL Horizons API"} v${j.signature?.version ?? "?"}`;
    hzRadius = /Vol\. mean radius[^\n]*?([\d.]+)\s*\+-?[^\n]*/i.exec(j.result ?? "")?.[1] ?? "";
  } catch {
    /* leave empty */
  }
  const title = /<ows:Title>([^<]+)</.exec(cap.text)?.[1] ?? "unknown layer";
  const fmt = /<Format>([^<]+)</.exec(cap.text)?.[1] ?? "";
  return [
    {
      id: "quickmap", name: "QuickMap (LROC)", organisation: "Arizona State University, LROC Science Operations Center (data: NASA Lunar Reconnaissance Orbiter)", url: "https://quickmap.lroc.asu.edu/", role: "reference-only",
      usedFor: "Visual and terrain context for the south pole; linked so users can inspect the same LRO/LROC products interactively.",
      retrievedAtUtc: now,
      checks: [check("QuickMap web application reachable", "https://quickmap.lroc.asu.edu/", qm, "the interactive application responds (it is an ASU web application, not a NASA-operated API)")],
      limitation: "QuickMap is a web application. No documented public data API for it was found, so MoonNav does not scrape it and does not claim a data integration. The same LRO WAC imagery reaches MoonNav through NASA Moon Trek tiles (below).",
    },
    {
      id: "moon-trek", name: "NASA Moon Trek WMTS", organisation: "NASA (JPL / Solar System Treks Project); imagery LRO WAC mosaic by NASA/GSFC/Arizona State University", url: "https://trek.nasa.gov/moon/", role: "data-integrated",
      usedFor: "South-polar surface imagery for the 3D scene's context layer and map basemap (LRO WAC mosaic, south pole, 100 m/px). Terrain heights come from the LOLA LDEM_75S product already in MoonNav's science pipeline (NASA PGDA).",
      retrievedAtUtc: now,
      checks: [
        check("WMTS capabilities: LRO_WAC_Mosaic_SPole60_100m_v02", `${TREK_BASE}/WMTSCapabilities.xml`, cap, `layer "${title}", tile format ${fmt || "n/a"}, matrix set default028mm`),
        check("Tile 2/1/1 (south pole) downloaded", `${TREK_BASE}/default/default028mm/2/1/1.png`, tile, "real image tile; hash recorded"),
        check("Listed product: LRO_LOLA_ClrShade_Global_128ppd_v04 capabilities", "https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04/1.0.0/WMTSCapabilities.xml", lola, "LOLA colour-shaded elevation layer is published (equatorial projection; not used for the polar 3D terrain)"),
      ],
      limitation: "Moon Trek serves rendered tiles (WMTS); numeric elevation, slope and illumination come from the LOLA products MoonNav already ingests, not from tile pixels. Layer availability and tile matrices are as published by the service at retrieval time.",
    },
    {
      id: "jpl-horizons", name: "JPL Horizons API", organisation: "NASA Jet Propulsion Laboratory, Solar System Dynamics", url: "https://ssd.jpl.nasa.gov/horizons/", role: "data-integrated",
      usedFor: "Independent cross-check of the Sun and Earth directions from the landing site: SPICE is the runtime provider; Horizons az/el (observer table, CENTER=coord@301, COORD_TYPE=GEODETIC, QUANTITIES=4, airless) is compared at each environment load and its separation is shown.",
      retrievedAtUtc: now,
      checks: [check(`Horizons API (${HORIZONS}) answered`, HORIZONS, hz, hzVersion ? `${hzVersion}${hzRadius ? `; Moon mean radius ${hzRadius} km` : ""}` : "API responded")],
      limitation: "SPICE and Horizons derive from closely related JPL ephemerides, so agreement validates frames, light time and time conversions, not the ephemeris itself. If Horizons is unreachable the simulator says so and keeps the SPICE result.",
    },
    {
      id: "csa-moon-exploration", name: "Canadian Space Agency: Moon exploration", organisation: "Canadian Space Agency", url: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/", role: "reference-only",
      usedFor: "Explains why future lunar orbital infrastructure (Gateway) and robotics (Canadarm3) matter for surface missions; informs the wording of the simulated relay and its assumptions.",
      retrievedAtUtc: now,
      checks: [check("CSA Moon exploration page reachable", "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/", csa, "the page lists Canadarm3 (Gateway's robotic system), Gateway, the Canadian utility rover and the Artemis campaign")],
      limitation: "An information portal, not a telemetry or ephemeris service. No spacecraft positions, relay availability or link data are taken from it. Gateway is described as planned future infrastructure; the relay in this simulator is hypothetical.",
    },
  ];
}
