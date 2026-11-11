# Claude handoff — MoonNav

Claude Code: Read this handoff and the updated project documentation before making further changes. Preserve all Codex/previous-agent changes, commits and deployment configuration. Do not repeat completed tasks or overwrite working settings. Continue only items marked PARTIAL or BLOCKED.

Last updated: 2026-11-12. Detail: `docs/FINAL_8_WORKSTREAMS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md`, `docs/KNOWN_LIMITATIONS.md`.

## Status
| Item | Status | Notes |
|---|---|---|
| GitHub push | DONE | Private repo `A-Mhd-Suhail/Nasa-Space-App`, branch `main`. Feature commit `1a759aa` pushed and verified with `git ls-remote`. Later commits on `main` add infra/docs (see `git log`). The PAT can't read Actions, so CI results are unverified. |
| Gmail SMTP | PARTIAL | `.env.local` (git-ignored) uses `MAIL_DRIVER=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASSWORD` (Google App Password) and `MAIL_FROM`. Gmail accepted a test send. Sign-up for `amhdsuhail2026+moonnav@gmail.com` sent a verification mail through SMTP; the link click and login are not yet confirmed. Production env vars are not set (no Vercel access). |
| Vercel config | DONE (local) | `vercel.json` is confirmed by the owner: `app` public `/(.*)`, `science` internal, bindings `app→science` (`SCIENCE_API_URL`) and `science→app` (`MOONNAV_INTERNAL_API_URL`), science build `scripts/fetch_runtime_data.py`, daily cron `/api/internal/cron/drain`. Verified locally: Vercel-like data layout (health, 5 m hazards via the /tmp cache) and on-demand jobs (E2E 10/10, no worker). |
| Vercel deploy | BLOCKED | Vercel CLI logged out (`npx vercel login` needed). After login: `npx vercel link`, set env vars (DEPLOYMENT.md §8), `npx vercel deploy` (preview), test, then `npx vercel deploy --prod`. No URL exists yet. |
| Science on Vercel | PARTIAL | Runs as the internal `science` service. The illumination rasters (333 MB) are not bundled, so PSR point lookups return "unavailable" there. |
| Worker | DONE (replaced on Vercel) | On-demand drain (`POST /v1/worker/drain`), triggered by `after()` on submission, the job-status poll, and the cron. The long-running poller is still used locally (`npm run dev`). |

## Code changed in the infra pass
- `src/lib/science.ts`: `scienceUrl()` joins the binding-injected base URL safely.
- `science/moonnav_science/analysis.py`: `MOONNAV_TILE_CACHE` override.
- `science/moonnav_science/worker.py` `drain()`, `api.py` `POST /v1/worker/drain`, `scripts/fetch_runtime_data.py`, data-dir resolution in `analysis.py`.
- `src/lib/jobs.ts` (`ON_DEMAND_JOBS`, `kickJobDrain`), job/analyses routes (`maxDuration`), `src/app/api/internal/cron/drain/route.ts`, health/dashboard/admin/status UI (on-demand shown as OK).
- `vercel.json`, `.vercelignore`, `.gitignore` (`/science/data/`), `.env.example`, docs.

## Operating notes
- E2E needs the outbox: start the web server with `MAIL_DRIVER=outbox npx next dev -p 3100` (process env overrides `.env.local`).
- Never put the PAT in a remote URL or git config. Push using a one-off `-c credential.helper=...` that reads the token from a private file.
- Never commit `.env.local`. Never print `SMTP_PASSWORD`, `DATABASE_URL` or tokens.
- Supabase is live. Do not reset, truncate or re-run its setup.

## Exact user actions remaining
1. Click the MoonNav verification link in the Gmail inbox for `amhdsuhail2026+moonnav@gmail.com` while the local dev server runs, then tell Claude.
2. Run `npx vercel login` in a terminal (browser/device login; never share the password or token in chat).
4. Rotate the Google App Password and the GitHub PAT, because both were pasted into chat, then update `.env.local` and Vercel.
