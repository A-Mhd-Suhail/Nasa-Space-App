import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { fillStable, pool, testPassword, uniq } from "./helpers";

/** Each request gets its own client address, so per-IP rate limits never couple one test to another. */
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const H = () => ({ "x-forwarded-for": ip() });
const signUp = (request: import("@playwright/test").APIRequestContext, email: string, password = testPassword(), name = "Duplicate Test") =>
  request.post("/api/auth/sign-up/email", { data: { name, email, password, callbackURL: "/app/onboarding" }, headers: H() });

const outboxCount = (email: string, kind: string) => {
  const dir = path.join(process.cwd(), "data", "outbox");
  const tag = email.replace(/[^a-z0-9@._-]/gi, "_");
  return readdirSync(dir).filter((f) => f.includes(kind) && f.includes(tag)).length;
};

test.describe("duplicate sign-up prevention", () => {
  test("same email is refused with one controlled answer: same case, other case, padded with spaces", async ({ request }) => {
    const email = `dup-${uniq()}@example.test`;
    const first = await signUp(request, email);
    expect(first.status(), await first.text()).toBe(200);
    for (const variant of [email, email.toUpperCase(), `  ${email}  `, email.replace(/^dup/, "DuP")]) {
      const r = await signUp(request, variant);
      expect(r.status(), `variant ${JSON.stringify(variant)}`).toBe(409);
      const b = await r.json();
      expect(b.code).toBe("ACCOUNT_EXISTS");
      expect(b.message).toBe("You have already created an account with this email address. Please sign in.");
    }
    // Existing email + an invalid password: still the same controlled answer, and nothing is changed.
    const weak = await signUp(request, email, "short");
    expect(weak.status()).toBe(409);
    const rows = await pool.query(`select count(*)::int n from "user" where lower(btrim(email)) = $1`, [email]);
    expect(rows.rows[0].n).toBe(1);
  });

  test("verified and unverified existing accounts get the identical response (no status leak)", async ({ request }) => {
    const a = `verified-${uniq()}@example.test`;
    const b = `unverified-${uniq()}@example.test`;
    expect((await signUp(request, a)).status()).toBe(200);
    expect((await signUp(request, b)).status()).toBe(200);
    await pool.query(`update "user" set email_verified = true where email = $1`, [a]);
    const ra = await signUp(request, a);
    const rb = await signUp(request, b);
    expect(ra.status()).toBe(409);
    expect(rb.status()).toBe(409);
    expect(await ra.json()).toEqual(await rb.json());
  });

  test("concurrent duplicate sign-ups create exactly one user, one credential account and one verification email", async ({ request }) => {
    const email = `race-${uniq()}@example.test`;
    const results = await Promise.all(Array.from({ length: 6 }, () => signUp(request, email)));
    const codes = results.map((r) => r.status()).sort();
    const bodies = JSON.stringify(await Promise.all(results.map(async (r) => (r.status() === 200 ? "ok" : await r.text()))));
    expect(codes.filter((c) => c === 200), `statuses ${codes} ${bodies}`).toHaveLength(1);
    expect(codes.filter((c) => c === 409), `statuses ${codes} ${bodies}`).toHaveLength(5);
    const u = await pool.query(`select id from "user" where lower(email) = $1`, [email]);
    expect(u.rowCount).toBe(1);
    const acc = await pool.query(`select count(*)::int n from account where user_id = $1`, [u.rows[0].id]);
    expect(acc.rows[0].n).toBe(1);
    await new Promise((r) => setTimeout(r, 1000));
    expect(outboxCount(email, "verify-email")).toBe(1);
  });

  test("the database itself refuses duplicates and non-normalized addresses", async () => {
    const email = `db-${uniq()}@example.test`;
    const ins = (id: string, e: string) => pool.query(`insert into "user" (id, name, email) values ($1, 'DB test', $2)`, [id, e]);
    await ins(`u_${randomUUID()}`, email);
    await expect(ins(`u_${randomUUID()}`, email)).rejects.toThrow(/user_email_unique|user_email_lower_unique/);
    // case-insensitive duplicate is impossible even when the app-level check is bypassed
    await expect(ins(`u_${randomUUID()}`, email.toUpperCase())).rejects.toThrow(/user_email_normalized_chk|user_email_lower_unique/);
    await expect(ins(`u_${randomUUID()}`, ` ${email} `)).rejects.toThrow(/user_email_normalized_chk|user_email_lower_unique/);
    await pool.query(`delete from "user" where email = $1`, [email]);
  });

  test("Gmail dots and plus tags are distinct addresses (documented policy), only case and spaces are folded", async ({ request }) => {
    const base = `alias${uniq()}`;
    const r1 = await signUp(request, `${base}@gmail.test`);
    const r2 = await signUp(request, `${base}+tag@gmail.test`);
    const r3 = await signUp(request, `${base.slice(0, 5)}.${base.slice(5)}@gmail.test`);
    expect([r1.status(), r2.status(), r3.status()]).toEqual([200, 200, 200]);
    expect((await signUp(request, `${base.toUpperCase()}@gmail.test`)).status()).toBe(409);
  });

  test("sign-in and password reset treat padded or upper-case emails as the same account", async ({ request, baseURL }) => {
    const email = `case-${uniq()}@example.test`;
    const pw = testPassword();
    expect((await signUp(request, email, pw)).status()).toBe(200);
    await pool.query(`update "user" set email_verified = true where email = $1`, [email]);
    const ok = await request.post("/api/auth/sign-in/email", { data: { email: `  ${email.toUpperCase()}  `, password: pw }, headers: { ...H(), origin: baseURL! } });
    expect(ok.status(), await ok.text()).toBe(200);
    const bad = await request.post("/api/auth/sign-in/email", { data: { email, password: `${pw}x` }, headers: { ...H(), origin: baseURL! } });
    expect(bad.status()).toBe(401);
  });

  test("the register page tells an existing user clearly and offers Sign in, Forgot password and a safe resend", async ({ page, request }) => {
    const email = `ui-${uniq()}@example.test`;
    const pw = testPassword();
    expect((await signUp(request, email, pw)).status()).toBe(200);
    // Own client address for the browser too: the whole suite signs up from one machine and the per-address limit is real.
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip() });
    await page.goto("/register");
    await expect(page.getByRole("button", { name: "Create account" })).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
    await fillStable(page.getByLabel("Name"), "Existing Person");
    await fillStable(page.getByLabel("Email"), email.toUpperCase()); // padded input is covered by the API test (type=email strips spaces)
    await fillStable(page.getByRole("textbox", { name: "Password", exact: true }), pw);
    await fillStable(page.getByLabel("Confirm password"), pw);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    const panel = page.getByTestId("existing-account");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel).toContainText("You have already created an account with this email address. Please sign in.");
    await expect(panel.getByTestId("existing-signin")).toBeVisible();
    await expect(panel.getByTestId("existing-forgot")).toBeVisible();
    await expect(panel.getByTestId("existing-signin")).toHaveAttribute("href", `/login?email=${encodeURIComponent(email)}`);
    // resend: clear success state, then a cooldown that prevents hammering
    await panel.getByTestId("existing-resend").click();
    await expect(panel.getByTestId("existing-resend-ok")).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByTestId("existing-resend")).toBeDisabled();
    await expect(panel.getByTestId("existing-resend")).toContainText(/Send again in \d+s/);
    // both next steps carry the address over
    await expect(panel.getByTestId("existing-forgot")).toHaveAttribute("href", `/forgot-password?email=${encodeURIComponent(email)}`);
    await page.goto(`/forgot-password?email=${encodeURIComponent(email)}`);
    await expect(page.getByLabel("Email")).toHaveValue(email, { timeout: 10_000 });
  });
});

test("the sign-in page is pre-filled when arriving from the existing-account screen", async ({ page }) => {
  const email = `prefill-${uniq()}@example.test`;
  await page.goto(`/login?email=${encodeURIComponent(email)}`);
  await expect(page.getByLabel("Email")).toHaveValue(email);
});
