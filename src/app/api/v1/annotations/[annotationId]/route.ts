import { requireApiUser } from "@/lib/dal";
import { json, route } from "@/lib/http";
import { deleteAnnotation } from "@/lib/annotations";

type Ctx = { params: Promise<{ annotationId: string }> };

/** Delete an annotation (author, admin, or analyst in the workspace). */
export const DELETE = route<Ctx>(async (_req, { params }, requestId) => {
  const u = await requireApiUser();
  const { annotationId } = await params;
  await deleteAnnotation(u, annotationId, requestId);
  return json({ ok: true });
});
