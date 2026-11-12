import { sql } from "drizzle-orm";
import { db } from "@/db";
import { json, route } from "@/lib/http";
import { workerStatus } from "@/lib/jobs";
import { scienceHealth } from "@/lib/science";

export const dynamic = "force-dynamic";

const timed = async <T>(fn: () => Promise<T>) => {
  const t0 = performance.now();
  const v = await fn();
  return { v, ms: Math.round(performance.now() - t0) };
};

/** Readiness: distinguishes web app, database, science API, worker and dataset availability (checked concurrently). */
export const GET = route(async () => {
  const [dbRes, sciRes, workerRes] = await Promise.allSettled([
    timed(async () => {
      await db().execute(sql`select 1`); // may include connection setup
      return (await timed(() => db().execute(sql`select 1`))).ms; // one warm round trip = the per-query network cost
    }),
    timed(() => scienceHealth()),
    timed(() => workerStatus()),
  ]);
  const out: Record<string, unknown> = { web: { status: "ok", version: "0.1.0", region: process.env.VERCEL_REGION ?? null } };
  out.database = dbRes.status === "fulfilled" ? { status: "ok", roundTripMs: dbRes.value.v, checkMs: dbRes.value.ms } : { status: "unavailable" };
  const sci = sciRes.status === "fulfilled" ? sciRes.value.v : { status: "unavailable" };
  out.science = { ...sci, checkMs: sciRes.status === "fulfilled" ? sciRes.value.ms : null };
  out.datasets = sci.status === "unavailable" ? { status: "unknown" } : { kernels: (sci as { kernels?: unknown }).kernels, terrain: (sci as { terrain?: unknown }).terrain };
  out.worker = workerRes.status === "fulfilled" ? { status: workerRes.value.v.liveWorkers > 0 ? "ok" : workerRes.value.v.onDemand ? "on_demand" : "no_live_worker", ...workerRes.value.v } : { status: "unknown" };
  const dbOk = dbRes.status === "fulfilled";
  return json({ status: dbOk ? (sci.status === "ok" ? "ok" : "degraded") : "unavailable", checkedAtUtc: new Date().toISOString(), ...out }, dbOk ? 200 : 503);
});
