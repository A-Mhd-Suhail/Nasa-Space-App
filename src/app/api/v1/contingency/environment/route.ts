/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped JSON from the science service; every field is validated before use */
import { z } from "zod";
import { rateLimit, requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { science } from "@/lib/science";
import { candidatesFromHazards } from "@/lib/contingency/environment";

const body = z.object({
  latitudeDeg: z.number().min(-90).max(-75),
  longitudeEastDeg: z.number().min(-360).max(360),
  utc: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/),
  candidateRadiusM: z.number().min(500).max(8000).default(3000),
});
type Illum = { permanentShadow: boolean | null; averageSunVisibility: number | null; averageEarthVisibility: number | null };

/**
 * Everything the simulator needs about a landing target at an epoch, from MoonNav's own science pipeline:
 * SPICE Sun/Earth direction, the LOLA terrain horizon, a live JPL Horizons cross-check (best effort, never a silent
 * substitute), and candidate landing zones from the LOLA hazard screening with long-term illumination.
 */
export const POST = route(async (req, _ctx, requestId) => {
  const u = await requireApiUser();
  await rateLimit(`contingency-env:${u.id}`, 30, 60);
  const b = body.parse(await readJson(req));
  const utc = b.utc.length === 17 ? b.utc.replace("Z", ":00Z") : b.utc;
  const [eph, hor, hz] = await Promise.all([
    science<Record<string, any>>("/v1/ephemeris", { method: "POST", body: { latitudeDeg: b.latitudeDeg, longitudeEastDeg: b.longitudeEastDeg, utc }, requestId, timeoutMs: 25_000 }),
    science<Record<string, any>>("/v1/horizon", { method: "POST", body: { latitudeDeg: b.latitudeDeg, longitudeEastDeg: b.longitudeEastDeg, observerHeightM: 2 }, requestId, timeoutMs: 40_000 }),
    science<Record<string, any>>("/v1/terrain/hazards", { method: "POST", body: { latitudeDeg: b.latitudeDeg, longitudeEastDeg: b.longitudeEastDeg, halfSizeM: Math.max(6000, b.candidateRadiusM), fetchHighRes: false }, requestId, timeoutMs: 60_000 }).catch(() => null),
  ]);
  const stop = new Date(Date.parse(utc) + 3_600_000).toISOString().replace(/\.\d+Z$/, "Z");
  const hc = await science<Record<string, any>>("/v1/validate/horizons", { method: "POST", body: { latitudeDeg: b.latitudeDeg, longitudeEastDeg: b.longitudeEastDeg, heightM: eph.site?.heightM ?? 0, startUtc: utc, stopUtc: stop, samples: 3 }, requestId, timeoutMs: 45_000 })
    .then((r) => ({ status: r.status as string, maxSeparationDeg: Math.max(r.bodies?.sun?.maxSeparationDeg ?? 0, r.bodies?.earth?.maxSeparationDeg ?? 0), detail: `JPL Horizons observer table (${r.horizons?.source ?? "ssd.jpl.nasa.gov/api/horizons.api"}) vs SPICE for the Sun and Earth, 3 epochs over 1 h`, retrievedAtUtc: new Date().toISOString() }))
    .catch((e: { message?: string }) => ({ status: "unavailable", maxSeparationDeg: null, detail: `JPL Horizons could not be reached (${e?.message ?? "error"}); the SPICE result is unchanged and unverified by Horizons`, retrievedAtUtc: new Date().toISOString() }));

  let candidates: ReturnType<typeof candidatesFromHazards>["candidates"] = [];
  let unknownFraction: number | null = null;
  let candidateNote = "terrain screening unavailable: no candidate landing zones could be evaluated";
  if (hz) {
    const c = candidatesFromHazards(hz as never, { maxCount: 6, minSeparationM: 600, maxRangeM: b.candidateRadiusM, targetHeightM: eph.site?.heightM ?? 0 });
    candidates = c.candidates;
    unknownFraction = c.unknownFraction;
    candidateNote = `from LOLA terrain screening at ${(hz as { finestResolutionM?: number }).finestResolutionM ?? "?"} m cells (${String((hz as { terrainData?: { status?: string } }).terrainData?.status ?? "cached-only")}); boulders and craters smaller than a cell are not assessed`;
    await Promise.all(
      candidates.map(async (c) => {
        const il = await science<Illum>(`/v1/illumination/point?lat=${c.latDeg}&lon=${c.lonEastDeg}`, { timeoutMs: 8000 }).catch(() => null);
        if (!il) return;
        c.permanentShadow = typeof il.permanentShadow === "boolean" ? il.permanentShadow : null;
        c.sunPct = typeof il.averageSunVisibility === "number" ? il.averageSunVisibility * 100 : null;
        c.earthPct = typeof il.averageEarthVisibility === "number" ? il.averageEarthVisibility * 100 : null;
      }),
    );
  }
  const g = hz as { grid?: { spacingM: number; size: number; halfSizeM: number }; heightM?: (number | null)[][]; slopeDeg?: (number | null)[][]; finestResolutionM?: number } | null;
  const terrain = g?.grid && g.heightM ? { spacingM: g.grid.spacingM, size: g.grid.size, halfSizeM: g.grid.halfSizeM, resolutionM: g.finestResolutionM ?? g.grid.spacingM, heightM: g.heightM, orientation: "stereographic map plane, row 0 toward +y; rotate by the site longitude for east/north", source: "LOLA terrain via MoonNav screening (heights relative to the reference sphere)" } : null;
  return json({
    utc: eph.utc, site: eph.site, bodies: eph.bodies, horizon: hor.horizon, provenance: { ephemeris: `NAIF SPICE spkcpo (light time + stellar aberration, MOON_ME), method ${hor.methodVersion ?? ""}`, terrain: `${(hor.product as { productId?: string; fileName?: string } | undefined)?.productId ?? "LOLA LDEM_75S"} (horizon)` },
    horizonsCheck: hc, retrievedAtUtc: new Date().toISOString(), candidates, candidateNote, unknownFraction, terrain, notes: [eph.terrainNote].filter(Boolean),
  });
});
export const maxDuration = 120;
