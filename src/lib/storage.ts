import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

/**
 * Object storage. Production: Cloudflare R2 via the S3 API (server-side only).
 * Development/test: a local filesystem driver with HMAC-signed, short-lived URLs.
 * Keys are always built server-side from typed parts - clients never supply raw keys.
 */
export type PutResult = { key: string; sha256: string; bytes: number };

const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{2,400}$/;

export const keys = {
  analysisResult: (workspaceId: string, analysisId: string) => `analysis/${workspaceId}/${analysisId}/result.json`,
  report: (workspaceId: string, reportId: string, version: number, ext: string) => `reports/${workspaceId}/${reportId}/v${version}/report.${ext}`,
};

function assertKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..")) throw new Error("invalid storage key");
}

let s3: S3Client | null = null;
function r2(): S3Client {
  const e = env();
  if (!s3) {
    s3 = new S3Client({
      region: "auto",
      endpoint: e.R2_ENDPOINT ?? `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: e.R2_ACCESS_KEY_ID!, secretAccessKey: e.R2_SECRET_ACCESS_KEY! },
    });
  }
  return s3;
}

function localPath(key: string) {
  // Local driver is development/test only; exclude from output tracing so data/ is never bundled.
  return path.join(/*turbopackIgnore: true*/ process.cwd(), env().LOCAL_STORAGE_DIR, key);
}

export async function putObject(key: string, body: Buffer | string, contentType: string): Promise<PutResult> {
  assertKey(key);
  const buf = typeof body === "string" ? Buffer.from(body) : body;
  const sha256 = createHash("sha256").update(buf).digest("hex");
  if (env().STORAGE_DRIVER === "r2") {
    await r2().send(new PutObjectCommand({ Bucket: env().R2_BUCKET!, Key: key, Body: buf, ContentType: contentType, Metadata: { sha256 }, ChecksumSHA256: Buffer.from(sha256, "hex").toString("base64") }));
  } else {
    const p = localPath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, buf);
  }
  return { key, sha256, bytes: buf.length };
}

export async function getObject(key: string): Promise<Buffer> {
  assertKey(key);
  if (env().STORAGE_DRIVER === "r2") {
    const r = await r2().send(new GetObjectCommand({ Bucket: env().R2_BUCKET!, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  return readFile(localPath(key));
}

/** Short-lived download URL. Treat as a bearer token: never log it. */
export async function presignDownload(key: string, filename: string, ttlSeconds = 300): Promise<string> {
  assertKey(key);
  const e = env();
  if (e.STORAGE_DRIVER === "r2") {
    return getSignedUrl(r2(), new GetObjectCommand({ Bucket: e.R2_BUCKET!, Key: key, ResponseContentDisposition: `attachment; filename="${filename}"` }), { expiresIn: ttlSeconds });
  }
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = sign(`${key}:${exp}:${filename}`);
  return `/api/v1/storage/local?key=${encodeURIComponent(key)}&exp=${exp}&fn=${encodeURIComponent(filename)}&sig=${sig}`;
}

function sign(payload: string): string {
  const secret = env().STORAGE_SIGNING_SECRET ?? env().BETTER_AUTH_SECRET;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyLocalSignature(key: string, exp: number, filename: string, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(`${key}:${exp}:${filename}`));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
