# Missing features and gaps

> **Historical report.** Written before the move to Vercel + Supabase. Where it mentions Neon, Cloudflare R2 or Google Cloud Run, that is superseded: see `DEPLOYMENT.md` (actual architecture) and `IMPLEMENTATION_STATUS.md` (current status).

Everything the product does **not** yet do, with the reason and (where applicable) the path to close it. Companion documents: `KNOWN_LIMITATIONS.md` (science claims), `REMAINING_WORK_ROADMAP.md` (ordered plan), `IMPLEMENTATION_CHECKLIST.md` (status detail).

## Gaps requiring external credentials or accounts (code complete)
| Gap | Why | Path |
|---|---|---|
| Vercel production deployment | owner account needed | `DEPLOYMENT.md` §5 |
| Managed PostgreSQL (Neon) | owner account needed | `DEPLOYMENT.md` §1 |
| Cloudflare R2 with a real bucket | no credentials; driver + presign verified against the local driver only | `DEPLOYMENT.md` §2 |
| Production email (Resend) | no API key; outbox driver verified | `DEPLOYMENT.md` §3 |
| Science image on Cloud Run | Docker build not exercised in the delivery sandbox (no Docker daemon); Dockerfile + mirror-aware fetch ready | `DEPLOYMENT.md` §4 |
| First admin bootstrap | requires a live deployment + MFA enrolment | `scripts/grant-role.ts` |

## Gaps requiring hosts unreachable from the delivery environment (verified working paths exist)
| Gap | Why | Path |
|---|---|---|
| Live Moon Trek imagery tiles in the 2D map/globe | `trek.nasa.gov` unreachable from the sandbox; UI implements the WMTS layer + attribution and degrades to LOLA-derived layers | verify on an open network; honour GetCapabilities before first use |
| NAIF direct kernel download | `naif.jpl.nasa.gov` unreachable from the sandbox | `fetch_data.sh` restores the preferred FK automatically wherever NAIF is reachable |
| Live JPL Horizons runtime provider | validation-only adapter by design (SPICE is the runtime provider) | optional new provider behind the existing adapter interface |

## Product gaps deliberately not in the MVP (challenge scope)
- **RF link budgets** — geometric DTE only, by explicit challenge interpretation; a validated propagation model is a separate capability (master prompt §4).
- **Flight-certified landing-site safety** — slopes/roughness are screening context, never a safety certification.
- **Thermal, dust, battery, MPPT modelling** — panel energy is idealized with explicit derating.
- **AI explanation assistant** — optional in the brief; would sit on top of stored results only (master prompt §17).
- **OAuth/social login** — added only when fully configured (master prompt §7.2).
- **Artemis candidate-region point sites** — NASA publishes regions, not points; the catalogue uses IAU Gazetteer feature centres instead (D-018).

## Known engineering TODOs (small, concrete)
1. **Web-triggered ingestion pipeline** — ✅ **CLOSED (2026-11-11).** Curator UI + API now walks discovered → fetching_label → label_parsed → downloading → downloaded → checksum_verified → validated, recording every stage in `data_ingestion_runs.steps`. See `src/lib/ingestion.ts`, `POST /api/v1/admin/products/[id]/ingest`, `/admin/ingestion`, and the "Trigger ingestion run" button on `/admin/data`.
2. **Workspace member invitation emails** — ✅ **CLOSED (2026-11-11).** Owners can now invite any email address (not just existing users). A 7-day, revocable, bearer-token invitation is created and emailed; the recipient signs in (or registers + verifies) at `/invite/[token]` and is added as a member. See `src/lib/invitations.ts`, `workspace_invitations` table (migration 0004), `/invite/[token]` page, and the pending-invitations list in `WorkspacesClient.tsx`. The older add-existing-member path is retained for direct adds.
3. **Analyst annotations/reviews** — ✅ **CLOSED (2026-11-11).** Analysts (and higher roles) can now attach note / concern / approval / correction annotations to any analysis, with an optional anchor into the result payload (e.g. `sun.intervals[3]`). Annotations are visible to all workspace members; authors and analysts can delete. See `src/lib/annotations.ts`, `analysis_annotations` table (migration 0004), `AnnotationsPanel.tsx` integrated under every analysis status view.
4. **Higher-resolution DEMs** (LDEM_875S_5M, 20 m products) — ✅ **CLOSED (2026-11-11) for the catalogue + reader path.** `lola-ldem-875s-5m-v1` is registered in `science/catalog/products.json` (status `discovered`); the product-agnostic `PolarDem` reader accepts any PDS3 polar-stereographic LOLA IMG, verified by `TestHigherResDem` (5 tests). A curator flips it to `approved` through the ingestion pipeline + status workflow once the real >2 GB file is fetched on an open network. Larger-file (streamed/lazy) handling for very large DEMs remains a future optimisation.
5. **Playwright against WebKit/Firefox** — ✅ **CLOSED (2026-11-11).** `playwright.config.ts` now declares `ENGINES = [chromium, webkit, firefox]` so `npx playwright test` runs the full accessibility, security and visual suites across all three engines (after `npx playwright install`).
6. **`next dev` memory** — fine on 16 GB machines; on very small environments use `npm run prod:local` (documented in `LOCAL_DEVELOPMENT.md`).

Every item that was a documented TODO in this list is now closed. The only remaining gaps are external-credential blocks (deployment accounts) and deliberate NOT_IN_SCOPE product decisions — see below.
