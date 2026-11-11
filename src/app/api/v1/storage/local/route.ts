import { ApiError, route } from "@/lib/http";
import { env } from "@/lib/env";
import { getObject, verifyLocalSignature } from "@/lib/storage";

const TYPES: Record<string, string> = { pdf: "application/pdf", csv: "text/csv; charset=utf-8", json: "application/json" };

/** Local-driver signed download (development/test only). */
export const GET = route(async (req) => {
  if (env().STORAGE_DRIVER !== "local") throw new ApiError(404, "not_found", "Not found");
  const p = new URL(req.url).searchParams;
  const key = p.get("key") ?? "";
  const exp = Number(p.get("exp"));
  const fn = p.get("fn") ?? "download";
  if (!verifyLocalSignature(key, exp, fn, p.get("sig") ?? "")) throw new ApiError(403, "invalid_signature", "Link expired or invalid");
  const buf = await getObject(key);
  const ext = fn.split(".").pop() ?? "";
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Content-Disposition": `attachment; filename="${fn.replace(/[^A-Za-z0-9._-]/g, "_")}"`, "Cache-Control": "private, no-store" },
  });
});
