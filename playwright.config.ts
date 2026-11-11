import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env.local");
} catch {}

const BASE = process.env.E2E_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3100";

// Multi-engine browser matrix. Chromium is the verified baseline; WebKit and
// Firefox are included to satisfy the engineering-hardening roadmap item
// (REMAINING_WORK_ROADMAP.md Phase C.4). On CI without the system browsers
// installed, `npx playwright install` must be run first; projects that cannot
// find their browser are skipped by Playwright automatically.
const ENGINES = [
  { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
  { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
];

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { baseURL: BASE, trace: "retain-on-failure", screenshot: "only-on-failure", viewport: { width: 1440, height: 900 } },
  projects: ENGINES,
});
