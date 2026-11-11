import { z } from "zod";
import { rateLimit } from "@/lib/dal";
import { clientIp, json, route } from "@/lib/http";
import { quickAnalysis } from "@/lib/quick-analysis";

const q = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-360).max(360),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD (UTC)"),
  time: z.string().regex(/^\d{2}:\d{2}$/).default("00:00"),
  hours: z.coerce.number().gt(0).max(24 * 31).default(24),
  stepSeconds: z.coerce.number().int().min(60).max(86_400).default(600),
});

/** Daily (or custom-length) Sun and Earth visibility timeline for a site, starting at date+time UTC. */
export const GET = route(async (req, _ctx, requestId) => {
  await rateLimit(`timeline:${clientIp(req) ?? "anon"}`, 20, 60);
  const p = q.parse(Object.fromEntries(new URL(req.url).searchParams));
  const r = await quickAnalysis({ latitudeDeg: p.lat, longitudeDeg: p.lon, longitudeConvention: "east", startUtc: `${p.date}T${p.time}:00Z`, hours: p.hours, stepSeconds: p.stepSeconds, observerHeightM: 2, antennaMinimumElevationDeg: null }, requestId);
  return json({
    site: r.site,
    timeRange: r.timeRange,
    sun: { totalVisibleSeconds: r.sun.totalVisibleSeconds, fractionVisible: r.sun.fractionVisible, intervals: r.sun.visibleIntervals },
    earth: { totalVisibleSeconds: r.earth.dte.totalVisibleSeconds, fractionVisible: r.earth.dte.fractionVisible, windows: r.earth.dteWindows, label: r.earth.label },
    timeseries: r.timeseries.map((t) => ({ utc: t.utc, sunAzDeg: t.sunAzDeg, sunElDeg: t.sunElDeg, sunState: t.sunState, earthAzDeg: t.earthAzDeg, earthElDeg: t.earthElDeg, earthState: t.earthState, dteGeometric: t.dteGeometric })),
    quality: r.quality,
    provenance: r.provenance,
  });
});
