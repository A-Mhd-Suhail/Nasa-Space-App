# Known limitations

What this build cannot claim (also printed in every PDF report and on `/limitations`).

## Science and data
- **Terrain resolution** is 240 m everywhere in 75°S–pole. Finer LOLA products exist only near the pole: 40 m to 80°S, 20 m to 85°S, 5 m to 87.5°S. See the table below.
- **Coverage 75°S–90°S only.** Sites north of 75°S are rejected. Rays that reach the coverage edge are flagged and may produce "unknown" states.
- **Named sites are IAU feature centres**, not NASA candidate landing sites or approved sites. Crater centres are often permanently shadowed.
- **Power is idealized**: no thermal, dust, storage, MPPT/wiring losses beyond the derating factor, no reflected/Earthshine light.
- **DTE is geometric line of sight only**: no RF link budget, antenna patterns, pointing, ground-station visibility or scheduling.
- **Earth disk** uses the equatorial radius (no oblateness, no atmosphere).
- **3D lighting/shadows** are a visual aid limited to the 40 km patch (with a small ambient fill); analytic states use the 300 km horizon.
- **Analysis limits**: DE440s kernel span (1849–2150), ≤ 400 days and ≤ 20,000 samples per analysis.
- **No bundled optical imagery** (Moon Trek/LROC tiles load live at runtime where the network allows; imagery textures are visual context, never analysis data); map layers are LOLA-derived.
- **Horizons** is a validation reference (fixtures), not a live runtime provider.

## Platform and operations
- **Deployment (2026-11-12): live on Vercel** (https://moonnav.vercel.app).
  - Serverless limits: each analysis job must finish within one function run (≤ 300 s on Hobby). A longer job's lease expires and it is retried.
  - The cron backstop runs only daily on the Hobby plan; submissions and status polls trigger jobs immediately.
  - Science cold starts take several seconds (Python packages are installed at runtime).
  - On Vercel, long-term Sun/Earth visibility values come from copies rounded to 0.001 (max error 0.0005); PSR is exact.
  - Production and Preview share one Supabase database.
- **Previously:** Vercel, managed PostgreSQL (e.g. Neon), Cloudflare R2, Cloud Run and an email provider need the owner's accounts and credentials (see `docs/DEPLOYMENT.md`). Locally, storage uses the filesystem driver and email is written to `data/outbox/`.
- **R2 driver and presigned uploads are implemented but not exercised against a real bucket** (no credentials). Status: BLOCKED.
- **Docker image** (`science/Dockerfile`) was written but not built here (Docker is not installed on the development machine).
- **Data ingestion** is script-driven (`scripts/fetch_data.sh`, catalogue JSON) plus the curator status workflow in `/admin/data`; there is no automated web-triggered download/validation pipeline for new products yet.
- **OAuth/social login** not configured (only email/password + TOTP MFA).
- **AI assistant** not implemented (optional in the brief).
- **Analyst annotations / sharing scenarios across workspaces**: workspace roles exist in the schema (owner/editor/viewer) but there is no UI for inviting members; sharing is via read-only report links.
- **Repository URL** in the footer appears only if `NEXT_PUBLIC_REPO_URL` is set.
- **MOON_ME frame kernel fallback.** When the preferred NAIF release `moon_de440_250416.tf` is not locally present, the checksum-verified predecessor `moon_de440_220930.tf` is used and every affected analysis result carries a disclosure warning; empirical effect on shipped artifacts is nil for the demo analyses and ≤ 0.0062 in grid sunFractions (see DECISION_LOG D-022).

## Terrain and data limitations: cause, impact, mitigation, evidence

| Limitation | Cause | Impact | Mitigation in MoonNav | Evidence |
|---|---|---|---|---|
| Near-field horizon smoothed on 240 m | LOLA `LDEM_75S_240M` grid spacing | Ridges and rims within ~1 km can be missed; sunlight can be overestimated on narrow ridges | 5/20/40 m PDS tiles used for the near field (≤ 6 km) wherever they exist; every result lists the products actually used (`terrainData`) | Shackleton–de Gerlache ridge: 240 m 83%, multi-res 64%, LOLA team 120 m 68% (`lola-avgsun-shackleton-dg-ridge`) |
| High-res products cover only part of the cap | 5 m to 87.5°S, 20 m to 85°S, 40 m to 80°S | North of 80°S the finest data is 240 m | Coverage preview before a run (`/api/v1/terrain/coverage`); the UI states the finest available resolution | `test_coverage_and_illumination_endpoints` |
| First use of a new high-res area downloads tiles | Tiles are read live from NASA PDS by byte range | A few seconds of waiting; PDS outages | Parallel, deduplicated downloads with retries. "Fast mode" (untick high-res) uses only cached tiles. If PDS fails, coarser LOLA data is used, labelled `fallback` with the reason. Never zero-filled. | 112.5 s → 8.0 s first use; cached < 0.3 s; `test_tile_fetching.py` |
| Sub-pixel shadows / small PSRs | 120 m PSR product, 5–240 m DEMs | Cold traps smaller than a pixel are not shown | PSR layer labelled as LOLA team source data with its resolution; the "Permanent shadow" rule shows "unknown" outside coverage | `test_illumination.py` |
| Point values at rims vary between pixels | Steep illumination gradients (0 → 59% between adjacent 120 m pixels at the pole) | One-point comparisons can disagree by tens of percent | Validation compares against the 3×3 neighbourhood range and flags "high local gradient" | `lola-avgsun-south-pole` |
| Analysis window ≠ 18.6-year average | Analyses cover ≤ 400 days | Earth visibility in short windows differs from the long-term mean | Long-term Sun/Earth context comes from the LOLA products, labelled as source data and kept separate from the analysed window | Mission Report "Long-term sunlight / Earth" row |
| No lander-scale hazards below 5 m | No public sub-5 m DEM for the whole cap | Boulders and small craters are not assessed | Hazard screen is labelled "screening", not certification | Hazard result caveats |
