# Decision log

Format: **ID — decision** · alternatives · reason · evidence.

## Baseline

**D-000 — No prior GLM 5.2 implementation exists; build from scratch.**
The brief asks to audit a previous GLM 5.2 build (Next.js 16, Three.js, Prisma/SQLite, synthetic "LOLA-style" terrain, a hand-built lunar-frame adjustment, sample results such as 168 h sunlight / 168 h DTE / 8,241.7 Wh at Mons Mouton). On 2026-11-10 the repository folder `~/Desktop/MoonNav` was empty and no GLM build log, source, database or screenshots were found anywhere on the machine (`mdfind`, `~/Desktop/Luna`, `~/Desktop/Project` checked; `Luna/` is an unrelated "LUNA-X" project). The only inputs were the three PDFs on the Desktop.
Consequences: nothing to migrate from SQLite (there is no SQLite database), nothing to preserve. All of GLM's claimed figures are treated as **unverified and not reproduced**; MoonNav's own numbers come from the pipeline below. Notably, a continuous 168-hour sunlight and 168-hour DTE result at a single site would need validation; our Mons Mouton week (15–22 Nov 2026) gives 67% sunlight and 88% Earth visibility, not 100%.

**D-001 — Source hierarchy.** Official NASA challenge text and NASA/JPL/NAIF/PDS/USGS documentation for science claims → project bible (12-step intent) → implementation spec (product/API detail) → repository state. Where the PDFs give example request syntax (e.g. Horizons `SITE_COORD`), it was verified against the live service before use.

## Architecture

**D-002 — Next.js 16 App Router + TypeScript web app, Python FastAPI science service.** Alternatives: all-TypeScript (no mature SPICE binding), Python-only web (weaker UI ecosystem). Python is used where it is materially stronger: SpiceyPy/NAIF SPICE and NumPy raster work.

**D-003 — Ephemeris: NAIF SPICE via SpiceyPy is the runtime provider; JPL Horizons is the independent validation reference.** Horizons is rate-limited and network-dependent; SPICE is reproducible offline with a pinned kernel manifest. Evidence: `science/tests/test_ephemeris_and_analysis.py::test_spice_matches_horizons` — 6 cases × 15 epochs, max separation < 0.01°. The adapter for Horizons (`horizons_params`, `parse_horizons_azel`) is implemented and its fixtures stored raw in `science/tests/fixtures/`.

**D-004 — Body-fixed frame = `MOON_ME` from `moon_de440_250416.tf` (alias of `MOON_ME_DE440_ME421`).** The LOLA polar GDR label states `COORDINATE_SYSTEM_NAME = "MEAN EARTH/POLAR AXIS OF DE421"`; this NAIF frame is defined to align the DE440 PA orientation with DE421 ME, so terrain and ephemeris share one frame. Rejected: `IAU_MOON` (≈ hundreds of metres offset) and any fixed 1.54° obliquity shortcut. Note: the brief's file name `moon_de440_220930.tf` no longer exists on NAIF; the current `moon_de440_250416.tf` was used (recorded in the kernel manifest).

**D-005 — Analysis DEM = LOLA `LDEM_75S_240M` (PDS GDR v2.0, 29 MB).** Alternatives: `LDEM_85S_20M` (460 MB, covers only 85°S–pole: too small for a 300 km horizon), `LDEM_875S_5M` (1.8 GB). 240 m covers 75°S–pole (≈455 km from the pole), enough for long-range horizons for every catalogue site; resolution limits are disclosed (quality never "high").

**D-006 — DEM reader in NumPy from the PDS3 label, not Rasterio/GDAL.** The product is raw 16-bit with a simple, well-documented polar stereographic projection. Avoiding GDAL keeps the worker image small and the code auditable. Label keywords, file size and SHA-256 are validated; orientation was verified empirically (Shackleton floor −2.8 km, rim +1.5 km; Shoemaker flat floor −3.9 km; pole +1.29 km) and in unit tests.

**D-007 — `cacheComponents: false`.** The Next 16 scaffold enables Cache Components, which requires every session read to sit behind Suspense boundaries. The product is mostly per-user and dynamic, and correct server-side authorization on each request matters more than prerendered shells. Re-enable later per route if needed.

**D-008 — ORM: Drizzle (not Prisma).** There was no existing Prisma schema to keep (D-000). Drizzle has first-class PostgreSQL support, SQL-level control for `FOR UPDATE SKIP LOCKED` job leasing, and a Better Auth adapter. Versioned SQL migrations in `drizzle/`.

**D-009 — Auth: Better Auth (email/password + email verification + TOTP two-factor), not Clerk.** Clerk would block all auth testing locally without external credentials. Better Auth runs on our PostgreSQL, supports everything required (verification, reset, sessions, TOTP MFA, DB-backed rate limits), and keeps one identity system. Passwords hashed with scrypt.

**D-010 — Roles stored on the user row (`user|analyst|curator|admin`), enforced server-side in `src/lib/dal.ts`.** Curator and admin require MFA at both page and API level. Workspace membership is checked on every object read (`assertWorkspaceAccess`), returning 404 to avoid revealing existence.

**D-011 — Object storage driver interface: Cloudflare R2 (S3 API) in production, filesystem + HMAC-signed short-lived URLs locally.** Keys are built server-side (`storage.ts:keys`), never accepted from clients. Analysis results and reports are stored with SHA-256; the DB stores keys and checksums only.

**D-012 — Job queue = PostgreSQL table with leases (`FOR UPDATE SKIP LOCKED`), worker pulls over an internal HTTP API.** No Redis needed. The worker holds only the service token (no DB or R2 credentials). Idempotency key = scenario definition hash; leases 60 s with heartbeats; retries with exponential backoff (15 s, 30 s, …, max 3 attempts); cancellation invalidates the lease; expired final attempts are failed.

**D-013 — Worker host default: Google Cloud Run** (service for the API, Cloud Run job/service with min-instances=1 for the worker), single Docker image with `SERVICE_MODE`. Reason: container-native, scales to zero for the API, no Vercel duration limits. Not deployed (credentials required).

**D-014 — 2D map: OpenLayers with a custom LOLA polar stereographic projection and static image layers derived from the same DEM.** Moon Trek WMTS was not integrated (its polar tile matrix needs verification against GetCapabilities and adds a third-party runtime dependency); labelled as not connected. Derived layers are visual only.

**D-015 — Charts: Apache ECharts (one chart system). 3D: React Three Fiber + drei OrbitControls.** drei `<Html>` labels were removed after they triggered a React 19 root-unmount race warning in E2E; labels moved to a DOM legend.

**D-016 — Visibility rule default "any part of disk visible"; full-disk and centre rules selectable and stored with every result.** Partial-disk area fraction feeds the power model.

**D-017 — Quality labels are rule-based, never a fabricated confidence %.** With a 240 m DEM the best state is "medium".

**D-018 — Site catalogue = IAU/USGS Gazetteer feature centres** (16 features + the geometric pole), each with its Gazetteer URL. NASA's Artemis III candidate *regions* were not used as point sites because NASA did not publish point coordinates for them.

**D-019 — Precomputed public demonstrations** for 4 featured sites (15 Nov–15 Dec 2026, 30 min) are generated by `science/scripts/build_assets.py` with the production engine and labelled "Precomputed demonstration" with generation time.

**D-020 — CSRF:** HttpOnly SameSite=Lax cookies + Better Auth origin checks + `src/proxy.ts` rejecting cross-origin state-changing `/api/v1` requests.

**D-021 — Local dev uses a project-local PostgreSQL 17 cluster (`scripts/dev-db.sh`, port 54329) and port 3100 for the web app** (port 3000 was occupied by another app on this machine).

## Completion verification pass (2026-11-10/11)

**D-022 — MOON_ME frame-kernel candidate slot: preferred `moon_de440_250416.tf`, verified fallback `moon_de440_220930.tf`.**
During the completion verification the delivery sandbox could not reach `naif.jpl.nasa.gov` (TCP connect timeout; see QA_EVIDENCE network note), and no public mirror of the 250416 FK release was found. The manifest therefore lists both releases with their real SHA-256 digests; the loader furnishes the preferred release when present and checksum-valid, otherwise the checksum-verified predecessor, which defines the same `MOON_PA_DE440 → MOON_ME_DE440_ME421` chain *and* the `MOON_ME` alias (its header explicitly adds "the alias frames MOON_PA, MOON_ME"). Empirical equivalence: with the fallback FK the engine **reproduces the shipped precomputed demonstrations byte-identically** (site heights, 720-bin horizons, 1442-sample time series, all intervals for all four featured sites) and still agrees with the stored JPL Horizons fixtures to < 0.01°. A full rebuild of the 61×61 feasibility grid under the fallback FK matches the shipped grid to max 0.0062 in sunFraction, 0.0041 in dteFraction, one 2 h sample in longestDarkHours and 0.1 m in height — differences confined to samples whose visibility boundary falls within the FK substitution's sub-milli-degree az/el shift; the shipped grid (built with the preferred FK) remains the artifact of record, and rebuilding with the preferred release restored is expected to reproduce it. The substitution is disclosed: `kernels.json` note field, a warning line in every affected analysis result, and `scripts/fetch_data.sh` restores the preferred release automatically wherever NAIF is reachable. Alternative considered: swapping the manifest to a single "220930-only" pin — rejected because it would silently change provenance of future analyses; the candidate slot keeps the preferred release authoritative.

**D-023 — Verbatim mirrors in `fetch_data.sh` (MIT PLT for LOLA GDR, a public verbatim NAIF mirror for kernels).** Every download is SHA-256 verified against the versioned catalogue, so a mirror can never substitute different bytes. Primary NASA URLs remain first-choice.

**D-024 — Asset builder rewritten to the shipped product set** (webp map layers incl. slope, regional 320² polar cap, 61×61 feasibility grid, 4 demo analyses + patches, 17-site catalogue). `--out` supports scratch validation without touching shipped assets; the completion pass confirmed the engine reproduces the shipped demos identically. `pillow` added as the only new dependency (webp encoding); the feasibility grid provenance keeps `moonnav-method-1.0.0+grid-1`.

**D-025 — `robots.txt`/`sitemap.xml` via Next metadata routes** (public crawlable, `/app`, `/admin`, `/settings`, `/api`, `/dev`, `/share` disallowed). UI untouched.

**D-026 — Completion-pass runtime environment.** Verification ran on a Linux sandbox without root: PostgreSQL 17.5 portable binaries on :54329 (matching `dev-db.sh` ports), production `next start` (the 4 GB sandbox OOM-killed `next dev` at ~2.1 GB RSS — an environment constraint, not a product defect), worker and science API as detached processes. This validated `scripts/dev-all.mjs`'s orchestration contract (db → migrate → science → web → worker) on a second platform.
