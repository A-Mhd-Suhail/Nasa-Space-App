# Claude handoff — MoonNav

Claude Code: Read this handoff and the updated project documentation before making further changes. Preserve all Codex/previous-agent changes, commits and deployment configuration. Do not repeat completed tasks or overwrite working settings. Continue only items marked PARTIAL or BLOCKED.

Last updated: 2026-11-12. Detail: `docs/FINAL_8_WORKSTREAMS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md`, `docs/KNOWN_LIMITATIONS.md`.

## Status
| Item | Status | Notes |
|---|---|---|
| GitHub push | DONE | Private repo `A-Mhd-Suhail/Nasa-Space-App`, branch `main`. Feature commit `1a759aa` pushed and verified with `git ls-remote`. Later commits on `main` add infra/docs (see `git log`). The PAT can't read Actions, so CI results are unverified. |
| Gmail SMTP | PARTIAL | `.env.local` (git-ignored) uses `MAIL_DRIVER=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASSWORD` (Google App Password) and `MAIL_FROM`. Gmail accepted a test send. Sign-up for `amhdsuhail2026+moonnav@gmail.com` sent a verification mail through SMTP; the link click and login are not yet confirmed. Production env vars are not set (no Vercel access). |
| Vercel | BLOCKED | Draft `vercel.json` (services `app` public, `science` internal; bindings `app→science` as `SCIENCE_API_URL` and `science→app` as `MOONNAV_INTERNAL_API_URL`) awaits owner confirmation. The Vercel CLI is logged out. No deployment URL exists. |
| Science on Vercel | BLOCKED | The service build must download LOLA 240 m + SPICE (~73 MB; `/data` is git-ignored). Tile cache goes to `/tmp` via `MOONNAV_TILE_CACHE`. The LOLA illumination rasters (333 MB) are too large for a function bundle, so on Vercel the point lookups will say "unavailable". |
| Worker | BLOCKED | The always-on poller (`moonnav_science/worker.py`) cannot run on Vercel. Two options await the owner's decision: (a) a separate container host (`science/Dockerfile`, `SERVICE_MODE=worker`), or (b) an on-demand job drain in the science function using `process_one`, triggered after submission plus a cron backstop. |

## Code changed in the infra pass
- `src/lib/science.ts`: `scienceUrl()` joins the binding-injected base URL safely.
- `science/moonnav_science/analysis.py`: `MOONNAV_TILE_CACHE` override.
- `vercel.json` (draft), `.env.example`, docs.

## Operating notes
- E2E needs the outbox: start the web server with `MAIL_DRIVER=outbox npx next dev -p 3100` (process env overrides `.env.local`).
- Never put the PAT in a remote URL or git config. Push using a one-off `-c credential.helper=...` that reads the token from a private file.
- Never commit `.env.local`. Never print `SMTP_PASSWORD`, `DATABASE_URL` or tokens.
- Supabase is live. Do not reset, truncate or re-run its setup.

## Exact user actions remaining
1. Click the MoonNav verification link in the Gmail inbox for `amhdsuhail2026+moonnav@gmail.com` while the local dev server runs, then tell Claude.
2. Run `npx vercel login` in a terminal (browser/device login; never share the password or token in chat).
3. Confirm the `vercel.json` service names, public/internal routing, bindings and the worker option.
4. Rotate the Google App Password and the GitHub PAT, because both were pasted into chat, then update `.env.local` and Vercel.
