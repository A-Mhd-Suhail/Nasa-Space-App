import { expect, test } from "@playwright/test";
import { testPassword, uniq } from "./helpers";

/** Regressions for the owner-reported problems: login, create account, email verification, demo, Simple/Advanced. */
test.describe.configure({ mode: "serial" });

test("auth submit buttons stay disabled until the page is interactive, then work", async ({ page }) => {
  await page.goto("/login");
  const btn = page.getByRole("button", { name: "Sign in" });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  await expect(btn).toHaveAttribute("data-ready", "1");
  // A submitted form never leaks credentials into the URL.
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("Wrong-Password-123");
  await btn.click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  expect(page.url()).not.toContain("password");
});

test("create account -> local mailbox -> verification link activates the account", async ({ page }) => {
  const email = `reg-${uniq()}@example.test`;
  const pw = testPassword();
  await page.goto("/register");
  await expect(page.getByRole("button", { name: "Create account" })).toHaveAttribute("data-ready", "1", { timeout: 30_000 });
  await page.getByLabel("Name").fill("Regression User");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(pw);
  await page.getByLabel("Confirm password").fill(pw);
  await page.getByRole("checkbox").check();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Check your inbox").or(page.getByText(/Too many attempts/)).first().waitFor({ timeout: 20_000 });
    if (!(await page.getByText(/Too many attempts/).isVisible())) break;
    await page.waitForTimeout(30_000);
  }
  await expect(page.getByText("Check your inbox")).toBeVisible();
  await expect(page.getByTestId("local-mail-hint")).toBeVisible();
  await page.getByTestId("local-mail-hint").getByRole("link", { name: "local mailbox" }).click();
  const link = page.locator(`a[href*="verify-email"]`).filter({ hasText: /verify-email/ }).first();
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
  const me = await (await page.request.get("/api/v1/me")).json();
  expect((me.user ?? me).email).toBe(email);
});

test("Simple and Advanced show different content on public and workspace pages", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByTestId("mode-toggle").first();
  await toggle.getByRole("radio", { name: "Simple" }).click();
  await expect(page.getByTestId("home-simple")).toBeVisible();
  await expect(page.locator("#method")).toBeHidden();
  await toggle.getByRole("radio", { name: "Advanced" }).click();
  await expect(page.getByTestId("mode-toast")).toContainText("Advanced mode");
  await expect(page.getByTestId("home-simple")).toBeHidden();
  await expect(page.locator("#method")).toBeVisible();

  await page.goto("/login");
  await page.getByTestId("demo-button").click();
  await page.waitForURL(/\/app/, { timeout: 90_000 });
  await page.getByTestId("mode-toggle").first().getByRole("radio", { name: "Simple" }).click();
  await expect(page.getByTestId("overview-simple")).toBeVisible();
  await expect(page.getByText("Engine & data")).toBeHidden();
  await page.getByTestId("mode-toggle").first().getByRole("radio", { name: "Advanced" }).click();
  await expect(page.getByTestId("overview-simple")).toBeHidden();
  await expect(page.getByText("Engine & data")).toBeVisible();

  // logout: session cookie removed -> protected page redirects, API refuses
  const so = await page.request.post("/api/auth/sign-out", { data: {}, headers: { Origin: process.env.APP_URL ?? "http://localhost:3100" } });
  expect(so.ok()).toBe(true);
  expect((await page.request.get("/api/scenarios")).status()).toBe(401);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
});

test("tampered or garbage session cookies are rejected", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "moonnav.session_token", value: "forged.token.value", url: process.env.APP_URL ?? "http://localhost:3100" }]);
  const p = await ctx.newPage();
  expect((await p.request.get("/api/scenarios")).status()).toBe(401);
  await p.goto("/app");
  await expect(p).toHaveURL(/\/login/);
  await ctx.close();
});
