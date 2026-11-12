#!/usr/bin/env node
/* One reproducible, isolated configuration for the complete E2E suite.

     node scripts/test-stack.mjs [playwright args...]      e.g.  npm run test:e2e:stack -- --project=firefox

   - Database: project-local PostgreSQL (port 54329), database `moonnav_test`, dropped and rebuilt on every run.
     It never touches Supabase or any remote database.
   - Mail: MAIL_DRIVER=outbox (messages go to data/outbox, nothing is ever sent); storage: local filesystem.
   - Jobs: the polling worker (the production path, the serverless drain, is covered by its own tests).
   - Web: a production build (`next build` + `next start`), the same code path as the deployment.
   - Every variable the app and tests read is set explicitly below, so editing .env.local while the suite runs
     (or having Supabase/SMTP values in it) cannot change the configuration.
   - Health of database, science API and worker is verified before the first test starts. */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";

const PORT = 3100;
const SCI_PORT = 8001;
const APP_URL = `http://localhost:${PORT}`;
const PG_BIN = process.env.PG_BIN ?? "/opt/homebrew/opt/postgresql@17/bin";
const DB_URL = "postgres://moonnav@localhost:54329/moonnav_test";
const token = randomBytes(24).toString("hex");

const env = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: "en_US.UTF-8",
  NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  APP_URL, BETTER_AUTH_URL: APP_URL,
  DATABASE_URL: DB_URL, DATABASE_URL_DIRECT: DB_URL, DATA_BACKEND: "postgres",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), STORAGE_SIGNING_SECRET: randomBytes(32).toString("hex"),
  SCIENCE_API_URL: `http://127.0.0.1:${SCI_PORT}`, SCIENCE_SERVICE_TOKEN: token, MOONNAV_INTERNAL_API_URL: APP_URL,
  MAIL_DRIVER: "outbox", STORAGE_DRIVER: "local", LOCAL_STORAGE_DIR: "data/test-objects", JOB_MODE: "",
  SMTP_HOST: "", SMTP_USER: "", SMTP_PASSWORD: "", SUPABASE_SERVICE_ROLE_KEY: "", RESEND_API_KEY: "",
  MOONNAV_RATE_LIMIT_TEST: "", E2E_BASE_URL: APP_URL,
};
const children = [];
let stopping = false;

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { env: { ...env, ...opts.env }, stdio: "inherit", ...opts });
}
function start(name, cmd, args, cwd) {
  const p = spawn(cmd, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
  const out = (b) => process.env.STACK_VERBOSE && b.toString().split("\n").filter(Boolean).forEach((l) => console.log(`[${name}] ${l}`));
  p.stdout.on("data", out);
  p.stderr.on("data", out);
  p.on("exit", (c) => { if (!stopping) console.error(`✖ ${name} exited unexpectedly (${c})`); });
  children.push(p);
  return p;
}
async function until(fn, label, tries = 90) {
  for (let i = 0; i < tries; i++) {
    try { if (await fn()) return; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} did not become ready`);
}
function stop() {
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
}
process.on("SIGINT", () => { stop(); process.exit(130); });
process.on("SIGTERM", () => { stop(); process.exit(143); });

async function main() {
  for (const port of [PORT, SCI_PORT]) {
    const busy = await fetch(`http://127.0.0.1:${port}/`).then(() => true, () => false);
    if (busy) throw new Error(`port ${port} is already in use; stop that service so the suite runs against its own stack`);
  }
  console.log("▸ Database: rebuilding local moonnav_test (local cluster only)");
  sh("./scripts/dev-db.sh");
  const psql = (sql) => sh(`${PG_BIN}/psql`, ["-h", "localhost", "-p", "54329", "-U", "moonnav", "-d", "postgres", "-q", "-c", sql]);
  psql("drop database if exists moonnav_test with (force)");
  psql("create database moonnav_test");
  sh("npx", ["tsx", "scripts/migrate.ts"]);

  rmSync("data/outbox", { recursive: true, force: true });
  rmSync("data/test-objects", { recursive: true, force: true });
  mkdirSync("data/outbox", { recursive: true });

  console.log("▸ Web: production build");
  sh("npx", ["next", "build"], { stdio: ["ignore", "ignore", "inherit"] });

  console.log("▸ Science API, worker, web");
  start("science", "uv", ["run", "uvicorn", "moonnav_science.api:app", "--host", "127.0.0.1", "--port", String(SCI_PORT)], "science");
  await until(async () => (await fetch(`http://127.0.0.1:${SCI_PORT}/health`)).ok, "science API");
  start("web", "npx", ["next", "start", "-p", String(PORT)], ".");
  await until(async () => (await fetch(`${APP_URL}/api/v1/health`)).ok, "web app");
  start("worker", "uv", ["run", "python", "-m", "moonnav_science.worker"], "science");
  await until(async () => {
    const h = await (await fetch(`${APP_URL}/api/v1/health`)).json();
    return h.database?.status === "ok" && h.science?.status === "ok" && h.worker?.status === "ok";
  }, "database + science + worker health");
  const h = await (await fetch(`${APP_URL}/api/v1/health`)).json();
  console.log(`✔ stack healthy: web ${h.web?.status}, database ${h.database?.status}, science ${h.science?.status}, worker ${h.worker?.status}`);

  if (process.env.STACK_ONLY) {
    console.log(`Stack left running for manual probing at ${APP_URL} (Ctrl+C to stop).`);
    await new Promise(() => {});
  }
  const args = process.argv.slice(2);
  const pw = spawn("npx", ["playwright", "test", ...(args.some((a) => a.startsWith("--reporter")) ? [] : ["--reporter=list,json"]), ...args], {
    env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "test-results/e2e-report.json" },
    stdio: "inherit",
  });
  const code = await new Promise((r) => pw.on("exit", r));
  stop();
  process.exit(code ?? 1);
}
main().catch((e) => { console.error(`✖ ${e.message}`); stop(); process.exit(1); });
