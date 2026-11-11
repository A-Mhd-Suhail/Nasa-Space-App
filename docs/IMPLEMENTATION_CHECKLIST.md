# Implementation checklist

Statuses: PASS (verified, evidence cited) · IN_PROGRESS · BLOCKED (external dependency) · TODO · NOT_IN_SCOPE. Evidence refers to `docs/QA_EVIDENCE.md` and test files.

## Product and UI (brief §19)
| Requirement | Status | Evidence |
|---|---|---|
| Premium landing page, truthful value proposition, working CTAs | PASS | `public.spec.ts:4`; `screenshots/home-*.png` |
| Public lunar explorer works without an account | PASS | `public.spec.ts:4` |
| Learn (12 steps, glossary, guided example), Methodology, Sources with meaningful content | PASS | `public.spec.ts:37,57` |
| Login, register, verification, reset, onboarding | PASS | `workspace.spec.ts:23` (register/verify/onboarding), `workspace.spec.ts:167` (reset, old sessions revoked) |
| Dashboard + project workspace (create, rename, duplicate, archive, notes) | PASS | `workspace.spec.ts:58`; `screenshots/dashboard-*` |
| Scenario builder validates and persists immutable inputs | PASS | `workspace.spec.ts:58,74`; `core.test.ts` contract tests |
| 2D map with sourced layers and verified site markers | PASS | `public.spec.ts:4` |
| 3D scene uses documented elevation; provenance visible | PASS (LOLA terrain patch; imagery texture NOT_IN_SCOPE this build) | `screenshots/site-3d-*` |
| Sun & Power shows real outputs or why unavailable | PASS | `workspace.spec.ts:92` |
| Earth & DTE distinguishes geometry from RF | PASS | `workspace.spec.ts:92`, `public.spec.ts:4` |
| Comparison of 2–4 scenarios with trade-offs | PASS | `workspace.spec.ts:108`, `core.test.ts` |
| PDF/CSV/JSON reports with provenance and assumptions | PASS | `workspace.spec.ts:117`, `core.test.ts` |
| Admin/data pages role-protected and audited | PASS | `security.spec.ts:39,52,76` |
| Desktop, tablet, mobile usable | PASS | `visual.spec.ts` |
| Global Moon sphere with imagery texture | NOT_IN_SCOPE (no licensed imagery product registered; see KNOWN_LIMITATIONS) | — |

## Science and data
| Requirement | Status | Evidence |
|---|---|---|
| No synthetic terrain described as LOLA | PASS | synthetic DEM only in unit tests (`SyntheticDem`, labelled) |
| Real ephemeris provider integrated | PASS | SPICE DE440; `test_spice_matches_horizons` |
| Frame/coordinate/time conversions documented and tested | PASS | `SCIENTIFIC_METHODS.md`; geometry + time tests |
| ≥1 documented LOLA DEM decoded and validated end to end | PASS | `TestRealLola`; checksum gate |
| Horizon includes curvature and no-data semantics | PASS | curvature + gap tests |
| Sun intervals pass refinement tests | PASS | interval + sensitivity tests |
| Solar power only with explicit assumptions | PASS | `test_analysis_without_panel_reports_no_energy` |
| DTE terrain-aware and distinct from RF | PASS | `test_dte_mask_…` |
| Comparison checks compatibility, hard gates before weights | PASS | `core.test.ts` comparison block |
| Every analysis has reproducible provenance | PASS | `test_analysis_is_deterministic`; stored SHA-256 |
| Horizons adapter (request/parse) | PASS (validation use); live runtime provider NOT_IN_SCOPE | fixtures |
| Moon Trek WMTS adapter | PASS (WMTS imagery layer + attribution in UI; live tiles require an open network) | `public.spec.ts:129,159`; `LunarMap.tsx`, `GlobeScene.tsx` |
| Automated web-triggered ingestion pipeline | PASS (curator UI + API: discovered → fetching_label → label_parsed → downloading → downloaded → checksum_verified → validated; `/admin/ingestion` dashboard) | `src/lib/ingestion.ts`; `POST /api/v1/admin/products/[id]/ingest`; `/admin/ingestion`; `IngestionClient.tsx` |

## Engineering and operations
| Requirement | Status | Evidence |
|---|---|---|
| Production persistence is PostgreSQL | PASS | Drizzle migrations; no SQLite |
| R2 stores scientific assets/reports with secure access | IN_PROGRESS / BLOCKED (driver + presign implemented; verified with local driver + signed URLs; no R2 credentials) | `workspace.spec.ts:117` |
| Vercel deployment configured | BLOCKED (account) | `DEPLOYMENT.md` |
| Science API/worker deployable independently and documented | PASS (Dockerfile with mirror-aware fetch + guide; image build not exercised where no Docker daemon exists) | `science/Dockerfile`; `DEPLOYMENT.md` |
| Migrations run on fresh and existing DB | PASS | `qa/migrations.log` |
| Secrets not committed or in client bundles | PASS (`.env*.local` ignored; `server-only` env module; no `NEXT_PUBLIC_` secrets) | `.gitignore`, `src/lib/env.ts` |
| RBAC, MFA, rate limits, object ownership tested | PASS | `security.spec.ts`; rate limit observed in full run |
| Lint, typecheck, unit, integration, E2E, build pass | PASS | `QA_EVIDENCE.md` |
| Screenshots and QA evidence saved | PASS | `docs/screenshots`, `docs/qa` |
| No dead buttons, broken routes, console errors, fake "live" status | PASS (console errors asserted on explore; status pill reads `/api/v1/health`) | `public.spec.ts:4` |
| CI workflow | PASS (written; runs on push once a remote exists) | `.github/workflows/ci.yml` |
| Real email delivery | BLOCKED (needs `RESEND_API_KEY` + domain) | `src/lib/mail.ts` |
| OAuth/social login | NOT_IN_SCOPE (only if fully configured) | — |
| AI assistant | NOT_IN_SCOPE (optional; not a core MVP blocker) | — |
| Workspace member invitations UI (email-based, 7-day token, accept flow) | PASS | `workspace_invitations` table (migration 0004); `/invite/[token]` page; `WorkspacesClient.tsx` invite form + pending list |

## Completion verification pass additions (2026-11-10/11)
| Requirement | Status | Evidence |
|---|---|---|
| science/ service + docs/ restored from session backup and completed | PASS | `FINAL_IMPLEMENTATION_REPORT.md` |
| Kernel manifest FK candidate slot (preferred release + verified fallback, disclosure warning) | PASS | `kernels.json`; `D-022`; warning asserted in rebuild diff |
| Worker 8-stage progress contract | PASS | live run: stages in order; `workspace.spec.ts:58` |
| Source products verified against real NASA files (incl. mirrors) | PASS | `fetch_data.sh` 6/6; `QA_EVIDENCE.md` |
| build_assets.py reproduces shipped demos + grid within tolerance | PASS | `QA_EVIDENCE.md`; `D-024` |
| robots.txt + sitemap.xml | PASS | `next build`; `src/app/robots.ts`, `src/app/sitemap.xml` via `sitemap.ts` |
| Live end-to-end analysis on real data through the full stack | PASS | sun 148.68 h / DTE 86.45 h / 48,303.76 Wh in 4.4 s; `QA_EVIDENCE.md` |

## Final completion pass — closing every documented TODO (2026-11-11)
| Requirement | Status | Evidence |
|---|---|---|
| Web-triggered ingestion pipeline (discovered → downloaded → validated, job-driven, UI + API) | PASS | `src/lib/ingestion.ts`; `POST /api/v1/admin/products/[id]/ingest`; `GET /api/v1/admin/ingestion`; `/admin/ingestion` page + `IngestionClient.tsx`; "Trigger ingestion run" button on `/admin/data` |
| Workspace member invitations by email (any address, 7-day token, mail, accept flow, revoke) | PASS | `src/lib/invitations.ts`; `workspace_invitations` table (migration 0004); `POST/GET /api/v1/workspaces/[id]/invitations`; `DELETE …/[invitationId]`; `GET /api/v1/invitations/[token]`; `POST /api/v1/invitations/accept`; `/invite/[token]` public page + `InvitationAcceptClient.tsx`; pending-invitations list in `WorkspacesClient.tsx` |
| Analyst annotation surface (note/concern/approval/correction, role-gated, anchored) | PASS | `src/lib/annotations.ts`; `analysis_annotations` table (migration 0004); `POST/GET /api/v1/analyses/[id]/annotations`; `DELETE /api/v1/annotations/[id]`; `AnnotationsPanel.tsx` integrated into `AnalysisStatusClient.tsx` |
| Higher-resolution DEM support (LDEM_875S_5M catalogue entry + reader test) | PASS | `science/catalog/products.json` (new `lola-ldem-875s-5m-v1` row, status `discovered`); `TestHigherResDem` (5 tests) in `science/tests/test_geometry_and_terrain.py` |
| Playwright WebKit + Firefox projects (browser matrix) | PASS | `playwright.config.ts` `ENGINES = [chromium, webkit, firefox]` |
| Migration 0004 (workspace_invitations + analysis_annotations) | PASS | `drizzle/0004_invitations_annotations.sql`; `drizzle/meta/_journal.json` entry 4; `drizzle/meta/0004_snapshot.json` |
| Typecheck clean after all additions | PASS | `npx tsc --noEmit` → exit 0 |
| ESLint clean after all additions | PASS | `npx eslint <new files>` → 0 errors, 0 warnings |
| Vitest clean after all additions | PASS | 32/32 passed |
| Science pytest clean after all additions | PASS | 32 passed, 21 skipped (real-data gates), 0 failed |
| Next.js production build clean after all additions | PASS | 39 pages generated, exit 0 |
