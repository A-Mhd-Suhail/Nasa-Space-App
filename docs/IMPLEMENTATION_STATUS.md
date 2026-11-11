# Implementation status (2026-11-11 completion pass)

Requirement-to-codebase matrix against `Lunar_Landing_Site_Navigator_Feature_Checklist.md`. This file supersedes the older status documents (`IMPLEMENTATION_STATUS_MATRIX.md`, `COMPLETION_VERIFICATION_CHECKLIST.md`, `IMPLEMENTATION_CHECKLIST.md`), which describe earlier passes (e.g. comparison of 2–4 scenarios, now 2–8).

**Legend** — **Verified**: implemented and exercised by an automated test and/or a run in this pass. **Implemented**: code in place, exercised manually but without a dedicated automated test. **Partial**: works with stated gaps. **Blocked/Not in scope**: needs external data/accounts or excluded by design.

## What this pass found and fixed
| Problem found | Fix |
|---|---|
| `npm run db:migrate` crashed (catalogue entry without retrieval date) | `scripts/migrate.ts` tolerates a missing date |
| `fetch_data.sh` verification failed on the not-yet-downloaded 5 m DEM | only `approved` products are required |
| Drizzle snapshot chain broken (0004 duplicated 0003's id) — `db:generate` impossible | re-linked snapshot ids |
| No NASA data on disk → 21 science tests skipped, no analyses possible | data fetched + SHA-256 verified; 59/59 science tests run |
| `preferred_mode` stored but had no effect; no Simple/Advanced mode | global mode (pre-paint, persisted, profile-synced) |
| Comparison: max 4, no Pareto, ties ranked arbitrarily, no plain-language trade-offs, no 0–100 breakdown, no hour gates, no matrix/multi-date chart, no comparison report | comparison engine v2 + new Compare screen + PDF/JSON comparison report |
| No on-screen mission report / print | `/app/analyses/{id}/report` |
| Horizons used only as offline fixtures | live per-analysis JPL Horizons cross-check stored on the analysis |
| No ephemeris / timeline / synchronous analyze endpoints; checklist endpoint names absent | new routes + `/api/*` rewrites |
| Playback: no reset, speeds not real-time multiples, no custom range | new time controller |
| Globe: markers only — no click-to-pick, fly-to, reset/polar view, Sun lighting; home had no 3D preview | globe upgrades + rotating home globe |
| No repository layer, no RLS, no Supabase preparation | repositories, RLS migration (verified under simulated Supabase roles), Supabase client modules, `.env.example` |
| Scenario rename impossible (immutability trigger blocked all updates) | trigger narrowed: only `name` may change; science fields still immutable (tested) |
| Header overflow at tablet width; pre-existing ambiguous E2E locator | compact toggle; test fixed |

## Matrix
| § | Requirement | Status | Where / evidence |
|---|---|---|---|
| 1 | Answers which site/date is better, sunlight, DTE, combined | Verified | Compare + reports; `features.spec.ts`, `compare.test.ts` |
| 1.3 | South-pole focus, arbitrary coordinates, PSRs | Partial | Any coordinate accepted; terrain analysis limited to LOLA 75°S–90°S coverage (outside → geometry only, `unknown`). PSRs appear as 0 h sunlight (e.g. Shackleton centre) and in Simple-mode text; no dedicated PSR map layer |
| 2.1–2.2 | Simple / Advanced modes, no reload, remembered | Verified | `ModeToggle.tsx`, `layout.tsx` boot script, `/api/v1/me/preferences`; `features.spec.ts` |
| 2.3 | Keyboard, contrast, responsive, loading/error states | Verified (Chromium) | axe audits + 5-width visual sweep in `public.spec.ts`/`visual.spec.ts` |
| 3.1 | React, Tailwind, Three.js, charts, client state | Verified | Next.js 16/React 19, Tailwind 4, R3F; charts use **ECharts** (existing choice kept, no migration to Recharts) |
| 3.2 | Python FastAPI, NumPy, SPICE | Verified | `science/`; Astropy not used (SPICE covers time/frames) |
| 3.3/18.5 | PostgreSQL | Verified | local PG 17; Supabase-ready (see `DATABASE_SETUP.md`) |
| 4.1 | Home: intro, rotating 3D Moon, Start Mission Planning, featured regions, mode toggle, how it works | Verified | `(public)/page.tsx`, `HomeGlobe.tsx` |
| 4.2 / 5 | Site Explorer: 3D rotate/pan/zoom, click any point, live lat/lon, elevation, predefined list, coordinate entry, save, marker | Verified | `ExploreClient.tsx`, `GlobeScene.tsx`, `LunarMap.tsx`; coordinate entry validated; saved locations with name/notes (PATCH) |
| 4.2 | Fly-to, reset view, polar preset | Implemented | `GlobeScene.tsx` (screenshot-verified) |
| 4.3 / 6 | Date/time UTC, Sun direction, elevation/azimuth, horizon & terrain blocking, time slider | Verified | `SunView`, `TimeControl.tsx`, `/api/ephemeris/sun` |
| 4.4 | Earth position, signed elevation, obstruction, windows, timeline, "Available/Blocked" | Verified | `EarthView`, `PlainLanguage.tsx` ("why blocked"), `/api/ephemeris/earth` |
| 4.5 / 12 / 14 | Comparison: multi-site, multi-date, matrix, charts, trade-offs, score + weights, Pareto, recommendations, no single winner, ties | Verified | `compare.ts`, `CompareClient.tsx`, `charts.tsx`; `compare.test.ts`, `features.spec.ts` |
| 4.6 / 17 | Mission report with all sections, PDF, print, JSON, timestamps, source versions, confidence, validation | Verified | `MissionReport.tsx`, `report-builders.ts`; comparison report PDF/JSON |
| 6.3 | UTC in/out, TDB internally, MOON_ME → ENU | Verified | `kernels.py`, `geometry.py`, pytest |
| 7.1–7.5 | Solar/Earth az-el from transformed vectors, terrain horizon (curvature, 0.5° bins, 300 km), refined transitions, durations, windows | Verified | `science/moonnav_science/*`; pytest |
| 7.6 / 15 | Hard pass/fail constraints, configurable thresholds, simplified-score labelling | Verified | comparison gates (fractions + hours + unknown); report constraint table |
| 7.7 / 21.2 | Validation vs JPL Horizons | Verified | fixtures (pytest) + live (`horizons_live.py`, observed ≈1e-6°) |
| 7.7 / 21.2 | Validation vs NASA SVS 4930 | Not integrated | stated in report and `SCIENTIFIC_METHODS.md` §14 |
| 8.1 | JPL Horizons | Verified (validation role) | server-side, retries, cache, UA |
| 8.2 / 8.4 | LOLA via PDS | Verified | 240 m GDR; 5 m catalogued only; PGDA 78 not integrated |
| 8.3 | Moon Trek WMTS | Verified | 2D imagery layer + globe texture (`public.spec.ts`) |
| 8.5 | SPICE | Verified | runtime ephemeris |
| 9.1 | 3D Moon with LOLA relief as geometry | Partial | relief in the site 3D patch and 75°S regional mesh; global globe is a textured sphere (no global DEM loaded) |
| 9.2 / 9.6 | Sun/Earth as 3D objects, direction indicators, dynamic lighting | Verified/Implemented | site 3D scene rays + regional lighting from SPICE; globe lighting from SPICE Sun (toggle) |
| 9.3 | Terrain shadows, horizon line | Partial | regional scene shadows are a visual aid; horizon panorama/polar sky plot are exact |
| 10 | Bar, line, timeline, polar sky, horizon charts with tooltips | Verified | `charts.tsx`, `PolarSkyPlot.tsx` |
| 11 | Play/pause/scrub/speed 1×–86 400×/step/reset/custom range | Verified | `TimeControl.tsx`; `features.spec.ts` |
| 13 | Dashboard metric cards with units, info tips, confidence badges | Verified | `Stat` + `InfoTip` + `DataTag` |
| 16 | Confidence tiers + provenance | Verified | `DataTag` kinds; report §8–9 |
| 18.1–18.3 | Saved sites (name, notes), scenarios (save/rename/reopen/delete), preferences | Verified | `/api/locations`, `/api/scenarios`, `/api/v1/me/preferences`; duplicate = new scenario version / project duplicate |
| 18.4 | Cached results | Verified | idempotent analysis per scenario hash; horizon + Horizons caches |
| 19 | Checklist API endpoints | Verified | `API_REFERENCE.md`; `features.spec.ts` |
| 20 | Explanations and analogies, Learn section | Verified | `lib/explain.ts`, `/learn`, Simple-mode summaries |
| 21.3 | Performance | Implemented | 24 h timeline ≈ 0.2 s; 7-day 10-min analysis completes in seconds via worker; FPS not instrumented |
| 21.5 | Browsers | Partial | Chromium verified; WebKit/Firefox configured, not run in this pass |
| 22.3 | Landing feasibility map | Partial | data-backed precomputed grid over the 75°S region with user constraints and per-cell reasons (`FeasibilityPanel`); fixed window, not recomputed per date |
| 22.5 | Mission planner mode | Verified | mission requirements + weights on Compare; `/app/scenarios/new`; mission plans |
| — | Supabase | Prepared, not connected | `DATABASE_SETUP.md` |
| — | Vercel | Not deployed | `DEPLOYMENT.md` |

## Core scientific completion pass (2026-11-11, second session)
| Workstream | Status | Evidence |
|---|---|---|
| 1. Whole-Moon LOLA relief | COMPLETED AND TESTED | `LDEM_16` → 4/8 px/deg maps; displaced globe geometry with LOD (1° / ⅓° meshes by camera distance), true scale by default, labelled exaggeration; markers/picks on the relief surface; GPU geometry disposed on change; unit tests (`features.test.ts`), E2E `planner.spec.ts` |
| 2. High-resolution terrain | COMPLETED AND TESTED | PDS `LDEM_875S_5M` / `LDEM_85S_20M` / `LDEM_80S_40M` via byte-range tiles, `lola-multires-v1` composite in analyses, hazards, suitability; 17 sites ingested; validation vs 240 m (median 1.6–1.9 m); pytest `test_screening_and_tiles.py` |
| 3. Validation framework | COMPLETED AND TESTED | `validation.py` + `npm run science:validate` → `docs/VALIDATION_REPORT.md`, `/validation`; 52 pass / 0 fail / 1 unavailable (2026-11-12); SVS pixel comparison not performed (no machine-readable projection) |
| 4. Dynamic suitability map | COMPLETED AND TESTED | `/app/planner` suitability grid + site × date matrix for any 75–90°S point and window; hard constraints (missing → unknown), explainable score |
| 5. Terrain hazard screening | COMPLETED AND TESTED | slope, roughness, relief, rim/ridge, configurable thresholds, landing-zone verdict; synthetic-terrain tests (exact slope) |
| 6. Sensitivity analysis | COMPLETED AND TESTED | location grid + date shifts, computed alternatives only |
| 7. Operational windows | COMPLETED AND TESTED | `lib/operations.ts` + panels on Sun/Earth screens; unit tests; E2E |
| 8. Comparison enhancement | COMPLETED AND TESTED | slope/roughness/terrain resolution, data quality, window length, max-slope hard constraint, terrain trade-off text |
| 9. Cross-browser | see `TESTING.md` | Chromium, WebKit, Firefox runs |
| Demo access | COMPLETED AND TESTED | "Continue with demo" on `/login` → isolated 24 h account seeded with the precomputed analyses; admin denied, credential changes and invitations blocked; second demo cannot read the first (E2E) |

### Remaining limitations
- High-resolution tiles are fetched on demand (first use at a new 5 m area ≈ 8 s since the 2026-11-12 parallel fetch; was ~2 min); offline machines fall back to 240 m and say so.
- Horizon far field and the suitability grid use 240 m terrain; only the near field (≤ 6 km) and terrain stencils use 5/20/40 m.
- SVS 4930 frames are not compared pixel-by-pixel; the SVS Dial-a-Moon tables currently end on 2026-12-31.
- Hazard screening cannot see boulders or craters smaller than the DEM cell (5–40 m); it is screening, not certification.

## Final 8 workstreams pass (2026-11-12)
Full checklist with evidence and blockers: **`FINAL_8_WORKSTREAMS.md`**.

| Workstream | Status |
|---|---|
| 1. GitHub push incl. CI | Pushed 2026-11-12 (`1a759aa`, private). Actions status not readable with this PAT. |
| 2. Vercel deployment | **Live** at https://moonnav.vercel.app (app public, science internal, serverless job drain, Supabase storage). Verified 2026-11-12. |
| 3. Real SMTP email | Gmail SMTP: verified end to end locally; set in Vercel; production inbox arrival awaiting the owner's confirmation. |
| 4. SVS 4930 validation | Verified Complete (numeric). Pixel comparison is not data-feasible. 52 pass / 0 fail / 1 unavailable. |
| 5. PSR map layer | Verified Complete: LOLA LPSR/AVGVISIB layers, point lookup, report row, tests. |
| 6. FPS instrumentation | Verified Complete on Apple M5 / Chromium: perf panel, baseline JSON, tests. |
| 7. High-res terrain use | Verified Complete: all planner tools, coverage preview, first use 112.5 s → 8.0 s. |
| 8. Terrain limitations | Verified Complete: the limitation table in `KNOWN_LIMITATIONS.md` and the validation evidence. |
