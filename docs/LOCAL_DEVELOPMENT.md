# Local development

Everything needed to run MoonNav on a laptop. macOS is the primary documented path (matches `scripts/setup.sh`); the completion pass also validated the whole flow on Linux x86_64 with portable PostgreSQL binaries.

## Quick start (macOS)

```bash
npm run setup      # Homebrew deps (uv, postgresql@17, webp), npm install, science venv,
                   # .env.local with fresh secrets, source-product download + checksums, DB + migrations
npm run dev:all    # PostgreSQL :54329 → migrations → science API :8001 → web :3100 → worker
npm run health     # readiness of web, database, science (kernels/terrain), worker
```

Open **http://localhost:3100**. Dev mailbox: **http://localhost:3100/dev/mail** (verification/reset emails, driver `outbox`). Demo accounts: `npm run db:seed-dev` (passwords are generated into `.env.local`).

## What runs where

| Piece | Port / path | Started by |
|---|---|---|
| PostgreSQL 17 (project-local cluster in `data/pg`, DBs `moonnav_dev`, `moonnav_test`) | 54329 | `scripts/dev-db.sh` (via `npm run db:up` / `dev:all`) |
| Science API (FastAPI + SPICE + LOLA) | 8001 | `scripts/dev-science.sh` (`uv run uvicorn moonnav_science.api:app`) |
| Web (Next.js 16) | 3100 | `npm run dev` |
| Analysis worker | — | `scripts/dev-worker.sh` (`uv run python -m moonnav_science.worker`, leases jobs from the web app) |

`scripts/dev-all.mjs` orchestrates all four in order and reuses already-running processes. The worker needs `SCIENCE_SERVICE_TOKEN` (shared secret with the web app) and `MOONNAV_INTERNAL_API_URL` (web base URL) — both are set by the scripts from `.env.local`.

## Environment

`.env.local` is created by `npm run setup` with fresh local secrets; `.env.example` documents every variable and never contains real values. Required: `DATABASE_URL`, `BETTER_AUTH_SECRET` (≥32 chars), `SCIENCE_SERVICE_TOKEN` (≥24 chars). Storage defaults to the local driver (`data/objects`, HMAC-signed short-lived URLs) and mail to the `data/outbox` mailbox in development; production refuses both drivers on non-local origins (see `src/lib/env.ts`).

## Data products

`npm run data:fetch` (`scripts/fetch_data.sh`) downloads the pinned NASA source products and verifies SHA-256 against `science/catalog/*.json`:

- primary sources: PDS Geosciences (LOLA) and NAIF (SPICE kernels);
- if those hosts are unreachable, verbatim public mirrors are tried (MIT PLT for the LOLA GDR, a public NAIF mirror for kernels) — every file is still checksum-verified, so mirrors cannot change bytes;
- the MOON_ME frame kernel slot prefers the current NAIF release (`moon_de440_250416.tf`) and falls back to the checksum-verified predecessor (`moon_de440_220930.tf`) — see `DECISION_LOG.md` D-022.

`npm run data:assets` (`science/scripts/build_assets.py`) regenerates every derived asset (map layers, site catalogue, precomputed demos, terrain patches, regional cap, feasibility grid). Full options: `--out DIR` (scratch builds), `--skip-grid`, `--grid-size N`. The 61×61 feasibility grid is a long job; the shipped `public/data/feasibility/grid.json` records its own `computeSeconds`.

## Database

```bash
npm run db:up          # start the local cluster
npm run db:migrate     # apply drizzle/ migrations + seed catalogue rows (idempotent)
npm run db:generate    # create a new migration from schema changes
npm run db:seed-dev    # create local demo accounts via the running web app
```

## Tests

```bash
npm run lint && npm run typecheck && npm test   # ESLint, tsc, Vitest (32 tests)
npm run science:test                            # pytest (48 tests incl. Horizons cross-checks)
npx playwright test                             # E2E: public, workspace, security, visual (stack on :3100)
npx playwright test tests/e2e/workspace.spec.ts # full user journey incl. a real queued analysis
```

Playwright loads `.env.local` itself; the workspace/security suites also query PostgreSQL directly, so `DATABASE_URL` must point at the same database the web app uses. E2E writes screenshots to `docs/screenshots/` and registers test users (the sign-up rate limit is intentional — the helpers wait it out).

## Troubleshooting

- **`next dev` killed on small-RAM machines** — run the production server instead: `npm run prod:local` (the completion pass hit this on a 4 GB sandbox; `next start` is far leaner).
- **`science_unavailable` in the UI** — the science API isn't running (`npm run science:dev`), or `SCIENCE_SERVICE_TOKEN` differs between web and science processes. Public demo content still works.
- **`kernel missing` / checksum errors** — run `npm run data:fetch`; never point the service at unverified kernel files.
- **Port 54329/3100/8001 busy** — `dev-all.mjs` reuses running processes; otherwise stop the stale one (`npm run db:up` is idempotent).
- **IPv6-only `localhost` resolution** — if `localhost` resolves to `::1` and PostgreSQL listens only on IPv4, use `127.0.0.1` in `DATABASE_URL` or make the server listen on both (the completion pass used portable binaries with `listen_addresses=127.0.0.1,::1`).
