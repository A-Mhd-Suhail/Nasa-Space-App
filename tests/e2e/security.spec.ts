import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { enableMfa, pool, registerVerified, setRole, signIn, testPassword, uniq, waitForAnalysis } from "./helpers";

test.describe.configure({ mode: "serial" });

const a = { email: `owner-${uniq()}@example.test`, pw: testPassword() };
const b = { email: `other-${uniq()}@example.test`, pw: testPassword() };
const cur = { email: `curator-${uniq()}@example.test`, pw: testPassword() };
const adm = { email: `admin-${uniq()}@example.test`, pw: testPassword() };
let analysisId = "";
let projectId = "";
const createdProducts: string[] = [];

test("IDOR: another user cannot read, run or export someone else's objects", async ({ browser }) => {
  const ca = await browser.newContext();
  const pa = await ca.newPage();
  await registerVerified(pa, "Owner", a.email, a.pw);
  const p = await (await pa.request.post("/api/v1/projects", { data: { name: "Private" } })).json();
  projectId = p.project.id;
  const s = await (await pa.request.post("/api/v1/scenarios", { data: { projectId, name: "S", site: { mode: "catalog", siteId: "shackleton" }, startUtc: "2026-11-15T00:00:00Z", endUtc: "2026-11-16T00:00:00Z", stepSeconds: 3600 } })).json();
  const q = await (await pa.request.post("/api/v1/analyses", { data: { scenarioId: s.scenario.id } })).json();
  analysisId = q.analysisId;
  expect((await waitForAnalysis(pa.request, analysisId)).analysis.status).toBe("completed");

  const cb = await browser.newContext();
  const pb = await cb.newPage();
  await registerVerified(pb, "Other", b.email, b.pw);
  for (const url of [`/api/v1/projects/${projectId}`, `/api/v1/analyses/${analysisId}`, `/api/v1/analyses/${analysisId}/timeseries`, `/api/v1/scenarios/${s.scenario.id}`, `/api/v1/jobs/${q.jobId}`]) {
    expect((await pb.request.get(url)).status(), url).toBe(404);
  }
  expect((await pb.request.post("/api/v1/analyses", { data: { scenarioId: s.scenario.id } })).status()).toBe(404);
  expect((await pb.request.post("/api/v1/reports", { data: { analysisId, format: "json" } })).status()).toBe(404);
  expect((await pb.request.post("/api/v1/scenarios", { data: { projectId, name: "x", site: { mode: "catalog", siteId: "shackleton" }, startUtc: "2026-11-15T00:00:00Z", endUtc: "2026-11-16T00:00:00Z", stepSeconds: 3600 } })).status()).toBe(404);
  expect((await pb.request.patch(`/api/v1/projects/${projectId}`, { data: { name: "pwned" } })).status()).toBe(404);
  await ca.close();
  await cb.close();
});

test("regular user cannot open admin routes or invoke admin APIs", async ({ page }) => {
  await signIn(page, b.email, b.pw);
  await page.waitForURL(/\/app/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app\?denied=1/);
  await expect(page.getByText("Access denied")).toBeVisible();
  expect((await page.request.patch(`/api/v1/admin/users/x/role`, { data: { role: "admin", reason: "please" } })).status()).toBe(403);
  expect((await page.request.patch(`/api/v1/admin/products/lola-ldem-75s-240m-v2/status`, { data: { status: "deprecated", reason: "test" } })).status()).toBe(403);
  expect((await page.request.post(`/api/v1/admin/jobs/x/retry`)).status()).toBe(403);
  // Internal worker API requires the service token
  expect((await page.request.post(`/api/internal/jobs/claim`, { data: {} })).status()).toBe(401);
});

test("data curator needs MFA, can validate a new dataset version, but cannot grant roles", async ({ page }) => {
  await registerVerified(page, "Curator", cur.email, cur.pw);
  await setRole(cur.email, "curator");
  await signIn(page, cur.email, cur.pw);
  await page.waitForURL(/\/app/);
  const pid = `test-product-${uniq()}`;
  createdProducts.push(pid);
  await pool.query(`insert into data_products (id, kind, provider, product_id, release, status, sha256) values ($1, 'dem', 'test', $1, 'r1', 'discovered', 'abc')`, [pid]);
  const noMfa = await page.request.patch(`/api/v1/admin/products/${pid}/status`, { data: { status: "validated", reason: "label checked" } });
  expect(noMfa.status()).toBe(403);
  expect((await noMfa.json()).error.code).toBe("mfa_required");
  await page.goto("/admin/data");
  await expect(page).toHaveURL(/\/settings\/security\?mfa=required/);
  await enableMfa(page.request, cur.pw);
  const ok = await page.request.patch(`/api/v1/admin/products/${pid}/status`, { data: { status: "validated", reason: "label + checksum verified" } });
  expect(ok.status(), await ok.text()).toBe(200);
  expect((await page.request.patch(`/api/v1/admin/products/${pid}/status`, { data: { status: "discovered", reason: "back" } })).status()).toBe(422);
  const users = await pool.query(`select id from "user" where email = $1`, [b.email]);
  expect((await page.request.patch(`/api/v1/admin/users/${users.rows[0].id}/role`, { data: { role: "admin", reason: "escalate" } })).status()).toBe(403);
  await page.goto("/admin/data");
  await expect(page.getByText("Data-product registry")).toBeVisible();
  await pool.query(`delete from data_ingestion_runs where data_product_id = $1`, [pid]);
  await pool.query(`delete from data_products where id = $1`, [pid]);
});

test("admin with MFA manages roles; changes and approvals are audited and the audit log is immutable", async ({ page }) => {
  await registerVerified(page, "Admin", adm.email, adm.pw);
  await setRole(adm.email, "admin");
  await signIn(page, adm.email, adm.pw);
  await page.waitForURL(/\/app/);
  await enableMfa(page.request, adm.pw);
  const target = await pool.query(`select id from "user" where email = $1`, [b.email]);
  const r = await page.request.patch(`/api/v1/admin/users/${target.rows[0].id}/role`, { data: { role: "analyst", reason: "review access for test" } });
  expect(r.status(), await r.text()).toBe(200);
  await page.goto("/admin/audit");
  await expect(page.getByText("user.role_change").first()).toBeVisible();
  await expect(page.getByText("data_product.status").first()).toBeVisible();
  await page.goto("/admin/users");
  await expect(page.getByText(b.email)).toBeVisible();
  // Append-only at the DB level
  await expect(pool.query(`update audit_events set action = 'x' where id = (select id from audit_events limit 1)`)).rejects.toThrow(/append-only/);
  await expect(pool.query(`delete from audit_events where id = (select id from audit_events limit 1)`)).rejects.toThrow(/append-only/);
  // Scenario science inputs are immutable at the DB level (only the display name may be changed: migration 0008).
  await expect(pool.query(`update scenarios set start_utc = start_utc + interval '1 hour' where id = (select id from scenarios limit 1)`)).rejects.toThrow(/immutable/);
});

test("worker lease protocol: wrong lease token is rejected", async ({ request }) => {
  const token = process.env.SCIENCE_SERVICE_TOKEN!;
  const r = await request.post(`/api/internal/jobs/job_${randomUUID()}/complete`, { headers: { Authorization: `Bearer ${token}` }, data: { leaseToken: "not-a-real-lease-token", result: {} } });
  expect([409, 422]).toContain(r.status());
});

test("cross-origin state-changing requests are rejected (CSRF)", async ({ request }) => {
  const r = await request.post("/api/v1/projects", { data: { name: "x" }, headers: { Origin: "https://evil.example" } });
  expect(r.status()).toBe(403);
  expect((await r.json()).error.code).toBe("forbidden_origin");
});

test("MFA recovery: regenerated backup codes sign in once when the authenticator is unavailable", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = `mfa-${uniq()}@example.test`;
  const pw = testPassword();
  await registerVerified(page, "MFA User", email, pw);
  await enableMfa(page.request, pw);
  const headers = { Origin: process.env.APP_URL ?? "http://localhost:3100" };
  const g = await page.request.post("/api/auth/two-factor/generate-backup-codes", { data: { password: pw }, headers });
  expect(g.ok(), await g.text()).toBeTruthy();
  const { backupCodes } = await g.json();
  expect(backupCodes.length).toBeGreaterThanOrEqual(8);
  await ctx.close();
  // fresh browser: password step, then the two-factor page, then a backup code
  const c2 = await browser.newContext();
  const p2 = await c2.newPage();
  await signIn(p2, email, pw);
  await expect(p2).toHaveURL(/\/login\/two-factor/);
  await p2.getByRole("button", { name: "Use a backup code instead" }).click();
  await p2.getByLabel("Backup code").fill(backupCodes[0]);
  await p2.getByRole("button", { name: "Verify" }).click();
  await expect(p2).toHaveURL(/\/app/);
  // the same code cannot be used twice
  const c3 = await browser.newContext();
  const p3 = await c3.newPage();
  await signIn(p3, email, pw);
  await expect(p3).toHaveURL(/\/login\/two-factor/);
  await p3.getByRole("button", { name: "Use a backup code instead" }).click();
  await p3.getByLabel("Backup code").fill(backupCodes[0]);
  await p3.getByRole("button", { name: "Verify" }).click();
  await expect(p3.getByText("That code is not valid.")).toBeVisible();
  await c2.close();
  await c3.close();
});

test.afterAll(async () => {
  // guaranteed cleanup of test registry rows, even when a test failed midway
  for (const id of createdProducts) {
    await pool.query(`delete from data_ingestion_runs where data_product_id = $1`, [id]);
    await pool.query(`delete from data_products where id = $1`, [id]);
  }
  // Do not end the shared pool here: it is a module singleton reused by other
  // spec files in the single-worker run. It closes when the worker exits.
});
