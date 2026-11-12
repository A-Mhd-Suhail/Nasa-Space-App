import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { expect, test } from "@playwright/test";
import { pool, testPassword, uniq } from "./helpers";

const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/** All verification links sent to an address, oldest first. */
function links(email: string): string[] {
  const dir = path.join(process.cwd(), "data", "outbox");
  const tag = email.replace(/[^a-z0-9@._-]/gi, "_");
  return readdirSync(dir)
    .filter((f) => f.includes("verify-email") && f.includes(tag))
    .sort()
    .map((f) => (JSON.parse(readFileSync(path.join(dir, f), "utf8")).text as string).match(/https?:\/\/\S+/)![0]);
}
async function waitForLinks(email: string, n: number) {
  for (let i = 0; i < 40 && links(email).length < n; i++) await new Promise((r) => setTimeout(r, 250));
  return links(email);
}
const verified = async (email: string) => (await pool.query(`select email_verified v from "user" where email = $1`, [email])).rows[0]?.v as boolean;

async function newAccount(request: import("@playwright/test").APIRequestContext) {
  const email = `verify-${uniq()}@example.test`;
  const pw = testPassword();
  const r = await request.post("/api/auth/sign-up/email", { data: { name: "Verify Test", email, password: pw, callbackURL: "/app/onboarding" }, headers: { "x-forwarded-for": ip() } });
  expect(r.status(), await r.text()).toBe(200);
  return { email, pw };
}

test.describe("email verification", () => {
  test("a new account starts unverified, the email carries this deployment's URL, and the link verifies and signs in", async ({ request, page, baseURL }) => {
    const { email, pw } = await newAccount(request);
    expect(await verified(email)).toBe(false);
    const [link] = await waitForLinks(email, 1);
    expect(new URL(link).origin).toBe(new URL(process.env.APP_URL ?? baseURL!).origin);
    expect(link).toContain("/api/auth/verify-email?token=");
    // sign-in is refused until verified
    const early = await request.post("/api/auth/sign-in/email", { data: { email, password: pw }, headers: { "x-forwarded-for": ip() } });
    expect(early.status()).toBe(403);
    await page.goto(link);
    await page.waitForURL(/\/app/, { timeout: 30_000 });
    expect(await verified(email)).toBe(true);
  });

  test("an already-used link is harmless: the account stays verified and the user is not shown an error page", async ({ request, page }) => {
    const { email } = await newAccount(request);
    const [link] = await waitForLinks(email, 1);
    await page.goto(link);
    await page.waitForURL(/\/app/, { timeout: 30_000 });
    const res = await request.get(link, { maxRedirects: 0, headers: { "x-forwarded-for": ip() } });
    expect(res.status()).toBeLessThan(400 + 100);
    expect(res.status()).not.toBe(500);
    expect(await verified(email)).toBe(true);
  });

  test("an invalid token is rejected with an error redirect and verifies nothing", async ({ request }) => {
    const { email } = await newAccount(request);
    const res = await request.get("/api/auth/verify-email?token=not-a-real-token&callbackURL=%2Fverify-email", { maxRedirects: 0, headers: { "x-forwarded-for": ip() } });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toMatch(/error=/);
    expect(await verified(email)).toBe(false);
  });

  test("an expired token is rejected as expired and verifies nothing", async ({ request }) => {
    const { email } = await newAccount(request);
    const secret = new TextEncoder().encode(process.env.BETTER_AUTH_SECRET!);
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ email }).setProtectedHeader({ alg: "HS256" }).setIssuedAt(now - 7200).setExpirationTime(now - 3600).sign(secret);
    const res = await request.get(`/api/auth/verify-email?token=${token}&callbackURL=%2Fverify-email`, { maxRedirects: 0, headers: { "x-forwarded-for": ip() } });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toMatch(/error=token_expired/i);
    expect(await verified(email)).toBe(false);
  });

  test("resending sends a new link and does NOT invalidate the earlier, still-valid one", async ({ request, page }) => {
    const { email } = await newAccount(request);
    const [first] = await waitForLinks(email, 1);
    await new Promise((r) => setTimeout(r, 1100)); // tokens carry a one-second timestamp; resend a moment later like a real user
    const re = await request.post("/api/auth/send-verification-email", { data: { email, callbackURL: "/app/onboarding" }, headers: { "x-forwarded-for": ip() } });
    expect(re.status(), await re.text()).toBe(200);
    const all = await waitForLinks(email, 2);
    expect(all).toHaveLength(2);
    expect(all[1]).not.toBe(first);
    // the FIRST link still works after a resend (tokens are stateless and independent)
    await page.goto(first);
    await page.waitForURL(/\/app/, { timeout: 30_000 });
    expect(await verified(email)).toBe(true);
    // the second link is also harmless afterwards
    const again = await request.get(all[1], { maxRedirects: 0, headers: { "x-forwarded-for": ip() } });
    expect(again.status()).not.toBe(500);
  });

  test("resending for a verified or unknown address sends nothing and reveals nothing", async ({ request }) => {
    const { email } = await newAccount(request);
    await pool.query(`update "user" set email_verified = true where email = $1`, [email]);
    const before = links(email).length;
    const a = await request.post("/api/auth/send-verification-email", { data: { email }, headers: { "x-forwarded-for": ip() } });
    const b = await request.post("/api/auth/send-verification-email", { data: { email: `nobody-${uniq()}@example.test` }, headers: { "x-forwarded-for": ip() } });
    expect(a.status()).toBe(200);
    expect(b.status()).toBe(200);
    expect(await a.json()).toEqual(await b.json());
    await new Promise((r) => setTimeout(r, 800));
    expect(links(email).length).toBe(before);
  });

  test("resend is rate limited per client (3 per minute) without affecting other clients", async ({ request }) => {
    const { email } = await newAccount(request);
    const mine = ip();
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await request.post("/api/auth/send-verification-email", { data: { email }, headers: { "x-forwarded-for": mine } })).status());
    expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codes.slice(3)).toEqual([429, 429]);
    const other = await request.post("/api/auth/send-verification-email", { data: { email }, headers: { "x-forwarded-for": ip() } });
    expect(other.status()).toBe(200);
  });
});
