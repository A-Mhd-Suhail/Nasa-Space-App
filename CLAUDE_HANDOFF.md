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
| Gmail SMTP | DONE | Variables: `MAIL_DRIVER=smtp`, `SMTP_HOST`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`; set in `.env.local` and in Vercel (Production + Preview). Locally verified end to end: sign-up → Gmail → link clicked → sign-in with `emailVerified: true`. In production a password-reset email was sent and the owner confirmed it arrived in Gmail (2026-11-12). |
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

## Email architecture (don't configure Supabase Auth SMTP)
- MoonNav does **not** use Supabase Auth. Sign-up verification, password reset and invitations are sent by Better Auth (`src/lib/auth.ts`) through `src/lib/mail.ts` straight to Gmail SMTP. Supabase is only the Postgres database and the storage bucket. Supabase's Auth SMTP settings and its "email sending rate limit" (30/h) therefore have no effect on MoonNav. This was checked on 2026-11-12, and those settings were deliberately left unchanged.
- The limits that do apply:
  - Gmail's own sending limit (about 500 messages per day for a personal account).
  - MoonNav's per-IP limits in `src/lib/auth.ts`: sign-up 5/min, password reset 3 per 5 min, sign-in 8/min.
  - For higher volume, switch to a transactional provider (`MAIL_DRIVER=resend` or another SMTP service).
- 2026-11-12 23:47 UTC: a second production password-reset email was sent to the test account (HTTP 200).

## Email delivery investigation (2026-11-12, second pass)
Findings from production logs and code:
- **Both flows use the same path**: Better Auth callback → `sendMail()` (`src/lib/mail.ts`) → Gmail SMTP `smtp.gmail.com:465`, implicit TLS, `From` = the Gmail account. Verified in production logs: password reset ×2 and sign-up verification ×1 were each **accepted by Gmail with SMTP `250 2.0.0 OK`**, `accepted:1, rejected:0`, about 3 s each, correct recipient domain, and the link host is `moonnav.vercel.app` (never localhost).
- **Env values can't be read back**: `vercel env pull` masks Production variables as sensitive. The effective configuration is therefore proven through the delivery log fields (`driver`, `host`, `port`, `secure`, `fromDomain`, `appUrlHost`), not by reading variables.
- **Defect found: failures were invisible.** Better Auth catches errors from the send callbacks (`runInBackgroundOrAwait`) and returns success, by design, for non-enumeration. A failed SMTP send therefore showed no error anywhere, and the "Send a new link" button always said "A new link is on its way".
- **Fixes**:
  - `sendMail` now returns only after the provider answers and logs one JSON line per attempt (`event:"mail.delivery"`): kind, driver, masked recipient (`a***@gmail.com`), link host, status (`accepted`/`rejected`/`failed`), message id, SMTP response code, error code, duration. It never logs passwords, tokens, links, message text or full addresses.
  - It uses a fresh transport per attempt with explicit timeouts, retries once on transient errors (timeouts, resets, 4xx), and refuses to send a localhost link from a public deployment.
  - The login page's "Send a new link" reports failures instead of claiming success.
- **Read the logs**: `npx vercel logs -e production --since 10m --json | grep mail.delivery`.
- **What can't be verified from here**: whether Gmail placed a message in Inbox, Spam, or only "All Mail". The server only sees SMTP acceptance, and reading the mailbox is out of scope for the credentials we hold (SMTP only). Use the Gmail search `rfc822msgid:<message-id>` with "All Mail" selected, from the ids in the logs.
- **Likely inbox-side cause**: the sender and recipient are the same Gmail account (`amhdsuhail2026@gmail.com` → `…+moonnav@…`). Gmail may skip the Inbox, notifications, or fold identical subjects into one thread for mail you send to yourself. Test with a different recipient address before treating it as an application bug.

### Final verification on the deployed build (03:12 UTC, 2026-11-12) — inbox placement still to be confirmed by the owner
| Flow | Gmail SMTP result | Message-ID (search `rfc822msgid:` in Gmail, "All Mail") |
|---|---|---|
| Sign-up verification (`…+moonnav3@gmail.com`) | accepted, `250 2.0.0 OK`, 1.2 s, link host `moonnav.vercel.app` | `<95561c58-a5ba-fb3f-5e2f-ee32c3f9099b@gmail.com>` |
| Password reset (`…+moonnav@gmail.com`) | accepted, `250 2.0.0 OK`, 0.6 s, link host `moonnav.vercel.app` | `<cde69063-5d31-19c7-d184-80b9d7ff7da9@gmail.com>` |
Local regression after the change (outbox mode): `auth-fixes.spec.ts` 8/8 on Chromium + WebKit; register and forgot-password flows pass on both. Two earlier failures were test-environment effects, not product bugs: a stale dev-server cache (fixed by a clean restart) and the password-reset rate limit (3 per 5 min per IP, **stored in the shared Supabase DB, so local runs and production tests count against the same limit**; wait 5 min between runs).
Test accounts created in production for these checks: `amhdsuhail2026+moonnav@`, `+moonnav2@` (unverified), `+moonnav3@` (unverified).

## Operating notes
- E2E needs the outbox: start the web server with `MAIL_DRIVER=outbox` in its environment (process env overrides `.env.local`). Never run the registering E2E suites against production, because they would send real email to `example.test` addresses.
- Read-only production check: `E2E_BASE_URL=https://moonnav.vercel.app npx playwright test tests/e2e/public.spec.ts --project=chromium`.
- If the illumination products change, run `npm run data:illum`, then `science/scripts/pack_illumination.py`, then upload the AVGVISIB parts to `moonnav-build-assets` and update `science/assets/illum/packed-manifest.json`.
- Local dev, Preview and Production share one Supabase database **and** the Supabase storage bucket `moonnav-objects`. Local `.env.local` uses `STORAGE_DRIVER=supabase`, so a job processed by any side (local poller or the Vercel drain) stays readable everywhere. The 502 earlier local objects were copied into the bucket on 2026-11-12. Don't switch local storage back to `local` while sharing the database.
- Temporary credential files were all deleted on 2026-11-12: the scratchpad is empty; there is no PAT in the project, shell history, `~/.git-credentials` or the keychain. Secrets now live only in the git-ignored `.env.local` (app config, including the `VERCEL_OIDC_TOKEN` written by `vercel link`) and in Vercel's environment variables.
- Never put the PAT in a remote URL or git config. Never commit `.env.local`. Never print secret values.
- Supabase is live. Do not reset, truncate or re-run its setup.

## Exact user actions remaining
1. Rotate the Google App Password and the GitHub PAT (both were pasted into chat). Update `SMTP_PASSWORD` in `.env.local` and in Vercel → moonnav → Settings → Environment Variables, then redeploy.
2. Push the pending local docs commits with the new token (`git push origin main`).
3. Optional: give the PAT **Actions: Read** permission so CI results can be checked.
