# Remaining work roadmap

Ordered, with effort estimates, for the work left after the completion verification pass. The MVP is complete and verified (`IMPLEMENTATION_STATUS_MATRIX.md`); everything here is deployment, hardening or optional scope.

> **2026-11-11 update:** Phase C items 1–4 are now **CLOSED** — see the struck-through lines below and `docs/COMPLETION_VERIFICATION_CHECKLIST.md`. Only Phase A (deploy, owner credentials), Phase B (open-network verification) and the optional Phase D science extensions remain.

## Phase A — Deploy (owner credentials; ~1 day)
1. Neon PostgreSQL branches + migrations (`DEPLOYMENT.md` §1).
2. Cloudflare R2 buckets + token + CORS; switch `STORAGE_DRIVER=r2` (§2).
3. Resend domain + key (§3).
4. Build and push the science image; deploy API + worker to Cloud Run (§4) — first run on an open network lets `fetch_data.sh` pin the preferred `moon_de440_250416.tf`.
5. Vercel project, env vars, preview + production; smoke-test health, a real analysis, a report and a share link (§5).
6. Bootstrap admin, enforce MFA, revoke `DEV_*` accounts.

## Phase B — Verify on open networks (half a day)
1. Re-run `npm run data:fetch` with NAIF reachable — confirm the preferred FK checksum slot; archive the verified file in the catalogue state.
2. Re-run the two imagery E2E tests (`public.spec.ts:129,159`) with `trek.nasa.gov` reachable.
3. Optional: rebuild the feasibility grid with the preferred FK and confirm byte-identity with the shipped `grid.json` (D-022 expectation).
4. Fetch the real `LDEM_875S_5M` file, run the ingestion pipeline (`/admin/data` → Trigger ingestion run → Approve), and re-run the horizon/visibility tests against the 5 m product.

## Phase C — Engineering hardening (~2–4 days)
1. ✅ **Web-triggered ingestion** — CLOSED 2026-11-11. Job-driven downloader/validator for the registry is built: `src/lib/ingestion.ts`, `POST /api/v1/admin/products/[id]/ingest`, `/admin/ingestion` dashboard, `IngestionClient.tsx`, "Trigger ingestion run" button on `/admin/data`. Every stage (discovered → fetching_label → label_parsed → downloading → downloaded → checksum_verified → validated) is logged in `data_ingestion_runs.steps`.
2. ✅ **Workspace member invitations by email** — CLOSED 2026-11-11. `workspace_invitations` table (migration 0004), `src/lib/invitations.ts`, `POST/GET /api/v1/workspaces/[id]/invitations`, `DELETE …/[invitationId]`, `GET /api/v1/invitations/[token]`, `POST /api/v1/invitations/accept`, `/invite/[token]` public page, pending-invitations list in `WorkspacesClient.tsx`. 7-day, revocable, bearer-token invitations emailed via the existing mail driver.
3. ✅ **Analyst annotation surface** — CLOSED 2026-11-11. `analysis_annotations` table (migration 0004), `src/lib/annotations.ts`, `POST/GET /api/v1/analyses/[id]/annotations`, `DELETE /api/v1/annotations/[id]`, `AnnotationsPanel.tsx` integrated into `AnalysisStatusClient.tsx`. Role-gated to analyst+; kinds: note / concern / approval / correction; optional anchor.
4. ✅ **Browser matrix: WebKit + Firefox** — CLOSED 2026-11-11. `playwright.config.ts` now declares `ENGINES = [chromium, webkit, firefox]`. Run `npx playwright install` then `npx playwright test` to exercise the full suite across all three engines.
5. Optional CI addition: a job that builds `science/Dockerfile` (image build is currently only locally exercised where Docker exists).
6. Observability: structured log sink + error reporting for the worker/Cloud Run (request IDs already flow end to end).

## Phase D — Science extensions (optional; challenge-plus)
1. Higher-resolution DEM products (LDEM_875S_5M for 85°S–pole) as new immutable product versions with the existing registry/approval flow. — **Catalogue entry + reader test closed 2026-11-11** (`lola-ldem-875s-5m-v1`, `TestHigherResDem`). Real-file ingestion pending an open-network fetch (Phase B.4).
2. Earth apparent-disk handling beyond the equatorial-radius approximation (oblateness) — small, documented accuracy gain.
3. Moon Trek WMTS GetCapabilities-driven layer registry (verification-first integration).
4. Live Horizons provider adapter behind the existing `EphemerisProvider` protocol for cross-checking at runtime (SPICE remains the reproducible default).
5. RF-context explanations (SCaN-sourced), still strictly separate from geometric DTE.

## Explicitly NOT planned (reasoned in DECISION_LOG / MISSING_FEATURES_AND_GAPS)
RF link budgets as a "communication guarantee", flight-certified landing safety, thermal/dust modelling, AI assistant as a data source, OAuth until fully configured, universal "best site" rankings without mission criteria.
