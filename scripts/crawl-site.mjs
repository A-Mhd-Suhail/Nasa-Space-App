#!/usr/bin/env node
/* Crawl the running MoonNav app (the ISOLATED test stack: `STACK_ONLY=1 node scripts/test-stack.mjs`) and record, for every
   page and viewer role, the real headings, navigation, buttons, links, form fields, tabs and what each safe button does.
   Output: docs/website-crawl/crawl.json (+ screenshots). Used to generate MOONNAV_COMPLETE_WEBSITE_REFERENCE.md.
   Never point this at production: it creates accounts, runs analyses and clicks buttons. */
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import pg from "pg";

const BASE = process.env.CRAWL_BASE ?? "http://localhost:3100";
if (!/^http:\/\/localhost:/.test(BASE)) throw new Error("refusing to crawl anything but the local isolated stack");
const DB = "postgres://moonnav@localhost:54329/moonnav_test";
const OUT = "docs/website-crawl";
mkdirSync(`${OUT}/screenshots`, { recursive: true });
const pool = new pg.Pool({ connectionString: DB, max: 2 });
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const DESTRUCTIVE = /sign out|log out|delete|remove|revoke|archive|disable|suspend|cancel analysis|retry|re-?run|reset|leave|discard|clear|deactivate|ingest|promote|change role/i;

function totp(secretB32) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of secretB32.replace(/=+$/, "")) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15;
  return String(((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6).padStart(6, "0");
}

async function account(browser, role) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const email = `crawl-${role}-${randomBytes(3).toString("hex")}@example.test`; const pw = `Lunar-${randomBytes(9).toString("base64url")}-9`;
  const h = { origin: BASE, "x-forwarded-for": ip() };
  let r = await ctx.request.post(`${BASE}/api/auth/sign-up/email`, { data: { name: `Crawl ${role}`, email, password: pw }, headers: h });
  if (!r.ok()) throw new Error(`signup ${role}: ${r.status()}`);
  await pool.query(`update "user" set email_verified=true, role=$2, onboarded_at=now(), terms_accepted_at=now(), preferred_mode='planning' where email=$1`, [email, role]);
  r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password: pw }, headers: h });
  if (!r.ok()) throw new Error(`signin ${role}: ${r.status()}`);
  if (role === "admin") {
    const en = await (await ctx.request.post(`${BASE}/api/auth/two-factor/enable`, { data: { password: pw }, headers: h })).json();
    const secret = new URL(en.totpURI).searchParams.get("secret");
    const v = await ctx.request.post(`${BASE}/api/auth/two-factor/verify-totp`, { data: { code: totp(secret) }, headers: h });
    if (!v.ok()) throw new Error(`mfa ${role}: ${v.status()}`);
  }
  return { ctx, email, pw };
}

async function describePage(page, label) {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const name = (e) => (e.getAttribute("aria-label") || e.getAttribute("title") || e.innerText || e.value || e.getAttribute("alt") || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const region = (e) => e.closest("header") ? "header" : e.closest("aside,nav[aria-label*=idebar],[data-sidebar]") ? "sidebar" : e.closest("footer") ? "footer" : e.closest("main,#main") ? "main" : e.closest("[role=dialog]") ? "dialog" : "other";
    const labelFor = (e) => { const id = e.id; const l = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || e.closest("label"); return (e.getAttribute("aria-label") || l?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120); };
    const out = { title: document.title, h1: [...document.querySelectorAll("h1")].map(name), h2: [...document.querySelectorAll("h2")].filter(vis).map(name), h3: [...document.querySelectorAll("h3")].filter(vis).map(name).slice(0, 40), url: location.pathname + location.search };
    out.links = [...document.querySelectorAll("a[href]")].filter(vis).map((a) => ({ text: name(a), href: a.getAttribute("href"), region: region(a), external: /^https?:/.test(a.getAttribute("href")) && !a.getAttribute("href").includes(location.host) })).filter((l) => l.href && !l.href.startsWith("#"));
    out.buttons = [...document.querySelectorAll("button,[role=button],input[type=submit]")].filter(vis).map((b, i) => ({ i, text: name(b), type: b.getAttribute("type") || "button", disabled: b.disabled || b.getAttribute("aria-disabled") === "true", region: region(b), testid: b.getAttribute("data-testid"), role: b.getAttribute("role"), pressed: b.getAttribute("aria-pressed"), expanded: b.getAttribute("aria-expanded"), icon: !!b.querySelector("svg") && !(b.innerText || "").trim() }));
    out.fields = [...document.querySelectorAll("input,textarea,select")].filter((e) => vis(e) || e.type === "checkbox" || e.type === "radio").map((e) => ({ tag: e.tagName.toLowerCase(), type: e.type || null, id: e.id || null, name: e.name || null, label: labelFor(e), placeholder: e.placeholder || null, required: e.required, min: e.min || null, max: e.max || null, pattern: e.pattern || null, minlength: e.minLength > 0 ? e.minLength : null, value: e.type === "password" ? "" : (e.type === "checkbox" || e.type === "radio" ? String(e.checked) : String(e.value).slice(0, 60)), options: e.tagName === "SELECT" ? [...e.options].map((o) => o.text.trim()).slice(0, 60) : undefined, testid: e.getAttribute("data-testid"), region: region(e) }));
    out.tabs = [...document.querySelectorAll("[role=tab],[role=radio]")].filter(vis).map((t) => ({ role: t.getAttribute("role"), text: name(t), selected: t.getAttribute("aria-selected") ?? t.getAttribute("aria-checked") }));
    out.tables = [...document.querySelectorAll("table")].filter(vis).map((t) => ({ caption: t.querySelector("caption")?.innerText || null, headers: [...t.querySelectorAll("th")].map(name).slice(0, 14), rows: t.querySelectorAll("tbody tr").length }));
    out.canvases = [...document.querySelectorAll("canvas")].filter(vis).length; out.svgCharts = [...document.querySelectorAll("svg[role=img],svg[aria-label]")].filter(vis).map((s) => s.getAttribute("aria-label")).slice(0, 12);
    out.testids = [...new Set([...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")))];
    out.notices = [...document.querySelectorAll("[role=alert],[role=status],[data-tone]")].filter(vis).map(name).filter(Boolean).slice(0, 8);
    out.mainText = (document.querySelector("main,#main")?.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 3500);
    out.nav = [...document.querySelectorAll("nav")].map((n) => ({ label: n.getAttribute("aria-label"), items: [...n.querySelectorAll("a,button")].filter(vis).map((a) => ({ text: name(a), href: a.getAttribute("href") })) }));
    return out;
  });
}

async function probeButtons(page, route, info, log) {
  const seen = new Set(); const results = [];
  const candidates = info.buttons.filter((b) => b.region !== "footer" && !b.disabled);
  for (const b of candidates) {
    const key = `${b.text}|${b.testid}|${b.region}`; if (seen.has(key) || results.length >= 9) continue; seen.add(key);
    const label = b.text || b.testid || `icon button #${b.i}`;
    if (DESTRUCTIVE.test(label) || b.type === "submit") { results.push({ label, region: b.region, executed: false, reason: b.type === "submit" ? "form submit: documented from the form, not clicked blindly" : "destructive or session-changing action: inspected, not executed" }); continue; }
    const reqs = []; const onReq = (r) => { if (/\/api\//.test(r.url()) && r.resourceType() !== "image") reqs.push(`${r.method()} ${new URL(r.url()).pathname}`); };
    page.on("request", onReq);
    const before = page.url(); let outcome = {};
    try {
      const loc = page.locator("button,[role=button]").filter({ visible: true });
      const target = b.testid ? page.locator(`[data-testid="${b.testid}"]`).first() : loc.nth(b.i);
      await target.scrollIntoViewIfNeeded({ timeout: 1200 }); await target.click({ timeout: 1800, noWaitAfter: true });
      await page.waitForTimeout(500);
      const dlg = await page.locator("[role=dialog],[role=menu],[role=listbox],[role=tooltip],[popover]").filter({ visible: true }).first().innerText({ timeout: 400 }).catch(() => null);
      outcome = { executed: true, urlAfter: page.url().replace(BASE, ""), navigated: page.url() !== before, opened: dlg ? dlg.replace(/\s+/g, " ").slice(0, 200) : null, apiCalls: [...new Set(reqs)], expandedAfter: await target.getAttribute("aria-expanded", { timeout: 400 }).catch(() => null), pressedAfter: await target.getAttribute("aria-pressed", { timeout: 400 }).catch(() => null) };
    } catch (e) { outcome = { executed: false, reason: `not clickable in this state: ${String(e.message).split("\n")[0].slice(0, 100)}` }; }
    page.off("request", onReq);
    results.push({ label, region: b.region, ...outcome });
    if (page.url() !== before || outcome.opened) { await page.goto(BASE + route, { waitUntil: "load" }).catch(() => {}); await page.waitForLoadState("networkidle").catch(() => {}); }
    else await page.keyboard.press("Escape").catch(() => {});
  }
  log(`  probed ${results.filter((r) => r.executed).length}/${results.length} buttons`);
  return results;
}

async function main() {
  const log = (m) => console.log(m);
  const browser = await chromium.launch({ args: ["--use-angle=metal"] });
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const demo = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const dp = await demo.newPage();
  await dp.goto(BASE + "/"); await dp.waitForLoadState("networkidle").catch(() => {}); await dp.getByTestId("home-demo-button").click(); await dp.waitForURL(/\/app/, { timeout: 60000 }); await dp.close();
  const user = await account(browser, "user"); const admin = await account(browser, "admin");

  // real ids for the dynamic routes
  const sc = (await (await demo.request.get(`${BASE}/api/scenarios`)).json()).scenarios;
  const aid = sc.find((s) => /malapert/i.test(s.name))?.latestAnalysis.id ?? sc[0].latestAnalysis.id; const ids = sc.map((s) => s.latestAnalysis.id).join(",");
  const projects = (await (await demo.request.get(`${BASE}/api/v1/projects`)).json()).projects; const pid = projects[0].id;
  const uh = { origin: BASE };
  const up = (await (await user.ctx.request.post(`${BASE}/api/v1/projects`, { data: { name: "Crawl project" }, headers: uh })).json()).project.id;
  const usc = (await (await user.ctx.request.post(`${BASE}/api/v1/scenarios`, { data: { projectId: up, name: "Crawl scenario", site: { mode: "catalog", siteId: "mons-malapert" }, startUtc: "2026-11-15T00:00:00Z", endUtc: "2026-11-18T00:00:00Z", stepSeconds: 3600, solarPanel: { areaM2: 1, efficiency: 0.25, derating: 0.9, orientation: "terrain_aligned" } }, headers: uh })).json()).scenario.id;
  const uaid = (await (await user.ctx.request.post(`${BASE}/api/v1/analyses`, { data: { scenarioId: usc }, headers: uh })).json()).analysisId;
  for (let i = 0; i < 60; i++) { const s = (await (await user.ctx.request.get(`${BASE}/api/v1/analyses/${uaid}`)).json()).analysis.status; if (s === "completed") break; await new Promise((r) => setTimeout(r, 1000)); }
  const rep = (await (await user.ctx.request.post(`${BASE}/api/v1/reports`, { data: { analysisId: uaid, format: "pdf" }, headers: uh })).json()).report;
  const share = await (await user.ctx.request.post(`${BASE}/api/v1/reports/${rep.id}/share-links`, { data: { expiresInDays: 7 }, headers: uh })).json();
  const stoken = share.url?.split("/").pop() ?? share.token;
  const ws = (await (await user.ctx.request.get(`${BASE}/api/v1/workspaces`)).json()).workspaces[0].id;
  const inv = await (await user.ctx.request.post(`${BASE}/api/v1/workspaces/${ws}/invitations`, { data: { email: `invitee-${randomBytes(3).toString("hex")}@example.test`, role: "viewer" }, headers: uh })).json();
  const itoken = "sample-invalid-token"; // the API emails the real token and never returns it; the invalid-token state is what an anonymous visitor sees
  const R = { aid, ids, pid, uaid, up, stoken, itoken };
  log(`ids: ${JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, String(v).slice(0, 18)])))}`);

  const pub = ["/", "/explore", "/explore?site=mons-malapert&tab=globe", "/learn", "/methodology", "/sources", "/validation", "/about", "/limitations", "/privacy", "/terms", "/login", "/login/two-factor", "/register", "/forgot-password", "/reset-password", "/verify-email", `/share/${stoken}`, `/invite/${itoken}`, "/does-not-exist"];
  const app = ["/app", "/app/projects", `/app/projects/${up}`, "/app/explorer", "/app/explorer?site=shackleton&tab=region", "/app/sites/mons-malapert", `/app/analyses/${uaid}`, `/app/analyses/${uaid}/report`, `/app/analysis/sun?analysisId=${uaid}`, `/app/analysis/earth?analysisId=${uaid}`, `/app/compare?ids=${ids}`, "/app/planner", "/app/reports", "/app/scenarios/new", "/app/scenarios/new?guided=1", "/app/workspaces", "/app/settings", "/app/onboarding", "/settings/profile", "/settings/security", "/dev/mail"];
  const adm = ["/admin", "/admin/users", "/admin/data", "/admin/ingestion", "/admin/jobs", "/admin/audit"];
  const plan = [["anonymous", anon, pub], ["demo", demo, [...app.filter((r) => !/analyses\/.+|share|onboarding/.test(r)), `/app/analyses/${aid}`, `/app/analysis/sun?analysisId=${aid}`, `/app/analysis/earth?analysisId=${aid}`, `/app/compare?ids=${ids}`, "/admin"]], ["user", user.ctx, [...app, "/admin"]], ["admin", admin.ctx, [...adm, "/admin/users?x=1"]]];
  const shots = new Set(["/", "/explore", "/app", "/app/explorer", `/app/analysis/sun?analysisId=${uaid}`, `/app/analysis/earth?analysisId=${uaid}`, `/app/compare?ids=${ids}`, "/app/planner", "/validation", "/login", "/register", "/app/scenarios/new?guided=1", "/admin", "/app/settings"]);
  const probed = new Set();
  const result = { generatedAtUtc: new Date().toISOString(), base: BASE, ids: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, "…" + String(v).slice(-6)])), pages: [] };

  for (const [role, ctx, routes] of plan) {
    for (const route of routes) {
      const page = await ctx.newPage(); const errs = [];
      page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 120)}`));
      page.on("console", (m) => { if (m.type() === "error" && !/trek\.nasa\.gov/.test(m.location().url)) errs.push(`console: ${m.text().slice(0, 120)}`); });
      const failed = []; page.on("response", (r) => { if (r.status() >= 400 && /\/api\//.test(r.url())) failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      log(`-> ${role} ${route.slice(0, 80)}`); const t0 = Date.now(); const resp = await page.goto(BASE + route, { waitUntil: "load" }).catch((e) => ({ status: () => 0, err: e }));
      await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {}); await page.waitForTimeout(700);
      log("   loaded"); const finalPath = page.url().replace(BASE, ""); const info = await describePage(page, route); log("   described");
      const entry = { role, route, finalUrl: finalPath, redirected: finalPath !== route, status: resp.status(), loadMs: Date.now() - t0, ...info, errors: [...new Set(errs)], failedApi: [...new Set(failed)] };
      if (role !== "anonymous" || route === "/") { /* probe interactive controls (safe ones) */ }
      const probeKey = route.replace(/[?#].*/, "").replace(/ana_[\w-]+|prj_[\w-]+|[\w-]{16,}/g, ":id");
      const wantProbe = !probed.has(probeKey) && entry.status === 200 && !entry.redirected && role !== "demo";
      if (wantProbe) probed.add(probeKey);
      entry.probes = wantProbe ? await Promise.race([probeButtons(page, route, info, log), new Promise((r) => setTimeout(() => r([{ label: "(time cap)", executed: false, reason: "per-page probe time cap reached" }]), 70000))]) : [];
      if (shots.has(route) && role !== "anonymous" || (role === "anonymous" && shots.has(route))) {
        const slug = `${role}-${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}`.slice(0, 80);
        await page.goto(BASE + route, { waitUntil: "load" }).catch(() => {}); await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1200);
        await page.screenshot({ path: `${OUT}/screenshots/${slug}-desktop.png` }); entry.screenshot = `${slug}-desktop.png`;
        await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
        entry.mobile = { nav: await page.evaluate(() => [...document.querySelectorAll("header button,header [role=button]")].map((b) => (b.getAttribute("aria-label") || b.innerText || "").trim()).filter(Boolean)), overflowX: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1) };
        await page.screenshot({ path: `${OUT}/screenshots/${slug}-mobile.png` }); entry.mobile.screenshot = `${slug}-mobile.png`;
      }
      log("   probes done"); result.pages.push(entry); log(`${role.padEnd(9)} ${String(entry.status).padEnd(4)} ${route.slice(0, 70)} -> ${finalPath.slice(0, 40)} (${entry.buttons.length} buttons, ${entry.links.length} links, ${entry.fields.length} fields)`);
      await page.close();
    }
  }
  writeFileSync(`${OUT}/crawl.json`, JSON.stringify(result, null, 1));
  log(`wrote ${OUT}/crawl.json (${result.pages.length} page visits)`);
  await browser.close(); await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
