import { projectInput } from "@/lib/contracts";
import { requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { createProject, listProjects } from "@/lib/services";

export const GET = route(async (req) => {
  const u = await requireApiUser();
  const all = new URL(req.url).searchParams.get("archived") === "1";
  return json({ projects: await listProjects(u, all) });
});

export const POST = route(async (req, _ctx, requestId) => {
  const u = await requireApiUser();
  const input = projectInput.parse(await readJson(req));
  return json({ project: await createProject(u, input, requestId) }, 201);
});
