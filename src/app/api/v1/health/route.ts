import { sql } from "drizzle-orm";
import { db } from "@/db";
import { json, route } from "@/lib/http";
import { workerStatus } from "@/lib/jobs";
import { scienceHealth } from "@/lib/science";

export const dynamic = "force-dynamic";

/** Readiness: distinguishes web app, database, science API, worker and dataset availability. */
export const GET = route(async () => {
  const out: Record<string, unknown> = { web: { status: "ok", version: "0.1.0" } };
  try {
    await db().execute(sql`select 1`);
    out.database = { status: "ok" };
  } catch {
    out.database = { status: "unavailable" };
  }
  const sci = await scienceHealth();
  out.science = sci;
  out.datasets = sci.status === "unavailable" ? { status: "unknown" } : { kernels: sci.kernels, terrain: sci.terrain };
  try {
    const w = await workerStatus();
    out.worker = { status: w.liveWorkers > 0 ? "ok" : "no_live_worker", ...w };
  } catch {
    out.worker = { status: "unknown" };
  }
  const dbOk = (out.database as { status: string }).status === "ok";
  return json({ status: dbOk ? (sci.status === "ok" ? "ok" : "degraded") : "unavailable", checkedAtUtc: new Date().toISOString(), ...out }, dbOk ? 200 : 503);
});
