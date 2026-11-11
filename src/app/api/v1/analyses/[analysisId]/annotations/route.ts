import { z } from "zod";
import { requireApiUser } from "@/lib/dal";
import { json, readJson, route } from "@/lib/http";
import { ANNOTATION_KINDS, createAnnotation, listAnnotations } from "@/lib/annotations";

type Ctx = { params: Promise<{ analysisId: string }> };

/** List annotations on an analysis (workspace members). */
export const GET = route<Ctx>(async (_req, { params }) => {
  const u = await requireApiUser();
  const { analysisId } = await params;
  const annotations = await listAnnotations(u, analysisId);
  return json({ annotations });
});

/** Create an annotation (analyst+ role, workspace editor). */
export const POST = route<Ctx>(async (req, { params }, requestId) => {
  const u = await requireApiUser();
  const { analysisId } = await params;
  const { body, kind, anchor } = z.object({
    body: z.string().min(1).max(4000),
    kind: z.enum(ANNOTATION_KINDS as [string, ...string[]]).optional(),
    anchor: z.string().max(200).optional(),
  }).parse(await readJson(req));
  const annotation = await createAnnotation(u, analysisId, { body, kind: kind as never, anchor }, requestId);
  return json({ annotation }, 201);
});
