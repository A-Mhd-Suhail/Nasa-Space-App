import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { ApiError } from "./http";

/** Worker <-> web authentication with the shared service token (constant-time compare). */
export function requireServiceToken(req: Request): string {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env().SCIENCE_SERVICE_TOKEN}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new ApiError(401, "unauthorized", "Invalid service token");
  return (req.headers.get("x-worker-id") ?? "unknown").slice(0, 120);
}
