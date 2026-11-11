import { z } from "zod";
import { requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { deleteWorkspace, renameWorkspace } from "@/lib/workspaces";

type Ctx = { params: Promise<{ workspaceId: string }> };

export const PATCH = route<Ctx>(async (req, { params }, requestId) => {
  const u = await requireApiUser();
  const { workspaceId } = await params;
  const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(await readJson(req));
  await renameWorkspace(u, workspaceId, name, requestId);
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (req, { params }, requestId) => {
  const u = await requireApiUser();
  const { workspaceId } = await params;
  const { confirmName } = z.object({ confirmName: z.string() }).parse(await readJson(req));
  await deleteWorkspace(u, workspaceId, confirmName, requestId);
  return json({ ok: true });
});
