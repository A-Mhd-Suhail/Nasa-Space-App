import { createHmac, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
export const uniq = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
export const testPassword = () => `Lunar-${randomBytes(9).toString("base64url")}-9`;

/** Read the newest dev-outbox mail for an address and extract its link. */
export async function mailLink(email: string, kind: "verify-email" | "reset-password"): Promise<string> {
  const dir = path.join(process.cwd(), "data", "outbox");
  for (let i = 0; i < 40; i++) {
    const files = readdirSync(dir).filter((f) => f.includes(kind) && f.includes(email.replace(/[^a-z0-9@._-]/gi, "_"))).sort();
    if (files.length) {
      const m = JSON.parse(readFileSync(path.join(dir, files.at(-1)!), "utf8"));
      const url = (m.text as string).match(/https?:\/\/\S+/)?.[0];
      if (url) return url;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${kind} mail for ${email}`);
}

/** Register + verify through the API (used for secondary users). Returns a signed-in request context cookie jar via page. */
export async function registerVerified(page: Page, name: string, email: string, password: string) {
  let r = await page.request.post("/api/auth/sign-up/email", { data: { name, email, password, callbackURL: "/app/onboarding" } });
  // Sign-up is rate limited (5/min); wait out the window instead of weakening the limit.
  for (let i = 0; i < 8 && r.status() === 429; i++) {
    await new Promise((res) => setTimeout(res, 10_000));
    r = await page.request.post("/api/auth/sign-up/email", { data: { name, email, password, callbackURL: "/app/onboarding" } });
  }
  expect(r.ok(), await r.text()).toBeTruthy();
  const link = await mailLink(email, "verify-email");
  await page.goto(link);
  await page.waitForURL(/\/app\/onboarding|\/app/);
  await page.request.patch("/api/v1/me", { data: { preferredMode: "planning", completeOnboarding: true } });
}

/** Type into a field and confirm the value survived React hydration (re-types if hydration reset it). */
export async function fillStable(loc: import("@playwright/test").Locator, value: string) {
  await expect(async () => {
    await loc.fill(value);
    await loc.page().waitForTimeout(300);
    await expect(loc).toHaveValue(value, { timeout: 200 });
  }).toPass({ timeout: 15_000 });
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  const e = page.getByLabel("Email");
  const p = page.getByRole("textbox", { name: "Password", exact: true });
  // Inputs typed before React hydrates are reset by hydration (slower engines such as WebKit):
  // re-type until both values survive a short settle period.
  await expect(async () => {
    await e.fill(email);
    await p.fill(password);
    await page.waitForTimeout(300);
    await expect(e).toHaveValue(email, { timeout: 200 });
    await expect(p).toHaveValue(password, { timeout: 200 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function setRole(email: string, role: string) {
  await pool.query(`update "user" set role = $1 where email = $2`, [role, email]);
  await pool.query(`delete from session where user_id = (select id from "user" where email = $1)`, [email]);
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) for authenticator-secret tests. */
export function totp(base32: string, t = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / 30)));
  const h = createHmac("sha1", key).update(ctr).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Enable TOTP MFA for the signed-in user through Better Auth's API. */
export async function enableMfa(req: APIRequestContext, password: string): Promise<string> {
  const headers = { Origin: process.env.APP_URL ?? "http://localhost:3100" };
  const r = await req.post("/api/auth/two-factor/enable", { data: { password }, headers });
  expect(r.ok(), await r.text()).toBeTruthy();
  const { totpURI } = await r.json();
  const secret = new URL(totpURI).searchParams.get("secret")!;
  const v = await req.post("/api/auth/two-factor/verify-totp", { data: { code: totp(secret) }, headers });
  expect(v.ok(), await v.text()).toBeTruthy();
  return secret;
}

export async function waitForAnalysis(req: APIRequestContext, analysisId: string, timeoutMs = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await req.get(`/api/v1/analyses/${analysisId}`);
    const d = await r.json();
    if (["completed", "failed", "cancelled"].includes(d.analysis.status)) return d;
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error("analysis did not finish");
}
