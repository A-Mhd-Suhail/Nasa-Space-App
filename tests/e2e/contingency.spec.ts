import { expect, test, type Page } from "@playwright/test";

/**
 * Mission Emergency Simulator: every control must change something observable, results must come from real data
 * (SPICE, LOLA, live Horizons check) or be labelled illustrative, and impossible recoveries must be reported as such.
 */
// One demo session per browser run, reused by every test: demo starts are rate limited (20 per 10 minutes per client)
// and other suites need that budget too.
let cookies: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>> | null = null;
async function demo(page: Page) {
  if (cookies) {
    await page.context().addCookies(cookies);
    return;
  }
  await page.goto("/");
  await page.getByTestId("home-demo-button").click();
  await page.waitForURL(/\/app/, { timeout: 90_000 });
  cookies = await page.context().cookies();
}
async function openSim(page: Page) {
  await demo(page);
  await page.goto("/app/contingency");
  await expect(page.getByTestId("sim-banner")).toHaveText("SIMULATED MISSION — NOT LIVE SPACECRAFT CONTROL");
  await expect(page.getByTestId("env-meta")).toContainText("SPICE ephemeris", { timeout: 90_000 });
}
const seek = async (page: Page, frac: number) => {
  const slider = page.getByTestId("sim-slider");
  const max = Number(await slider.getAttribute("max"));
  await slider.fill(String(Math.round(max * frac)));
};
const preset = async (page: Page, id: string) => {
  await expect(async () => {
    await page.getByTestId(`preset-${id}`).click();
    await expect(page.getByTestId(`preset-${id}`)).toHaveAttribute("aria-pressed", "true", { timeout: 1500 });
  }).toPass({ timeout: 30_000 });
};

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test("access: anonymous users are sent to sign in and the APIs refuse them", async ({ page, request }) => {
  await page.goto("/app/contingency");
  await expect(page).toHaveURL(/\/login/);
  const r = await request.post("/api/v1/contingency/environment", { data: { latitudeDeg: -86, longitudeEastDeg: 0, utc: "2026-12-01T06:00:00Z" } });
  expect([401, 403]).toContain(r.status());
});

test("page loads with real SPICE/LOLA data, the Horizons cross-check, a 3D canvas and a nav entry", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openSim(page);
  await expect(page.getByRole("link", { name: "Emergency Simulator" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mission Emergency Simulator", level: 1 })).toBeVisible();
  await expect(page.getByTestId("env-meta")).toContainText("Horizons check: pass");
  await expect(page.getByTestId("env-meta")).toContainText(/LOLA terrain screening/);
  await expect(page.getByTestId("contingency-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("canvas").first()).toBeVisible();
  // camera / view controls do something
  await page.getByTestId("view-orbit").click();
  await expect(page.getByTestId("contingency-canvas")).toHaveAttribute("data-view", "orbit");
  await page.getByTestId("focus-lander").click();
  await page.getByTestId("view-descent").click();
  await expect(page.getByTestId("contingency-canvas")).toHaveAttribute("data-view", "descent");
  // WebKit reports cancelled link prefetches ("due to access control checks") as page errors on every app page: not ours.
  expect(errors.filter((e) => !/WebGL|ResizeObserver|access control checks/.test(e))).toEqual([]);
});

test("normal descent: direct Earth contact holds at the Malapert summit and the descent ends within limits", async ({ page }) => {
  await openSim(page);
  await preset(page, "normal");
  await seek(page, 0);
  await expect(page.getByTestId("hud-direct")).toHaveText("DIRECT COMMUNICATION: AVAILABLE");
  await seek(page, 0.97);
  await expect(page.getByTestId("hud-direct")).toHaveText("DIRECT COMMUNICATION: AVAILABLE");
  await expect(page.getByTestId("comm-reason")).toContainText(/above the terrain/);
  await expect(page.getByTestId("outcome-headline")).toHaveAttribute("data-status", "NOMINAL_TOUCHDOWN");
  await expect(page.getByTestId("status-panel")).toContainText("Altitude");
});

test("terrain blackout: on the Malapert flank real LOLA terrain blocks Earth as the lander descends", async ({ page }) => {
  await openSim(page);
  await preset(page, "blackout");
  await expect(page.getByTestId("env-meta")).toContainText("SPICE ephemeris", { timeout: 90_000 });
  await expect(page.getByTestId("preset-summary")).toContainText("86.0°S");
  await seek(page, 0);
  await expect(page.getByTestId("hud-direct")).toHaveText("DIRECT COMMUNICATION: AVAILABLE");
  await seek(page, 0.99);
  await expect(page.getByTestId("hud-direct")).toHaveText("DIRECT COMMUNICATION: LOST");
  await expect(page.getByTestId("comm-reason")).toContainText(/terrain/);
  await expect(page.getByTestId("hud-relay")).toHaveText("RELAY COMMUNICATION: UNAVAILABLE");
  await expect(page.getByTestId("state-log")).toContainText("Communication blackout");
  await expect(page.getByTestId("state-log")).toContainText("Autonomous response");
});

test("communication blackout and the relay: both legs are evaluated and shown", async ({ page }) => {
  await openSim(page);
  await preset(page, "relay");
  await expect(page.getByTestId("preset-summary")).toContainText("flank");
  await expect(page.getByTestId("env-meta")).toContainText("SPICE ephemeris", { timeout: 90_000 });
  await seek(page, 0.5); // after the injected blackout at t = 60 s
  await expect(page.getByTestId("hud-direct")).toHaveText("DIRECT COMMUNICATION: LOST");
  await expect(page.getByTestId("hud-l2r")).toContainText("LANDER → RELAY: VISIBLE");
  await expect(page.getByTestId("hud-r2e")).toContainText("RELAY → EARTH: VISIBLE");
  await expect(page.getByTestId("hud-relay")).toHaveText("RELAY COMMUNICATION: AVAILABLE");
  await expect(page.getByTestId("comm-reason")).toContainText(/simulated/i);
  await expect(page.getByTestId("state-log")).toContainText("Relay visibility check");
  // move the relay to the far side: the relay path closes and says why
  await page.getByTestId("relay-phase").fill("90");
  await expect(page.getByTestId("hud-relay")).toHaveText("RELAY COMMUNICATION: UNAVAILABLE");
  await expect(page.getByTestId("hud-l2r")).toContainText("BLOCKED");
  await expect(page.getByTestId("comm-timeline")).toBeVisible();
});

test("trigger buttons change the scene state: blackout, overshoot, undershoot, excessive descent velocity", async ({ page }) => {
  await openSim(page);
  await preset(page, "normal");
  await page.getByTestId("trigger-blackout").click();
  await expect(page.getByTestId("toast")).toContainText("blackout");
  await seek(page, 0.6);
  await expect(page.getByTestId("hud-direct")).toHaveText("DIRECT COMMUNICATION: LOST");
  for (const [id, text] of [["trigger-overshoot", "overshoot"], ["trigger-undershoot", "undershoot"], ["trigger-vertical", "descent velocity"]] as const) {
    await page.getByTestId("sim-reset").click();
    await page.getByTestId(id).click();
    await expect(page.getByTestId("toast")).toContainText(new RegExp(text, "i"));
    await expect(page.getByTestId("outcome-headline")).not.toHaveAttribute("data-status", "NOMINAL_TOUCHDOWN");
    await expect(page.getByTestId("explanations")).toContainText(/without action it touches down/);
  }
});

test("excessive horizontal velocity preset: deviation detected, recovery computed with delta-v and propellant", async ({ page }) => {
  await openSim(page);
  await preset(page, "overshoot");
  await expect(page.getByTestId("outcome-headline")).toContainText("RECOVERY FEASIBLE");
  const card = page.getByTestId("recovery-card");
  await expect(card).toContainText("RECOVERY FEASIBLE");
  await expect(card).toContainText("Required delta-v");
  await expect(card).toContainText("Propellant remaining");
  await seek(page, 0.3);
  await expect(page.getByTestId("hud-state")).toContainText(/TRAJECTORY DEVIATION|RECOVERY/);
});

test("emergency braking preset reports its own result, and vertical braking alone cannot save a lander with sideways speed", async ({ page }) => {
  await openSim(page);
  await preset(page, "braking");
  await expect(page.getByTestId("outcome-headline")).toContainText("RETROGRADE BRAKING FEASIBLE");
  await page.getByTestId("mode-select").selectOption("vertical");
  await expect(page.getByTestId("outcome-headline")).toContainText("RECOVERY NOT FEASIBLE");
  await expect(page.getByTestId("outcome-headline")).toContainText("VERTICAL BRAKING ONLY CANNOT GIVE A SAFE TOUCHDOWN");
});

test("alternative landing sites: real terrain candidates, explainable checks, a recommendation only among passing zones, and an honest no-site result", async ({ page }) => {
  await openSim(page);
  await preset(page, "alternative");
  await expect(page.getByTestId("outcome-headline")).toContainText("ORIGINAL TARGET NOT REACHABLE");
  await expect(page.getByTestId("sites-headline")).toContainText("ALTERNATIVE FOUND");
  const rows = page.locator('[data-testid^="site-alt-"]');
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  const verdicts = await rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.verdict));
  expect(verdicts).toContain("PASS");
  // a failing zone is never the recommended one
  const best = page.locator('[data-testid^="site-alt-"]:has-text("recommended")');
  await expect(best).toHaveAttribute("data-verdict", "PASS");
  await best.getByRole("button").first().click();
  await expect(best).toContainText("Reachable with remaining divert capability");
  await expect(best).toContainText(/Slope ≤ 15°/);
  // starve the vehicle: the honest answer is that no site is feasible
  await page.getByLabel("Propellant (kg)", { exact: true }).fill("150");
  await expect(page.getByTestId("outcome-headline")).toContainText("RECOVERY NOT FEASIBLE");
  await expect(page.getByTestId("sites-headline")).toHaveText("NO FEASIBLE ALTERNATIVE LANDING SITE FOUND");
});

test("emergency action buttons produce observable results", async ({ page }) => {
  await openSim(page);
  await preset(page, "normal");
  await page.getByTestId("action-brake").click();
  await expect(page.getByTestId("toast")).toContainText(/braking/i);
  await expect(page.getByTestId("recovery-card")).toBeVisible();
  await page.getByTestId("action-lateral").click();
  await expect(page.getByTestId("toast")).toContainText(/divert/i);
  await expect(page.getByTestId("sites-panel")).toBeVisible();
  await page.getByTestId("sim-reset").click();
  await page.getByTestId("action-sites").click();
  await expect(page.getByTestId("sites-headline")).toBeVisible();
});

test("simulation controls: start, pause, resume, speed, timeline, reset", async ({ page }) => {
  await openSim(page);
  await page.getByTestId("sim-start").click();
  await expect(page.getByTestId("sim-pause")).toBeVisible();
  await page.getByTestId("sim-speed").selectOption("30");
  await expect(page.getByTestId("sim-time")).not.toHaveText(/^t = 0 s/, { timeout: 30_000 });
  await page.getByTestId("sim-pause").click();
  const frozen = await page.getByTestId("sim-time").innerText();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("sim-time")).toHaveText(frozen);
  await expect(page.getByTestId("sim-resume")).toBeVisible();
  await seek(page, 0.5);
  await expect(page.getByTestId("sim-time")).not.toHaveText(frozen);
  await page.getByTestId("sim-reset").click();
  await expect(page.getByTestId("sim-time")).toHaveText(/^t = 0 s/);
});

test("optional RF margin needs the user's own values and is labelled illustrative", async ({ page }) => {
  await openSim(page);
  await page.getByTestId("rf-toggle").check();
  await expect(page.getByText("Fill in every RF assumption")).toBeVisible();
  const v: Record<string, string> = { "Frequency (GHz)": "2.2", "EIRP (dBW)": "20", "Receiver G/T (dB/K)": "30", "Data rate (bit/s)": "1000", "Required Eb/N0 (dB)": "3", "Other losses (dB)": "2" };
  for (const [label, val] of Object.entries(v)) await page.getByLabel(label).fill(val);
  await expect(page.getByTestId("rf-result")).toContainText("Relay → Earth margin");
  await expect(page.getByText(/does not prove a working link/)).toBeVisible();
});

test("data sources & provenance: all four resources, links, live checks, honest roles", async ({ page }) => {
  await openSim(page);
  const panel = page.getByTestId("sources-panel");
  await expect(panel).toBeVisible();
  for (const href of ["https://quickmap.lroc.asu.edu/", "https://trek.nasa.gov/moon/", "https://ssd.jpl.nasa.gov/horizons/", "https://ssd-api.jpl.nasa.gov/doc/horizons.html", "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/"]) {
    await expect(panel.locator(`a[href="${href}"]`).first()).toBeVisible();
  }
  await expect(page.getByTestId("source-moon-trek")).toContainText("DATA INTEGRATED", { timeout: 60_000 });
  await expect(page.getByTestId("source-quickmap")).toContainText("REFERENCE ONLY");
  await expect(page.getByTestId("source-csa-moon-exploration")).toContainText("REFERENCE ONLY");
  await expect(page.getByTestId("source-jpl-horizons")).toContainText("DATA INTEGRATED");
  await expect(page.getByTestId("source-quickmap")).toContainText(/not NASA-operated|not a NASA-operated|No documented public data API/);
  await expect(page.getByTestId("history-panel")).toContainText("2.1 km");
  await expect(page.getByTestId("history-panel")).toContainText("127 seconds");
  await expect(page.getByTestId("csa-note")).toContainText("Canadarm3");
});

test("failure handling: when the environment API fails the page says so and shows only illustrative geometry", async ({ page }) => {
  await demo(page);
  await page.route("**/api/v1/contingency/environment", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "science_unavailable", message: "The science service is unavailable." } }) }));
  await page.goto("/app/contingency");
  await expect(page.getByTestId("env-error")).toContainText("ILLUSTRATIVE", { timeout: 60_000 });
  await expect(page.getByTestId("env-meta")).toContainText("ILLUSTRATIVE");
  await expect(page.getByTestId("env-meta")).not.toContainText("SPICE ephemeris");
  await expect(page.getByTestId("outcome-headline")).toBeVisible();
});

test("failure handling: an incomplete ephemeris is rejected, and a Horizons outage is reported, not hidden", async ({ page }) => {
  await demo(page);
  let real: Record<string, unknown> | null = null;
  let mode: "incomplete" | "horizons" = "incomplete";
  await page.route("**/api/v1/contingency/environment", async (route) => {
    const resp = await route.fetch();
    const d = await resp.json();
    real = d;
    if (mode === "incomplete") d.bodies.earth = { azimuthDeg: 10 };
    else d.horizonsCheck = { status: "unavailable", maxSeparationDeg: null, detail: "JPL Horizons could not be reached (test)" };
    await route.fulfill({ response: resp, json: d });
  });
  await page.goto("/app/contingency");
  await expect(page.getByTestId("env-error")).toContainText("Earth ephemeris incomplete", { timeout: 90_000 });
  mode = "horizons";
  await page.getByTestId("load-env").click();
  await expect(page.getByTestId("env-meta")).toContainText("Horizons check: unavailable", { timeout: 90_000 });
  expect(real).not.toBeNull();
});

test("mobile: the simulator fits a phone screen without sideways scrolling and its controls work", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  await openSim(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await preset(page, "blackout");
  await expect(page.getByTestId("sim-banner")).toBeVisible();
  await expect(page.getByTestId("trigger-blackout")).toBeVisible();
  await page.getByTestId("trigger-blackout").click();
  await expect(page.getByTestId("toast")).toBeVisible();
  await ctx.close();
});
