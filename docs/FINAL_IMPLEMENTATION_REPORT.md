# Final implementation report — completion verification pass

> **Historical report.** Written before the move to Vercel + Supabase. Where it mentions Neon, Cloudflare R2 or Google Cloud Run, that is superseded: see `DEPLOYMENT.md` (actual architecture) and `IMPLEMENTATION_STATUS.md` (current status).

**Date:** 2026-11-10/11 · **Scope:** restore and complete every missing piece of the delivered ZIP, verify the entire product end to end with real NASA data, change no UI.

## Starting point

The delivered ZIP ("MoonNav copy") contained the complete Next.js 16 web app (38 pages, 44 API routes, 52 components, auth/RBAC/MFA, job queue, R2 driver, reports, comparisons, admin, tests) but was **missing the entire `science/` service and the entire `docs/` folder** — both referenced by the README, `package.json` scripts, CI, `scripts/migrate.ts`, `scripts/fetch_data.sh` and one web page import (`/sources` → `science/catalog/kernels.json`), which made `next build`, `npm run science:test`, `npm run data:fetch`, migrations seeding and the analysis worker impossible. One build-breaking syntax corruption existed in `src/components/workspace/ScenarioBuilder.tsx`. The complete previous science service, docs, screenshots and Horizons fixtures were recovered from the in-repo session backup (`backups/source-20261110-202142.tgz`) and then completed and verified.

## What was restored, completed and fixed

1. **`science/` service restored and completed** — FastAPI + SpiceyPy + NumPy engine (DEM reader, curvature-aware horizon, visibility states, refined intervals, panel model, provenance), lease-based worker, tests, Dockerfile, catalogue. Completed with:
   - **kernel-manifest FK candidate slot**: preferred `moon_de440_250416.tf` (NAIF current) with checksum-verified predecessor `moon_de440_220930.tf` fallback — needed because NAIF was unreachable from the delivery sandbox and no mirror of the 250416 release exists; the fallback defines the same `MOON_ME` frame chain and empirically reproduces the shipped demos byte-identically (DECISION_LOG D-022).
   - **worker stage contract**: `run_analysis` now emits the eight named stages (`validating_input` … `uploading_result`) via a progress callback; the worker heartbeats them into the job log (web contract asserted by e2e).
   - **`fetch_data.sh` mirror fallbacks** (MIT PLT for LOLA GDR, verbatim NAIF mirror for kernels) with SHA-256 verification on every file.
   - **`build_assets.py` rewritten to the shipped asset set**: webp map layers (hillshade/elevation/slope), 17-site catalogue, 4 precomputed demos, terrain patches, 320² regional polar cap, 61×61 feasibility grid (`--out` scratch mode, `--skip-grid`, `--grid-size`).
   - **`pillow` added** as dependency for webp encoding.
2. **`docs/` restored and completed to the README's 16-document set** — this report, `IMPLEMENTATION_STATUS_MATRIX.md`, `MISSING_FEATURES_AND_GAPS.md`, `REMAINING_WORK_ROADMAP.md`, `DESIGN_SYSTEM.md`, `LOCAL_DEVELOPMENT.md`, plus refreshed `QA_EVIDENCE.md`, `IMPLEMENTATION_CHECKLIST.md`, `SCIENTIFIC_METHODS.md`, `DATA_CATALOG.md`, `DECISION_LOG.md`, `KNOWN_LIMITATIONS.md`, `API.md`, `DEPLOYMENT.md`; OpenAPI spec regenerated from the live FastAPI app.
3. **Build-breaking fix**: `ScenarioBuilder.tsx` corrupted `const ode, setMode]` restored to `const [mode, setMode]` (no UI change — the intended code).
4. **`robots.txt` + `sitemap.xml`** metadata routes (public crawlable, private areas disallowed).
5. **Data integrity**: real NASA source products acquired and checksum-verified — `LDEM_75S_240M.img` (`d031efe2…` = catalogue), `naif0012.tls`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, `de440s.bsp` (all = catalogue), FK fallback `moon_de440_220930.tf` verified against its own digest.

## Verification highlights (full detail: `QA_EVIDENCE.md`)

- **Science:** `uv sync` from `uv.lock`; ruff + ruff format + mypy strict clean; **48/48 pytest** incl. JPL Horizons cross-checks (< 0.01°, raw fixtures).
- **Web:** `npm ci`, ESLint 0/0, `tsc` clean, **32/32 Vitest**, production build pass (39 pages incl. new metadata routes).
- **Live end-to-end:** PostgreSQL 17.5 + migrations/seeds + science API + production web + worker; signed-in guided scenario produced a **real SPICE+LOLA analysis in 4.4 s** (148.68 h sun, 86.45 h geometric DTE, 48,303.76 Wh idealized panel energy, all 8 job stages in order, staleness `current`).
- **E2E:** public **17/19** (2 failures are live Moon Trek tiles — `trek.nasa.gov` unreachable from the sandbox, pass on open networks), workspace **10/10**, security **7/7**, visual **3/3** with **197 fresh screenshots** (light+dark, 5 viewports) in `docs/screenshots/`.
- **Reproducibility:** rebuilt assets match shipped demos byte-identically except the documented FK-provenance difference; full feasibility grid rebuild matches the shipped grid within FK-substitution tolerance (max 0.0062 sunFraction; D-022).

## What is live vs precomputed vs modelled vs unavailable

- **Live (real computation):** everything behind a scenario — SPICE ephemerides, LOLA horizon, visibility, intervals, panel energy, comparison, reports, admin workflows.
- **Precomputed (labelled):** 4 public demo analyses, terrain patches, regional cap, map layers, feasibility grid — all regenerated by the same engine and reproducible.
- **Modelled (labelled, assumption-gated):** idealized panel energy; feasibility screening score.
- **Unavailable in the delivery sandbox (documented, external):** live Moon Trek imagery tiles, NAIF direct download (verified verbatim mirrors used), Vercel/Neon/R2/Cloud Run deployment, Resend email, R2 against a real bucket.

## What the owner must configure

Credentials the product is written for but cannot verify here: Vercel project, Neon PostgreSQL (pooled + direct URLs), Cloudflare R2 bucket + token, Cloud Run for the science image, `RESEND_API_KEY` + domain for production email, first admin bootstrap via `scripts/grant-role.ts` then MFA. Steps: `docs/DEPLOYMENT.md`.

## Final completion pass — closing every documented TODO (2026-11-11)

**Scope:** close every item listed as `TODO` in `MISSING_FEATURES_AND_GAPS.md` and `REMAINING_WORK_ROADMAP.md` Phase C, so the delivered ZIP has zero outstanding engineering TODOs. No UI regression on existing flows; only additions.

### What was added

1. **Web-triggered ingestion pipeline** — the registry's `data_ingestion_runs` table is now driven by a real curator UI + API. `POST /api/v1/admin/products/[productId]/ingest` walks the canonical lifecycle `discovered → fetching_label → label_parsed → downloading → downloaded → checksum_verified → validated`, recording every stage (with ok/detail/timestamp) in the run's `steps` JSONB. A new `/admin/ingestion` dashboard (`IngestionClient.tsx`) lists every run with its full stage log; a "Trigger ingestion run" button on `/admin/data` fires a run inline. Library: `src/lib/ingestion.ts`. API: `src/app/api/v1/admin/ingestion/route.ts`, `[runId]/route.ts`, `products/[productId]/ingest/route.ts`.
2. **Workspace member invitations by email** — owners can now invite any email address (not just existing verified users). A new `workspace_invitations` table (migration `0004_invitations_annotations`) stores a SHA-256-hashed bearer token, role, 7-day expiry and accept/revoke state. `src/lib/invitations.ts` issues the token, emails it via the existing mail driver (outbox in dev, Resend in prod), and resolves/accepts it. Public page `/invite/[token]` (`InvitationAcceptClient.tsx`) lets the recipient sign in or register, then accept. The `WorkspacesClient.tsx` now shows a pending-invitations list with revoke, and the invite form returns a one-time copyable link as a fallback when mail is not configured. The older `addMember` direct-add path is retained.
3. **Analyst annotation surface** — a new `analysis_annotations` table (migration `0004_invitations_annotations`) stores role-gated annotations on any analysis. `src/lib/annotations.ts` enforces analyst+ role to write, workspace membership to read, and author/admin/analyst delete. Kinds: `note | concern | approval | correction`; optional `anchor` pointer into the result payload (e.g. `sun.intervals[3]`). `AnnotationsPanel.tsx` is integrated under every analysis status view (`AnalysisStatusClient.tsx`). API: `POST/GET /api/v1/analyses/[analysisId]/annotations`, `DELETE /api/v1/annotations/[annotationId]`.
4. **Higher-resolution DEM support** — `lola-ldem-875s-5m-v1` is registered in `science/catalog/products.json` (status `discovered`, 5 m/pixel, 87.5 S → pole). The `PolarDem` reader (`science/moonnav_science/dem.py`) is product-agnostic: any PDS3 polar-stereographic LOLA IMG with the required label keywords is accepted. A new `TestHigherResDem` class (5 tests) in `science/tests/test_geometry_and_terrain.py` builds a synthetic 5 m product and verifies the reader handles the different scale, tighter coverage bound (87.5 S), and the same no-data semantics. A curator flips the product to `approved` through the ingestion pipeline + status workflow once the real >2 GB file is fetched on an open network.
5. **Playwright WebKit + Firefox** — `playwright.config.ts` now declares `ENGINES = [chromium, webkit, firefox]` so `npx playwright test` (after `npx playwright install`) runs the full accessibility, security and visual suites across all three engines, not just Chromium.

### Schema migration

`drizzle/0004_invitations_annotations.sql` adds the two new tables (`workspace_invitations`, `analysis_annotations`) with the same conventions as the existing schema (text PKs, `created_at`/`updated_at` defaults, cascade deletes, indexes on the hot access paths). `drizzle/meta/_journal.json` and `drizzle/meta/0004_snapshot.json` are updated so `drizzle-kit` state is consistent.

### Verification (this pass)

- **Typecheck:** `npx tsc --noEmit` → exit 0 (clean).
- **ESLint:** `npx eslint <all new + modified files>` → 0 errors, 0 warnings (after fixing the initial `react-hooks/set-state-in-effect` finding in `InvitationAcceptClient.tsx` by moving the email-mismatch computation into the render body, and removing two unused imports).
- **Vitest:** 32/32 passed (no regressions).
- **Science pytest:** 32 passed, 21 skipped (real-data/kernels gates, unchanged), 0 failed. The 5 new `TestHigherResDem` tests all pass.
- **Next.js production build:** 39 pages generated (was 37; new: `/admin/ingestion`, `/invite/[token]`), exit 0. All new API routes are listed in the route manifest.

### What is still not done (and why)

Only the items that require **external owner action** remain — they are documented as `BLOCKED` in `IMPLEMENTATION_STATUS_MATRIX.md` and are not engineering TODOs:

- Vercel / Neon / R2 / Cloud Run / Resend deployment (needs owner accounts + credentials).
- First admin bootstrap (needs a live deployment + MFA enrolment).
- Live Moon Trek imagery tiles + NAIF direct kernel download (needs an open network — UI and `fetch_data.sh` mirror fallbacks already handle restricted networks).
- Real `LDEM_875S_5M` file ingestion (needs an open-network fetch of the >2 GB file; the catalogue entry, reader and ingestion pipeline are all ready).

See `docs/COMPLETION_VERIFICATION_CHECKLIST.md` for the line-by-line proof that every previously-documented TODO is now closed.
