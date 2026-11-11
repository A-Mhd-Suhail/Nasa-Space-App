#!/usr/bin/env node
/* One command for the whole local stack:
     PostgreSQL (project-local cluster) -> migrations -> science API -> worker -> web app.
   Services already listening on their ports are reused, never killed. Ctrl+C stops what this script started. */
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";

process.loadEnvFile?.(".env.local");
const APP_URL = process.env.APP_URL ?? "http://localhost:3100";
const WEB_PORT = Number(new URL(APP_URL).port || 3100);
const SCI_PORT = Number(new URL(process.env.SCIENCE_API_URL ?? "http://127.0.0.1:8001").port || 8001);
const children = [];
const color = { db: 33, science: 36, worker: 35, web: 32 };

const portBusy = (port) => new Promise((res) => {
  const s = net.connect(port, "127.0.0.1");
  s.once("connect", () => { s.destroy(); res(true); });
  s.once("error", () => res(false));
});

function run(name, cmd, args, extraEnv = {}) {
  const p = spawn(cmd, args, { env: { ...process.env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
  const tag = `\x1b[${color[name]}m${name.padEnd(7)}\x1b[0m│ `;
  const pipe = (stream) => stream.on("data", (b) => b.toString().split("\n").filter(Boolean).forEach((l) => console.log(tag + l)));
  pipe(p.stdout);
  pipe(p.stderr);
  p.on("exit", (code) => console.log(`${tag}exited (${code})`));
  children.push(p);
  return p;
}

async function waitFor(url, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

async function main() {
  if (!existsSync(".env.local")) throw new Error("Missing .env.local — run `npm run setup` first.");
  const dbHost = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return ""; } })();
  if (["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
    console.log("▸ PostgreSQL (local cluster)");
    execFileSync("./scripts/dev-db.sh", { stdio: "inherit" });
  } else {
    console.log(`▸ PostgreSQL: remote database (${dbHost.replace(/^[^.]+/, "…")}) — local cluster not started`);
  }
  console.log("▸ Migrations");
  execFileSync("npx", ["tsx", "--env-file=.env.local", "scripts/migrate.ts"], { stdio: "inherit" });

  if (await portBusy(SCI_PORT)) console.log(`▸ Science API already listening on :${SCI_PORT} (reused)`);
  else run("science", "./scripts/dev-science.sh", []);
  await waitFor(`http://127.0.0.1:${SCI_PORT}/health`, "science API");

  if (await portBusy(WEB_PORT)) console.log(`▸ Web app already listening on :${WEB_PORT} (reused)`);
  else run("web", "npx", ["next", "dev", "-p", String(WEB_PORT)]); // plain web only: npm run dev:web
  await waitFor(`${APP_URL}/api/v1/health`, "web app", 120);

  const workerRunning = (() => { try { return execFileSync("pgrep", ["-f", "moonnav_science.worker"]).toString().trim().length > 0; } catch { return false; } })();
  if (workerRunning) console.log("▸ Worker already running (reused)");
  else run("worker", "./scripts/dev-worker.sh", []);

  const h = await (await fetch(`${APP_URL}/api/v1/health`)).json();
  console.log(`\n✔ MoonNav is running at ${APP_URL}  (database ${h.database?.status}, science ${h.science?.status}, worker ${h.worker?.status ?? "starting"})`);
  console.log(`  Development mailbox: ${APP_URL}/dev/mail   ·   Ctrl+C stops the services this command started.\n`);
}

const stop = () => {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
main().catch((e) => {
  console.error(`✖ ${e.message}`);
  stop();
});
