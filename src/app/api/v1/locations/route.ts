import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DEM_MAX_LATITUDE, normalizeLonEast } from "@/lib/contracts";
import { audit, currentWorkspaceId, requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { repos } from "@/repositories";

const body = z.object({
  name: z.string().trim().min(1).max(80),
  latitudeDeg: z.number().min(-90).max(DEM_MAX_LATITUDE, "Locations must lie inside LOLA terrain coverage (75°S–90°S)"),
  longitudeEastDeg: z.number().min(-360).max(360),
  siteId: z.string().max(64).nullable().optional(),
  note: z.string().max(500).optional(),
});

export const GET = route(async () => {
  const u = await requireApiUser();
  const ws = await currentWorkspaceId(u);
  return json({ locations: await repos().sites.listSaved(ws) });
});

export const POST = route(async (req, _ctx, requestId) => {
  const u = await requireApiUser();
  const ws = await currentWorkspaceId(u, "editor");
  const b = body.parse(await readJson(req));
  const id = `loc_${randomUUID()}`;
  await repos().sites.createSaved({ id, workspaceId: ws, name: b.name, latitudeDeg: b.latitudeDeg, longitudeEastDeg: normalizeLonEast(b.longitudeEastDeg), siteId: b.siteId ?? null, note: b.note ?? null, createdBy: u.id });
  await audit({ actorUserId: u.id, action: "location.create", objectType: "location", objectId: id, requestId });
  return json({ id }, 201);
});
