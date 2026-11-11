import { timingSafeEqual } from "node:crypto";
import { science } from "@/lib/science";

export const maxDuration = 300;

/** Vercel Cron backstop for on-demand jobs. Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const r = await science<{ processed: number; seconds: number }>("/v1/worker/drain?budget_s=240", { method: "POST", timeoutMs: 270_000 });
    return Response.json({ ok: true, ...r });
  } catch {
    return Response.json({ ok: false, error: "science_unavailable" }, { status: 503 });
  }
}
