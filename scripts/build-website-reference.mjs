#!/usr/bin/env node
/* Build MOONNAV_COMPLETE_WEBSITE_REFERENCE.md from (1) a template with the hand-written explanations and
   (2) generated inventories: the router, import graph, API handlers, Python endpoints, schema, env names, UI strings,
   tests (all scanned from source) and the live crawl (docs/website-crawl/crawl.json).
   Usage: node scripts/build-website-reference.mjs      (re-run after any UI or API change) */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (f) => readFileSync(path.join(root, f), "utf8");
const rel = (f) => path.relative(root, f);
function walk(dir, test, out = []) {
  for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", ".next"].includes(e.name)) walk(p, test, out); } else if (test(p)) out.push(p);
  }
  return out;
}
const crawl = existsSync(path.join(root, "docs/website-crawl/crawl.json")) ? JSON.parse(read("docs/website-crawl/crawl.json")) : { pages: [] };

/* ---------- import graph ---------- */
const srcFiles = walk("src", (p) => /\.(tsx?)$/.test(p));
const fileSet = new Set(srcFiles);
function resolveImport(from, spec) {
  let base = spec.startsWith("@/") ? path.join("src", spec.slice(2)) : spec.startsWith(".") ? path.join(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base + ".tsx", base + ".ts", path.join(base, "index.tsx"), path.join(base, "index.ts"), base]) if (fileSet.has(c)) return c;
  return null;
}
const importsOf = (f) => [...read(f).matchAll(/(?:from\s+|import\()\s*["']([^"']+)["']/g)].map((m) => resolveImport(f, m[1])).filter(Boolean);
function closure(f, only = /^src\/(components|lib)\//) {
  const seen = new Set([f]); const stack = [f];
  while (stack.length) for (const n of importsOf(stack.pop())) if (!seen.has(n) && only.test(n)) { seen.add(n); stack.push(n); }
  return [...seen];
}
const API_RE = /["'`](\/api\/[A-Za-z0-9_\-/\[\]${}.:]*)/g;
const apiPathsIn = (files) => [...new Set(files.flatMap((f) => [...read(f).matchAll(API_RE)].map((m) => m[1].replace(/\$\{[^}]*\}/g, "{id}").replace(/\/+$/, ""))))].filter((p) => p.length > 5).sort();

/* ---------- routes ---------- */
const pageFiles = walk("src/app", (p) => p.endsWith("page.tsx"));
const routeOf = (f) => "/" + path.dirname(path.relative("src/app", f)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s) && s !== ".").join("/");
const pages = pageFiles.map((f) => ({ file: f, route: routeOf(f).replace(/\/$/, "") || "/" })).sort((a, b) => a.route.localeCompare(b.route));
function accessOf(file) {
  const dirChain = []; let d = path.dirname(file); while (d.startsWith("src/app")) { dirChain.push(d); d = path.dirname(d); }
  const text = [file, ...dirChain.map((x) => path.join(x, "layout.tsx")).filter((x) => existsSync(path.join(root, x)))].map(read).join("\n");
  const m = text.match(/requirePageRole\("(\w+)"/); if (m) return m[1] === "admin" ? "admin (MFA required)" : `${m[1]} or admin (MFA required)`;
  if (/requirePageUser\(/.test(text)) return "signed in (any role)";
  return "public";
}

/* ---------- API handlers ---------- */
const apiFiles = walk("src/app/api", (p) => p.endsWith("route.ts"));
const apiRoutes = apiFiles.map((f) => {
  const t = read(f); const url = "/api" + "/" + path.dirname(path.relative("src/app/api", f)).split(path.sep).join("/");
  const methods = [...new Set([...t.matchAll(/export\s+(?:const|async function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]))];
  const auth = /requireServiceToken/.test(t) ? "service token (internal)" : /CRON_SECRET/.test(t) ? "cron secret (Vercel Cron)" : (t.match(/requireApiRole\("(\w+)"/) ? `role ≥ ${t.match(/requireApiRole\("(\w+)"/)[1]}` : /requireApiUser|requirePageUser|currentUser|assertWorkspaceAccess/.test(t) ? "signed in" : /\/api\/auth\//.test(url) ? "Better Auth endpoints" : "public");
  const rl = [...t.matchAll(/rateLimit\(\s*[`"']([^`"'$]*)[^,]*,\s*(\d+)\s*,\s*(\d+)/g)].map((m) => `${m[2]}/${m[3]}s`).join(", ");
  const sci = [...new Set([...t.matchAll(/science(?:<[^>]*>)?\(\s*[`"'](\/v1\/[^`"'?$]+)/g)].map((m) => m[1]))];
  return { url: url.replace(/\[\.\.\.all\]/, "[...all]"), methods: methods.join(", ") || "—", auth, rl: rl || "—", sci: sci.join(", ") || "—", file: rel(f) };
}).sort((a, b) => a.url.localeCompare(b.url));

const py = read("science/moonnav_science/api.py");
const sciEndpoints = [...py.matchAll(/@app\.(get|post)\("([^"]+)"(?:,\s*dependencies=\[Depends\((\w+)\)\])?\)\s*\n(?:async )?def (\w+)\([^)]*\)[^:]*:\s*\n\s*(?:"""([^"\n]*))?/g)].map((m) => ({ method: m[1].toUpperCase(), path: m[2], auth: m[3] ? "bearer token" : "none (health only)", fn: m[4], doc: (m[5] || "").trim() }));

/* ---------- schema, env, strings, tests ---------- */
const tables = [...read("src/db/schema.ts").matchAll(/pgTable\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
const envNames = [...read("src/lib/env.ts").matchAll(/^\s+([A-Z][A-Z0-9_]+):\s*z\./gm)].map((m) => m[1]);
const uiFiles = walk("src", (p) => /\.tsx$/.test(p));
const strings = { empty: [], notice: [], errors: [] };
for (const f of uiFiles) {
  const t = read(f);
  for (const m of t.matchAll(/<EmptyState\s+title="([^"]+)"/g)) strings.empty.push([m[1], rel(f)]);
  for (const m of t.matchAll(/<Notice\s+[^>]*title="([^"]+)"/g)) strings.notice.push([m[1], rel(f)]);
  for (const m of t.matchAll(/errs\.(\w+)\s*=\s*"([^"]+)"/g)) strings.errors.push([`${m[1]}: ${m[2]}`, rel(f)]);
  for (const m of t.matchAll(/set(?:General|Error|ErrorMsg|Msg)\(\s*"([^"]{8,})"/g)) strings.errors.push([m[1], rel(f)]);
}
const specs = walk("tests/e2e", (p) => p.endsWith(".spec.ts")).map((f) => ({ file: path.basename(f), titles: [...read(f).matchAll(/^\s*test\(\s*(["'`])(.+?)\1/gm)].map((m) => m[2]) }));
const unit = walk("tests/unit", (p) => p.endsWith(".test.ts")).map((f) => ({ file: path.basename(f), n: (read(f).match(/^\s*(?:it|test)\(/gm) || []).length }));

/* ---------- component inventory ---------- */
const compFiles = walk("src/components", (p) => p.endsWith(".tsx")).sort();
const usedBy = {};
for (const pf of pageFiles.concat(walk("src/app", (p) => p.endsWith("layout.tsx")))) for (const f of closure(pf, /^src\/components\//)) (usedBy[f] ||= new Set()).add(routeOf(pf).replace(/\/$/, "") || "/");
const components = compFiles.map((f) => {
  const t = read(f);
  const exports = [...t.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|const)\s+([A-Z]\w+)/g)].map((m) => m[1]);
  const props = (t.match(/export function [A-Z]\w+\(\s*\{[^)]*?\}\s*:\s*([^)]{0,170})\)/) || [])[1] || "";
  const first = (t.match(/\/\*\*([\s\S]*?)\*\//) || [])[1]?.replace(/\s*\*\s*/g, " ").trim().slice(0, 170) || "";
  return { file: f, exports: exports.join(", ") || "—", client: /^"use client"/.test(t), props: props.replace(/\s+/g, " ").trim(), doc: first, api: apiPathsIn([f]).join(", ") || "—", pages: [...(usedBy[f] || [])].slice(0, 6).join(", ") || "—" };
});

/* ---------- render helpers ---------- */
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const table = (head, rows) => `| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n${rows.map((r) => `| ${r.map(esc).join(" | ")} |`).join("\n")}\n`;
const slug = (r) => r.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
const crawlFor = (route) => crawl.pages.filter((p) => p.route === route || p.route.split("?")[0] === route);
const g = {};

g.SITEMAP = table(["Route", "Source file", "Access (from code)", "Components reached (direct imports)", "API paths referenced"],
  pages.map((p) => [`\`${p.route}\``, `\`${p.file}\``, accessOf(p.file), importsOf(p.file).filter((f) => f.startsWith("src/components")).map((f) => path.basename(f, ".tsx")).slice(0, 8).join(", ") || "—", apiPathsIn(closure(p.file)).slice(0, 6).join(", ") || "—"]));

g.ACCESS_MATRIX = (() => {
  const roles = ["anonymous", "demo", "user", "admin"]; const routes = [...new Set(crawl.pages.map((p) => p.route))];
  const cell = (role, route) => { const p = crawl.pages.find((x) => x.role === role && x.route === route); return p ? (p.redirected ? `redirect → ${p.finalUrl.split("?")[0]}` : String(p.status)) : "—"; };
  return table(["Route visited (crawl)", ...roles], routes.map((r) => [`\`${r.slice(0, 70)}\``, ...roles.map((ro) => cell(ro, r))]));
})();

g.PAGE_DETAILS = (() => {
  const seen = new Set(); const out = [];
  const order = ["anonymous", "user", "admin", "demo"];
  const byRoute = new Map();
  for (const p of crawl.pages) { const k = p.route.replace(/ana_[\w-]+|prj_[\w-]+|[\w-]{16,}/g, ":id"); (byRoute.get(k) ?? byRoute.set(k, []).get(k)).push(p); }
  let n = 0;
  for (const [key, list] of [...byRoute.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const p = order.map((r) => list.find((x) => x.role === r && !x.redirected && x.status === 200)).find(Boolean) ?? list[0];
    const id = `PG-${String(++n).padStart(2, "0")}`;
    const lines = [`### ${id} · ${p.h1[0] || p.title || key}  \`${key}\``, ""];
    lines.push(`- **Document title:** ${p.title}`);
    lines.push(`- **Observed per viewer role:** ${list.map((x) => `${x.role} → ${x.redirected ? `redirected to \`${x.finalUrl.split("?")[0]}\`` : x.status}`).join("; ")}`);
    const src = pages.find((q) => q.route.replace(/\[(\w+)\]/g, ":id") === key.split("?")[0].replace(/\/$/, "") || q.route === key.split("?")[0]);
    if (src) lines.push(`- **Source:** \`${src.file}\` · access rule in code: ${accessOf(src.file)}`);
    if (p.h2.length) lines.push(`- **Section headings (h2), top to bottom:** ${p.h2.map((h) => `“${h}”`).join(" · ")}`);
    if (p.h3.length) lines.push(`- **Card/sub-headings (h3):** ${p.h3.slice(0, 14).map((h) => `“${h}”`).join(" · ")}`);
    if (p.tabs.length) lines.push(`- **Tabs / radio groups:** ${p.tabs.map((t) => `“${t.text}”${t.selected === "true" ? " (selected)" : ""}`).join(" · ")}`);
    if (p.tables.length) lines.push(`- **Tables:** ${p.tables.map((t) => `${t.caption ? `“${t.caption}”: ` : ""}${t.headers.join(" / ")} (${t.rows} rows)`).join("; ")}`);
    if (p.canvases || p.svgCharts.length) lines.push(`- **Graphics:** ${p.canvases} canvas element(s) (3D/map)${p.svgCharts.length ? `; charts: ${p.svgCharts.join("; ")}` : ""}`);
    if (p.notices.length) lines.push(`- **Notices / alerts shown:** ${p.notices.map((x) => `“${x.slice(0, 110)}”`).join(" · ")}`);
    if (p.errors.length || p.failedApi.length) lines.push(`- **Errors seen while loading:** ${[...p.errors, ...p.failedApi].join("; ")}`);
    lines.push(`- **Test ids on the page:** ${p.testids.length ? p.testids.map((t) => `\`${t}\``).join(", ") : "none"}`);
    lines.push(`- **Visible text excerpt:**`, "", "  > " + p.mainText.replace(/\n+/g, " ⏎ ").slice(0, 700), "");
    const btns = p.buttons.filter((b) => b.region !== "footer").map((b) => { const pr = (p.probes || []).find((x) => x.label === (b.text || b.testid || `icon button #${b.i}`)); return [`BTN-${String(n).padStart(2, "0")}-${String(b.i).padStart(2, "0")}`, b.text || (b.icon ? "(icon only)" : "(no label)"), b.region, b.type + (b.disabled ? ", disabled" : ""), b.testid ?? "", pr ? (pr.executed ? `Clicked: ${pr.navigated ? `navigates to \`${pr.urlAfter.split("?")[0]}\`` : pr.opened ? `opens “${pr.opened.slice(0, 80)}”` : pr.apiCalls?.length ? `calls ${pr.apiCalls.join(", ")}` : pr.expandedAfter != null ? `toggles aria-expanded → ${pr.expandedAfter}` : pr.pressedAfter != null ? `toggles aria-pressed → ${pr.pressedAfter}` : "changes on-page state only (no navigation, no API call)"}` : `Not executed: ${pr.reason}`) : "Same control observed; not probed in this role/page"]; });
    if (btns.length) lines.push("**Buttons observed (live DOM)**", "", table(["ID", "Visible label / accessible name", "Region", "Type", "Test id", "Result of clicking it (executed in the isolated stack)"], btns.slice(0, 40)));
    const lnks = [...new Map(p.links.filter((l) => l.region === "main" || l.region === "other").map((l) => [l.text + l.href, l])).values()].slice(0, 30);
    if (lnks.length) lines.push("**Links in the page body**", "", table(["Label", "Destination", "External"], lnks.map((l) => [l.text || "(icon/image link)", `\`${l.href}\``, l.external ? "yes" : "no"])));
    const flds = p.fields.filter((f) => f.region !== "header");
    if (flds.length) lines.push("**Form fields**", "", table(["Label", "Element", "Placeholder", "Required", "Constraints", "Default", "Options"], flds.slice(0, 40).map((f) => [f.label || "(unlabelled)", `${f.tag}${f.type ? `[${f.type}]` : ""}${f.testid ? ` (${f.testid})` : ""}`, f.placeholder ?? "", f.required ? "yes" : "no", [f.min && `min ${f.min}`, f.max && `max ${f.max}`, f.minlength && `minlength ${f.minlength}`, f.pattern && `pattern ${f.pattern}`].filter(Boolean).join(", "), f.value ?? "", f.options ? f.options.join(" · ") : ""])));
    if (p.mobile) lines.push(`- **Mobile (390×844):** header controls: ${p.mobile.nav.map((x) => `“${x}”`).join(", ") || "none"}; horizontal scroll: ${p.mobile.overflowX ? "YES (overflow)" : "none"}; screenshot \`docs/website-crawl/screenshots/${p.mobile.screenshot}\``);
    if (p.screenshot) lines.push(`- **Desktop screenshot:** \`docs/website-crawl/screenshots/${p.screenshot}\` (1440×900)`);
    lines.push("");
    out.push(lines.join("\n"));
  }
  return out.join("\n");
})();

g.NAVIGATION = (() => {
  const homes = ["anonymous", "user", "admin"].map((role) => { const p = crawl.pages.find((x) => x.role === role && x.status === 200 && !x.redirected && x.nav?.length); return p ? [role, p] : null; }).filter(Boolean);
  return homes.map(([role, p]) => `#### Navigation seen by role **${role}** (page \`${p.route.slice(0, 50)}\`)\n\n` + p.nav.map((n) => `- **${n.label || "unlabelled navigation"}:** ` + n.items.map((i) => `“${i.text || "(icon)"}”${i.href ? ` → \`${i.href}\`` : " (button)"}`).join(" · ")).join("\n")).join("\n\n");
})();

g.API_TABLE = table(["URL", "Methods", "Who may call it (from code)", "Rate limit", "Science endpoints called", "Source"], apiRoutes.map((a) => [`\`${a.url}\``, a.methods, a.auth, a.rl, a.sci, `\`${a.file}\``]));
g.SCI_TABLE = table(["Method", "Science path (internal only)", "Auth", "Function", "Purpose (docstring)"], sciEndpoints.map((e) => [e.method, `\`${e.path}\``, e.auth, `\`${e.fn}\``, e.doc]));
g.TABLES = tables.map((t) => `\`${t}\``).join(", ");
g.ENV = envNames.map((e) => `\`${e}\``).join(", ");
g.COMPONENTS = table(["Component file", "Exports", "Client", "Props (signature excerpt)", "Purpose (source comment)", "API paths it references", "Pages that include it"], components.map((c) => [`\`${c.file}\``, c.exports, c.client ? "yes" : "no", c.props, c.doc, c.api, c.pages]));
g.EMPTY = table(["Empty-state title", "File"], strings.empty.map(([a, b]) => [a, `\`${b}\``]));
g.NOTICES = table(["Notice / alert title", "File"], [...new Map(strings.notice.map((x) => [x[0] + x[1], x])).values()].map(([a, b]) => [a, `\`${b}\``]));
g.ERRORS = table(["Validation / error message in code", "File"], strings.errors.map(([a, b]) => [a, `\`${b}\``]));
g.TESTS = table(["E2E spec (Playwright)", "Tests in the file"], specs.map((s) => [`\`tests/e2e/${s.file}\``, s.titles.map((t) => `• ${t}`).join("<br>")])) + "\n" + table(["Unit spec (Vitest)", "Tests"], unit.map((u) => [`\`tests/unit/${u.file}\``, u.n]));
g.SHOTS = (() => {
  const rows = []; for (const p of crawl.pages) { if (p.screenshot) rows.push([p.screenshot, p.route.slice(0, 60), p.role, "1440×900", "loaded, default state"]); if (p.mobile?.screenshot) rows.push([p.mobile.screenshot, p.route.slice(0, 60), p.role, "390×844", "loaded, default state, mobile layout"]); }
  const vis = existsSync(path.join(root, "docs/screenshots")) ? readdirSync(path.join(root, "docs/screenshots")).length : 0;
  return table(["File (docs/website-crawl/screenshots/)", "Route", "Role", "Viewport", "State shown"], rows) + `\nIn addition the visual regression spec stores ${vis} screenshots in \`docs/screenshots/\` (public pages at five widths, key pages in dark theme).\n`;
})();
g.STATS = `${crawl.pages.length} page visits (${new Set(crawl.pages.map((p) => p.route)).size} distinct URLs) as roles ${[...new Set(crawl.pages.map((p) => p.role))].join(", ")}; ${crawl.pages.reduce((a, p) => a + p.buttons.length, 0)} button observations, ${crawl.pages.reduce((a, p) => a + (p.probes || []).filter((x) => x.executed).length, 0)} buttons actually clicked, ${crawl.pages.reduce((a, p) => a + p.fields.length, 0)} form-field observations. Crawl generated ${crawl.generatedAtUtc ?? "n/a"} against the isolated local stack.`;
g.COUNTS = `${pages.length} pages, ${apiRoutes.length} web API route files, ${sciEndpoints.length} internal science endpoints, ${tables.length} database tables, ${components.length} component files.`;
g.GENERATED_AT = new Date().toISOString().replace(/\.\d+Z$/, "Z");

const template = read("scripts/website-reference.template.md");
let doc = template.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in g)) throw new Error(`template placeholder {{${k}}} has no generator`); return g[k]; });
// Redact anything token-shaped (local outbox pages show one-time links) and test-account addresses.
doc = doc
  .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[REDACTED-TOKEN]")
  .replace(/([?&]token=)[^&\s`)"]+/g, "$1[REDACTED]")
  .replace(/(?<![\\A-Za-z0-9._+-])[A-Za-z0-9._+-]+@example\.test/g, "[test-account]@example.test");
writeFileSync(path.join(root, "MOONNAV_COMPLETE_WEBSITE_REFERENCE.md"), doc);
console.log(`wrote MOONNAV_COMPLETE_WEBSITE_REFERENCE.md (${doc.split("\n").length} lines): ${g.COUNTS}`);
