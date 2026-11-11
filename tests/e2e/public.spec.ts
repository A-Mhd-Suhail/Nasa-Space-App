import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("anonymous visitor opens home, clicks Explore and uses the public map", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Read the light before you land");
  await page.getByRole("link", { name: /Explore the pole/ }).first().click();
  await expect(page).toHaveURL(/\/explore/);
  await expect(page.getByRole("heading", { name: "South-pole explorer" })).toBeVisible();
  // Map renders and a click returns a LOLA coordinate readout
  const map = page.getByRole("application");
  await expect(map).toBeVisible();
  await page.waitForTimeout(1500);
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5 + 40, box.y + box.height * 0.5 - 30);
  await expect(page.getByRole("heading", { name: "Clicked coordinate" })).toBeVisible();
  await expect(page.getByText(/Height relative to the 1737.4 km sphere/)).toBeVisible();
  // Select a featured site from the keyboard-accessible list; precomputed demo is labelled
  await page.getByRole("option", { name: /Mons Mouton/ }).click();
  await expect(page.getByText(/Precomputed demonstration · generated/)).toBeVisible();
  await expect(page.getByText("Direct-sunlight intervals")).toBeVisible();
  await page.getByRole("tab", { name: "Earth & DTE" }).click();
  await expect(page.getByText(/not RF link availability/).first()).toBeVisible();
  await page.getByRole("tab", { name: "Site 3D" }).click();
  await expect(page.getByText(/local ENU patch/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: "Polar region 3D" }).click();
  await expect(page.getByText(/each sample on the 1737.4 km sphere/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Sites on the cap" })).toBeVisible();
  // slope layer toggles a legend
  await page.getByRole("checkbox", { name: "Slope" }).check();
  await expect(page.getByText("Slope (480 m)")).toBeVisible();
  // Out-of-coverage coordinates report unavailable, never zero
  await page.getByPlaceholder("lat e.g. -89.45").fill("-70");
  await page.getByPlaceholder(/lon °E/).fill("10");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByText(/Outside terrain coverage/)).toBeVisible();
  expect(errors.filter((e) => !/WebGL|GPU|THREE/i.test(e))).toEqual([]);
});

test("visitor completes the Learn guided example; technical details show the same numbers", async ({ page }) => {
  await page.goto("/learn");
  await page.getByRole("radio", { name: "Shackleton" }).click();
  await expect(page.getByText(/Mons Malapert receives more direct sunlight/)).toBeVisible();
  await page.getByText("Show technical details").click();
  await expect(page.getByText(/sunFraction = 0.58/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "The 12 steps" })).toBeVisible();
  await expect(page.getByText("Complete the blueprint")).toBeVisible();
});

test("saving a scenario from the public explorer requires sign-in and preserves a safe return URL", async ({ page }) => {
  await page.goto("/explore?site=shackleton");
  await page.getByRole("link", { name: /Save as scenario/ }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fscenarios%2Fnew%3Fsite%3Dshackleton/);
  await expect(page.getByText("Sign in to continue to the page you requested.")).toBeVisible();
  // Protected pages redirect anonymous users to login
  await page.goto("/app/compare");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("methodology, sources and limitations contain substantive content", async ({ page }) => {
  await page.goto("/methodology");
  await expect(page.getByText(/MOON_ME_DE440_ME421/).first()).toBeVisible();
  await page.goto("/sources");
  await expect(page.getByText("LDEM_75S_240M").first()).toBeVisible();
  await expect(page.getByText(/d031efe2611b17dfbf3c158f5e15dc04cd5719349dcbf6384bb21fd97697c490/)).toBeVisible();
  await expect(page.getByText(/Moon Trek WMTS/).first()).toBeVisible();
  await page.goto("/limitations");
  await expect(page.getByText("Communication")).toBeVisible();
});

for (const p of ["/", "/explore", "/learn", "/methodology", "/sources", "/login", "/register"]) {
  test(`accessibility audit ${p}`, async ({ page }) => {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).disableRules(["region"]).analyze();
    const serious = r.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
}

test("health endpoint distinguishes web, database, science and worker", async ({ request }) => {
  const r = await request.get("/api/v1/health");
  const d = await r.json();
  expect(d.web.status).toBe("ok");
  expect(d.database.status).toBe("ok");
  expect(d.science.status).toBe("ok");
  expect(["ok", "no_live_worker"]).toContain(d.worker.status);
});

test("API errors use the consistent contract without stack traces", async ({ request }) => {
  const r = await request.get("/api/v1/terrain/point?lat=abc&lon=0");
  expect(r.status()).toBe(422);
  const d = await r.json();
  expect(d.error.code).toBe("invalid_input");
  expect(d.error.requestId).toBeTruthy();
  expect(JSON.stringify(d)).not.toMatch(/at .*\.ts:\d+/);
  const u = await request.get("/api/v1/projects");
  expect(u.status()).toBe(401);
});

test("theme switch persists and both themes render with their own tokens", async ({ page }) => {
  await page.goto("/");
  const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  expect(await bg()).toBe("#f4f0e7");
  await page.getByRole("radio", { name: "Dark theme" }).first().click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  expect(await bg()).toBe("#1c1a17");
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  await page.getByRole("radio", { name: "Light theme" }).first().click();
  expect(await bg()).toBe("#f4f0e7");
});

test("public navigation: every primary link resolves and the 404 page is branded", async ({ page }) => {
  for (const [label, path] of [["Explore", "/explore"], ["Learn", "/learn"], ["Methodology", "/methodology"], ["Data sources", "/sources"], ["About", "/about"]] as const) {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  const r = await page.goto("/no-such-page");
  expect(r?.status()).toBe(404);
  await expect(page.getByText("This page is outside our coverage.")).toBeVisible();
});

test("NASA Moon Trek imagery basemap loads real tiles with attribution; LOLA layers remain", async ({ page }) => {
  const tiles: number[] = [];
  page.on("response", (r) => r.url().startsWith("https://trek.nasa.gov/tiles/Moon/SP/LRO_WAC_Mosaic_SPole60_100m_v02/") && tiles.push(r.status()));
  await page.goto("/explore?site=mons-malapert");
  await page.getByRole("radio", { name: "LROC WAC imagery" }).click();
  await expect(page.getByTestId("imagery-status")).toContainText("LRO WAC Mosaic, S Pole v2");
  await expect.poll(() => tiles.filter((s) => s === 200).length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.getByRole("radio", { name: "LOLA relief" }).click();
  await page.getByRole("checkbox", { name: "Slope" }).check();
  await expect(page.getByText("Slope (480 m)")).toBeVisible();
});

test("feasibility layer screens real grid cells against user constraints and explains a point", async ({ page }) => {
  await page.goto("/explore?site=shackleton");
  await page.getByRole("checkbox", { name: "Feasibility" }).check();
  const legend = page.getByTestId("feasibility-legend");
  await expect(legend).toContainText("3721 cells");
  const passCount = async () => Number((await legend.innerText()).match(/Meets all \((\d+)\)/)![1]);
  const before = await passCount();
  await page.getByRole("slider", { name: /Minimum geometric DTE/ }).fill("0");
  await expect.poll(passCount).toBeGreaterThan(before);
  // Shackleton floor: permanently shadowed in the window → fails sunlight and darkness
  await page.getByPlaceholder("lat e.g. -89.45").fill("-89.67");
  await page.getByPlaceholder(/lon °E/).fill("129.78");
  await page.getByRole("button", { name: "Go" }).click();
  const ex = page.getByTestId("feasibility-explanation");
  await expect(ex).toContainText("✗ Direct sunlight: 0.0%");
  await expect(ex).toContainText("Longest darkness");
});

test("global Moon globe renders NASA imagery and hands off to the regional 3D view", async ({ page }) => {
  let trek = 0;
  page.on("response", (r) => r.url().includes("trek.nasa.gov") && r.ok() && trek++);
  await page.goto("/explore?site=shackleton");
  await page.getByRole("tab", { name: "Global Moon" }).click();
  await expect(page.getByText(/LRO WAC mosaics \(NASA\/GSFC\/ASU\)/)).toBeVisible({ timeout: 30_000 });
  expect(trek).toBeGreaterThanOrEqual(36);
  await page.getByRole("button", { name: /Open Shackleton .* in polar region 3D/ }).click();
  await expect(page.getByRole("heading", { name: "Sites on the cap" })).toBeVisible({ timeout: 20_000 });
});

test("polar sky plot draws the stored horizon and tracks, with a zoom/full-sky toggle", async ({ page }) => {
  await page.goto("/explore?site=mons-malapert");
  await page.getByRole("tab", { name: "Polar sky plot" }).first().click();
  const plot = page.getByTestId("polar-sky-plot");
  await expect(plot).toBeVisible();
  expect(await plot.locator("circle").count()).toBeGreaterThan(100); // Sun + Earth samples
  await expect(page.getByText(/Sun, selected/)).toBeVisible();
  await page.getByRole("radio", { name: "Full sky" }).click();
  await expect(plot.getByText("90°")).toBeVisible();
  await page.getByRole("tab", { name: "Panorama" }).first().click();
  await expect(page.getByRole("tab", { name: "Panorama" }).first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Horizon panorama" }).first()).toBeVisible();
  await expect(plot).toHaveCount(0);
});

test("PSR source layer: toggles with legend; point lookup reports PSR and unknown outside coverage", async ({ page }) => {
  await page.goto("/explore?site=shackleton");
  await page.getByLabel("Permanent shadow (PSR)").check();
  await expect(page.getByTestId("illum-legend")).toContainText("Permanently shadowed");
  await expect(page.getByTestId("illum-legend")).toContainText("LOLA");
  await page.locator("#go-lat").fill("-89.67");
  await page.locator("#go-lon").fill("129.78");
  await page.locator("#go-lon").press("Enter");
  await expect(page.getByTestId("point-psr")).toHaveText("yes (PSR)", { timeout: 15_000 });
  await page.locator("#go-lat").fill("-85.99");
  await page.locator("#go-lon").fill("2.93");
  await page.locator("#go-lon").press("Enter");
  await expect(page.getByTestId("point-psr")).toHaveText("no", { timeout: 15_000 });
  const eq = await page.request.get("/api/v1/illumination/point?lat=10&lon=10");
  expect(eq.ok()).toBeTruthy();
  const j = await eq.json();
  expect(j.permanentShadow).toBeNull();
  expect(j.permanentShadowStatus).toContain("outside");
});

test("rendering diagnostics: ?perf=1 shows live frame stats and records a sample", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/explore?site=mons-malapert&perf=1");
  const panel = page.getByTestId("perf-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("perf-live")).toContainText("FPS", { timeout: 5_000 });
  await page.getByTestId("perf-record").click();
  await expect(page.getByTestId("perf-result")).toContainText("fps avg", { timeout: 15_000 });
  await panel.getByRole("button", { name: "Close diagnostics" }).click();
  await expect(panel).toBeHidden();
});
