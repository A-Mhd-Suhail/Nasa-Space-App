# MoonNav — Final production release report

Verified 2026-11-13 (IST) against https://moonnav.vercel.app. Labels: VERIFIED WORKING · DEPLOYED BUT NOT VERIFIED · IMPLEMENTED — NOT DEPLOYED · BLOCKED — OWNER ACTION REQUIRED · FAILED. Nothing is marked verified without evidence listed here.

## 1–6. Release identification
| Item | Value |
|---|---|
| GitHub | `A-Mhd-Suhail/Nasa-Space-App` (private), `main` = `origin/main` = `907d38b` (fast-forward from `8e4239f`) |
| Deployed commit | `907d38b`, deployed from a clean working tree (0 uncommitted changes at deploy time) |
| Vercel project | `hack-zz/moonnav` |
| Deployment | `dpl_FRa2u69REnyutZ86aEjhJD7v1fsn`, https://moonnav-7x3tj4e4p-hack-zz.vercel.app |
| Timestamp | Fri 13 Nov 2026 04:49 IST (23:19 UTC 12 Nov) |
| Environment / region | Production / `hnd1`; domain https://moonnav.vercel.app aliased to this deployment |
| Build | Ready; ~1 min; local `npm run build` also succeeded before deploying |
| Note on provenance | The project has no Vercel–GitHub integration, so the deployment was uploaded with the Vercel CLI and Vercel records no Git SHA. The match to `907d38b` is by construction (clean tree at that commit), not a Vercel-recorded SHA. **VERIFIED WORKING** otherwise; health reports `moonnav-method-1.1.0`, which exists only in this commit. |

Pre-deploy checks: `tsc` clean, ESLint 0 errors (5 pre-existing warnings), Vitest 62, science pytest 129 with ruff/mypy clean, E2E 264/264 on the isolated stack. No database migrations in this release (`drizzle/` and `src/db` unchanged since `8e4239f`), so production data was untouched. Production environment variable names present: BETTER_AUTH_SECRET, CRON_SECRET, DATABASE_URL, DATABASE_URL_DIRECT, DATA_BACKEND, MAIL_DRIVER, MAIL_FROM, MOONNAV_TILE_CACHE, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SCIENCE_SERVICE_TOKEN, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_SECURE, SMTP_USER, STORAGE_DRIVER, STORAGE_SIGNING_SECRET, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET, SUPABASE_URL (names only; `SCIENCE_API_URL` comes from the service binding in `vercel.json`). No variable was changed.

## 7–8. Production smoke tests (Chromium, against production)
35 of 35 passed in 3.1 min: `public.spec` (home, Explore, map, layers, PSR, feasibility, globe, sky plot, navigation, 404, a11y audits, perf panel, **invitation link**), `demo.spec` (home → demo → tour, 3D explorer, a real new analysis through the job pipeline, mobile layout), `reliability.spec` (every public and demo route renders cleanly; malformed API input never 500), `solar-surface.spec`. Only disposable demo accounts were created; no real account was touched. **VERIFIED WORKING.**

Health (`/api/v1/health`): web ok (`hnd1`), database ok (4 ms round trip), science ok, kernels ok, terrain products ok, worker `on_demand`. **VERIFIED WORKING.**

Public route status (anonymous): `/`, `/explore`, `/learn`, `/methodology`, `/sources`, `/validation`, `/about`, `/login`, `/register`, `/forgot-password`, `/verify-email`, `/reset-password`, `/invite/x`, `/share/x` → 200; `/app`, `/app/projects`, `/admin`, `/settings/security` → 307 (protected); `/dev/mail` → 404 (absent in production).

## 9. Scientific features on production
| Feature | Status | Evidence |
|---|---|---|
| Sun position, illumination, darkness metrics (longest dark, accounting visible + dark + unknown = window) | VERIFIED WORKING | solar-surface test 1 reads the real stored demo analysis: method 1.1.0, `longestDarkS > 0`, time accounting |
| Terrain-surface incidence, ground irradiance | VERIFIED WORKING | same test: `surface.terrain.status = ok`; Sun panel visible |
| Terrain-aligned panel | VERIFIED WORKING | test 2: a new analysis ran end to end on production |
| Earth visibility / DTE | VERIFIED WORKING | demo tour and reliability pages with real data; link-margin test uses DTE samples |
| Optional link budget | VERIFIED WORKING | tests 3–4: UI result labelled illustrative; API 401/403 anonymous, 422 invalid distances |
| Site/date comparison | VERIFIED WORKING | demo tour step "Compare sites and dates" opens with real data |
| LOLA terrain assessment (hazards/planner) | DEPLOYED BUT NOT VERIFIED | covered locally (`planner.spec`); not exercised by the production suites run now |
| Scientific result exports (PDF/CSV/JSON via Supabase signed URL, storage access) | DEPLOYED BUT NOT VERIFIED | verified in an earlier pass on production; not re-run for 1.1.0 |

## 10. Authentication and email
| Item | Status |
|---|---|
| Sign-up, login, sign-in pages load | VERIFIED WORKING (pages 200, a11y audits) |
| Invite link page loads without crashing | VERIFIED WORKING (production E2E + HTTP 200) |
| Registration, email verification, resend, forgot/reset password, MFA | DEPLOYED BUT NOT VERIFIED on this deployment: these create accounts and send real email, so they were not run against production. Verified locally on the isolated stack (264/264 across three browsers) and, for real delivery, by the owner in an earlier pass. Auth code is unchanged since then |
| Real email delivery | DEPLOYED BUT NOT VERIFIED in this pass (no email sent; a 2xx response is not proof of delivery). One safe test remains for the owner: `npm run mail:test -- <your email>` |

## 11. Infrastructure
Database ok; science service ok (method 1.1.0, kernels coverage 1849–2150); worker `on_demand` (no resident worker on Vercel by design; jobs drain on demand plus a daily cron); storage: demo analyses read their stored results and a new analysis wrote one on production (VERIFIED WORKING); region `hnd1`. Database pool: the demo, reliability and analysis runs above produced no failures (**VERIFIED WORKING**; production logs were not reviewed).

## 12. Previously fixed defects
| Defect | Status | Evidence |
|---|---|---|
| Link-budget returns 422, not 500, for NaN/invalid input | VERIFIED WORKING | production API test (anonymous 401/403, 422 invalid distances, NaN body < 500); reliability test also asserts no 500 for malformed input |
| `on_demand` worker not shown as "No live worker" | VERIFIED WORKING | health `worker.status = on_demand`; production demo header text read at 1440 px: "Engine online · jobs run on demand"; the string "No live worker" is absent |
| `/invite/[token]` no longer crashes (QueryClientProvider) | VERIFIED WORKING | production E2E test (no QueryClient page error) and HTTP 200; the re-crawl shows the page rendering |
| Earlier demo and pool fixes | VERIFIED WORKING | demo tests 5/5 and reliability 3/3 on production |

Observation (not a defect fixed here): the invitation page renders a `<main>` inside the public shell's `<main>` (a nested landmark). Minor accessibility issue; the axe audit on the checked pages passes. Not changed.

## 13. Documentation refresh
`MOONNAV_COMPLETE_WEBSITE_REFERENCE.md` regenerated from a new crawl of the fixed code on the isolated stack (72 page visits, four roles; the invite page now 200), with a new section 30.1 (deployment and production route status). Crawl JSON and the reference are redacted (tokens, test-account addresses). The valid-token invitation state is documented from source because the API emails the token and never returns it. Status: **VERIFIED WORKING** for what was crawled; destructive controls and form submits were not clicked.

## 14. Remaining blockers
None for the release itself. This documentation commit is local only (see §15).

## 15. Owner-only actions
1. **Revoke the GitHub fine-grained token** that was pasted in chat (github.com → Settings → Developer settings → Fine-grained tokens). It was used once for the push and was deleted from this machine afterwards. Do not paste a replacement in chat; to push this report, create a new token and tell me, or run `git push` yourself.
2. **Rotate the Google App Password** (steps in `FINAL_PRODUCTION_READINESS_REPORT.md` §B.3) — not rotated; not verified.
3. Rotate Supabase database password and keys (§B.5).
4. **Create the first administrator** with `scripts/grant-role.ts` and enable MFA (§B.2).
5. Optional: connect the Vercel project to GitHub so deployments record a Git SHA; run the email test above.
