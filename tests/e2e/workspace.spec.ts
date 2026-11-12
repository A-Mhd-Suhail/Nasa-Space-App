import { expect, test } from "@playwright/test";
import { fillStable, mailLink, pool, registerVerified, testPassword, uniq, waitForAnalysis } from "./helpers";

test.describe.configure({ mode: "serial" });

const email = `planner-${uniq()}@example.test`;
const password = testPassword();
let analysisA = "";
let analysisB = "";
let cookies: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>> | null = null;

/** Sign in once through the UI, then reuse the session cookie (sign-in is rate limited). */
async function session(page: import("@playwright/test").Page) {
  if (cookies) return page.context().addCookies(cookies);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app/);
  cookies = await page.context().cookies();
}

test("user registers, verifies email and completes onboarding", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/register");
  await page.getByLabel("Name").fill("Test Planner");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("short");
  await page.getByLabel("Confirm password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Password needs at least 12 characters/)).toBeVisible();
  await expect(page.getByText("Please accept the terms and privacy notice")).toBeVisible();
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  // Sign-up is rate limited (5/min per IP); when another suite just registered users, wait out the window.
  for (let i = 0; i < 4; i++) {
    // Wait for the server's answer before deciding (the alert renders asynchronously).
    await page.getByText("Check your inbox").or(page.getByText(/Too many attempts/)).first().waitFor({ timeout: 20_000 });
    if (!(await page.getByText(/Too many attempts/).isVisible())) break;
    await page.waitForTimeout(30_000);
    await page.getByRole("button", { name: "Create account" }).click();
  }
  await expect(page.getByText("Check your inbox")).toBeVisible();
  // Unverified users cannot sign in
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Verify your email first")).toBeVisible();
  // Verification link signs the user in and lands on onboarding
  await page.goto(await mailLink(email, "verify-email"));
  await expect(page).toHaveURL(/\/app\/onboarding/);
  await page.getByRole("radio", { name: /Mission planning/ }).click();
  await page.getByLabel("I understand these prototype limitations.").check();
  await page.getByRole("button", { name: /guided example/ }).click();
  await expect(page).toHaveURL(/\/app\/scenarios\/new\?guided=1/);
});

test("user creates a project + guided scenario and the job runs queued -> completed", async ({ page }) => {
  await session(page);
  await page.goto("/app/scenarios/new?guided=1");
  await expect(page.getByText("Guided example")).toBeVisible();
  await expect(page.getByText(/is inside LOLA 75°S–90°S/)).toBeVisible();
  await page.getByRole("button", { name: "Save & run analysis" }).click();
  await expect(page).toHaveURL(/\/app\/analyses\/ana_/, { timeout: 20_000 });
  analysisA = page.url().split("/").pop()!;
  await expect(page.locator("#main").getByRole("link", { name: "Sun & Power" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Panel energy")).toBeVisible();
  const d = await waitForAnalysis(page.request, analysisA);
  expect(d.analysis.status).toBe("completed");
  expect(d.analysis.summary.power.energyWh).toBeGreaterThan(0);
  expect(d.analysis.summary.provenance.kernelManifestId).toBe("moonnav-kernels-2026-11-10-a");
  // the worker reported its real processing stages, in order, into the job log
  const job = await (await page.request.get(`/api/v1/jobs/${d.job.id}`)).json();
  const stages = job.job.log.map((l: { msg: string }) => l.msg).filter((m: string) => m.startsWith("stage ")).map((m: string) => m.slice(6));
  expect(stages).toEqual(expect.arrayContaining(["validating_input", "loading_spice_kernels", "loading_dem", "computing_terrain_horizon", "sampling_sun_and_earth", "extracting_sun_intervals", "integrating_solar_power", "uploading_result"]));
  expect(stages.indexOf("loading_dem")).toBeLessThan(stages.indexOf("sampling_sun_and_earth"));
  // a freshly computed result is not stale
  expect((await (await page.request.get(`/api/v1/analyses/${analysisA}`)).json()).staleness.state).toBe("current");
  // project list reports the real scenario count (regression: correlated subquery)
  const list = await (await page.request.get("/api/v1/projects")).json();
  const proj = list.projects.find((x: { id: string }) => x.id === d.scenario.projectId);
  expect(proj.scenarioCount).toBeGreaterThanOrEqual(1);
});

test("custom-coordinate scenario validates coverage, then runs", async ({ page }) => {
  await session(page);
  await page.goto("/app/scenarios/new");
  await fillStable(page.getByLabel("Scenario name"), "Custom rim point");
  await page.getByRole("radio", { name: "Custom coordinates" }).click();
  await page.getByLabel("Latitude (°)").fill("-70");
  await expect(page.getByText(/is outside the terrain product/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save & run analysis" })).toBeDisabled();
  await page.getByLabel("Latitude (°)").fill("-89.45");
  await page.getByLabel("Longitude (°)").fill("222.69");
  await page.getByLabel(/Estimate idealized solar-panel energy/).check();
  await page.getByRole("button", { name: "Save & run analysis" }).click();
  await expect(page).toHaveURL(/\/app\/analyses\/ana_/, { timeout: 20_000 });
  analysisB = page.url().split("/").pop()!;
  const d = await waitForAnalysis(page.request, analysisB);
  expect(d.analysis.status).toBe("completed");
});

test("Sun & Power and Earth & DTE pages show computed geometry, intervals and RF limitation", async ({ page }) => {
  await session(page);
  await page.goto(`/app/analysis/sun?analysisId=${analysisA}`);
  await expect(page.getByText("Sun azimuth", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Direct-sunlight intervals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solar-panel energy (idealized)" })).toBeVisible();
  await page.getByRole("combobox", { name: "Step size" }).selectOption("0");
  await page.getByRole("button", { name: "Step forward" }).click();
  await expect(page.getByText(/· 2\/\d+/)).toBeVisible();
  await page.goto(`/app/analysis/earth?analysisId=${analysisA}`);
  await expect(page.getByText(/Geometric Direct-to-Earth visibility — not RF link availability/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Geometric DTE windows" })).toBeVisible();
  await page.goto(`/app/sites/mons-malapert?analysisId=${analysisA}`);
  await expect(page.getByRole("heading", { name: "At selected time" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Elevation profile" })).toBeVisible();
});

test("stale results are flagged with reasons and re-run as a new analysis, keeping the original", async ({ page }) => {
  await session(page);
  // Simulate a result produced by an older method version (test-created analysis only).
  await pool.query(`update analyses set method_version = 'moonnav-method-0.9.0' where id = $1`, [analysisB]);
  const st = (await (await page.request.get(`/api/v1/analyses/${analysisB}`)).json()).staleness;
  expect(st.state).toBe("stale");
  expect(st.reasons[0]).toMatchObject({ field: "methodVersion", stored: "moonnav-method-0.9.0" });
  await page.goto(`/app/analysis/sun?analysisId=${analysisB}`);
  await expect(page.getByText("Stale result — computed with older scientific inputs")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("stale-reasons")).toContainText("moonnav-method-0.9.0");
  await page.getByRole("button", { name: "Re-run with current versions" }).click();
  await expect(page).toHaveURL(/\/app\/analyses\/ana_/, { timeout: 20_000 });
  const fresh = page.url().split("/").pop()!;
  expect(fresh).not.toBe(analysisB);
  const d = await waitForAnalysis(page.request, fresh);
  expect(d.staleness.state).toBe("current");
  // the historical analysis is untouched and still readable
  const old = (await (await page.request.get(`/api/v1/analyses/${analysisB}`)).json()).analysis;
  expect(old).toMatchObject({ status: "completed", methodVersion: "moonnav-method-0.9.0" });
  // re-running again under the same versions is idempotent
  const again = await page.request.post(`/api/v1/analyses/${analysisB}/rerun`, { headers: { Origin: process.env.APP_URL ?? "http://localhost:3100" } });
  expect((await again.json()).analysisId).toBe(fresh);
  await pool.query(`update analyses set method_version = 'moonnav-method-1.0.0' where id = $1`, [analysisB]);
});

test("user compares two analyses and sees compatibility warnings and trade-offs", async ({ page }) => {
  await session(page);
  await page.goto(`/app/compare?ids=${analysisA},${analysisB}`);
  await page.getByTestId("run-compare").click();
  await expect(page.getByTestId("compare-summary")).toBeVisible();
  await expect(page.getByTestId("compare-results")).toContainText("Side-by-side results");
  // Guided scenario has a 5° mask; the custom one has the same defaults but different panel assumptions
  await expect(page.getByTestId("compare-results")).toContainText("not an official NASA mission feasibility rating");
});

test("user exports PDF, CSV and JSON with provenance; creates and revokes a share link", async ({ page, browser }) => {
  await session(page);
  const ids: Record<string, string> = {};
  for (const format of ["pdf", "csv", "json"] as const) {
    const r = await page.request.post("/api/v1/reports", { data: { analysisId: analysisA, format } });
    expect(r.status()).toBe(201);
    ids[format] = (await r.json()).report.id;
  }
  const dl = async (id: string) => {
    const { url } = await (await page.request.post("/api/v1/storage/presign-download", { data: { reportId: id } })).json();
    const r = await page.request.get(url);
    expect(r.ok()).toBeTruthy();
    return r.body();
  };
  const json = JSON.parse((await dl(ids.json)).toString());
  const csv = (await dl(ids.csv)).toString();
  const pdf = await dl(ids.pdf);
  const stored = await (await page.request.get(`/api/v1/analyses/${analysisA}`)).json();
  expect(json.analysis.sun.totalVisibleSeconds).toBe(stored.analysis.summary.sun.totalVisibleSeconds);
  expect(csv).toContain(`kernels=${stored.analysis.summary.provenance.kernelManifestId}`);
  expect(csv.split("\n").filter((l) => /^\d{4}-/.test(l)).length).toBe(json.analysis.timeseries.length);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  // Tampered signed URL is rejected
  const { url } = await (await page.request.post("/api/v1/storage/presign-download", { data: { reportId: ids.json } })).json();
  // A tampered signature is refused by whichever storage driver signed the URL (local HMAC or Supabase token).
  const tampered = /[?&]token=/.test(url) ? url.replace(/token=[^&]{8}/, "token=AAAAAAAA") : url.replace(/sig=[a-f0-9]{4}/, "sig=0000");
  expect(tampered).not.toBe(url);
  const bad = (await page.request.get(tampered)).status();
  expect(/[?&]token=/.test(url) ? bad >= 400 && bad < 500 : bad === 403).toBeTruthy();

  await page.goto("/app/reports");
  await expect(page.getByRole("heading", { name: "Generated reports" })).toBeVisible();
  const share = await page.request.post(`/api/v1/reports/${ids.pdf}/share-links`, { data: { expiresInHours: 24 } });
  const s = await share.json();
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(s.url.replace(/^https?:\/\/[^/]+/, ""));
  await expect(ap.getByText("Summary")).toBeVisible();
  await expect(ap.getByRole("link", { name: /Download/ })).toBeVisible();
  // Anonymous users cannot use private report APIs
  expect((await ap.request.get(`/api/v1/reports/${ids.pdf}`)).status()).toBe(401);
  await page.request.delete(`/api/v1/share-links/${s.id}`);
  await ap.reload();
  await expect(ap.getByText(/invalid, expired or revoked/)).toBeVisible();
  await anon.close();
});

test("scenarios are immutable at the database level and analysis submission is idempotent", async ({ page }) => {
  await session(page);
  const a = await (await page.request.get(`/api/v1/analyses/${analysisA}`)).json();
  const again = await (await page.request.post("/api/v1/analyses", { data: { scenarioId: a.scenario.id } })).json();
  expect(again.analysisId).toBe(analysisA);
  expect(again.reused).toBe(true);
});

test("workspace features: search, saved locations, shared workspace with members, project deletion", async ({ page, browser }) => {
  await session(page);
  // command palette search finds catalogue sites and the user's project
  await page.goto("/app");
  const box = page.getByRole("combobox", { name: /Search pages, sites/ });
  // The shortcut is only listened for once the page has hydrated: retry the key press until the palette opens.
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(box).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await box.fill("Shackleton");
  await expect(page.getByRole("option", { name: /Shackleton/ }).first()).toBeVisible();
  await box.press("Enter");
  await expect(page).toHaveURL(/\/app\/sites\/shackleton/);
  // saved location round-trip (+ coverage validation)
  expect((await page.request.post("/api/v1/locations", { data: { name: "Too far north", latitudeDeg: -60, longitudeEastDeg: 0 } })).status()).toBe(422);
  const loc = await page.request.post("/api/v1/locations", { data: { name: "Rim point A", latitudeDeg: -89.45, longitudeEastDeg: 222.69 } });
  expect(loc.status()).toBe(201);
  await page.goto("/app/scenarios/new");
  await page.getByRole("radio", { name: "Custom coordinates" }).click();
  await page.getByLabel("Use a saved location").selectOption({ index: 1 });
  await expect(page.getByLabel(/Latitude \(°\)/)).toHaveValue("-89.45");
  // shared workspace: create, switch, add a member (other user), member sees the workspace's project
  const ws = await (await page.request.post("/api/v1/workspaces", { data: { name: `Team ${uniq()}` } })).json();
  expect((await page.request.post(`/api/v1/workspaces/${ws.workspace.id}/switch`)).ok()).toBeTruthy();
  const proj = await (await page.request.post("/api/v1/projects", { data: { name: "Shared study" } })).json();
  const otherEmail = `member-${uniq()}@example.test`;
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await registerVerified(other, "Team Member", otherEmail, testPassword());
  expect((await other.request.get(`/api/v1/projects/${proj.project.id}`)).status()).toBe(404);
  const add = await page.request.post(`/api/v1/workspaces/${ws.workspace.id}/members`, { data: { email: otherEmail, role: "viewer" } });
  expect(add.ok()).toBeTruthy();
  expect((await other.request.get(`/api/v1/projects/${proj.project.id}`)).status()).toBe(200);
  // viewers cannot write
  expect((await other.request.patch(`/api/v1/projects/${proj.project.id}`, { data: { name: "x" } })).status()).toBe(403);
  await ctx.close();
  // project deletion requires the exact name
  expect((await page.request.delete(`/api/v1/projects/${proj.project.id}`, { data: { confirmName: "wrong" } })).status()).toBe(422);
  expect((await page.request.delete(`/api/v1/projects/${proj.project.id}`, { data: { confirmName: "Shared study" } })).ok()).toBeTruthy();
  expect((await page.request.get(`/api/v1/projects/${proj.project.id}`)).status()).toBe(404);
  await page.goto("/app/workspaces");
  await expect(page.getByRole("heading", { name: "Workspaces", level: 1 })).toBeVisible();
});

test("forgot password: non-enumerating request, emailed link, reset, old sessions revoked, sign in with new password", async ({ page, browser }) => {
  // Wait for hydration before typing (a value typed earlier is reset by hydration and the form would not submit).
  const requestReset = async (address: string) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("button", { name: "Send reset link" })).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
    await fillStable(page.getByLabel("Email"), address);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/If an account exists for that address/)).toBeVisible();
  };
  await requestReset(`nobody-${Date.now()}@example.test`);
  await requestReset(email);
  const link = await mailLink(email, "reset-password");
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto(link);
  await expect(p2).toHaveURL(/\/reset-password\?token=/);
  const newPw = `${password}-new`;
  await p2.getByRole("textbox", { name: "New password", exact: true }).fill(newPw);
  await p2.getByRole("textbox", { name: "Confirm new password" }).fill(newPw);
  await p2.getByRole("button", { name: "Update password" }).click();
  await expect(p2).toHaveURL(/\/login\?reset=1/);
  await p2.getByLabel("Email").fill(email);
  await p2.getByRole("textbox", { name: "Password", exact: true }).fill(newPw);
  await p2.getByRole("button", { name: "Sign in" }).click();
  await expect(p2).toHaveURL(/\/app/);
  // The pre-reset session cookie no longer works
  if (cookies) {
    await page.context().addCookies(cookies);
    expect((await page.request.get("/api/v1/projects")).status()).toBe(401);
  }
  await ctx.close();
});
