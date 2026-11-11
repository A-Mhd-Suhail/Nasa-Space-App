import { requireApiUser } from "@/lib/dal";
import { json, route } from "@/lib/http";
import { duplicateProject } from "@/lib/services";

export const POST = route<{ params: Promise<{ projectId: string }> }>(async (_req, { params }, requestId) => {
  const u = await requireApiUser();
  const { projectId } = await params;
  return json({ project: await duplicateProject(u, projectId, requestId) }, 201);
});
