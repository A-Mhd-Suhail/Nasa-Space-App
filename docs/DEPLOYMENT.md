# Deployment guide

Everything below describes what is actually deployed and has been checked against `vercel.json`, the code and the Vercel project. Neon, Cloudflare R2 and Google Cloud Run are **not** used (see "Not used" at the end).

## 1. Architecture

```
Browser ──► Vercel edge ──► Project hack-zz/moonnav  (one Vercel project, two services, region hnd1 = Tokyo)
                             │
                             ├─ service "app"      Next.js 16 (repo root), PUBLIC on /(.*)
                             │     ├─ Postgres  ──► Supabase PostgreSQL (session pooler, Tokyo)        users, scenarios, jobs, audit, rate limits
                             │     ├─ Storage   ──► Supabase Storage, private bucket "moonnav-objects"  analysis results, reports (server-side only)
                             │     ├─ Mail      ──► Gmail SMTP smtp.gmail.com:465 (implicit TLS)        verification, reset, invitations
                             │     └─ SCIENCE_API_URL (injected by the service binding) ─┐
                             │                                                           ▼
                             └─ service "science"  FastAPI (science/), INTERNAL only: no public route, bearer-token protected
                                   NAIF SPICE + NASA LOLA, runs analyses, hazards, suitability, illumination lookups
```

| Piece | Where | Notes |
|---|---|---|
| Web app + BFF | Vercel service `app` | Public. Session cookies; CSRF + per-route rate limits; every route authorises server-side. |
| Science API | Vercel service `science` | Reachable only through the `app → science` binding. All routes need `SCIENCE_SERVICE_TOKEN`. |
| Analysis jobs | `src/lib/jobs.ts#drainJobs` in the app | There is no always-on worker on Vercel (see §4). |
| Database | Supabase PostgreSQL | Migrations in `drizzle/` (0000–0009). RLS enabled on all application tables. |
| Object storage | Supabase Storage, private bucket | Reached only with the service key from server code. Signed download URLs expire after 5 minutes. |
| Build-time data bucket | Supabase Storage `moonnav-build-assets` | Packed LOLA sunlight rasters used by the science build. |
| Email | Gmail SMTP | Same driver for verification, password reset and invitations. |
| Source | GitHub `A-Mhd-Suhail/Nasa-Space-App` (private) | Pushes to `main` deploy production. |

Production URL: **https://moonnav.vercel.app**. Preview deployments get their own `*.vercel.app` URL and sit behind Vercel login.

### Region and latency
Functions run in **`hnd1` (Tokyo)**, next to the Supabase database (`ap-northeast-1`). Measured from the serverless function: one database round trip was 152 ms from `iad1` (the previous default) and 1–6 ms from `hnd1`; a cold connection fell from about 1.2 s to about 140 ms. Keep functions and database in the same region; if the database moves, change `"regions"` in `vercel.json` to match.

### Database connections (important)
`DATABASE_URL` is Supabase's **session** pooler (port 5432). On this project that pooler serves the whole app from a **fixed pool of 15 server connections** (`max_connections` is 60), and in session mode every client holds one for as long as it stays connected. Each Vercel function instance has its own pool, so a burst of instances can exhaust the 15 and queries then fail with "Failed query" (this caused random 500s in production on 2026-11-13). Mitigation in the code (`src/db/index.ts`): on Vercel each instance keeps at most 3 connections, closes idle ones after 3 s, waits up to 15 s for a free connection instead of failing, and calls `attachDatabasePool` (`@vercel/functions`) so idle connections are released before the instance is suspended. The preview and the local environment use the same pooler, so a local `npm run dev` also takes connections from the same 15.
Recommended next step (owner decision, not applied): switch `DATABASE_URL` to Supabase's **transaction** pooler (port 6543). Connections are then held only per transaction, so a few server connections serve hundreds of clients. Keep `DATABASE_URL_DIRECT` on the session pooler (port 5432) for migrations. Change it with `npx vercel env add DATABASE_URL --environment production --force` (and `preview`), then redeploy and re-run the production suites.

## 2. Configuration files
- `vercel.json`: services, the `app → science` binding, the catch-all rewrite to `app`, the daily cron, `regions`.
- `science/scripts/fetch_runtime_data.py`: the science service's build command (see §5).
- `.vercelignore`: keeps local data, virtualenvs, `.env*` and screenshots out of CLI uploads.
- `.env.example`: every variable with a description. `.env.local` is git-ignored and never committed.

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)
Set for **Production and Preview**. Values are secrets: never print them or commit them. Names only:

| Group | Variables |
|---|---|
| App / auth | `BETTER_AUTH_SECRET` (≥ 32 chars). `APP_URL` and `BETTER_AUTH_URL` are optional: when unset, `APP_URL` is derived from `VERCEL_PROJECT_PRODUCTION_URL` (production) or `VERCEL_URL` (previews). Set them if you add a custom domain. |
| Database | `DATABASE_URL` (Supabase **session pooler**, port 5432, `sslmode=require`), `DATABASE_URL_DIRECT` (migrations), `DATA_BACKEND=postgres` |
| Internal auth | `SCIENCE_SERVICE_TOKEN` (≥ 24 chars; shared by the app and the science service), `CRON_SECRET` (bearer secret Vercel sends to the cron route) |
| Storage | `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (**server-side only**), `SUPABASE_STORAGE_BUCKET=moonnav-objects`, `STORAGE_SIGNING_SECRET` |
| Mail | `MAIL_DRIVER=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASSWORD` (a Google App Password, never the account password), `MAIL_FROM` |
| Science | `MOONNAV_TILE_CACHE=/tmp/moonnav-tiles` (the only writable path in a function) |

Not set on purpose: `SCIENCE_API_URL` (injected by the binding; setting it would fight the binding), `R2_*` (unused). Production refuses `MAIL_DRIVER=outbox` and `STORAGE_DRIVER=local` unless `APP_URL` is local.

Change a value: `npx vercel env add NAME --environment production --force` (reads the value from stdin), repeat for `preview`, then redeploy. Production and Preview share one database and one storage bucket.

## 4. Analysis jobs on Vercel (on-demand drain)
Vercel cannot run a polling worker, so the app drains the queue itself with the same lease protocol the local worker uses:
1. A request to submit an analysis stores the job as `queued` and, after the response is sent, calls `drainJobs()` (`after()`).
2. `drainJobs()` leases a job, calls the science service `POST /v1/jobs/compute` (which returns the result **and the real stage timestamps**), stores the result in Supabase Storage and marks the job completed. A lease heartbeat keeps long jobs alive.
3. Backstops: the job-status poll re-triggers a drain when a job has stayed `queued` for 20 s, and a **daily cron** (`/api/internal/cron/drain`, 04:00 UTC, authorised with `CRON_SECRET`) drains anything left over. (The Hobby plan allows daily crons only; submissions and polls provide the low-latency path.)
4. Routes that start a drain set `maxDuration = 300`. A job that outlives its function loses its lease and is retried by the next drain (up to the job's attempt limit).
On-demand mode is switched on automatically by the `VERCEL` variable, or locally with `JOB_MODE=on-demand`. `/api/v1/health` reports the worker as `on_demand`. Science never calls the app (Vercel rejects circular service bindings).

Locally the polling worker is used instead (`npm run dev` starts it); see `LOCAL_DEVELOPMENT.md`.

## 5. Science build, data and caching
The science build command `python3 scripts/fetch_runtime_data.py` runs on every deployment and:
- downloads LOLA `LDEM_75S_240M` and the SPICE kernels from NASA (with checksum-verified mirrors) into `science/data/` and verifies every file's SHA-256 against `science/catalog/*.json` (a mismatch fails the build);
- downloads the two quantised long-term sunlight packs (about 92 MB) from the private bucket `moonnav-build-assets` and verifies their SHA-256 against `science/assets/illum/packed-manifest.json` (skipped with a warning if Supabase credentials are missing; the lookups then report "unavailable", never 0).
The PSR pack (0.4 MB, lossless) and the PDS labels are committed in `science/assets/illum/`. The 5/20/40 m LOLA tiles are fetched at request time from NASA PDS by byte range into `MOONNAV_TILE_CACHE`; a warm function reuses them, a cold one fetches again (first use of a new 5 m area ≈ 8 s). Static map layers and relief data are served from the CDN with `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`.

Files under `public/` are **not** bundled into server functions. Code that reads them at runtime must be listed in `outputFileTracingIncludes` (`next.config.ts`): this was missing for the demo and `/validation`, which therefore failed on Vercel until 2026-11-13.

## 6. Procedures
**Database migration** (additive changes only; review first, run from a trusted shell):
```bash
npm run db:migrate          # uses DATABASE_URL_DIRECT or DATABASE_URL from .env.local
```
Migration 0009 (`user_email_lower_unique`, `user_email_normalized_chk`) was checked read-only against production before applying (78 users, 0 case or whitespace duplicates). Never run destructive statements against the shared database.

**Preview, then production**
```bash
npx vercel deploy                         # preview URL (behind Vercel login)
npx vercel curl /api/v1/health --deployment <preview-url>
git push origin main                      # production deploy through the GitHub integration (or: npx vercel deploy --prod)
```
After a production deploy: `curl https://moonnav.vercel.app/api/v1/health` and `E2E_BASE_URL=https://moonnav.vercel.app npx playwright test tests/e2e/public.spec.ts --project=chromium`.

**First administrator** (there is no public endpoint for this; see `CLAUDE_HANDOFF.md`): the person registers and verifies their email, then the owner runs, from a trusted shell with the database credentials:
```bash
npx tsx --env-file=.env.local scripts/grant-role.ts person@example.org admin "initial bootstrap by the project owner"
```
The script refuses unverified, inactive or demo accounts, asks you to retype the address, revokes that user's sessions and writes an audit event. The new admin then signs in, enables two-factor authentication at Settings → Security and stores the backup codes; admin pages stay locked until two-factor is enabled.

## 7. Health checks and troubleshooting
`GET /api/v1/health` → `status`, `web.region`, `database.roundTripMs`, `science.checkMs`, `datasets`, `worker` (`on_demand`).
- `database` unavailable: check `DATABASE_URL` (session pooler, `sslmode=require`) and the Supabase project status.
- `science` unavailable or slow on the first call: a cold start installs Python packages and loads SPICE (several seconds); repeat after a moment. Persistent failure: check the science build log for `fetch_runtime_data.py` errors.
- Analyses stay `queued`: check `worker.activeJobs`, the app function logs for `drainJobs`, and `SCIENCE_SERVICE_TOKEN` equality between services.
- Email not arriving: `npx vercel logs -e production --since 10m --json | grep mail.delivery`. Each send logs `status` (`accepted` / `rejected` / `failed`), the SMTP response, a message id and a masked recipient, never the link or credentials. `accepted` means the server took the message; to find it in Gmail search `rfc822msgid:<id>` in All Mail.
- Demo or `/validation` empty: a file read from `public/` is missing from `outputFileTracingIncludes`.
- Local E2E and production share nothing: `npm run test:e2e:stack` rebuilds an isolated local database every run.

## 8. Not used
Neon (the database is Supabase), Cloudflare R2 (storage is Supabase Storage; the `r2` driver remains in code as an unused alternative, and curator direct uploads, which need it, are therefore disabled), Google Cloud Run and a separate worker host (jobs drain on Vercel; `science/Dockerfile` remains only for self-hosting), and Resend (the driver exists; Gmail SMTP is used).
