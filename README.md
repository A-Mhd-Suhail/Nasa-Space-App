# MoonNav — Lunar Landing Site Navigator

Compare lunar south-pole sites and dates by **terrain-aware direct sunlight** and **geometric direct-to-Earth (DTE) visibility**, using NASA LOLA terrain (with lunar curvature) and NAIF SPICE ephemerides cross-checked against JPL Horizons. Built for the 2026 NASA Space Apps Challenge "Lunar Landing Site Navigator".

> Independent research/education prototype — not NASA-owned, NASA-endorsed or flight-certified. It does not select NASA-approved landing sites.

## Stack
| Layer | Technology |
|---|---|
| Web + BFF | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 |
| Auth | Better Auth — email/password, email verification, password reset, TOTP MFA, DB rate limits |
| Data | PostgreSQL 17 + Drizzle ORM (versioned SQL migrations in `drizzle/`) |
| Object storage | Cloudflare R2 (S3 API) in production; signed local driver in dev |
| Science | Python 3.12 · FastAPI · SpiceyPy (NAIF SPICE) · NumPy |
| Jobs | PostgreSQL lease queue (`FOR UPDATE SKIP LOCKED`) + Python worker |
| Visuals | OpenLayers (custom LOLA polar projection) · Apache ECharts · React Three Fiber |
| Tests | pytest · Vitest · Playwright + axe |

```
Browser ─► Next.js (Vercel) ─┬─► PostgreSQL (users, projects, scenarios, jobs, analyses, provenance, audit)
                             ├─► R2 (analysis results, reports)
                             └─► Science API (FastAPI: SPICE + LOLA horizon)   ◄── Worker leases jobs via /api/internal
```

## Run locally (macOS)
```bash
npm run setup      # first time: Homebrew deps, npm + uv, .env.local with fresh secrets, data download + checksums, DB + migrations
npm run dev:all    # PostgreSQL :54329 → migrations → science API :8001 → web :3100 → worker
npm run health     # readiness of web, database, science, kernels, terrain and worker
```
Open **http://localhost:3100**. Verification/reset emails appear at **http://localhost:3100/dev/mail**. `npm run db:seed-dev` creates local demo accounts (passwords live only in `.env.local`). Details: `docs/LOCAL_DEVELOPMENT.md`.

## Scripts
| Script | Purpose |
|---|---|
| `npm run dev:all` / `dev` / `prod:local` | whole stack / web dev server / local production build on :3100 |
| `npm run lint` / `typecheck` / `test` | ESLint, TypeScript, Vitest |
| `npm run science:test` | pytest (48 scientific tests incl. JPL Horizons cross-check) |
| `npx playwright test` | E2E, security, accessibility and responsive/visual suites (stack on :3100) |
| `npm run db:migrate` / `db:generate` / `db:seed-dev` | migrations / new migration / local demo accounts |
| `npm run data:fetch` / `data:assets` | source products / derived map layers, demos and 3D grids |

## Design
"Traverse Field Book": parchment light theme and basalt-night dark theme, Newsreader + IBM Plex, copper traverse accents. Built with Impeccable (PRODUCT.md, DESIGN.md, design hook) and UI/UX Pro Max (`design-system/moonnav/MASTER.md`). See `docs/DESIGN_SYSTEM.md`.

## Documentation
- `docs/IMPLEMENTATION_STATUS.md` — **current requirement-by-requirement status (2026-11-11 completion pass)**
- `docs/API_REFERENCE.md`, `docs/DATA_SOURCES.md`, `docs/DATABASE_SETUP.md` (Supabase-ready, not connected), `docs/TESTING.md`
- `docs/COMPLETION_VERIFICATION_CHECKLIST.md` — **line-by-line proof that every brief objective, every checklist row and every documented TODO is addressed**
- `docs/IMPLEMENTATION_CHECKLIST.md` — every requirement with status and evidence
- `docs/SCIENTIFIC_METHODS.md` — equations, frames, assumptions, validation
- `docs/DATA_CATALOG.md` — products, versions, licences, checksums
- `docs/DECISION_LOG.md` — architecture and science decisions
- `docs/KNOWN_LIMITATIONS.md` — what this build cannot claim
- `docs/QA_EVIDENCE.md` — commands, results, browser flows, screenshots
- `docs/API.md`, `docs/openapi-science.json` — API reference
- `docs/DEPLOYMENT.md` — Vercel + Neon + R2 + Cloud Run
- `docs/FINAL_IMPLEMENTATION_REPORT.md` — current delivery report (`docs/FINAL_REPORT.md` is the first-session report)
- `docs/IMPLEMENTATION_STATUS_MATRIX.md`, `docs/MISSING_FEATURES_AND_GAPS.md`, `docs/REMAINING_WORK_ROADMAP.md`
- `docs/DESIGN_SYSTEM.md`, `docs/LOCAL_DEVELOPMENT.md`

## What is in this delivery (2026-11-11 final pass)

Beyond the completion-verification pass (2026-11-10/11), this ZIP closes every previously-documented engineering TODO:

1. **Web-triggered ingestion pipeline** — `/admin/ingestion` dashboard + `POST /api/v1/admin/products/[id]/ingest` walks discovered → fetching_label → label_parsed → downloading → downloaded → checksum_verified → validated, with every stage logged.
2. **Workspace member invitations by email** — `/invite/[token]` public acceptance page + 7-day revocable bearer tokens + mail driver integration; any email address can be invited (not just existing users).
3. **Analyst annotation surface** — `AnnotationsPanel.tsx` under every analysis; note / concern / approval / correction kinds; role-gated to analyst+; optional anchor into the result payload.
4. **Higher-resolution DEM support** — `lola-ldem-875s-5m-v1` catalogue entry (5 m/pixel, 87.5 S → pole) + `TestHigherResDem` (5 tests) proving the product-agnostic reader is ready.
5. **Playwright WebKit + Firefox** — `playwright.config.ts` now runs the full suite across chromium, webkit and firefox.

Verification: `npx tsc --noEmit` clean · `npx eslint` 0/0 · `npx vitest run` 32/32 · `uv run pytest` 32 passed / 21 skipped / 0 failed · `npx next build` 39 pages exit 0.
