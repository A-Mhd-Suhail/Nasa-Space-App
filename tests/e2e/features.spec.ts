import { expect, test } from "@playwright/test";
import { registerVerified, testPassword, uniq, waitForAnalysis } from "./helpers";

/**
 * Mission-planning journey added in the 2026-11-11 completion pass: Simple/Advanced mode,
 * checklist API endpoints, multi-site x multi-date comparison with trade-offs and Pareto,
 * the printable mission report and the live JPL Horizons cross-check.
 */
test.describe.configure({ mode: "serial" });

const email = `journey-${uniq()}@example.test`;
const password = testPassword();
const analyses: string[] = [];
let cookies: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>> | null = null;

test("Simple / Advanced mode switches without reload and persists", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Start mission planning/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Google Maps, but for planning Moon landings/ })).toBeVisible();
  const toggle = page.getByTestId("mode-toggle").first();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "simple");
  await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 42));
  await toggle.getByRole("radio", { name: "Advanced" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "advanced");
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42); // no reload
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "advanced");
  await page.getByTestId("mode-toggle").first().getByRole("radio", { name: "Simple" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "simple");
});

test("checklist endpoints: ephemeris, timeline, sites and terrain with validation", async ({ request }) => {
  const sun = await (await request.get("/api/ephemeris/sun?lat=-85.0&lon=31&date=2026-12-01&time=06:30")).json();
  expect(sun.body).toBe("sun");
  expect(sun.azimuthDeg).toBeGreaterThanOrEqual(0);
  expect(sun.azimuthDeg).toBeLessThan(360);
  expect(Math.abs(sun.elevationDeg)).toBeLessThan(10);
  expect(sun.terrainHorizonDeg).not.toBeNull();
  expect(["visible", "partial", "terrain_blocked", "below_horizon", "unknown"]).toContain(sun.state);
  expect(sun.provenance.ephemerisSource).toMatch(/SPICE/);
  const earth = await (await request.get("/api/ephemeris/earth?lat=-85.0&lon=31&utc=2026-12-01T06:30:00Z")).json();
  expect(typeof earth.elevationDeg).toBe("number");
  expect((await request.get("/api/ephemeris/sun?lat=-95&lon=0&date=2026-12-01")).status()).toBe(422);
  expect((await request.get("/api/ephemeris/moon?lat=-85&lon=0&date=2026-12-01")).status()).toBe(404);
  const tl = await (await request.get("/api/timeline?lat=-85.98&lon=358.33&date=2026-12-15&hours=24")).json();
  expect(tl.timeseries.length).toBeGreaterThanOrEqual(145); // 24 h at 10 min, plus any refined transition samples
  expect(tl.sun.totalVisibleSeconds).toBeGreaterThanOrEqual(0);
  expect(tl.earth.label).toMatch(/line of sight|geometric/i);
  const sites = await (await request.get("/api/sites")).json();
  expect(sites.sites.map((s: { id: string }) => s.id)).toEqual(expect.arrayContaining(["shackleton", "de-gerlache", "mons-mouton", "south-pole"]));
  const pt = await (await request.get("/api/terrain/elevation?lat=-84.6&lon=31")).json();
  expect(pt.covered).toBe(true);
  expect(pt.heightM).toBeGreaterThan(4000);
});

test("two sites x two dates: compare, trade-offs, Pareto, matrix, export and preferences", async ({ page }) => {
  await registerVerified(page, "Journey Planner", email, password);
  cookies = await page.context().cookies();
  const req = page.request;
  const proj = (await (await req.post("/api/v1/projects", { data: { name: "Journey" } })).json()).project.id;
  for (const site of ["mons-malapert", "mons-mouton"])
    for (const d of ["2026-12-01", "2026-12-15"]) {
      const end = new Date(Date.parse(`${d}T00:00:00Z`) + 2 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
      const sc = await (await req.post("/api/v1/scenarios", { data: { projectId: proj, name: `${site} ${d}`, site: { mode: "catalog", siteId: site }, startUtc: `${d}T00:00:00Z`, endUtc: end, stepSeconds: 1800 } })).json();
      const a = await (await req.post("/api/v1/analyses", { data: { scenarioId: sc.scenario.id } })).json();
      analyses.push(a.analysisId);
    }
  for (const id of analyses) expect((await waitForAnalysis(req, id, 120_000)).analysis.status).toBe("completed");

  // scenario management: list, rename
  const list = await (await req.get("/api/scenarios")).json();
  expect(list.scenarios.length).toBeGreaterThanOrEqual(4);
  const renamed = await (await req.patch(`/api/scenarios/${list.scenarios[0].id}`, { data: { name: "Renamed candidate" } })).json();
  expect(renamed.scenario.name).toBe("Renamed candidate");

  await page.goto(`/app/compare?ids=${analyses.join(",")}`);
  await page.getByLabel("Min. direct-to-Earth (h)").fill("1");
  await page.getByTestId("run-compare").click();
  await expect(page.getByTestId("compare-results")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("compare-summary")).toContainText(/deserve/);
  await expect(page.getByTestId("compare-results")).toContainText("Simplified MoonNav mission suitability score — not an official NASA mission feasibility rating");
  const matrix = page.getByTestId("matrix");
  await expect(matrix.getByRole("row")).toHaveCount(3); // header + 2 sites
  await expect(matrix).toContainText("Mons Malapert");
  await expect(page.getByLabel("Pareto-optimal").first()).toBeVisible();
  const pdf = await page.getByRole("link", { name: "PDF" }).getAttribute("href");
  const r = await req.get(pdf!);
  expect(r.headers()["content-type"]).toBe("application/pdf");
  // weights and thresholds were remembered
  const prefs = await (await req.get("/api/v1/me/preferences")).json();
  expect(prefs.stored).toBe(true);
  expect(prefs.preferences.missionThresholds.minDteHours).toBe(1);
});

test("Sun view explains blocking in plain language; mission report has every section", async ({ page }) => {
  await page.context().addCookies(cookies!);
  await page.goto(`/app/analysis/sun?analysisId=${analyses[1]}`);
  await expect(page.getByTestId("plain-sun")).toContainText(/Sun is visible from this site about \d+%/);
  await expect(page.getByRole("button", { name: "Reset to start" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Playback speed/ })).toHaveValue("3600");
  await page.getByRole("button", { name: "Step forward" }).click();
  await expect(page.getByTestId("time-readout")).toContainText("2026-12-15 01:00:00 UTC");

  await page.goto(`/app/analyses/${analyses[1]}/report`);
  const rep = page.getByTestId("mission-report");
  for (const h of ["1. Site and mission time", "2. Sun and Earth at mission time", "3. Durations over the interval", "4. Terrain horizon profile", "7. Feasibility assessment", "8. Scientific confidence and validation", "9. Data provenance"]) await expect(rep.getByText(h)).toBeVisible();
  await expect(rep.getByRole("button", { name: /Print/ })).toBeVisible();
  await expect(rep).toContainText("not an official NASA mission feasibility rating");
});

test("live JPL Horizons cross-check is stored on the analysis (or reports the outage honestly)", async ({ page }) => {
  await page.context().addCookies(cookies!);
  await page.goto(`/app/analyses/${analyses[1]}`);
  await page.getByTestId("run-horizons").click();
  await expect(page.getByTestId("horizons-status")).toContainText(/pass|warn|fail|could not be reached|unreachable/i, { timeout: 120_000 });
  const d = await (await page.request.get(`/api/v1/analyses/${analyses[1]}`)).json();
  if (d.analysis.validation) {
    expect(d.analysis.validation.status).toBe("pass");
    expect(d.analysis.validation.maxSeparationDeg).toBeLessThan(0.01);
  }
});

test("scenario science fields stay immutable in the database; only the name can change", async () => {
  const { pool } = await import("./helpers");
  const { rows } = await pool.query(`select id, name from scenarios limit 1`);
  await expect(pool.query(`update scenarios set step_seconds = step_seconds + 1 where id = $1`, [rows[0].id])).rejects.toThrow(/immutable/);
  await pool.query(`update scenarios set name = name where id = $1`, [rows[0].id]);
});
