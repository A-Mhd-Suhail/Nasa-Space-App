# Testing

## Current verification (2026-11-13) — one reproducible configuration

### How the complete suite is run
`npm run test:e2e:stack` (`scripts/test-stack.mjs`) is the single supported way to run the whole suite:
- **Isolated database**: the project-local PostgreSQL 17 cluster (port 54329), database `moonnav_test`, dropped and rebuilt every run. It never touches Supabase. (Earlier passes ran the tests against the shared Supabase database; that is no longer done.)
- **Pinned configuration**: every variable the app and the tests read is set explicitly by the script (`MAIL_DRIVER=outbox`, `STORAGE_DRIVER=local`, the polling worker, random per-run secrets, empty SMTP/Supabase values), so editing `.env.local`, or having real credentials in it, cannot change a run in progress.
- **Same code path as production**: `next build` + `next start`, the FastAPI science service, and the Python worker. The script refuses to start if ports 3100 or 8001 are already used, and waits until the database, science API and worker are all healthy before the first test.
- Browsers: Chromium, Firefox and WebKit, one worker, serial. Extra arguments go to Playwright (`npm run test:e2e:stack -- --project=firefox tests/e2e/demo.spec.ts`). `STACK_ONLY=1` leaves the stack running for manual probing.
- Per-client isolation: tests that sign up or resend mail send their own `x-forwarded-for`, because the rate limits (sign-up 5/min, resend 3/min, password reset 3 per 5 min) are real and are keyed by client address.
- Run it from a normal terminal (not a sandboxed tool shell): see the Firefox finding below.

### Results
Latest complete run after the Mission Emergency Simulator (2026-11-16): **330 passed, 0 failed** (110 per browser: Chromium, Firefox, WebKit; includes the 16 `contingency.spec.ts` tests per browser). Two small contingency-only changes followed it (orbit-view Moon material, source-route rate limit); `contingency.spec.ts` was re-run afterwards: 48/48. Vitest 119 (57 new in `contingency.test.ts`), science pytest 129. Earlier: latest complete run after the deletion work: **282 passed, 0 failed** (94 per browser, incl. the 6 `deletion.spec.ts` tests). Previous: (2026-11-13, method 1.1.0, includes the new solar-surface and invitation tests), all specs, one stack: **264 passed, 0 failed, 0 skipped** in 19.9 min, 88 per browser (Chromium, Firefox, WebKit). Vitest 62, science pytest 129, ruff and mypy clean.

Previous run (before method 1.1.0): **249 passed, 0 failed, 0 skipped, 0 flaky** in 19.8 min. Per browser: **chromium 83/83**, **webkit 83/83**, **firefox 83/83** (the same 83 tests in each engine; no test is skipped or engine-specific).
Specs (tests per browser): `auth-fixes` 4, `demo` 5, `features` 6, `planner` 8, `public` 21, `reliability` 4, `security` 7, `signup-duplicates` 8, `verification` 7, `visual` 3, `workspace` 10.
Along the way, earlier complete runs (the first with 235/237, then 248/249, twice) each exposed one failure; every one was investigated and either fixed in the application (the bugs in the table below) or was a race in a test that typed or pressed a key before the page had hydrated (fixed with the project's existing wait-for-hydration pattern, no assertion weakened). Nothing was retried to get a green result and no failure was marked as passing.

| Other checks | Result |
|---|---|
| ESLint · TypeScript · production build | 0 errors · OK · OK |
| Vitest | 61 passed |
| Science: ruff, ruff format, mypy, pytest | clean · clean · clean · **95 passed** (84 + 11 new: illumination API boundaries, invalid input, packed-data equivalence) |
| Scientific validation (`npm run science:validate`) | 52 pass · 0 fail · 1 unavailable (SVS tables end 2026-12-31) |
| Production (https://moonnav.vercel.app) after deployment | public + demo suites **78/78** on three browsers; reliability audit **12/12** on three browsers; duplicate sign-up variants return 409 (see below) |

### Firefox: root cause and fix
Firefox failed with `Could not find profile folder` and was recorded as blocked by "macOS 27 / a malformed signature". Investigated 2026-11-13: the launch fails for any profile path, but the identical Playwright Firefox build (1572, Firefox 159) starts and renders from the user's own Terminal, and a Playwright alpha with a newer Firefox build (1578) failed the same way inside the tool sandbox. The cause is the **command sandbox of the agent's shell**, which denies Firefox's own `sandbox_extension_issue_file_to_process` call; it is not macOS, not the Playwright version and not a broken download. Nothing in the environment was changed (no security setting, no re-signing, no dependency change). Running the suite outside that sandbox works: Firefox 83/83.

### Application bugs found and fixed by this pass
| Bug | Evidence | Fix |
|---|---|---|
| **Demo failed in production** (52 s, then "Demo could not be started") | log `ENOENT /var/task/public/data/demo/index.json` | `public/` is not bundled into server functions: added `outputFileTracingIncludes` (also repaired `/validation`, which showed no rows). Demo now starts in ~3 s. |
| Database queries failed under load in production | `max_connections` 60; Supabase session pooler serves the whole app from 15 server connections, and each function instance kept up to 5 | per-instance pool 3, 3 s idle timeout, `attachDatabasePool` (idle connections released before suspension), root cause logged |
| 150 ms per database query in production | `database.roundTripMs` 152 ms (functions in `iad1`, database in Tokyo) | functions moved to `hnd1`: 3–4 ms |
| Duplicate sign-up said "check your inbox" | library returns a fake success | 409 `ACCOUNT_EXISTS` + clear screen; DB unique index on `lower(email)` + normalisation check (migration 0009) |
| `GET /api/v1/sites/%00` returned 500 | reliability fuzz test | Postgres class-22 data errors now return 422 |
| `/settings/profile` hydration error (React #418) in Firefox and Safari | reliability crawl | the time-zone list came from `Intl.supportedValuesOf`, which differs by engine: server snapshot first, browser list after hydration |
| Client crash `g.data.analysis is undefined` (Firefox, intermittent) | the error boundary now logs the message | `api()` treated an unreadable 2xx body as `{}`: it now fails, and the status page guards the access |
| NaN / infinite longitude accepted by the science illumination endpoint | new pytest | `allow_inf_nan=False`, range ±360 |
| Browser CSP violation logged by Zod on every form page (Firefox) | console error | Zod `jitless` in the browser |

### Duplicate sign-up and verification (what is tested)
`signup-duplicates.spec.ts` (8) and `verification.spec.ts` (7), on all three browsers: same address, different capitalization and space-padded variants (409, same body); verified and unverified accounts get an identical response (no status leak); an invalid password for an existing address still gets 409 and changes nothing; **6 concurrent sign-ups create exactly one user, one credential account and one verification email**; the database itself rejects a case-variant duplicate and a non-normalised address; Gmail dots and `+tags` are distinct addresses (documented policy); padded or upper-case sign-in works; the register page shows Sign in / Forgot password / a rate-limited resend; the verification link carries this deployment's URL and verifies and signs in; a used link is harmless; invalid and expired tokens are rejected (`token_expired`) and verify nothing; a resend sends a new link **and the earlier link keeps working**; resend for a verified or unknown address sends nothing and reveals nothing; resend is limited to 3 per minute per client without affecting others.
In production: real delivery through Gmail SMTP was confirmed by the owner for both the verification and the reset email (2026-11-12). SMTP acceptance alone is never counted as delivery. Duplicate sign-up verified in production for three variants (409, one database row).

### Administrator and MFA
No administrator account was created by this pass (that needs the owner). Verified by the suite on all three browsers (`security.spec.ts`, 7 tests): regular users get 403 on every admin route and API; admin and curator pages and APIs require two-factor enrolment; TOTP enrolment, challenge and **backup-code recovery** work; privilege escalation through the role API is refused. `scripts/grant-role.ts` was hardened (verified, active, non-demo accounts only; retype confirmation; audit event; sessions revoked). Procedure: `DEPLOYMENT.md` §6.

### Performance (production, measured from Mumbai: nearest edge `bom1`; 3 runs, TTFB in ms)
Before = 2026-11-12 with functions in `iad1`; after = 2026-11-13 with functions in `hnd1`, next to the database.
| Measurement | Before | After |
|---|---|---|
| Database round trip from a function | 152 ms | **3–4 ms** |
| Cold database connection check | ~1.2 s | ~140 ms |
| `/api/v1/health` | 915 | ~355 |
| `/api/v1/sites` | ~590 | ~325 |
| `/api/v1/terrain/point` (science) | ~680 | ~350 |
| `/api/v1/illumination/point` (science) | ~680 | ~460 |
| `/` (home) · `/explore` · `/learn` · `/login` | ~520 · ~525 · ~510 · ~520 | ~300 · ~290 · ~280 · ~295 |
| `/validation` | ~535 (no rows) | ~370 (all rows) |
| Demo start (click → dashboard) | 52 s then **failed** | **3.4 s** |
| New analysis, submit → completed | not measurable (demo broken) | 1.2 s (submit call 642 ms) |
| PDF report generation | not measured | 1.2 s |
| Signed-in pages (dashboard, analysis, sun view, compare, planner, projects) | not measurable | 250–510 ms server response |
The floor is network distance: a cached CDN file is ~110–140 ms from Mumbai and a function now ~280 ms. Client-side measurements on the production build (local, no network): home page with the 3D globe: LCP 436 ms, 458 KB encoded JavaScript; every other page: LCP < 520 ms; the 3D, map and chart code is already lazy-loaded and the static data is already cached (`max-age=86400, stale-while-revalidate`), so **no change was made to the 3D, terrain or visual code**. Frame rate is unchanged (see "Frame rate" below). Code-level changes: concurrent (not sequential) comparison summaries, demo seeding and project duplication; job-status polling backs off (1 s → 2.5 s → 5 s) instead of a fixed 1.5 s; health checks run concurrently.

### Known test-environment caveats
- Under real network latency a browser reports requests cancelled by a navigation as errors (`TypeError: Load failed`, `NetworkError`, `ChunkLoadError`, WebKit's "access control checks"). The demo and reliability tests therefore let a page finish loading before leaving it, as a person would; the only error patterns ignored are WebKit's cancelled `_rsc` prefetches and the globe's data file, matched by URL.
- The production runs use only the demo (isolated, 24 h) and anonymous traffic; they send no email and write no accounts. Do not run the sign-up, verification or security specs against production: they write to the database and would send mail.
- A loss of the test machine's own network mid-run (it happened once, "The Internet connection appears to be offline") fails everything after it; rerun.

---
## Earlier passes (historical; superseded by the section above)


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

## Deployment verification (2026-11-12, https://moonnav.vercel.app)
| Check | Result |
|---|---|
| Preview (`moonnav-1yyv8jryl-hack-zz.vercel.app`) | health ok (web, DB, science, worker `on_demand`); SPICE Sun ephemeris, 24 h timeline, LOLA elevation/slope OK |
| Production public E2E (`public.spec.ts`, Chromium) | **21/21 passed** (after adding the `on_demand` health status and serving the PSR packs) |
| Production authenticated flow (verified test account) | sign-in 200 → project/scenario 201 → analysis job completed by the serverless drain (`vercel-iad1`, all 8 real stages) in ~6 s → PDF export via Supabase signed URL (`%PDF-`, 22.8 KB) → 5 m hazard screen 200 (2 tiles fetched in 1.5 s) |
| Science internal-only | `/health`, `/v1/*` on the public domain → 404 |
| Secrets | none in 5 pages + 16 JS chunks or the build log |
| Local before deploy | on-demand jobs + Supabase storage: `workspace.spec.ts` 10/10 (no worker process); pytest 84; Vitest 61; lint/typecheck clean |
| Production email | password-reset email sent through Gmail SMTP; arrival confirmed by the owner |

## Email delivery pass (2026-11-12)
| Check | Result |
|---|---|
| Production reset ×3, verification ×2 (all logged) | all accepted by Gmail with SMTP 250, correct recipient, production link host, 0.6–3 s |
| Local auth E2E after the mail changes | `auth-fixes.spec.ts` 8/8 (Chromium + WebKit); register + forgot-password pass on both |
| Inbox arrival | **Confirmed by the owner** for the sign-up verification and the password-reset email (message ids in `CLAUDE_HANDOFF.md`). The app itself only sees SMTP acceptance. |
Note: the password-reset limiter (3 per 5 min per IP) is shared across local and production through the database; space E2E runs at least 5 minutes apart.
