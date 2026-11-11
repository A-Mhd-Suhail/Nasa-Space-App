import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit, requireApiRole } from "@/lib/dal";
import { ApiError, clientIp, json, notFound, readJson, route } from "@/lib/http";

const body = z.object({ status: z.enum(["validated", "approved", "deprecated", "blocked", "failed"]), reason: z.string().trim().min(3).max(500) });
const ALLOWED: Record<string, string[]> = {
  discovered: ["validated", "blocked", "failed"],
  downloaded: ["validated", "blocked", "failed"],
  validated: ["approved", "blocked", "failed"],
  processing: ["failed"],
  approved: ["deprecated"],
  deprecated: [],
  failed: ["validated"],
  blocked: ["validated"],
};

/** Curator workflow: approve/deprecate a product version. Approved versions are never overwritten. */
export const PATCH = route<{ params: Promise<{ productId: string }> }>(async (req, { params }, requestId) => {
  const u = await requireApiRole("curator");
  const { productId } = await params;
  const { status, reason } = body.parse(await readJson(req));
  const [p] = await db().select().from(schema.dataProducts).where(eq(schema.dataProducts.id, productId)).limit(1);
  if (!p) throw notFound("Data product");
  if (!ALLOWED[p.status]?.includes(status)) throw new ApiError(409, "invalid_transition", `Cannot move from ${p.status} to ${status}`);
  if (status === "approved" && !p.sha256 && p.kind === "dem") throw new ApiError(409, "missing_checksum", "Approval requires a recorded checksum");
  await db().update(schema.dataProducts).set({ status, statusReason: reason, updatedAt: new Date(), ...(status === "approved" ? { approvedBy: u.id, approvedAt: new Date() } : {}) }).where(eq(schema.dataProducts.id, productId));
  await db().insert(schema.dataIngestionRuns).values({ id: `ing_${randomUUID()}`, dataProductId: productId, status: "succeeded", steps: [{ step: `status:${p.status}->${status}`, ok: true, detail: reason, at: new Date().toISOString() }], createdBy: u.id, finishedAt: new Date() });
  await audit({ actorUserId: u.id, action: "data_product.status", objectType: "data_product", objectId: productId, metadata: { from: p.status, to: status, reason }, ip: clientIp(req), requestId });
  return json({ ok: true, status });
});
