# MoonNav — Scientific validation report

Method version `moonnav-method-1.1.0`. Evidence below was produced by running the repository's own tests and validation suite; nothing is quoted from memory. Re-run: `npm run science:validate` (reference comparisons, writes `public/data/validation.json`, `docs/VALIDATION_REPORT.md`, `docs/validation/validation-results.json`), `npm run science:test` (pytest), `npx vitest run`, `npm run test:e2e:stack`.

## 1. Reference comparisons (published NASA/JPL data)

Result of the last `science:validate` run: **52 pass, 0 fail, 1 unavailable.** Records per source:

| Source / category | Records | What is compared |
|---|---|---|
| JPL Horizons | 20 | Sun and Earth azimuth/elevation from lunar surface sites at fixed epochs vs MoonNav (SPICE) |
| NASA SVS Dial-a-Moon | 12 | Sub-Earth/sub-solar geometry (libration, distance) vs published values |
| SPICE | 6 | Time-system identities (UTC/TDB/ET), frame and light-time consistency |
| LOLA | 6 | Elevations and slopes at points vs cross-products and projections |
| LOLA illumination | 8 | Long-term sunlight/Earth-visibility products vs MoonNav point lookups |
| SPICE+LOLA | 1 | Combined horizon/visibility consistency check |

Observed agreement (from the generated record, tolerances stated per record in `public/data/validation.json`): Horizons vs MoonNav Sun/Earth direction differs by at most about 1e-6° — limited by the number of printed digits in the Horizons table; SVS values agree within 0.00075° and 0.6 km (published precision); LOLA cross-product elevations agree with median 1.7–1.9 m.

**Independence caveat.** Horizons and the SPICE kernels used by MoonNav (DE-family planetary ephemeris, lunar PCK) are built from closely related solutions, so close agreement shows correct frames, light-time and aberration handling and correct time conversions, not independent confirmation of the ephemeris itself. This is stated on the Validation page.

**The one unavailable record** is a reference that could not be fetched at generation time; it is reported as `unavailable`, never as a pass.

## 2. Analytic and unit tests (science service)

`cd science && uv run pytest -q` → **129 passed**; `ruff` and `mypy` clean. Tests added or extended in this pass (each has a closed-form expectation, not a snapshot):

| Area | File | Tests | Expected value / property |
|---|---|---|---|
| Surface normal, slope, aspect, incidence | `test_surface.py` | 6 (some parametrised) | Flat ground: zero slope, no aspect; known tilted planes recover their exact slope and downhill azimuth (circular tolerance); incidence on flat and sloped ground; missing data → status `unavailable`, never flat; finite normal at the pole; plausible slope on the real Shackleton rim DEM |
| Solar irradiance on terrain in a full analysis | `test_solar_surface_analysis.py` | 8 | Inverse-square solar constant scaling; terrain irradiance never exceeds the available beam and is zero when the Sun is blocked; incidence consistent with slope and Sun elevation on flat ground; terrain-aligned panel = surface irradiance × area × efficiency; tracking ≥ fixed; visible + dark + unknown = window; permanently shadowed floor → one continuous dark period, zero energy; terrain-aligned panel without DEM heights is a typed error |
| Optional link budget | `test_link_budget.py` | 5 | FSPL matches the textbook form (≈ 222.6 dB at 384,400 km, 8.4 GHz); hand-calculated margin; margin falls 6 dB per doubled frequency or distance and 3 dB per doubled data rate; out-of-range values rejected; API requires the token, validates and labels the result as illustrative |
| Earth visibility geometry | `test_earth_visibility_geometry.py` | 6 | Blocked exactly when the whole disk is under the ridge line; partial disk fraction equals the circular-segment area; visibility rules differ only in the partial zone; unknown terrain beyond DEM coverage is never visible; multiple DTE windows with crossing times matching analytic roots; windows clipped by the analysis bounds are flagged unrefined |
| Terrain assessment | `test_terrain_assessment.py` | 5 | Flat → zero slope/roughness/relief; Gaussian crater slope matches the analytic maximum with a flat floor; known plane recovered in every direction; white-noise roughness matches plane-fit residual theory; no-data and grid edges are NaN, never zero |

Earlier suites cover time conversion, coordinates, horizon (curvature, multi-resolution tiles), disk-fraction circular segment, bisection event refinement, hazards, suitability, comparison, API contracts and cache behaviour.

## 3. Web, integration and end-to-end tests

| Suite | Scope | Result |
|---|---|---|
| Vitest | unit: scoring, contracts, report builders, header status (`serviceStatus`) | 62 passed |
| Playwright E2E on the isolated stack | auth, demo, workspace, analyses, planner, compare, reports/export, security/MFA, reliability, public pages, solar-surface (new, 4 tests), invitation page (new) | see `docs/TESTING.md` for the final counts of the run described in `FINAL_SCIENTIFIC_IMPLEMENTATION_REPORT.md` |
| Production (read-only) | `public.spec.ts`, `demo.spec.ts`, `reliability.spec.ts` | last run before this pass; not re-run against the not-yet-deployed 1.1.0 code |

The new E2E tests run a real analysis through the real pipeline and assert: method version 1.1.0, surface block status ok, visible + dark + unknown time accounting, terrain-aligned panel energy > 0 on a 30-day window, the link-margin UI, and API behaviour (401/403 anonymous, 422 for out-of-range distances, no 500 for a NaN body).

## 4. Regression: demo results unchanged

Demo assets were regenerated with 1.1.0. Core fractions are identical to the previous version: Mons Malapert sunlit 0.58499, Earth 1.0, DTE 0.36515; Mons Mouton 0.41577 / 0.60769 / 0.39053; Shackleton and de Gerlache 0 (permanently dark in the window). Only added fields differ.

## 5. Defects found and fixed during validation

| Defect | Evidence | Fix |
|---|---|---|
| Link-budget endpoint returned HTTP 500 for a NaN body | new API test | FastAPI `RequestValidationError` handler returning 422 without echoing input; non-finite query params rejected |
| Header chip said "No live worker" on Vercel | review of `DataStatus` | pure `serviceStatus()`; on-demand mode shown as online; unit test |
| `/invite/[token]` crashed for every link ("No QueryClient set") | website crawl (500 + console error) | page wrapped in `Providers`; E2E test added |
| Test asserted wrong physical expectation (partial Sun, surface facing away) | test failure analysis | expectation corrected; limitation documented (incidence at the disk centre) |

## 6. What is not validated, and why

- **Terrain heights vs an independent lander-scale survey:** none exists at 5 m scale for these sites; LOLA is the reference. Roughness is stencil-scale, not lander-foot scale.
- **Ground irradiance and panel energy vs a published mission power model:** no public reference was found; the formula is closed-form and tested analytically.
- **RF link margin:** illustrative free-space arithmetic only; not compared with DSN data (none is public per site).
- **Sub-daily Sun/Earth long-term products on Vercel** use 0.001-rounded copies of the LOLA rasters (documented).
- **Physical devices / Safari on iOS:** not tested.
- **Production:** the 1.1.0 code is not deployed; production validation refers to the previous method version.
