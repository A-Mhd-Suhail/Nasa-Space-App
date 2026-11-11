# Testing

| Suite | Command | Count (2026-11-11) | Covers |
|---|---|---|---|
| Science (pytest) | `npm run science:test` | **71 passed** (with data downloaded) | coordinate conversion, longitude wrap, polar ENU, az/el, DEM reader + checksums, curvature-aware horizon, terrain obstruction, disk visibility, interval refinement, SPICE vs stored JPL Horizons tables (< 0.01°), full analysis, power, Horizons live adapter (mocked: params, User-Agent, cache, backoff, give-up, no substitution), ephemeris endpoint incl. out-of-coverage and auth |
| Unit (Vitest) | `npm test` | **59 passed** | contracts, longitude normalisation, polar projection, report builders (mission + comparison PDF/JSON/CSV), comparison engine (0–100 score breakdown, ties, Pareto, trade-off text, hour gates, unknown ≠ pass, site×date matrix, zero weights), feasibility grid, planner, staleness, globe direction maths |
| E2E (Playwright) | `npx playwright test --project=chromium` (stack running on :3100) | **Chromium 53/53**, **WebKit 53/53** (single full runs, 2026-11-11); Firefox blocked (see below) | public pages + axe audits, auth/MFA/reset, IDOR/CSRF/roles, worker leases, scenario → job → analysis, Sun/Earth pages, compare, exports, share links, responsive visual sweep; **`features.spec.ts`**: Simple/Advanced mode (no reload, persisted), checklist endpoints, 2 sites × 2 dates comparison with trade-offs/Pareto/matrix/PDF export/preference persistence, time controls, mission report sections, live Horizons check, scenario immutability |
| Static | `npm run lint` · `npm run typecheck` · `npm run build` | 0 errors | ESLint, TypeScript (with `next typegen`), production build |

## Prerequisites
`npm run setup` once (or `npm ci`, `cd science && uv sync`, `npm run data:fetch`, `npm run db:up && npm run db:migrate`). Start the stack with `npm run dev:all`, then `npm run db:seed-dev` for demo accounts. E2E suites register their own throw-away users.

## Notes
- WebKit/Firefox projects exist in `playwright.config.ts`; they need `npx playwright install` and were not run in this pass.
- The live Horizons E2E accepts an honest "could not be reached" outcome when the network is offline; when Horizons answers it asserts `pass` (< 0.01°).
- Mocks are used only for external-service tests (Horizons transport); they are never production data.

## Core-feature pass additions (2026-11-11)
- **Science**: `test_screening_and_tiles.py` (exact plane slope / zero roughness, hazard verdicts incl. missing data, suitability missing-data ≠ pass, multi-resolution sampling and horizon, multipart byte-range parsing, PDS retry/give-up/404, fallback to coarser terrain, 5 m vs 240 m agreement, endpoint auth/coverage), `test_validation_framework.py` (offline validation checks pass; SVS clamped epochs → unavailable; perturbed reference → fail).
- **Unit**: operational windows (`operations.test.ts`), global relief sampler and mesh topology, terrain-aware comparison gates and trade-off text.
- **E2E** `planner.spec.ts`: one-click demo (seeded, restricted, isolated between sessions), operational windows, Mission Planner suitability / matrix / hazards / sensitivity, global LOLA relief (true scale by default, labelled exaggeration), `/validation`, high-resolution terrain reporting.
- **Validation suite**: `npm run science:validate` → `docs/VALIDATION_REPORT.md` (38 pass, 0 fail, 1 reference unavailable).

## Cross-browser status
| Engine | Result |
|---|---|
| Chromium | 53/53 |
| WebKit (Safari engine) | 53/53 — found and fixed a real WebKit-only bug: after a correct password on an MFA account the login form raced the two-factor redirect and bounced the user to /login |
| Firefox | **Blocked**: Playwright's patched Firefox 159 (`firefox-1572`) exits with "Could not find profile folder" on this macOS 27.2 host, also after a forced reinstall and outside the command sandbox (its code signature reports missing resources). Stock Firefox cannot replace Playwright's build. Re-run `npx playwright test --project=firefox` on another host or after a Playwright update. |

## Performance (local dev server, cached tiles)
| Operation | Time |
|---|---|
| Hazard screen, 5 m, 201×201 cells | 0.07 s |
| Suitability 7×7 cells × 169 epochs | 0.40 s |
| Sensitivity 5×5 + 7 date shifts | 0.29 s |
| Site × date matrix 4 × 3 | 0.19 s |
| Synchronous 24 h analysis | 0.25 s |
| First use of a new 5 m area (tile download from PDS) | 8.0 s for 4 tiles (2026-11-12, parallel + deduplicated; was 112.5 s) |
| Globe JS heap: default LOD / zoomed LOD | 24 MB / 102 MB |
### Frame rate (2026-11-12)
Measured with the built-in diagnostics (Advanced mode "Perf" button or `?perf=1`). Setup: Playwright Chromium new-headless with ANGLE Metal on an Apple M5, 1440×900 at DPR 2, dev server. Every scene held **60 FPS (p95 16.7–16.8 ms, 0 frames > 50 ms, 0 long tasks)**. The scenes were: home globe (low and high LOD), explore globe SPICE-lit, 10× relief, polar region 3D, site 3D patch, Sun view with timeline at 3600×, compare charts, and the planner during a hazard request. Raw data: `docs/perf/perf-baseline-chromium-m5.json`. These numbers are specific to this device and browser; use the panel's "Record 10 s → Export JSON" to measure other hardware.

## Infrastructure pass (2026-11-12)
| Check | Result |
|---|---|
| Lint · typecheck · production build | 0 errors · OK · OK |
| Vitest | 61 passed |
| Science: ruff, ruff format, mypy, pytest | clean · clean · clean · 83 passed |
| Validation suite | 52 pass · 0 fail · 1 unavailable (SVS tables end 2026-12-31) |
| E2E Chromium + WebKit (Supabase) | 116 passed, 1 failed, 1 not run. The failure (`workspace features`, WebKit) happened because `.env.local` was switched to SMTP mid-run, so its verification email skipped the outbox. Re-run of the whole `workspace.spec.ts` on WebKit with `MAIL_DRIVER=outbox`: 10/10 passed. |
| Gmail SMTP | `npm run mail:test` accepted by Gmail (1 accepted, 0 rejected). App sign-up sent the verification mail through SMTP (nothing in the outbox). The user still has to click the link to confirm end to end. |
| GitHub push | remote `main` = local `1a759aa`; repository private |

E2E suites read verification links from the local outbox. Start the web server with `MAIL_DRIVER=outbox` (process env overrides `.env.local`) before running them.
