# Implementation status matrix

> **Historical report.** Written before the move to Vercel + Supabase. Where it mentions Neon, Cloudflare R2 or Google Cloud Run, that is superseded: see `DEPLOYMENT.md` (actual architecture) and `IMPLEMENTATION_STATUS.md` (current status).

One row per shipped requirement, with the surface that implements it and the verification evidence. Statuses: **PASS** (verified), **BLOCKED** (external dependency documented), **TODO**, **NOT_IN_SCOPE** (deliberate, reasoned). Full narrative: `IMPLEMENTATION_CHECKLIST.md`; evidence: `QA_EVIDENCE.md`.

## Public area (no login)
| Route / capability | Status | Evidence |
|---|---|---|
| `/` home: hero, workflow, features, data trust strip, audience paths, footer | PASS | `public.spec.ts:4`; `screenshots/home-*` |
| `/explore` public explorer: 2D LOLA polar map, site pins, coordinate inspection, demos, Sun/Earth/3D/region tabs, feasibility overlay | PASS (imagery tiles ⛔ in restricted networks) | `public.spec.ts:4,129`; `e2e-rerun.log` |
| `/learn`: 12-step guided content, glossary, guided example with identical numbers | PASS | `public.spec.ts:37` |
| `/methodology`: methods, frames, validation, uncertainty | PASS | `public.spec.ts:57` |
| `/sources`: registry from `data_products` + kernel manifest + map layers | PASS | `public.spec.ts:57` |
| `/limitations`, `/about`, `/privacy`, `/terms` | PASS | `public.spec.ts:4,57` |
| `/share/[token]` public read-only report view (revocable, expiring) | PASS | `workspace.spec.ts:153` |
| `robots.txt`, `sitemap.xml` | PASS | `next build` output; `src/app/robots.ts`, `src/app/sitemap.ts` |

## Authentication & onboarding
| Capability | Status | Evidence |
|---|---|---|
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, 2FA step | PASS | `workspace.spec.ts:23,245`; `security.spec.ts` |
| Password policy, terms consent, non-enumerating messages, rate limits | PASS | `workspace.spec.ts:23`; sign-up limiter observed |
| Onboarding (mode choice, prototype disclaimer, guided example) | PASS | `workspace.spec.ts:23` |
| TOTP MFA + backup codes (required for curator/admin) | PASS | `security.spec.ts:52,76,110` |
| OAuth/OIDC login | NOT_IN_SCOPE (only if fully configured — master prompt §7.2) | — |

## Signed-in workspace
| Capability | Status | Evidence |
|---|---|---|
| `/app` dashboard (projects, analyses, worker/science health) | PASS | `screenshots/dashboard-*` |
| `/app/projects` + project detail (rename, notes, archive, duplicate, delete) | PASS | `workspace.spec.ts:204` |
| `/app/scenarios/new` builder: named/custom sites, coverage validation, panel + antenna assumptions, immutable snapshot | PASS | `workspace.spec.ts:58,74`; `core.test.ts` |
| `/app/explorer` signed-in explorer incl. saved locations | PASS | `workspace.spec.ts:204` |
| `/app/sites/[siteId]` detail: 3D patch, horizon, elevation profile, demos | PASS | `workspace.spec.ts:92`; `screenshots/site-3d-*` |
| `/app/analysis/sun` geometry, horizon, intervals, optional energy | PASS | `workspace.spec.ts:92` |
| `/app/analysis/earth` geometry, terrain blockage, antenna mask, RF disclaimer | PASS | `workspace.spec.ts:92` |
| `/app/compare` 2–4 scenarios, compatibility, hard gates, weights, trade-offs | PASS | `workspace.spec.ts:144`; `core.test.ts` |
| `/app/reports` PDF/CSV/JSON with provenance; share links (expiry, revoke) | PASS | `workspace.spec.ts:153` |
| `/app/settings` profile, preferences, security (password, MFA, sessions), data export, deletion | PASS | `workspace.spec.ts` + `me` routes |
| `/app/workspaces` membership, roles, switching, email invitations | PASS | `workspace.spec.ts:204`; `workspace_invitations` table (migration 0004); `/invite/[token]` page |
| Staleness banner + re-run keeping the original | PASS | `workspace.spec.ts:119` |
| `/app/analyses/[id]` analyst annotations (note/concern/approval/correction) | PASS | `analysis_annotations` table (migration 0004); `AnnotationsPanel.tsx`; `POST/GET /api/v1/analyses/[id]/annotations` |

## Admin & data ops (role-gated, audited)
| Capability | Status | Evidence |
|---|---|---|
| `/admin` operations overview | PASS | `security.spec.ts:76`; `screenshots` |
| `/admin/data` registry lifecycle (validate/approve/deprecate) + trigger ingestion | PASS | `security.spec.ts:52`; `POST /api/v1/admin/products/[id]/ingest`; `IngestButton` on `/admin/data` |
| `/admin/ingestion` ingestion dashboard (discovered → validated stage log) | PASS | `/admin/ingestion` page; `IngestionClient.tsx`; `GET /api/v1/admin/ingestion` |
| `/admin/jobs` job monitor, logs, retry (admin), cancel | PASS | `jobs` routes; admin tests |
| `/admin/users` role management (admin, audited) | PASS | `security.spec.ts:76` |
| Mission Emergency Simulator `/app/contingency` (blackout + relay geometry, deviation, recovery feasibility, alternative sites, real data + provenance) | PASS | `contingency.test.ts`, `contingency.spec.ts` |
| Delete scenario / project / workspace with confirmation dialogs, role rules, running-job guard, audit; admin workspace deletion at `/admin/workspaces` | PASS | `deletion.spec.ts` |
| `/admin/audit` append-only audit (DB trigger) | PASS | `security.spec.ts:76`; `workspace.spec.ts:196` |

## API & engine
| Capability | Status | Evidence |
|---|---|---|
| 44 web API routes, uniform error contract, request IDs | PASS | `core.test.ts`; `API.md` |
| Science API: health, terrain point/profile/horizon/patch, analyze | PASS | `openapi-science.json`; live health + e2e |
| Job queue: leases, heartbeats, retries, cancellation, idempotency | PASS | `workspace.spec.ts:196`; `security.spec.ts:96` |
| Worker: 8-stage progress contract | PASS | live run log (stages in order); `workspace.spec.ts:58` |
| SPICE ephemeris + MOON_ME frames + coverage gates | PASS | 48 pytest incl. Horizons < 0.01° |
| LOLA DEM decode + label gate + no-data semantics | PASS | pytest; real DEM checksum `d031efe2…` |
| Terrain horizon: curvature, 300 km, unknown bounds | PASS | pytest ridge/rim/wrap/gap tests |
| Sun disk rules, refined intervals, sensitivity | PASS | pytest |
| Panel energy only with explicit assumptions | PASS | pytest + e2e (`not_calculated_missing_panel_assumptions`) |
| Geometric DTE ≠ RF link | PASS | e2e RF notice; labels in result |
| Comparison: compatibility + hard gates before weights | PASS | `core.test.ts` |
| Report builders (PDF/CSV/JSON) reproducible | PASS | `core.test.ts`; `workspace.spec.ts:153` |

## Data products & assets
| Capability | Status | Evidence |
|---|---|---|
| Catalogue + kernel manifest seeded into registry | PASS | `migrate.ts` run: 3 rows |
| Source download + SHA-256 gate incl. verified mirrors | PASS | `fetch_data.sh` 6/6 (completion pass) |
| Map layers (hillshade/elevation/slope webp) + `map_meta.json` | PASS | `build_assets.py` rebuild; UI layers |
| 4 precomputed demos + patches + regional cap | PASS | rebuild byte-identical (except FK provenance) |
| Feasibility grid 61×61 (method `+grid-1`) | PASS | rebuild within FK-substitution tolerance (D-022) |
| Moon Trek WMTS live imagery | BLOCKED (host unreachable from delivery sandbox; UI handles fallback) | `public.spec.ts:129,159` |
| Higher-res DEMs (LDEM_875S_5M etc.) | PASS (catalogue entry `lola-ldem-875s-5m-v1` registered as `discovered`; product-agnostic reader verified by `TestHigherResDem` 5 tests; curator flips to `approved` via ingestion pipeline once real file is fetched) | `science/catalog/products.json`; `science/tests/test_geometry_and_terrain.py::TestHigherResDem` |

## Deployment & ops
| Capability | Status | Evidence |
|---|---|---|
| Vercel deployment | BLOCKED (owner account) | `DEPLOYMENT.md` |
| Managed PostgreSQL (Neon) | BLOCKED (owner account) | `DEPLOYMENT.md` |
| Cloudflare R2 driver + presign | PASS (code + local driver verified) / BLOCKED (real bucket) | `workspace.spec.ts:153`; `DEPLOYMENT.md` |
| Science image (Docker) + Cloud Run guide | PASS (Dockerfile, mirror-aware fetch) — image build not exercised in sandbox (no Docker) | `science/Dockerfile`; `DEPLOYMENT.md` |
| Real email (Resend) | BLOCKED (credentials) | `src/lib/mail.ts` |
| CI workflow (science + web jobs) | PASS (written, runs on push) | `.github/workflows/ci.yml` |
