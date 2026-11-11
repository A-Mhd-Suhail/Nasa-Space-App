import { z } from "zod";
import { requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { removeMember, setMemberRole } from "@/lib/workspaces";

type Ctx = { params: Promise<{ workspaceId: string; userId: string }> };

export const PATCH = route<Ctx>(async (req, { params }, requestId) => {
  const u = await requireApiUser();
  const { workspaceId, userId } = await params;
  const { role } = z.object({ role: z.enum(["editor", "viewer"]) }).parse(await readJson(req));
  await setMemberRole(u, workspaceId, userId, role, requestId);
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, { params }, requestId) => {
  const u = await requireApiUser();
  const { workspaceId, userId } = await params;
  await removeMember(u, workspaceId, userId, requestId);
  return json({ ok: true });
});
