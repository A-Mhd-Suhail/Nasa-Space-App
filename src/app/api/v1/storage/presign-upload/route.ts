import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { audit, rateLimit, requireApiRole } from "@/lib/dal";
import { env } from "@/lib/env";
import { ApiError, json, readJson, route } from "@/lib/http";

const ALLOWED = { "application/octet-stream": [".img", ".tif", ".bsp", ".bpc"], "text/plain": [".lbl", ".tf", ".tls", ".tpc", ".txt"], "application/xml": [".xml"] } as const;
const body = z.object({
  filename: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/, "Use letters, digits, dot, dash or underscore"),
  contentType: z.enum(Object.keys(ALLOWED) as [keyof typeof ALLOWED, ...(keyof typeof ALLOWED)[]]),
  bytes: z.number().int().positive().max(2_000_000_000),
});

/** Data curators stage source files for validation. Server builds the key; R2 only. */
export const POST = route(async (req, _ctx, requestId) => {
  const u = await requireApiRole("curator");
  await rateLimit(`upload:${u.id}`, 20, 60);
  const b = body.parse(await readJson(req));
  const ext = b.filename.slice(b.filename.lastIndexOf(".")).toLowerCase();
  if (!(ALLOWED[b.contentType] as readonly string[]).includes(ext)) throw new ApiError(422, "invalid_input", "File type does not match content type", [{ field: "filename", message: "Unexpected extension" }]);
  const e = env();
  if (e.STORAGE_DRIVER !== "r2") throw new ApiError(501, "not_configured", "Direct uploads require the R2 storage driver (configure R2_* variables). Use scripts/fetch_data.sh locally.");
  const key = `source/uploads/${u.id}/${randomUUID()}/${b.filename}`;
  const s3 = new S3Client({ region: "auto", endpoint: e.R2_ENDPOINT ?? `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: e.R2_ACCESS_KEY_ID!, secretAccessKey: e.R2_SECRET_ACCESS_KEY! } });
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: e.R2_BUCKET!, Key: key, ContentType: b.contentType, ContentLength: b.bytes }), { expiresIn: 600 });
  await audit({ actorUserId: u.id, action: "storage.presign_upload", objectType: "object", objectId: key, metadata: { bytes: b.bytes }, requestId });
  return json({ url, key, expiresInSeconds: 600 });
});
