import { expect, test } from "@playwright/test";
import { waitForAnalysis } from "./helpers";

/**
 * Method 1.1.0 additions, against the real engine: ground surface normal and irradiance on the Sun view, darkness
 * metrics, a terrain-aligned panel, and the optional link-margin estimate on the Earth view.
 */
async function demo(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTestId("home-demo-button").click();
  await page.waitForURL(/\/app/, { timeout: 90_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const list = await (await page.request.get("/api/scenarios")).json();
  return list.scenarios as { latestAnalysis: { id: string }; name: string }[];
}

test("Sun view shows the ground slope, incidence, irradiance and darkness from the real analysis", async ({ page }) => {
  test.setTimeout(180_000);
  const sc = await demo(page);
  const malapert = sc.find((s) => /malapert/i.test(s.name)) ?? sc[0];
  const api = await (await page.request.get(`/api/v1/analyses/${malapert.latestAnalysis.id}/timeseries?full=1&maxPoints=4000`)).json();
  const r = api.result;
  expect(r.provenance.methodVersion).toBe("moonnav-method-1.1.0");
  expect(r.surface.terrain.status).toBe("ok");
  expect(r.sun.longestDarkS).toBeGreaterThan(0);
  expect(r.sun.totalVisibleSeconds + r.sun.unknownSeconds + r.sun.totalDarkSeconds).toBeCloseTo((Date.parse(r.timeRange.endUtc) - Date.parse(r.timeRange.startUtc)) / 1000, -1);

  await page.goto(`/app/analysis/sun?analysisId=${malapert.latestAnalysis.id}`);
  const panel = page.getByTestId("surface-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel).toContainText("Ground slope at the site");
  await expect(panel).toContainText("Mean ground irradiance");
  await expect(panel).toContainText("Longest continuous darkness");
  await expect(panel).toContainText("physical irradiance, not electrical output");
  await expect(panel).not.toContainText(/NaN|undefined/);
});

test("a terrain-aligned panel analysis runs end to end and is reported against the ground, not a fixed normal", async ({ page }) => {
  test.setTimeout(180_000);
  await demo(page);
  const projects = await (await page.request.get("/api/v1/projects")).json();
  const sc = await (await page.request.post("/api/v1/scenarios", {
    data: { projectId: projects.projects[0].id, name: "Terrain-aligned panel", site: { mode: "catalog", siteId: "mons-malapert" }, startUtc: "2026-11-15T00:00:00Z", endUtc: "2026-12-15T00:00:00Z", stepSeconds: 3600, // the demo window: Mons Malapert has real sunlight in it
     
      solarPanel: { areaM2: 2, efficiency: 0.25, derating: 0.8, orientation: "terrain_aligned" } },
  })).json();
  expect(sc.scenario?.id, JSON.stringify(sc)).toBeTruthy();
  const a = await (await page.request.post("/api/v1/analyses", { data: { scenarioId: sc.scenario.id } })).json();
  const done = await waitForAnalysis(page.request, a.analysisId, 120_000);
  expect(done.analysis.status).toBe("completed");
  const r = (await (await page.request.get(`/api/v1/analyses/${a.analysisId}/timeseries?full=1&maxPoints=4000`)).json()).result;
  expect(r.power.assumptions.orientation).toBe("terrain_aligned");
  for (const row of r.timeseries) {
    if (row.powerW != null && row.terrainIrradianceWm2 != null) expect(row.powerW).toBeCloseTo(row.terrainIrradianceWm2 * 2 * 0.25 * 0.8, 1);
  }
  expect(r.power.energyWh).toBeGreaterThan(0);
});

test("link-margin estimate: labelled illustrative, needs the user's own values, and gives a result", async ({ page }) => {
  test.setTimeout(180_000);
  const sc = await demo(page);
  const malapert = sc.find((s) => /malapert/i.test(s.name)) ?? sc[0]; // Earth is above the horizon here
  await page.goto(`/app/analysis/earth?analysisId=${malapert.latestAnalysis.id}`);
  await page.getByTestId("mode-toggle").first().getByRole("radio", { name: "Advanced" }).click();
  const lb = page.getByTestId("link-budget");
  await expect(lb).toBeVisible({ timeout: 30_000 });
  await expect(lb).toContainText("not a mission link analysis");
  const run = page.getByTestId("link-budget-run");
  await expect(run).toBeDisabled(); // no defaults are assumed
  await lb.getByLabel("EIRP (dBW)").fill("20");
  await lb.getByLabel("Receiver G/T (dB/K)").fill("30");
  await lb.getByLabel("Data rate (bit/s)").fill("100000");
  await lb.getByLabel("Required Eb/N0 (dB)").fill("2.5");
  await lb.getByLabel("Other losses (dB)").fill("3");
  await expect(run).toBeEnabled();
  await run.click();
  const res = page.getByTestId("link-budget-result");
  await expect(res).toBeVisible({ timeout: 30_000 });
  await expect(res).toContainText("Samples with margin ≥ 0 dB");
  await expect(res).toContainText("Free-space path loss");
});

test("link-budget API: sign-in required, input validated, labelled result", async ({ request, page }) => {
  const body = { frequencyHz: 2.2e9, eirpDbw: 20, receiverGOverTDbK: 30, dataRateBps: 1e5, requiredEbN0Db: 2.5, otherLossesDb: 3, distancesKm: [357000, 384400, 406700] };
  const anon = await request.post("/api/v1/link-budget", { data: body, headers: { origin: process.env.APP_URL ?? "http://localhost:3100" } });
  expect([401, 403]).toContain(anon.status());
  await demo(page);
  const ok = await page.request.post("/api/v1/link-budget", { data: body });
  expect(ok.status()).toBe(200);
  const j = await ok.json();
  expect(j.label).toContain("Not a mission link analysis");
  expect(j.marginDb[0]).toBeGreaterThan(j.marginDb[2]); // closer Earth, smaller path loss, larger margin
  const bad = await page.request.post("/api/v1/link-budget", { data: { ...body, distancesKm: [10] } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error.code).toBe("invalid_input");
  const nan = await page.request.post("/api/v1/link-budget", { data: "{\"frequencyHz\": NaN}", headers: { "content-type": "application/json" } });
  expect(nan.status()).toBeLessThan(500);
});
