import { z } from "zod";
import { rateLimit } from "@/lib/dal";
import { ApiError, clientIp, json, route } from "@/lib/http";
import { science } from "@/lib/science";

const q = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-360).max(360),
    utc: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  })
  .refine((v) => v.utc || v.date, { message: "Provide utc=YYYY-MM-DDTHH:MM:SSZ or date=YYYY-MM-DD&time=HH:MM (UTC)" });

type Eph = { utc: string; site: unknown; bodies: Record<"sun" | "earth", Record<string, unknown>>; provenance: unknown };

/** Sun or Earth azimuth / elevation / distance from a lunar surface site at a UTC time, with terrain visibility. */
export const GET = route<{ params: Promise<{ body: string }> }>(async (req, { params }, requestId) => {
  const { body } = await params;
  if (body !== "sun" && body !== "earth") throw new ApiError(404, "not_found", "Use /ephemeris/sun or /ephemeris/earth");
  await rateLimit(`ephemeris:${clientIp(req) ?? "anon"}`, 120, 60);
  const p = q.parse(Object.fromEntries(new URL(req.url).searchParams));
  const utc = p.utc ?? `${p.date}T${(p.time ?? "00:00").length === 5 ? `${p.time ?? "00:00"}:00` : p.time}Z`;
  const r = await science<Eph>("/v1/ephemeris", { method: "POST", body: { latitudeDeg: p.lat, longitudeEastDeg: p.lon, utc }, requestId, timeoutMs: 20_000 });
  return json({ body, utc: r.utc, site: r.site, ...r.bodies[body], provenance: r.provenance, conventions: { azimuth: "degrees clockwise from local north", elevation: "degrees above the local horizontal plane (signed)", longitude: "east-positive [0,360)", frame: "MOON_ME topocentric ENU" } });
});
