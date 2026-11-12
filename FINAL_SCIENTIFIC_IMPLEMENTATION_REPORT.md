# MoonNav — Final scientific implementation report

Date 2026-11-13 · method `moonnav-method-1.1.0` · repository state: local, uncommitted work committed locally at the end of this pass; **not pushed, not deployed**.

## 1. Outcome
The audit found the scientific core (SPICE Sun/Earth, curvature-aware LOLA horizon, partial-disk visibility, refined events, DTE windows, hazards, comparison, provenance, validation) already complete and verified. The genuine gaps were closed: terrain-normal incidence and ground irradiance, a terrain-aligned panel, darkness metrics, an optional labelled link margin, analytic tests for Earth geometry and terrain assessment, three defects, and the website knowledge base. Details per capability: `SCIENTIFIC_IMPLEMENTATION_STATUS.md`.

## 2. Completed
- **Surface and irradiance** (`science/moonnav_science/surface.py`, `analysis.py`, `power.py`): DEM-derived normal, slope, aspect, incidence; direct-beam irradiance S = 1361·(1 AU/r)²·max(0, n·s)·visible disk fraction; per-sample, mean/peak and Wh/m².
- **Panel orientation** `terrain_aligned` alongside fixed and two-axis tracking.
- **Darkness metrics**: longest visible/dark period, total dark time, dark-interval and interruption counts; time accounting visible + dark + unknown = window.
- **Optional link margin** (`link_budget.py`, `POST /v1/link-budget`, web `POST /api/v1/link-budget`, Advanced-mode panel): free-space path loss, C/N0, Eb/N0, margin from user-supplied values only; labelled illustrative; never presented as DTE availability.
- **UI/reports**: `SolarSurfacePanel`, `LinkBudgetPanel`, Scenario Builder orientation option, report/PDF/CSV/JSON lines, stale-method banner for older analyses.
- **Documents**: `SCIENTIFIC_METHODOLOGY.md`, `SCIENTIFIC_VALIDATION_REPORT.md`, `SCIENTIFIC_IMPLEMENTATION_STATUS.md`, this report, `MOONNAV_COMPLETE_WEBSITE_REFERENCE.md` (3,045 lines: 43 pages, 68 API route files, 12 science endpoints, 25 tables, 67 component files, from source plus a real four-role crawl with screenshots in `docs/website-crawl/screenshots`).
- **Defects fixed**: link-budget 500 on NaN bodies (now 422); header chip "No live worker" on Vercel; `/invite/[token]` crashed for every link.

## 3. Datasets and ephemerides
NAIF SPICE kernels, NASA LRO LOLA (240 m global; 40/20/5 m polar tiles; global LDEM_16 for the 3D Moon), LOLA team illumination products, JPL Horizons and NASA SVS as references only. No data was fabricated or substituted; unavailable data is shown as unavailable. Checksums: `science/catalog/*.json`.

## 4. Accuracy checks
Reference suite 52 pass / 0 fail / 1 unavailable. Horizons vs MoonNav ≤ ≈1e-6° (limited by printed digits; shared ephemeris lineage stated), SVS ≤ 0.00075° / 0.6 km, LOLA cross-product median 1.7–1.9 m. Demo core fractions identical between 1.0.0 and 1.1.0. See `SCIENTIFIC_VALIDATION_REPORT.md`.

## 5. Performance
Unchanged architecture (horizon cache, tile cache, result cache by definition hash, on-demand job drain, region hnd1). The added surface computation is a handful of DEM samples per analysis. No new production load measurement was made for 1.1.0 because it is not deployed.

## 6. Tests (final run, this pass)
| Check | Result |
|---|---|
| Playwright E2E, isolated stack, Chromium + Firefox + WebKit | **264 passed, 0 failed, 0 skipped** (88 per browser) |
| Vitest | 62 passed |
| Science pytest | 129 passed; ruff and mypy clean |
| `tsc --noEmit` | clean |
| ESLint | 0 errors, 5 warnings (not touched in this pass) |
| `science:validate` | 52 pass / 0 fail / 1 unavailable |
Not run: production E2E against the 1.1.0 code (not deployed); physical-device and Safari-on-iOS testing.

## 7. Known limitations
Direct-beam irradiance only; incidence at the Sun-disk centre; stencil-scale roughness; terrain products finer than 5 m do not exist; RF margin is free-space arithmetic, not a mission link analysis; the geometric DTE statement is unchanged. Full list: `docs/KNOWN_LIMITATIONS.md`.

## 8. Owner actions
1. Decide whether to deploy 1.1.0 (`npx vercel deploy --prod`, then run the read-only production suites). Production still runs the previous version.
2. Push: needs a fresh token from you (never paste it in chat; use the one-off credential-helper flow).
3. Credential rotations and the first administrator: `FINAL_PRODUCTION_READINESS_REPORT.md` §B (unchanged).

## 9. Run and verify
```bash
npm run science:test && npm run science:validate
npx vitest run
npm run test:e2e:stack          # isolated stack; Firefox needs a normal terminal, not a sandboxed shell
```
Regenerate the website reference: `STACK_ONLY=1 node scripts/test-stack.mjs`, then `node scripts/crawl-site.mjs`, then `node scripts/build-website-reference.mjs`.
