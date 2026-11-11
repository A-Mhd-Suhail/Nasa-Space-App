import "server-only";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { assertWorkspaceAccess, audit, hasRole, type SessionUser } from "./dal";
import { ApiError, notFound } from "./http";

export type AnnotationKind = "note" | "concern" | "approval" | "correction";

export const ANNOTATION_KINDS: AnnotationKind[] = ["note", "concern", "approval", "correction"];

export type AnnotationRow = {
  id: string;
  analysisId: string;
  workspaceId: string;
  body: string;
  kind: string;
  anchor: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * List annotations on an analysis. Any workspace member can read; only
 * analysts (or higher) can write. Authors can edit/delete their own; admins can
 * delete anyone's.
 */
export async function listAnnotations(u: SessionUser, analysisId: string) {
  const [a] = await db().select().from(schema.analyses).where(eq(schema.analyses.id, analysisId)).limit(1);
  if (!a) throw notFound("Analysis");
  await assertWorkspaceAccess(u, a.workspaceId);
  return db()
    .select({
      id: schema.analysisAnnotations.id,
      analysisId: schema.analysisAnnotations.analysisId,
      workspaceId: schema.analysisAnnotations.workspaceId,
      body: schema.analysisAnnotations.body,
      kind: schema.analysisAnnotations.kind,
      anchor: schema.analysisAnnotations.anchor,
      createdBy: schema.analysisAnnotations.createdBy,
      createdAt: schema.analysisAnnotations.createdAt,
      updatedAt: schema.analysisAnnotations.updatedAt,
      authorName: schema.user.name,
      authorRole: schema.user.role,
    })
    .from(schema.analysisAnnotations)
    .innerJoin(schema.user, eq(schema.user.id, schema.analysisAnnotations.createdBy))
    .where(eq(schema.analysisAnnotations.analysisId, analysisId))
    .orderBy(desc(schema.analysisAnnotations.createdAt));
}

export async function createAnnotation(u: SessionUser, analysisId: string, input: { body: string; kind?: AnnotationKind; anchor?: string | null }, requestId?: string) {
  if (!hasRole(u, "analyst")) throw new ApiError(403, "forbidden", "The analyst role is required to annotate analyses");
  const [a] = await db().select().from(schema.analyses).where(eq(schema.analyses.id, analysisId)).limit(1);
  if (!a) throw notFound("Analysis");
  await assertWorkspaceAccess(u, a.workspaceId, "editor");
  const body = input.body.trim();
  if (body.length < 1 || body.length > 4000) throw new ApiError(422, "invalid_input", "Annotation body must be 1–4000 characters", [{ field: "body", message: "1–4000 characters required" }]);
  const kind = input.kind ?? "note";
  if (!ANNOTATION_KINDS.includes(kind)) throw new ApiError(422, "invalid_input", "Unknown annotation kind", [{ field: "kind", message: `Must be one of ${ANNOTATION_KINDS.join(", ")}` }]);
  const id = `ann_${randomUUID()}`;
  await db().insert(schema.analysisAnnotations).values({ id, analysisId, workspaceId: a.workspaceId, body, kind, anchor: input.anchor ?? null, createdBy: u.id });
  await audit({ actorUserId: u.id, action: "annotation.create", objectType: "analysis", objectId: analysisId, metadata: { annotationId: id, kind }, requestId });
  return getAnnotation(u, id);
}

export async function getAnnotation(_u: SessionUser, annotationId: string) {
  const [r] = await db()
    .select({
      id: schema.analysisAnnotations.id,
      analysisId: schema.analysisAnnotations.analysisId,
      workspaceId: schema.analysisAnnotations.workspaceId,
      body: schema.analysisAnnotations.body,
      kind: schema.analysisAnnotations.kind,
      anchor: schema.analysisAnnotations.anchor,
      createdBy: schema.analysisAnnotations.createdBy,
      createdAt: schema.analysisAnnotations.createdAt,
      updatedAt: schema.analysisAnnotations.updatedAt,
      authorName: schema.user.name,
      authorRole: schema.user.role,
    })
    .from(schema.analysisAnnotations)
    .innerJoin(schema.user, eq(schema.user.id, schema.analysisAnnotations.createdBy))
    .where(eq(schema.analysisAnnotations.id, annotationId))
    .limit(1);
  if (!r) throw notFound("Annotation");
  return r;
}

export async function deleteAnnotation(u: SessionUser, annotationId: string, requestId?: string) {
  const [r] = await db().select().from(schema.analysisAnnotations).where(eq(schema.analysisAnnotations.id, annotationId)).limit(1);
  if (!r) throw notFound("Annotation");
  // Author, admin, or any analyst in the same workspace can remove.
  if (r.createdBy !== u.id && !hasRole(u, "admin")) {
    await assertWorkspaceAccess(u, r.workspaceId, "editor");
    if (!hasRole(u, "analyst")) throw new ApiError(403, "forbidden", "Only the author, an admin, or an analyst in the workspace can delete this annotation");
  }
  await db().delete(schema.analysisAnnotations).where(eq(schema.analysisAnnotations.id, annotationId));
  await audit({ actorUserId: u.id, action: "annotation.delete", objectType: "analysis", objectId: r.analysisId, metadata: { annotationId }, requestId });
}
