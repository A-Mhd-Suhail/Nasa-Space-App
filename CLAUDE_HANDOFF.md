# Claude handoff — MoonNav

Claude Code: Read this handoff and the updated project documentation before making further changes. Preserve all Codex/previous-agent changes, commits and deployment configuration. Do not repeat completed tasks or overwrite working settings. Continue only items marked PARTIAL or BLOCKED.

Last updated: 2026-11-12. Detail: `docs/DEPLOYMENT.md` §8, `docs/TESTING.md` (infrastructure pass), `docs/IMPLEMENTATION_STATUS.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/FINAL_8_WORKSTREAMS.md`.

## Status
| Item | Status | Notes |
|---|---|---|
| GitHub | DONE | Private repo `A-Mhd-Suhail/Nasa-Space-App`, branch `main`. Every push was verified with `git ls-remote`; see `git log` for the latest hash. The PAT can't read Actions, so CI results haven't been checked. |
| Vercel project | DONE | Team `hack-zz` (WinterX, Hobby), project `moonnav`, linked to the GitHub repo, so **every push to `main` deploys production**. Services (`vercel.json`): `app` (Next.js, public `/(.*)`) and `science` (FastAPI, internal; binding `app→science` injects `SCIENCE_API_URL`). Daily cron `/api/internal/cron/drain`. |
| Production URL | DONE | **https://moonnav.vercel.app**. Verified on 2026-11-12: health ok (web, Supabase DB, science, worker `on_demand`); public E2E 21/21; authenticated flow (sign-in → project → scenario → analysis job leased by `vercel-iad1`, all real stages, completed → PDF export through a Supabase signed URL); 5 m hazard screen (tiles into `/tmp`); PSR and long-term sunlight lookups. |
| Preview | DONE | `https://moonnav-1yyv8jryl-hack-zz.vercel.app` (protected by Vercel login): health, SPICE ephemeris, timeline and terrain verified before production. |
| Science API | DONE | Runs as the internal `science` service. The build (`science/scripts/fetch_runtime_data.py`) downloads LOLA 240 m + SPICE from NASA/mirrors and the AVGVISIB packs from the private Supabase bucket `moonnav-build-assets`, all SHA-256 checked. The PSR pack and labels are committed in `science/assets/illum`. Cold starts install Python packages at runtime (several seconds). |
| Worker | DONE (serverless) | No polling worker on Vercel. `src/lib/jobs.ts#drainJobs` leases queued jobs and calls science `POST /v1/jobs/compute`, which returns real stage timestamps. It is triggered by `after()` on submission, by the job-status poll when a job stays queued > 20 s, and by the daily cron. Locally the poller (`npm run dev`) still works. |
| Storage | DONE | `STORAGE_DRIVER=supabase`: private bucket `moonnav-objects`, accessed through the Storage REST API with the server-side service key (`src/lib/storage.ts`). |
| Gmail SMTP | DONE locally / PARTIAL in production | Variables: `MAIL_DRIVER=smtp`, `SMTP_HOST`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`; set in `.env.local` and in Vercel (Production + Preview). Locally verified end to end: sign-up → Gmail → link clicked → sign-in with `emailVerified: true`. In production a password-reset request returned 200 with no errors logged; inbox arrival is not yet confirmed by the owner. |
| Secrets | DONE | No secret values in git history, staged diffs, the production JS bundles (5 pages, 16 chunks) or the build log (scanned 2026-11-12). |

## Environment variables in Vercel (names only; Production + Preview)
`DATABASE_URL`, `DATABASE_URL_DIRECT`, `BETTER_AUTH_SECRET`, `SCIENCE_SERVICE_TOKEN`, `STORAGE_SIGNING_SECRET`, `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `DATA_BACKEND=postgres`, `MAIL_DRIVER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `MOONNAV_TILE_CACHE=/tmp/moonnav-tiles`, `CRON_SECRET`.
Not set on purpose: `SCIENCE_API_URL` (injected by the binding), `APP_URL` (derived from `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`; set it if a custom domain is added).

## Files changed in the infrastructure pass
- `vercel.json`, `.vercelignore`, `.gitignore`, `.env.example`
- `src/lib/env.ts` (APP_URL fallback, Supabase storage vars), `src/lib/storage.ts` (Supabase driver), `src/lib/science.ts` (`scienceUrl`, 12 s health timeout), `src/lib/jobs.ts` (`drainJobs`, `kickJobDrain`, `ON_DEMAND_JOBS`), `src/app/api/internal/cron/drain/route.ts`, analyses/rerun/jobs routes (`maxDuration`), health/dashboard/admin/status UI (`on_demand`)
- `science/moonnav_science/api.py` (`POST /v1/jobs/compute`), `analysis.py` (data dir + `MOONNAV_TILE_CACHE`), `illumination.py` (packed copies), `worker.py` (lazy base URL)
- `science/scripts/fetch_runtime_data.py`, `science/scripts/pack_illumination.py`, `science/assets/illum/*`
- Tests: `tests/e2e/public.spec.ts` (health accepts `on_demand`), `tests/e2e/workspace.spec.ts` (tamper check for both signers), `science/tests/test_illumination.py` (pack equivalence)

## Operating notes
- E2E needs the outbox: start the web server with `MAIL_DRIVER=outbox` in its environment (process env overrides `.env.local`). Never run the registering E2E suites against production, because they would send real email to `example.test` addresses.
- Read-only production check: `E2E_BASE_URL=https://moonnav.vercel.app npx playwright test tests/e2e/public.spec.ts --project=chromium`.
- If the illumination products change, run `npm run data:illum`, then `science/scripts/pack_illumination.py`, then upload the AVGVISIB parts to `moonnav-build-assets` and update `science/assets/illum/packed-manifest.json`.
- Local dev, Preview and Production share one Supabase database **and** the Supabase storage bucket `moonnav-objects`. Local `.env.local` uses `STORAGE_DRIVER=supabase`, so a job processed by any side (local poller or the Vercel drain) stays readable everywhere. The 502 earlier local objects were copied into the bucket on 2026-11-12. Don't switch local storage back to `local` while sharing the database.
- Never put the PAT in a remote URL or git config. Never commit `.env.local`. Never print secret values.
- Supabase is live. Do not reset, truncate or re-run its setup.

## Exact user actions remaining
1. Confirm that the production "reset password" email (sent 2026-11-12 to `amhdsuhail2026+moonnav@gmail.com`) arrived. Its link should point to https://moonnav.vercel.app. You don't need to use it.
2. Rotate the Google App Password and the GitHub PAT (both were pasted into chat). Update `SMTP_PASSWORD` in `.env.local` and in Vercel → moonnav → Settings → Environment Variables, then redeploy.
3. Optional: give the PAT **Actions: Read** permission so CI results can be checked.
