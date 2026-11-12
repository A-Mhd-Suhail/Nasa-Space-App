import { expect, test, type Page } from "@playwright/test";

/**
 * Application-wide reliability audit, as tests: every public and demo route renders without uncaught errors, console
 * errors or 5xx responses; every internal link resolves; malformed API input gets a 4xx with the standard error
 * contract and never a 500 or a stack trace. Expected browser noise is listed explicitly (never blanket-ignored).
 */
const IGNORED = [/trek\.nasa\.gov/i]; // third-party imagery tiles: may be blocked or aborted
const PUBLIC = ["/", "/explore", "/learn", "/methodology", "/sources", "/validation", "/about", "/limitations", "/privacy", "/terms", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

/** Let the current page finish loading before leaving it, like a user: leaving mid-load cancels in-flight requests and
 *  browsers report the cancellations as errors ("Load failed", "NetworkError", ChunkLoadError). */
const settle = (page: Page) => page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => {
    if (/due to access control checks/.test(e.message) && /([?&]_rsc=|\/data\/terrain\/)/.test(e.message)) return; // WebKit: fetch cancelled by navigation
    problems.push(`pageerror @${page.url().replace(/^https?:\/\/[^/]+/, "")}: ${e.message.slice(0, 160)}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED.some((r) => r.test(m.text()) || r.test(m.location().url))) problems.push(`console @${page.url().replace(/^https?:\/\/[^/]+/, "")}: ${m.text().slice(0, 160)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return problems;
}

test("every public route renders cleanly and every internal link resolves", async ({ page, request }) => {
  test.setTimeout(240_000);
  const problems = watch(page);
  const links = new Set<string>();
  for (const path of PUBLIC) {
    await settle(page);
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Application error|Unhandled Runtime Error/i);
    for (const h of await page.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""))) {
      if (h.startsWith("/") && !h.startsWith("//") && !h.startsWith("/api/") && !h.startsWith("/dev/")) links.add(h.split("#")[0]);
    }
  }
  const broken: string[] = [];
  for (const l of links) {
    if (!l) continue;
    const r = await request.get(l, { maxRedirects: 5 });
    if (r.status() >= 400) broken.push(`${r.status()} ${l}`);
  }
  expect(broken, `broken links:\n${broken.join("\n")}`).toEqual([]);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("unknown routes give a friendly 404, not an error page", async ({ page }) => {
  const res = await page.goto("/this-route-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.locator("body")).not.toContainText(/stack|TypeError|at .*\.tsx?:\d+/i);
  await expect(page.getByRole("link").first()).toBeVisible();
});

test("every demo-workspace route renders cleanly with real content", async ({ page }) => {
  test.setTimeout(300_000);
  const problems = watch(page);
  await page.goto("/login");
  await page.getByTestId("demo-button").click();
  await page.waitForURL(/\/app/, { timeout: 90_000 });
  const list = await (await page.request.get("/api/scenarios")).json();
  const ids = list.scenarios.map((s: { latestAnalysis: { id: string } }) => s.latestAnalysis.id);
  const routes = ["/app", "/app/projects", "/app/explorer", "/app/explorer?site=shackleton&tab=region", "/app/planner", "/app/reports", "/app/workspaces", "/settings/profile", "/settings/security",
    `/app/analyses/${ids[0]}`, `/app/analysis/sun?analysisId=${ids[0]}`, `/app/analysis/earth?analysisId=${ids[0]}`, `/app/analyses/${ids[0]}/report`, `/app/compare?ids=${ids.join(",")}`, "/app/scenarios/new?guided=1"];
  await settle(page);
  for (const r of routes) {
    await settle(page);
    const res = await page.goto(r);
    expect(res?.status(), r).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
    await page.waitForTimeout(600);
    await expect(page.locator("main")).not.toContainText(/\bNaN\b|\bundefined\b|Application error/);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("malformed API input is rejected with the standard contract: 4xx, requestId, no stack trace, never 500", async ({ request }) => {
  const origin = { origin: process.env.APP_URL ?? "http://localhost:3100" };
  const cases: [string, string, unknown?][] = [
    ["GET", "/api/v1/terrain/point?lat=abc&lon=0"], ["GET", "/api/v1/terrain/point?lat=-85&lon=1e999"], ["GET", "/api/v1/terrain/point?lat=-85"], ["GET", "/api/v1/terrain/point?lat=-200&lon=0"],
    ["GET", "/api/v1/illumination/point?lat=nan&lon=0"], ["GET", "/api/v1/illumination/point?lat=-89&lon=inf"], ["GET", "/api/v1/illumination/point?lat=-89&lon=999"],
    ["GET", "/api/v1/terrain/coverage?lat=-89&lon=0&radiusM=-5"], ["GET", "/api/v1/ephemeris/sun?lat=-85&lon=31&date=not-a-date"], ["GET", "/api/v1/ephemeris/pluto?lat=-85&lon=31&date=2026-12-01"],
    ["GET", "/api/v1/sites/%00"], ["GET", "/api/v1/jobs/..%2f..%2fetc"], ["GET", "/api/v1/analyses/ana_does_not_exist"],
    ["POST", "/api/v1/scenarios", "{not json"], ["POST", "/api/v1/scenarios", { projectId: 1 }], ["POST", "/api/v1/analyses", {}], ["POST", "/api/v1/reports", { analysisId: "x", format: "exe" }],
    ["POST", "/api/v1/terrain/hazards", { latitudeDeg: -85, longitudeEastDeg: 0 }], ["POST", "/api/v1/suitability/grid", { latitudeDeg: "x" }],
    ["POST", "/api/auth/sign-up/email", { email: "not-an-email", password: "x", name: "" }], ["POST", "/api/auth/sign-in/email", "{"], ["POST", "/api/auth/request-password-reset", {}],
    ["POST", "/api/internal/jobs/claim", { workerId: "x" }], ["GET", "/api/internal/cron/drain"], ["POST", "/api/v1/demo"],
  ];
  const bad: string[] = [];
  for (const [method, url, body] of cases) {
    const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.9`;
    const r = await request.fetch(url, { method, headers: { "x-forwarded-for": ip, ...origin, ...(typeof body === "string" ? { "content-type": "application/json" } : {}) }, data: body as never, maxRedirects: 0 });
    const text = await r.text();
    if (r.status() >= 500) bad.push(`${method} ${url} -> ${r.status()}`);
    if (/at .*\.(ts|js|tsx):\d+|node_modules|Traceback|SELECT .* FROM/i.test(text)) bad.push(`${method} ${url} leaks internals`);
    if (r.status() >= 400 && r.status() < 500 && r.headers()["content-type"]?.includes("json") && url.startsWith("/api/v1/")) {
      const d = JSON.parse(text);
      if (!d.error?.code || !d.error?.requestId) bad.push(`${method} ${url} -> ${r.status()} without the standard error contract`);
    }
  }
  expect(bad, bad.join("\n")).toEqual([]);
});
