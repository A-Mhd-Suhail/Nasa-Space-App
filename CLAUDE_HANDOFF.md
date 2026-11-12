# Claude handoff — MoonNav

Claude Code: Read this handoff and the updated project documentation before making further changes. Preserve all Codex/previous-agent changes, commits and deployment configuration. Do not repeat completed tasks or overwrite working settings. Continue only items marked PARTIAL or BLOCKED.

Last updated: 2026-11-13. Detail: `docs/DEPLOYMENT.md` (architecture, variables, procedures, troubleshooting), `docs/TESTING.md` ("Current verification": results, bugs found, performance), `docs/IMPLEMENTATION_STATUS.md`, `docs/KNOWN_LIMITATIONS.md`, `docs/DECISION_LOG.md` (D-024 … D-027).

## Status
| Item | Status | Notes |
|---|---|---|
| Production | DONE | https://moonnav.vercel.app (Vercel project `hack-zz/moonnav`, region `hnd1`). Services: `app` (Next.js, public) and `science` (FastAPI, internal only, bearer token). Verified after deployment: public + demo suites 78/78 and reliability audit 12/12 on Chromium, Firefox and WebKit. |
| GitHub | PARTIAL | Private repo `A-Mhd-Suhail/Nasa-Space-App`. Everything from 2026-11-13 (see `git log`) is committed locally and **deployed from the working tree with the Vercel CLI**; it is **not pushed** because no GitHub token is available. Push with a fresh token (`git push origin main`); this redeploys the same code. |
| Email (Gmail SMTP) | DONE | Delivery confirmed by the owner for sign-up verification and password reset. Every send logs `mail.delivery` (status, SMTP response, message id, masked recipient; no links or secrets). |
| Duplicate sign-up | DONE | 409 `ACCOUNT_EXISTS`; DB unique index on `lower(email)` and `CHECK email = lower(btrim(email))` (migration 0009, applied to production). Policy: trim + lower-case only, no Gmail dot/plus folding. |
| Demo | DONE | Fixed (files under `public/` were missing from the function bundle); 3.4 s start; guided tour on the dashboard; "Try the demo" button on the home page. |
| Test suite | DONE | `npm run test:e2e:stack`: isolated local database, three browsers. See `docs/TESTING.md` for the latest counts. Firefox works when run outside the agent's sandboxed shell. |
| Performance | DONE | Functions in `hnd1` next to the Supabase database (152 ms → 3–4 ms per query). Before/after table in `docs/TESTING.md`. |
| Database pooler | **OWNER DECISION** | Session pooler serves the whole app from 15 connections. Mitigated in code; recommended: switch `DATABASE_URL` to the transaction pooler (port 6543). See `docs/DEPLOYMENT.md`. Not applied: it changes a production variable. |
| First administrator + MFA | **OWNER ACTION** | No admin exists. See "Exact user actions". |
| Optional LOLA illumination | DONE | Local originals verified by SHA-256; production uses a lossless PSR pack and 0.001-rounded sunlight packs from a private bucket; boundary and invalid-input tests. |

## Architecture in one paragraph
One Vercel project, two services, region `hnd1`. `app` (public) talks to Supabase PostgreSQL (session pooler), Supabase Storage (private bucket `moonnav-objects`, service key server-side only) and Gmail SMTP, and calls `science` through a service binding (`SCIENCE_API_URL` is injected, never set by hand). `science` is internal: NAIF SPICE + NASA LOLA, bearer-token protected. There is no worker process on Vercel: `drainJobs()` in the app leases queued jobs, calls `science` `POST /v1/jobs/compute`, stores the result; triggers are after submission, job-status polls (queued > 20 s) and a daily cron. Production, Preview and local development share one database and one storage bucket; the automated test stack does not.

## Operating notes (things that bite)
- **Run the E2E suite with `npm run test:e2e:stack`**, from a normal terminal. It rebuilds an isolated local database each run. Never point the suite at Supabase or production except the read-only/demo ones: `public.spec.ts`, `demo.spec.ts` and `reliability.spec.ts` are safe against production (`E2E_BASE_URL=https://moonnav.vercel.app APP_URL=https://moonnav.vercel.app`); `signup-duplicates`, `verification` and `security` write to the database and send mail.
- **Rate limits are real and keyed by client address** (sign-up 5/min, resend 3/min, password reset 3 per 5 min, demo 20 per 10 min). The limiter state lives in the database, so local runs against Supabase and production share it. Tests send their own `x-forwarded-for`.
- **Files under `public/` are not in server functions.** Anything read with `fs` at request time must be listed in `outputFileTracingIncludes` (`next.config.ts`).
- Never put the PAT in a remote URL or git config; push with a one-off `-c credential.helper=...` reading a private file, delete it afterwards. Never commit `.env.local`. Never print `SMTP_PASSWORD`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` or tokens (production variables are stored as sensitive; `vercel env pull` shows them as `[SENSITIVE]`).
- Production environment variables: names are listed in `docs/DEPLOYMENT.md` §3. Change one with `npx vercel env add NAME --environment production --force` (value on stdin), then redeploy.
- Deploy: `npx vercel deploy` (preview, behind Vercel login; test with `npx vercel curl <path> --deployment <url>`) then `git push origin main` or `npx vercel deploy --prod`.
- Read production logs: `npx vercel logs -e production --since 10m --json`; mail: filter `mail.delivery`.
- Migrations are additive and applied by hand from a trusted shell (`npm run db:migrate`) after a read-only precondition check. Never run destructive statements on the shared database.
- Supabase is live. Do not reset, truncate or re-run its setup.

## Test accounts left in the production database
`amhdsuhail2026+moonnav@`, `+moonnav2@`, `+moonnav3@`, `+moonnav4@` (the last three unverified), plus automatically expiring `@demo.moonnav.invalid` demo accounts. They can be deleted.

## Exact user actions remaining
1. **Create the first administrator** (owner only). Register a normal account with the address that should be admin and verify its email. Then, from a trusted shell with `.env.local`, run `npx tsx --env-file=.env.local scripts/grant-role.ts <that email> admin "initial bootstrap by the project owner"` and retype the address when asked. Sign in as that user, open Settings → Security, enable two-factor authentication and **store the backup codes**; admin pages stay locked until two-factor is on.
2. **Decide on the database pooler**: approve switching `DATABASE_URL` (Production and Preview) to the Supabase transaction pooler, port 6543 (recommended; see `docs/DEPLOYMENT.md`). Re-run the production suites afterwards.
3. **Push the code to GitHub** with a fresh fine-grained token (Contents + Workflows: read/write, this repository only): `git push origin main`.
4. **Rotate secrets that were pasted into chat**: the Google App Password (update `SMTP_PASSWORD` in `.env.local` and in Vercel, redeploy) and every GitHub token used so far.
5. Optional: delete the leftover test accounts listed above.
