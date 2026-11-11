#!/usr/bin/env node
/* Print the readiness of every local service (exit 1 if anything required is down). */
process.loadEnvFile?.(".env.local");
const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
try {
  const h = await (await fetch(`${APP_URL}/api/v1/health`)).json();
  const rows = [
    ["web", h.web?.status],
    ["database", h.database?.status],
    ["science API", h.science?.status],
    ["SPICE kernels", h.science?.kernels?.status],
    ["LOLA terrain", h.science?.terrain?.status],
    ["worker", `${h.worker?.status} (${h.worker?.liveWorkers ?? 0} live, ${h.worker?.activeJobs ?? 0} active jobs)`],
  ];
  for (const [k, v] of rows) console.log(`${String(k).padEnd(14)} ${v}`);
  process.exit(h.status === "ok" && h.worker?.status === "ok" ? 0 : 1);
} catch (e) {
  console.log(`web            unreachable at ${APP_URL} (${e.message})`);
  process.exit(1);
}
