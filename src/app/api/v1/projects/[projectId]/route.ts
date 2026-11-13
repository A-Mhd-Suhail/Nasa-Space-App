import { projectPatch } from "@/lib/contracts";
import { requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { z } from "zod";
import { deleteProject, getProject, listScenarios, patchProject } from "@/lib/services";

type Ctx = { params: Promise<{ projectId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const u = await requireApiUser();
  const { projectId } = await params;
  return json({ project: await getProject(u, projectId), scenarios: await listScenarios(u, projectId) });
});

export const PATCH = route<Ctx>(async (req, { params }, requestId) => {
  const u = await requireApiUser();
  const { projectId } = await params;
  const patch = projectPatch.parse(await readJson(req));
  return json({ project: await patchProject(u, projectId, patch, requestId) });
});

export const DELETE = route<Ctx>(async (req, { params }, requestId) => {
  const u = await requireApiUser();
  const { projectId } = await params;
  const { confirmName } = z.object({ confirmName: z.string() }).parse(await readJson(req));
  return json({ ok: true, removed: await deleteProject(u, projectId, confirmName, requestId) });
});
