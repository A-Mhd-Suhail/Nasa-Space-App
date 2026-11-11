import { z } from "zod";
import { currentWorkspace, listWorkspaces, requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { createWorkspace } from "@/lib/workspaces";

export const GET = route(async () => {
  const u = await requireApiUser();
  return json({ workspaces: await listWorkspaces(u), currentId: (await currentWorkspace(u)).id });
});

export const POST = route(async (req, _ctx, requestId) => {
  const u = await requireApiUser();
  const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(await readJson(req));
  return json({ workspace: await createWorkspace(u, name, requestId) }, 201);
});
