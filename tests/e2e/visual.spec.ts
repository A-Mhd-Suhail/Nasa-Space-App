import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { enableMfa, registerVerified, setRole, signIn, testPassword, uniq, waitForAnalysis } from "./helpers";

/**
 * Visual and responsive review: every major page, light and dark themes, five widths.
 * Fails on horizontal overflow; writes screenshots to docs/screenshots/ for review.
 */
test.describe.configure({ mode: "serial" });

const SIZES = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
  small: { width: 360, height: 740 },
} as const;
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("moonnav-theme", t);
    } catch {}
  }, theme);
}

async function capture(page: Page, slug: string, url: string, size: keyof typeof SIZES, theme: "light" | "dark", full = false) {
  await page.setViewportSize(SIZES[size]);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(/3d|explore|region|site/.test(slug) ? 2200 : 500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) {
    const culprits = await page.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const out: string[] = [];
      document.querySelectorAll("body *").forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.right > W + 1 && r.width > 0 && out.length < 6) out.push(`${e.tagName}.${String((e as HTMLElement).className).slice(0, 70)} right=${Math.round(r.right)}`);
      });
      return out;
    });
    console.log(`OVERFLOW ${slug} ${size}/${theme}:`, culprits.join(" | "));
  }
  expect(overflow, `${slug} horizontal overflow at ${size}/${theme}`).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${OUT}/${slug}-${size}-${theme}.png`, fullPage: full });
}

const PUBLIC: [string, string][] = [
  ["home", "/"], ["explore", "/explore?site=mons-malapert"], ["learn", "/learn"], ["methodology", "/methodology"], ["sources", "/sources"],
  ["about", "/about"], ["login", "/login"], ["register", "/register"], ["limitations", "/limitations"], ["not-found", "/this-page-does-not-exist"],
];

test("public pages: five widths, light theme; key pages in dark", async ({ page }) => {
  test.setTimeout(600_000);
  await setTheme(page, "light");
  for (const [slug, url] of PUBLIC) for (const size of Object.keys(SIZES) as (keyof typeof SIZES)[]) await capture(page, slug, url, size, "light", size === "desktop");
  const dark = await page.context().browser()!.newContext();
  const dp = await dark.newPage();
  await setTheme(dp, "dark");
  for (const [slug, url] of PUBLIC.slice(0, 7)) {
    await capture(dp, slug, url, "desktop", "dark", true);
    await capture(dp, slug, url, "mobile", "dark");
  }
  await dark.close();
});

let analysisA = "";
let analysisB = "";

test("workspace pages with real analyses: five widths, both themes", async ({ page }) => {
  test.setTimeout(900_000);
  await registerVerified(page, "Visual Reviewer", `visual-${uniq()}@example.test`, testPassword());
  const p = await (await page.request.post("/api/v1/projects", { data: { name: "Polar illumination survey", description: "Comparing Malapert and Mouton for a November 2026 week" } })).json();
  const mk = async (name: string, siteId: string) => {
    const s = await (await page.request.post("/api/v1/scenarios", { data: { projectId: p.project.id, name, site: { mode: "catalog", siteId }, startUtc: "2026-11-15T00:00:00Z", endUtc: "2026-11-22T00:00:00Z", stepSeconds: 600, antennaMinimumElevationDeg: 5, solarPanel: { areaM2: 1, efficiency: 0.3, derating: 0.85, orientation: "two_axis_tracking" } } })).json();
    const a = await (await page.request.post("/api/v1/analyses", { data: { scenarioId: s.scenario.id } })).json();
    return a.analysisId as string;
  };
  analysisA = await mk("Mons Malapert — one week", "mons-malapert");
  analysisB = await mk("Mons Mouton — one week", "mons-mouton");
  expect((await waitForAnalysis(page.request, analysisA)).analysis.status).toBe("completed");
  expect((await waitForAnalysis(page.request, analysisB)).analysis.status).toBe("completed");
  await page.request.post("/api/v1/locations", { data: { name: "Connecting ridge point", latitudeDeg: -89.45, longitudeEastDeg: 222.69 } });
  await page.request.post("/api/v1/reports", { data: { analysisId: analysisA, format: "pdf" } });

  const PAGES: [string, string][] = [
    ["dashboard", "/app"],
    ["projects", "/app/projects"],
    ["project-detail", `/app/projects/${p.project.id}`],
    ["scenario-builder", "/app/scenarios/new?guided=1"],
    ["analysis-status", `/app/analyses/${analysisA}`],
    ["sun-power", `/app/analysis/sun?analysisId=${analysisA}`],
    ["earth-dte", `/app/analysis/earth?analysisId=${analysisA}`],
    ["site-3d", `/app/sites/mons-malapert?analysisId=${analysisA}`],
    ["explorer-app", "/app/explorer?site=mons-mouton"],
    ["region-3d", "/app/explorer?site=mons-mouton&tab=region"],
    ["compare", `/app/compare?ids=${analysisA},${analysisB}`],
    ["reports", "/app/reports"],
    ["workspaces", "/app/workspaces"],
    ["settings-profile", "/settings/profile"],
    ["settings-security", "/settings/security"],
  ];
  for (const [slug, url] of PAGES) {
    for (const size of Object.keys(SIZES) as (keyof typeof SIZES)[]) await capture(page, slug, url, size, "light", size === "desktop");
  }
  // compare results state
  await page.setViewportSize(SIZES.desktop);
  await page.goto(`/app/compare?ids=${analysisA},${analysisB}`);
  await page.getByTestId("run-compare").click();
  await expect(page.getByTestId("compare-summary")).toBeVisible();
  await expect(page.getByTestId("compare-results")).toContainText("Side-by-side results");
  await page.screenshot({ path: `${OUT}/compare-results-desktop-light.png`, fullPage: true });
  // command palette + mobile navigation
  await page.goto("/app");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
  await page.keyboard.type("mal");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/command-palette-desktop-light.png` });
  await page.keyboard.press("Escape");
  await page.setViewportSize(SIZES.mobile);
  await page.goto("/app");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/mobile-nav-mobile-light.png` });
  // dark theme on the same session
  await page.evaluate(() => localStorage.setItem("moonnav-theme", "dark"));
  for (const [slug, url] of PAGES.filter(([s]) => ["dashboard", "scenario-builder", "sun-power", "earth-dte", "site-3d", "compare", "reports", "project-detail"].includes(s))) {
    await capture(page, slug, url, "desktop", "dark", true);
    await capture(page, slug, url, "mobile", "dark");
  }
});

test("admin pages (admin with MFA)", async ({ page }) => {
  test.setTimeout(300_000);
  const email = `visual-admin-${uniq()}@example.test`;
  const pw = testPassword();
  await registerVerified(page, "Visual Admin", email, pw);
  await setRole(email, "admin");
  await signIn(page, email, pw);
  await page.waitForURL(/\/app/);
  await enableMfa(page.request, pw);
  for (const [slug, url] of [["admin", "/admin"], ["admin-data", "/admin/data"], ["admin-jobs", "/admin/jobs"], ["admin-users", "/admin/users"], ["admin-audit", "/admin/audit"]] as const) {
    await capture(page, slug, url, "desktop", "light", true);
    await capture(page, slug, url, "mobile", "light");
  }
  await page.evaluate(() => localStorage.setItem("moonnav-theme", "dark"));
  await capture(page, "admin", "/admin", "desktop", "dark", true);
});

// The shared `pool` is a module singleton reused across spec files in the
// single-worker run; it closes when the worker process exits. Ending it here
// would break any spec that runs afterwards.
