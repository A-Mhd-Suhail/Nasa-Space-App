/* Captures one screenshot per demonstration scenario (desktop + one phone view) from the isolated test stack.
   Usage: STACK_ONLY=1 node scripts/test-stack.mjs   (in another terminal)  then  node scripts/capture-contingency.mjs */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
if (!/^http:\/\/localhost[:/]/.test(BASE)) throw new Error("refusing to run against a non-local host");
const OUT = "docs/screenshots/contingency";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
async function session(vp) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(BASE + "/"); await p.getByTestId("home-demo-button").click(); await p.waitForURL(/\/app/, { timeout: 90000 });
  await p.goto(BASE + "/app/contingency");
  await p.getByTestId("env-meta").filter({ hasText: "SPICE ephemeris" }).waitFor({ timeout: 90000 });
  return p;
}
const seek = async (p, f) => { const s = p.getByTestId("sim-slider"); const max = Number(await s.getAttribute("max")); await s.fill(String(Math.round(max * f))); };
const shots = [["normal", 0.5, "descent"], ["blackout", 0.99, "descent"], ["relay", 0.5, "orbit"], ["overshoot", 0.3, "descent"], ["braking", 0.5, "descent"], ["alternative", 0.4, "descent"]];
const p = await session({ width: 1440, height: 1000 });
for (const [id, f, view] of shots) {
  await p.getByTestId(`preset-${id}`).click();
  await p.getByTestId(`view-${view}`).click();
  await p.waitForTimeout(id === "blackout" || id === "relay" ? 6000 : 2500);
  await seek(p, f);
  await p.waitForTimeout(3500);
  await p.getByTestId("contingency-canvas").scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, -80));
  await p.screenshot({ path: `${OUT}/${id}-desktop.png` });
  console.log("captured", id);
}
await p.getByTestId("preset-alternative").click();
await p.getByTestId("sites-panel").scrollIntoViewIfNeeded();
await p.screenshot({ path: `${OUT}/alternative-sites-panel.png` });
await p.getByTestId("sources-panel").scrollIntoViewIfNeeded();
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/sources-provenance.png` });
const m = await session({ width: 390, height: 844 });
await m.getByTestId("preset-blackout").click();
await m.waitForTimeout(4000);
await m.screenshot({ path: `${OUT}/blackout-mobile.png` });
await b.close();
