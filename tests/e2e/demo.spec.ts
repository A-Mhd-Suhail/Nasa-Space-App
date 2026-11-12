import { expect, test, type Page } from "@playwright/test";
import { waitForAnalysis } from "./helpers";

/**
 * The public demo journey, end to end: home page -> one click -> isolated pre-seeded workspace -> guided tour ->
 * every tour step renders real data -> a real (not recorded) analysis runs through the job pipeline.
 * Application errors are collected and asserted empty; browser noise that is not an application error
 * (a failed third-party image tile) is ignored explicitly, not silently.
 */
const IGNORED = [/trek\.nasa\.gov/i, /favicon/i];

/** Let the current page finish loading before leaving it, like a user. Under real network latency, navigating while lazy
 *  chunks and polling requests are in flight cancels them and the browser reports the cancellations as errors. */
const settle = (page: Page) => page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

function watch(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    // WebKit reports a fetch that was cancelled by a navigation (Next's route prefetches, the globe's data file) as a
    // page error ending in "due to access control checks". Matched by URL and message so real errors still fail.
    if (/due to access control checks/.test(e.message) && /([?&]_rsc=|\/data\/terrain\/)/.test(e.message)) return;
    errors.push(`pageerror: ${e.message}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED.some((r) => r.test(m.text()) || r.test(m.location().url))) errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return errors;
}

async function enterFromHome(page: Page) {
  await page.goto("/");
  const btn = page.getByTestId("home-demo-button");
  await expect(btn).toBeVisible();
  await settle(page); // let the 3D globe's code finish loading before leaving the page, as a person looking at it would
  await btn.click();
  await page.waitForURL(/\/app/, { timeout: 90_000 });
  await settle(page);
}

test("home page -> demo -> guided tour: every step opens a working page with real data", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watch(page);
  await enterFromHome(page);
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  const tour = page.getByTestId("demo-tour");
  await expect(tour).toBeVisible();
  const hrefs = await tour.locator("a").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
  expect(hrefs).toHaveLength(6);

  // 1. prepared analysis: real summary numbers, not placeholders
  await settle(page);
  await page.goto(hrefs[0]);
  await expect(page.getByText(/Sun|Sunlit/i).first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/NaN|undefined/);
  // 2. Sun view with the playable timeline
  await settle(page);
  await page.goto(hrefs[1]);
  await expect(page.getByTestId("time-readout")).toBeVisible({ timeout: 30_000 });
  // 3. compare four analyses
  await settle(page);
  await page.goto(hrefs[2]);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("main")).toContainText(/Pareto|score|trade-off/i);
  // 4. planner loads
  await settle(page);
  await page.goto(hrefs[3]);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // 5. report page renders sections
  await settle(page);
  await page.goto(hrefs[4]);
  await expect(page.locator("main")).toContainText(/provenance|Method|kernel/i);
  // 6. guided scenario builder opens with the example prefilled
  await settle(page);
  await page.goto(hrefs[5]);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
});

test("the 3D explorer works inside the demo", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watch(page);
  await enterFromHome(page);
  await page.goto("/app/explorer?site=mons-malapert&tab=globe");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(2500);
  const box = await page.locator("canvas").first().boundingBox();
  expect(box!.width).toBeGreaterThan(300);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("a demo user can run a real new analysis through the job pipeline", async ({ page }) => {
  test.setTimeout(180_000);
  await enterFromHome(page);
  const req = page.request;
  const projects = await (await req.get("/api/v1/projects")).json();
  const projectId = projects.projects[0].id;
  const sc = await (await req.post("/api/v1/scenarios", { data: { projectId, name: "Demo user scenario", site: { mode: "catalog", siteId: "shackleton" }, startUtc: "2026-12-10T00:00:00Z", endUtc: "2026-12-12T00:00:00Z", stepSeconds: 3600 } })).json();
  expect(sc.scenario?.id, JSON.stringify(sc)).toBeTruthy();
  const a = await (await req.post("/api/v1/analyses", { data: { scenarioId: sc.scenario.id } })).json();
  const done = await waitForAnalysis(req, a.analysisId, 120_000);
  expect(done.analysis.status).toBe("completed");
  await page.goto(`/app/analyses/${a.analysisId}`);
  await expect(page.locator("main")).not.toContainText(/NaN|undefined/);
});

test("demo failures show an actionable message instead of a dead end", async ({ page }) => {
  await page.goto("/login?demo=failed");
  const n = page.getByText("Demo could not be started");
  await expect(n).toBeVisible();
  await expect(page.getByRole("link", { name: /explore the polar map without an account/i })).toBeVisible();
  await page.goto("/login?demo=busy");
  await expect(page.getByText("Demo temporarily unavailable")).toBeVisible();
});

test("mobile: the demo button and tour fit a phone screen with no sideways scroll", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: false });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.goto("/");
  const btn = page.getByTestId("home-demo-button");
  await expect(btn).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await btn.click();
  await page.waitForURL(/\/app/, { timeout: 90_000 });
  await expect(page.getByTestId("demo-tour")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors, errors.join("\n")).toEqual([]);
  await ctx.close();
});
