# Final implementation report — 2026-11-10

## Starting point
The GLM 5.2 implementation described in the brief was **not present** on this machine (empty `MoonNav/` folder; no source, log or database found). MoonNav was built from scratch; none of GLM's claimed results were reused or reproduced (DECISION_LOG D-000).

## What was built
- **Science engine** (Python): SPICE topocentric Sun/Earth geometry in `MOON_ME`; PDS3 LOLA DEM reader with validation gate; 300 km curvature-aware terrain horizon with no-data bounds; disk-vs-terrain visibility states (visible/partial/terrain-blocked/below horizon/unknown); bisection-refined intervals; optional idealized panel energy; geometric DTE with antenna mask; rule-based quality; full provenance. FastAPI service + lease-based worker.
- **Web app** (Next.js 16): public home, explorer (OpenLayers polar map, coordinate inspection, precomputed demos, Sun/Earth/3D tabs), Learn (12 steps, glossary, guided example), Methodology, Sources, Limitations, Privacy, Terms; auth (register, verify, sign-in, 2FA step, forgot/reset); onboarding; dashboard; projects; immutable scenario builder; job status with polling/cancel; Sun & Power; Earth & DTE; Site detail/3D with elevation profile and data manifest; comparison; reports with share links; settings (profile, export, delete, password, MFA, sessions); admin (operations, data registry workflow, jobs, users & roles, audit).
- **Persistence**: PostgreSQL schema (identity, workspaces, projects, sites, data products, ingestion runs, scenarios, jobs, analyses, comparisons, reports, share links, append-only audit) with DB triggers making audit events append-only and scenarios immutable.

## Migrated to PostgreSQL and R2
No legacy SQLite data existed. PostgreSQL is the only database. Analysis results and reports go through the storage interface (R2 driver implemented; local signed driver verified).

## NASA data products and services actually connected
| Source | Connection |
|---|---|
| LRO LOLA `LDEM_75S_240M` (PDS) | Downloaded, checksum-verified, decoded; drives all terrain analysis, maps and 3D |
| NAIF SPICE kernels (DE440s, Moon PA DE440, Moon FK, LSK, PCK) | Downloaded, checksum-verified; runtime ephemeris |
| JPL Horizons API | Live-queried to create stored validation fixtures; not a runtime provider |
| USGS/IAU Gazetteer | Feature centre coordinates for 16 south-polar sites |
| NASA Moon Trek WMTS, LROC | Not connected (labelled in UI) |

## How calculations were validated
SPICE vs Horizons < 0.01° (6 cases × 15 epochs); synthetic terrain tests (ridge, crater, curvature, no-data, wrap); known LOLA features; interval refinement and sampling sensitivity; power incidence/integration; determinism; export consistency (JSON/CSV values equal stored analysis; CSV row count = samples). Details: `SCIENTIFIC_METHODS.md`, `QA_EVIDENCE.md`.

## Tests that passed
ESLint 0 problems · TypeScript pass · Vitest 19/19 · ruff/format/mypy pass · pytest 48/48 · Playwright 30/30 (13 public incl. 7 axe audits, 7 security, 2 responsive, 8 workspace) · migrations fresh/re-run/existing · production build (no warnings).

## Precomputed vs computed vs modelled
- **Computed on request**: every workspace analysis, horizon, terrain point/profile/patch.
- **Precomputed (labelled with generation time)**: 4 public demos (Mons Malapert, Mons Mouton, Shackleton, de Gerlache; 15 Nov–15 Dec 2026), map layers, 3D patches for those sites.
- **Modelled**: panel energy (only with user assumptions).
- **Unavailable by design**: RF link budget, landing hazards, optical imagery.

## Still requires owner credentials / accounts
Vercel project; Neon (or other) PostgreSQL with pooled + direct URLs; Cloudflare R2 buckets + API token; Google Cloud (Artifact Registry + Cloud Run) for the science API and worker; Resend (or other) email API key and sender domain. Then follow `DEPLOYMENT.md`.

## URLs
Local only: http://localhost:3100 (web), http://127.0.0.1:8001 (science API). No deployed URL exists yet.
