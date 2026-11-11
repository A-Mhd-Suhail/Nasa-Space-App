import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

/**
 * Object storage. Production: Cloudflare R2 via the S3 API, or a private Supabase Storage bucket via its
 * REST API with the service key (both server-side only; the key never reaches the browser).
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

// ---- Supabase Storage (private bucket) ------------------------------------------------------
function sb() {
  const e = env();
  const base = `${(e.SUPABASE_URL ?? e.NEXT_PUBLIC_SUPABASE_URL)!.replace(/\/+$/, "")}/storage/v1`;
  const k = e.SUPABASE_SERVICE_ROLE_KEY!;
  // New-style secret keys (sb_secret_…) go in `apikey` only; legacy service_role JWTs also as Bearer.
  const headers: Record<string, string> = k.startsWith("sb_") ? { apikey: k } : { apikey: k, Authorization: `Bearer ${k}` };
  return { base, headers, bucket: e.SUPABASE_STORAGE_BUCKET };
}
const objPath = (key: string) => key.split("/").map(encodeURIComponent).join("/");
let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const { base, headers, bucket } = sb();
  const r = await fetch(`${base}/bucket/${bucket}`, { headers, cache: "no-store" });
  if (!r.ok) {
    const c = await fetch(`${base}/bucket`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ id: bucket, name: bucket, public: false }) });
    if (!c.ok && c.status !== 409) throw new Error(`storage bucket unavailable (HTTP ${c.status})`);
  }
  bucketReady = true;
}

function localPath(key: string) {
  // Local driver is development/test only; exclude from output tracing so data/ is never bundled.
  return path.join(/*turbopackIgnore: true*/ process.cwd(), env().LOCAL_STORAGE_DIR, key);
}

export async function putObject(key: string, body: Buffer | string, contentType: string): Promise<PutResult> {
  assertKey(key);
  const buf = typeof body === "string" ? Buffer.from(body) : body;
  const sha256 = createHash("sha256").update(buf).digest("hex");
  if (env().STORAGE_DRIVER === "supabase") {
    await ensureBucket();
    const { base, headers, bucket } = sb();
    const r = await fetch(`${base}/object/${bucket}/${objPath(key)}`, { method: "POST", headers: { ...headers, "Content-Type": contentType, "x-upsert": "true" }, body: new Uint8Array(buf) });
    if (!r.ok) throw new Error(`storage upload failed (HTTP ${r.status})`);
  } else if (env().STORAGE_DRIVER === "r2") {
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
  if (env().STORAGE_DRIVER === "supabase") {
    const { base, headers, bucket } = sb();
    const r = await fetch(`${base}/object/authenticated/${bucket}/${objPath(key)}`, { headers, cache: "no-store" });
    if (!r.ok) throw new Error(`storage read failed (HTTP ${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  }
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
  if (e.STORAGE_DRIVER === "supabase") {
    const { base, headers, bucket } = sb();
    const r = await fetch(`${base}/object/sign/${bucket}/${objPath(key)}`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: ttlSeconds }), cache: "no-store" });
    if (!r.ok) throw new Error(`storage signing failed (HTTP ${r.status})`);
    const { signedURL } = (await r.json()) as { signedURL: string };
    return `${base}${signedURL}&download=${encodeURIComponent(filename)}`;
  }
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
