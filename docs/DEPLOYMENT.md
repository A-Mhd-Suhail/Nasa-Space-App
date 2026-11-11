# Deployment guide — Vercel + PostgreSQL + Cloudflare R2 + science worker

Nothing here has been deployed yet: each step needs the owner's accounts. Keep **development, preview and production** credentials, databases and buckets separate.

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
`MAIL_DRIVER=resend`, `RESEND_API_KEY`, `MAIL_FROM` with a verified sender domain. Production refuses the `outbox` driver.

Source products: `scripts/fetch_data.sh` downloads from NASA first and falls back to SHA-256-verified verbatim mirrors when NASA hosts are unreachable (e.g. locked-down CI networks); build the image on an open network to pin the preferred `moon_de440_250416.tf` release.

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
The image downloads LOLA + SPICE products at build time and verifies their SHA-256 against the catalogue. Health: `GET /health` (kernels + terrain status).

## 5. Vercel (web app + BFF)
1. Import the repository; framework Next.js; Node 24.
2. Environment variables (Production and Preview separately): `APP_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 48`), `DATABASE_URL`, `DATABASE_URL_DIRECT`, `SCIENCE_API_URL` (Cloud Run URL), `SCIENCE_SERVICE_TOKEN`, `STORAGE_DRIVER=r2` + `R2_*`, `STORAGE_SIGNING_SECRET`, `MAIL_DRIVER=resend` + `RESEND_API_KEY`, `MAIL_FROM`, optional `NEXT_PUBLIC_REPO_URL`.
3. Long computations never run in Vercel functions: the browser submits a job (202) and polls; the worker does the compute.
4. Preview deployments must point at the preview database branch and preview bucket.

## 6. Smoke test after deploy
- `GET /api/v1/health` → `status: ok`, `science.status: ok`, `worker.status: ok`.
- Register → verify email → run the guided scenario → completed → export PDF → share link opens anonymously → revoke.
- Run `E2E_BASE_URL=https://preview-url npx playwright test tests/e2e/public.spec.ts` against the preview.
