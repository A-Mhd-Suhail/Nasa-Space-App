import { z } from "zod";
import { assertWorkspaceAccess, audit, requireApiUser } from "@/lib/dal";
import { json, notFound, readJson, route } from "@/lib/http";
import { repos } from "@/repositories";

type Ctx = { params: Promise<{ locationId: string }> };

async function load(locationId: string) {
  const l = await repos().sites.getSaved(locationId);
  if (!l) throw notFound("Location");
  return l;
}

/** Edit a saved location's name and notes (coordinates are fixed; save a new location to move it). */
export const PATCH = route<Ctx>(async (req, { params }, requestId) => {
  const u = await requireApiUser();
  const { locationId } = await params;
  const l = await load(locationId);
  await assertWorkspaceAccess(u, l.workspaceId, "editor");
  const b = z.object({ name: z.string().trim().min(1).max(80).optional(), note: z.string().max(500).nullable().optional() }).parse(await readJson(req));
  const updated = await repos().sites.updateSaved(locationId, b);
  await audit({ actorUserId: u.id, action: "location.update", objectType: "location", objectId: locationId, requestId });
  return json({ location: updated });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const u = await requireApiUser();
  const { locationId } = await params;
  const l = await load(locationId);
  await assertWorkspaceAccess(u, l.workspaceId, "editor");
  await repos().sites.deleteSaved(locationId);
  return json({ ok: true });
});
