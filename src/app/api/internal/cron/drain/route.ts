import { timingSafeEqual } from "node:crypto";
import { drainJobs } from "@/lib/jobs";

export const maxDuration = 300;

/** Vercel Cron backstop for on-demand jobs. Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ ok: true, ...(await drainJobs()) });
}
