import { expect, test } from "@playwright/test";

/**
 * Scientific workflow added in the 2026-11-11 core-feature pass, driven through the one-click demo:
 * demo access and isolation, global LOLA relief, Mission Planner (suitability, site x date matrix,
 * terrain hazards, sensitivity), operational windows, comparison terrain columns, validation page.
 */
test.describe.configure({ mode: "serial" });
let cookies: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>> | null = null;

async function demo(page: import("@playwright/test").Page) {
  if (cookies) return page.context().addCookies(cookies);
  await page.goto("/login");
  await page.getByTestId("demo-button").click();
  await page.waitForURL(/\/app/, { timeout: 90_000 });
  cookies = await page.context().cookies();
}

test("Continue with demo opens an isolated, pre-seeded, restricted workspace", async ({ page }) => {
  await demo(page);
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  const me = await (await page.request.get("/api/v1/me")).json();
  expect((me.user ?? me).email).toMatch(/@demo\.moonnav\.invalid$/);
  const sc = await (await page.request.get("/api/scenarios")).json();
  expect(sc.scenarios.length).toBe(4);
  expect(sc.scenarios.every((s: { latestAnalysis: { status: string } }) => s.latestAnalysis.status === "completed")).toBe(true);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app\?denied=1/);
  const pw = await page.request.post("/api/auth/change-password", { data: { currentPassword: "x", newPassword: "yyyyyyyyyyyyyyyy" } });
  expect(pw.status()).toBe(403);
  const ws = (await (await page.request.get("/api/v1/workspaces")).json()).workspaces[0].id;
  expect((await page.request.post(`/api/v1/workspaces/${ws}/invitations`, { data: { email: "x@example.com", role: "viewer" } })).status()).toBe(403);
});

test("a second demo session cannot see the first demo's data", async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.getByTestId("demo-button").click();
  await p.waitForURL(/\/app/, { timeout: 90_000 });
  const mine = await (await p.request.get("/api/scenarios")).json();
  const ctxA = await browser.newContext();
  await ctxA.addCookies(cookies!);
  const theirs = await (await ctxA.request.get("/api/scenarios")).json();
  const a = new Set(theirs.scenarios.map((s: { id: string }) => s.id));
  expect(mine.scenarios.some((s: { id: string }) => a.has(s.id))).toBe(false);
  expect((await p.request.get(`/api/v1/scenarios/${theirs.scenarios[0].id}`)).status()).toBe(404);
  await ctx.close();
  await ctxA.close();
});

test("operational windows are derived from the stored analysis", async ({ page }) => {
  await demo(page);
  const sc = await (await page.request.get("/api/scenarios")).json();
  const malapert = sc.scenarios.find((s: { siteId: string }) => s.siteId === "mons-malapert");
  await page.goto(`/app/analysis/sun?analysisId=${malapert.latestAnalysis.id}`);
  const ops = page.getByTestId("ops-sun");
  await expect(ops).toBeVisible({ timeout: 30_000 });
  await expect(ops).toContainText("Next sunset");
  await expect(ops).toContainText(/Longest darkness in window\s*\d/);
  await page.goto(`/app/analysis/earth?analysisId=${malapert.latestAnalysis.id}`);
  await expect(page.getByTestId("ops-earth")).toContainText("Next DTE window");
});

test("Mission Planner: suitability grid with explanations; invalid coordinates rejected", async ({ page }) => {
  test.setTimeout(240_000);
  await demo(page);
  await page.goto("/app/planner");
  await page.getByLabel("Grid (cells per side)").selectOption("3");
  await page.getByLabel("Half-width (km)").fill("1");
  await page.getByTestId("run-suitability").click();
  const res = page.getByTestId("suitability-result");
  await expect(res).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId("cell-explanation")).toContainText(/score|not scored/);
  await expect(page.getByTestId("cell-explanation")).toContainText("Slope");
  await page.getByLabel("Landing site").selectOption("custom");
  await page.getByLabel("Latitude (°, −90…−75)").fill("-60");
  await page.getByLabel("Longitude (°E)").fill("10");
  await expect(page.getByRole("alert").filter({ hasText: "LOLA polar terrain coverage" })).toBeVisible();
  const api = await page.request.post("/api/v1/suitability/grid", { data: { latitudeDeg: -60, longitudeEastDeg: 10, startUtc: "2026-12-01T00:00:00Z", endUtc: "2026-12-02T00:00:00Z" } });
  expect(api.status()).toBe(422);
});

test("Mission Planner: terrain hazards, sensitivity and site x date matrix", async ({ page }) => {
  test.setTimeout(300_000);
  await demo(page);
  await page.goto("/app/planner");
  await page.getByRole("tab", { name: "Terrain hazards" }).click();
  await page.getByTestId("run-hazards").click();
  await expect(page.getByTestId("hazard-result")).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId("hazard-verdict")).toHaveText(/within thresholds|caution|exceeds|unknown/);
  await expect(page.getByTestId("hazard-result")).toContainText("not a certified landing-hazard assessment");
  await page.getByRole("tab", { name: "Sensitivity" }).click();
  await page.getByLabel("Length (days)").fill("2");
  await page.getByTestId("run-sensitivity").click();
  await expect(page.getByTestId("sensitivity-result")).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId("sensitivity-result")).toContainText(/sunlight ranges/);
  await page.getByRole("tab", { name: "Site × date matrix" }).click();
  await page.getByLabel(/Window start dates/).fill("2026-12-01, 2026-12-15");
  await page.getByTestId("run-matrix").click();
  const m = page.getByTestId("matrix-result");
  await expect(m).toBeVisible({ timeout: 180_000 });
  await expect(m.getByRole("row")).toHaveCount(3);
});

test("global Moon carries LOLA relief at true scale by default; exaggeration is labelled", async ({ page }) => {
  await page.goto("/explore?site=mons-malapert&tab=globe");
  const status = page.getByTestId("relief-status");
  await expect(status).toContainText("NASA LOLA LDEM_16", { timeout: 60_000 });
  await expect(status).toContainText("true scale (1.0×)");
  await page.getByLabel("Vertical exaggeration").selectOption("10");
  await expect(status).toContainText("VISUAL EXAGGERATION 10× — display only");
  const meta = await (await page.request.get("/data/terrain/global_relief.json")).json();
  expect(meta.source.product).toBe("LDEM_16");
  expect(meta.levels.map((l: { pixelsPerDegree: number }) => l.pixelsPerDegree)).toEqual([4, 8]);
});

test("validation page shows reproducible NASA/JPL comparisons", async ({ page }) => {
  await page.goto("/validation");
  await expect(page.getByRole("heading", { name: "Scientific validation" })).toBeVisible();
  await expect(page.getByText(/\d+ pass · 0 fail/)).toBeVisible();
  await expect(page.getByText("svs-2026-12-03T00:00")).toBeVisible();
  await expect(page.getByText("Passing these checks does not mean NASA has certified or endorsed MoonNav", { exact: false }).first()).toBeVisible();
});

test("high-resolution terrain is reported with its real resolution", async ({ request }) => {
  const p = await (await request.get("/api/terrain/elevation?lat=-85.98&lon=358.33")).json();
  expect(p.highResolution.resolutionM).toBe(20);
  expect(p.highResolution.productId).toBe("lola-ldem-85s-20m-v2");
  expect(Math.abs(p.highResolution.heightM - p.heightM)).toBeLessThan(50);
});
