# Deployment guide — Vercel + PostgreSQL + Cloudflare R2 + science worker

Nothing here has been deployed yet: each step needs the owner's accounts. Current status and blockers: `FINAL_8_WORKSTREAMS.md` (WS1–WS3). The database is already live on **Supabase** (`DATABASE_SETUP.md`); use it instead of step 1 below. Keep **development, preview and production** credentials, databases and buckets separate.

## 1. PostgreSQL (Neon recommended, via the Vercel Marketplace)
1. Create a Neon project with branches `production` and `preview`.
2. Copy the **pooled** connection string → `DATABASE_URL`, and the **direct** one → `DATABASE_URL_DIRECT` (used only by migrations).
3. Apply migrations and seed catalogue rows (idempotent):
   `DATABASE_URL_DIRECT=... npx tsx scripts/migrate.ts`
4. Bootstrap the first administrator after they register and verify email:
   `npx tsx scripts/grant-role.ts admin@example.org admin "initial bootstrap"` — they must then enable MFA in Settings → Security before admin pages open.

## 2. Cloudflare R2
1. Create buckets `moonnav-prod` and `moonnav-preview` (no public access).
2. Create an R2 API token scoped to those buckets (Object Read & Write) → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; set `R2_ACCOUNT_ID` (or `R2_ENDPOINT`) and `R2_BUCKET`; `STORAGE_DRIVER=r2`.
3. CORS (only needed for curator direct uploads): allow `PUT` from your app origin with `Content-Type`.
4. Presigned URLs expire in 5 min (downloads) / 10 min (uploads) and are never logged.

## 3. Email
Either SMTP (`MAIL_DRIVER=smtp`, `SMTP_HOST`, `SMTP_PORT` 587 STARTTLS or 465 TLS, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`) or Resend (`MAIL_DRIVER=resend`, `RESEND_API_KEY`, `MAIL_FROM` with a verified sender domain). Production refuses the `outbox` driver.
Check delivery before going live: `npm run mail:test -- you@example.org` (reads `.env.local`, sends one message, prints only the driver/host and the provider's message id, never credentials). For Gmail use an app password; for most providers the sender domain needs SPF/DKIM.

Source products: `scripts/fetch_data.sh` downloads from NASA first and falls back to SHA-256-verified verbatim mirrors when NASA hosts are unreachable (e.g. locked-down CI networks); build the image on an open network to pin the preferred `moon_de440_250416.tf` release.

### Mail delivery diagnostics
Every send writes one structured log line: `event:"mail.delivery"` with `kind` (`verify-email` | `reset-password` | …), `status` (`accepted` | `rejected` | `failed`), `messageId`, `smtpResponse` (e.g. `250 2.0.0 OK`), `errorCode`, `linkHost`, `appUrlHost`, a masked recipient and the duration. Credentials, tokens, links and message text are never logged. View them with `npx vercel logs -e production --since 10m --json | grep mail.delivery`. `accepted` means the SMTP server took the message; it does not prove inbox placement. To locate a message in Gmail, search `rfc822msgid:<id>` with "All Mail" selected. Better Auth hides send failures from the HTTP response (non-enumeration), so the log is the only place they appear. Alert on `"status":"failed"`.

## 4. Science API + worker (Google Cloud Run, default — see DECISION_LOG D-013)
```bash
docker build -f science/Dockerfile -t REGION-docker.pkg.dev/PROJECT/moonnav/science:0.1.0 .
docker push REGION-docker.pkg.dev/PROJECT/moonnav/science:0.1.0
# API (internal, token-protected)
gcloud run deploy moonnav-science --image ...:0.1.0 --memory 2Gi --cpu 1 \
  --set-env-vars SERVICE_MODE=api --set-secrets SCIENCE_SERVICE_TOKEN=moonnav-science-token:latest
# Worker (always-on poller)
gcloud run deploy moonnav-worker --image ...:0.1.0 --memory 2Gi --cpu 1 --min-instances 1 --no-cpu-throttling \
  --set-env-vars SERVICE_MODE=worker,MOONNAV_INTERNAL_API_URL=https://YOUR-APP --set-secrets SCIENCE_SERVICE_TOKEN=moonnav-science-token:latest
```
The science service cannot run on Vercel (Python, ~2 GB of NASA data, long CPU work); host it as a container. The image downloads LOLA + SPICE products at build time and verifies their SHA-256 against the catalogue. Health: `GET /health` (kernels + terrain status).

## 5. Vercel (web app + BFF)
1. Import the repository; framework Next.js; Node 24.
2. Environment variables (Production and Preview separately): `APP_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 48`), `DATABASE_URL`, `DATABASE_URL_DIRECT`, `SCIENCE_API_URL` (Cloud Run URL), `SCIENCE_SERVICE_TOKEN`, `STORAGE_DRIVER=r2` + `R2_*`, `STORAGE_SIGNING_SECRET`, `MAIL_DRIVER=resend` + `RESEND_API_KEY`, `MAIL_FROM`, optional `NEXT_PUBLIC_REPO_URL`.
3. Long computations never run in Vercel functions: the browser submits a job (202) and polls; the worker does the compute.
4. Preview deployments must point at the preview database branch and preview bucket.

## 6. Smoke test after deploy
- `GET /api/v1/health` → `status: ok`, `science.status: ok`, `worker.status: ok`.
- Register → verify email → run the guided scenario → completed → export PDF → share link opens anonymously → revoke.
- Run `E2E_BASE_URL=https://preview-url npx playwright test tests/e2e/public.spec.ts` against the preview.

## 7. Optional data for the PSR / long-term sunlight layers
`npm run data:illum` downloads the three LOLA illumination products (3 × 116 MB, SHA-256 checked) and rebuilds the map rasters. Without them the layers still show (the rasters are committed in `public/data/`), but point lookups and the Mission Report row say "unavailable".

## 8. Vercel deployment (live since 2026-11-12)
- **Project**: `hack-zz/moonnav`, linked to the GitHub repo, so pushes to `main` deploy production. **Production URL: https://moonnav.vercel.app**.
- **Services** (`vercel.json`):
  - `app` (Next.js, repo root) is public on `/(.*)`. Its binding to `science` injects `SCIENCE_API_URL` at runtime; don't set that variable yourself.
  - `science` (FastAPI, root `science/`, entrypoint `moonnav_science/api.py`) is internal only: no public rewrite, and every route still needs `SCIENCE_SERVICE_TOKEN`. Its build, `python3 scripts/fetch_runtime_data.py`, downloads LOLA 240 m + SPICE (~71 MB) and the long-term sunlight packs (~92 MB, from the private Supabase bucket `moonnav-build-assets`), all SHA-256 checked. The PSR pack is committed in `science/assets/illum`. High-res tiles are cached in `/tmp` (`MOONNAV_TILE_CACHE`).
- **Analysis jobs** (no polling worker on Vercel): `src/lib/jobs.ts#drainJobs` leases queued jobs, calls science `POST /v1/jobs/compute` and stores the result and the real stage log. It is triggered by `after()` on submission, by the job-status poll for jobs queued > 20 s, and by a daily cron (`/api/internal/cron/drain`, `CRON_SECRET`). Routes that trigger a drain set `maxDuration = 300`. A circular `science → app` binding is rejected by Vercel, so science never calls the app.
- **Storage**: `STORAGE_DRIVER=supabase`, a private bucket `moonnav-objects`, accessed through the Storage REST API with the server-side service key. Signed download URLs expire in 5 min.
- **APP_URL**: if unset, it is derived from `VERCEL_PROJECT_PRODUCTION_URL` (production) or `VERCEL_URL` (previews). Set it if you add a custom domain.
- **Env vars** (Production + Preview): see `CLAUDE_HANDOFF.md`. To change one: `npx vercel env add NAME --environment production --force`, then redeploy.
- **Redeploy**: push to `main`, or run `npx vercel deploy --prod`. Preview: `npx vercel deploy`. Previews are behind Vercel login; test them with `npx vercel curl <path> --deployment <url>`.
- `.vercelignore` keeps local data, virtualenvs, `.env*` and screenshots out of CLI uploads.
