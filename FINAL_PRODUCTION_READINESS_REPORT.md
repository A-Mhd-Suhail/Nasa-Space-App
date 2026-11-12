# MoonNav — Final production-readiness report

Verified 2026-11-13 against the live system. Everything below was checked in this pass unless marked "from earlier pass".

## H. Final status
**PRODUCTION READY — OWNER ACTIONS PENDING.** The implementation is complete and verified, and the leftover privileged test accounts were cleared on 2026-11-13 (§B.1). What remains needs your accounts: credential rotation and creating the first administrator. The exposed credentials (§C) should be rotated before the site is shown publicly.

## A. Completed and verified
| Area | Evidence |
|---|---|
| GitHub sync | local `main` = `origin/main` = `5adc63e`; working tree clean; no untracked files. (`git fetch` cannot authenticate without a token, so `origin/main` is the ref from the verified push, not a fresh fetch.) |
| No secrets tracked | `.env.local` ignored; only `.env.example` is tracked; token, service-key, JWT, private-key and App Password patterns: 0 hits in the tree and in all history |
| Production health | `/api/v1/health` ok; region `hnd1`; database round trip 4 ms; science ok; worker `on_demand`; `/`, `/explore`, `/login`, `/validation`, sites, terrain and illumination endpoints all HTTP 200 (the first hit after idle is a cold start, 2–6 s) |
| Production code = intended commit | Both production deployments are newer than `5adc63e` and the working tree has zero code differences from it. They were uploaded with the Vercel CLI, so Vercel shows no Git SHA for them; the match is by content and timing, not a Vercel-recorded SHA |
| Tokyo region active | `vercel.json` `regions: ["hnd1"]`; health reports `hnd1` |
| Environment variables | present for Production and Preview (names only; values are stored as sensitive): `DATABASE_URL`, `DATABASE_URL_DIRECT`, `BETTER_AUTH_SECRET`, `SCIENCE_SERVICE_TOKEN`, `CRON_SECRET`, `STORAGE_DRIVER`, `STORAGE_SIGNING_SECRET`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `MAIL_DRIVER`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `DATA_BACKEND`, `MOONNAV_TILE_CACHE` |
| Current tests | Vitest 61/61; science pytest 95/95; ruff and mypy clean; production public suite (Chromium) 21/21 against https://moonnav.vercel.app (read-only) |
| Functionality (earlier verified pass; code unchanged since) | demo; analysis submit to complete (1.2 s); PDF export through a Supabase signed URL; duplicate sign-up 409; verification and reset email delivery (owner confirmed); 249/249 local E2E (83 per browser); 78/78 production public + demo; 12/12 production reliability |

Not repeated in this pass, deliberately: registration, demo and analysis runs against production, because they create accounts or rows and no code changed. Production logs could not be read this pass (the log query returned no rows), so "no runtime errors" is supported by live checks, not by logs.

## B. Owner actions required
**1. Clear the leftover privileged accounts — DONE 2026-11-13 (approved by the owner).** In one guarded transaction (it aborted unless it found exactly these 10 test accounts): the 10 accounts were set to role `user` and status `suspended`, their 9 sessions were deleted, and one audit event was written per account. Verified afterwards: 0 admin/curator accounts remain, 0 sessions held by those accounts. Original findings:
- *Why:* the production database holds **10 admin/curator accounts that are not yours**: 9 `@example.test` accounts (6 admin, 3 curator, MFA on, unknown random passwords, 9 live sessions) created by old E2E runs that used to write to the shared database, and the seeded `admin@moonnav.test` (admin, **no MFA**; its password is `DEV_ADMIN_PASSWORD` in your local `.env.local`). Anyone who knew that password could sign in, enrol their own MFA and become admin. The test suite no longer touches this database.
- *Result:* `select count(*) from "user" where role in ('admin','curator')` now returns 0. No other account was touched.

**2. Create the first administrator (you run the command; I only verify).**
- *Eligible account:* your account ending `2007@gmail.com` is registered, email **verified**, active, role `user`. (Your account ending `2026@gmail.com` is registered but **not verified**, so it is not eligible.) Do step 1 first.
- *Command* (terminal, project folder, `.env.local` present; it asks you to retype the address):
  `npx tsx --env-file=.env.local scripts/grant-role.ts <your verified email> admin "initial bootstrap by the project owner"`
- *Then:* sign in at https://moonnav.vercel.app/login → Settings → Security → turn on two-factor, scan the QR code and **save the backup codes**. Admin pages stay locked until this is done.
- *Expected:* the script prints `role of … set to admin; their sessions were revoked.`; `/admin` opens only after two-factor is on.
- *Verify:* tell me when done; I check the role and `two_factor_enabled` read-only and confirm that a normal user still gets 403.

**3. Rotate the Google App Password (replace first, then revoke).**
1. Google Account → Security → 2-Step Verification → App passwords → create "MoonNav SMTP". Keep the new 16-letter password to yourself.
2. Vercel → project `moonnav` → Settings → Environment Variables → `SMTP_PASSWORD` → edit for **Production and Preview** (or in a terminal `npx vercel env add SMTP_PASSWORD --environment production --force`, then again with `preview`; the CLI asks you to type the value).
3. Edit `SMTP_PASSWORD` in your local `.env.local`.
4. Redeploy: `npx vercel deploy --prod`.
5. Verify: `npm run mail:test -- <your email>` (one email to yourself; prints no secret), and request one password reset for your own address in production and confirm it arrives.
6. Only then: Google Account → App passwords → delete the old one.
*Where the value lives:* Vercel (Production and Preview) and `.env.local`. It is not in Git or its history (verified).

**4. Revoke every GitHub token used in this project.** github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → delete all of them. The deployed system needs no GitHub token (the code never reads one; deployments were made with the Vercel CLI). Create a new one only when you next want to push (Contents and Workflows: read/write, this repository only). No token is stored on this machine (no keychain entry, no helper, none in the project).

**5. Rotate the Supabase credentials pasted into the earlier chat** (database password, secret/service key, publishable key). Treat them as exposed.
1. Supabase → Project Settings → Database → reset the database password and copy the new pooler connection strings.
2. Supabase → Project Settings → API Keys → rotate the secret (service-role) key.
3. Update `DATABASE_URL`, `DATABASE_URL_DIRECT`, `SUPABASE_SERVICE_ROLE_KEY` (and the publishable key if rotated) in Vercel for Production and Preview, and in `.env.local`; redeploy.
4. Verify: `curl https://moonnav.vercel.app/api/v1/health` shows `database.status` ok, then repeat a signed-in PDF export.
Do this in one sitting: the site is down for the moments between the password reset and the Vercel update.

**6. Database pooler: no action needed now** (see §E). The decision is yours only if you expect a burst of visitors.

## C. Security
| Item | Status |
|---|---|
| Secrets in Git | none, history included (verified) |
| Google App Password | **exposed; not yet rotated.** Still the value in Vercel and `.env.local` (Vercel's variables were last changed 23 h ago). Steps: §B.3 |
| GitHub tokens | **exposed; revocation is yours** (§B.4). None stored anywhere here |
| Supabase DB password and keys | **exposed in the earlier session; not yet rotated** (§B.5) |
| Leftover admin/curator accounts | **closed 2026-11-13** (§B.1): demoted, suspended, sessions removed, audited; 0 privileged accounts remain |
| First administrator | not created yet (§B.2); the script refuses unverified, inactive and demo accounts and asks for a retyped confirmation |
| MFA | enrolment, challenge and backup-code recovery verified by the suite (7 tests × 3 browsers, earlier pass); enforced for admin and curator pages and APIs |
| Internal science service | not public; every route needs `SCIENCE_SERVICE_TOKEN` |
| Storage | private bucket, server-side service key only, signed URLs expire in 5 minutes |
| Remaining risk | the cleanup and rotations above; Production, Preview and local development share one database |

## D. GitHub and Vercel
- GitHub: private repository `A-Mhd-Suhail/Nasa-Space-App`; remote = local = `5adc63e` (this report is committed locally on top; pushing it is optional).
- Vercel: project `hack-zz/moonnav`; latest production deployment `https://moonnav-dks3oiwd1-hack-zz.vercel.app` (Ready), served at **https://moonnav.vercel.app**; region `hnd1`; services `app` (public) and `science` (internal); daily cron `/api/internal/cron/drain`.

## E. Database and infrastructure
- **Pooler:** `DATABASE_URL` is the Supabase session pooler (port 5432). `max_connections` is 60 and the pooler serves the app from a pool of 15. Today it holds 7 backends, all idle but one: **no exhaustion now** (earlier it held all 15). Per-instance limits are in place (3 connections, 3 s idle timeout, `attachDatabasePool`). The failures seen on 2026-11-13 stopped after that change (production suites 78/78 and 12/12 afterwards).
- **Recommendation: keep the current setup.** Evidence limits: the pool was checked only at rest and logs were unavailable this pass. **Switch to the transaction pooler (port 6543)** if any of these occur: `Failed query`, `timeout exceeded when trying to connect` or `MaxClientsInSessionMode` in production logs; more than about 12 of the 15 backends busy for several minutes; or before an event where you expect dozens of simultaneous visitors (for example a live judging session). Change `DATABASE_URL` (Production and Preview) only, keep `DATABASE_URL_DIRECT` on 5432, redeploy, then re-run the public and demo suites.
- Storage: Supabase Storage (private). Jobs: on-demand drain in the app with a daily cron backstop. Region: `hnd1`, next to the database.
- **Email:** Gmail SMTP `smtp.gmail.com:465`, implicit TLS. Variables: `MAIL_DRIVER`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`. Verification and reset delivery were confirmed by you (earlier pass). Limits: resend 3/min, reset 3 per 5 min, sign-up 5/min; expired, invalid, used and resent links are covered by tests. No further test emails were sent in this pass. One safe owner test after rotating the password: `npm run mail:test -- <your email>`.
- Known limitation: curator direct file uploads are disabled (they need the unused R2 driver); source data is loaded with the scripts.

## F. Tests (this pass)
| Command | Result |
|---|---|
| `npx vitest run` | 61 passed |
| `cd science && uv run pytest -q` | 95 passed (ruff and mypy clean) |
| `APP_URL=https://moonnav.vercel.app E2E_BASE_URL=https://moonnav.vercel.app npx playwright test tests/e2e/public.spec.ts --project=chromium` | 21 passed (read-only) |
| Full local suite (`npm run test:e2e:stack`) | not re-run: no code changed since the verified 249/249 run (83 per browser, 0 skipped). Unavailable: none |

## G. Blockers
**Critical (before public exposure):** the exposed, unrotated credentials (§B.3–B.5).
**Optional / future:** the transaction pooler (§E); a paid plan for a sub-daily cron; separate databases for Production, Preview and local development; production log alerts on `mail.delivery` `failed` and `Failed query`; deleting the other leftover test accounts (about 50 `@example.test`, `@moonnav.test` and `+alias` rows).
