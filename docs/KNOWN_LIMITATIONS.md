# Known limitations

What this build cannot claim (also printed in every PDF report and on `/limitations`).

## Science and data
- **Terrain resolution** is 240 m everywhere in 75°S–pole. Finer LOLA products exist only near the pole: 40 m to 80°S, 20 m to 85°S, 5 m to 87.5°S. See the table below.
- **Coverage 75°S–90°S only.** Sites north of 75°S are rejected. Rays that reach the coverage edge are flagged and may produce "unknown" states.
- **Named sites are IAU feature centres**, not NASA candidate landing sites or approved sites. Crater centres are often permanently shadowed.
- **Power is idealized**: no thermal, dust, storage, MPPT/wiring losses beyond the derating factor, no reflected/Earthshine light.
- **DTE is geometric line of sight.** An optional, clearly labelled free-space link margin (Advanced mode, user-supplied frequency/EIRP/G·T/data rate) exists; there are still no antenna patterns, pointing, weather, ground-station scheduling or DSN availability.
- **Ground irradiance is direct-beam only** and the incidence angle is taken at the Sun-disk centre (no albedo, scattering or partial-disk weighting of the angle).
- **Earth disk** uses the equatorial radius (no oblateness, no atmosphere).
- **3D lighting/shadows** are a visual aid limited to the 40 km patch (with a small ambient fill); analytic states use the 300 km horizon.
- **Analysis limits**: DE440s kernel span (1849–2150), ≤ 400 days and ≤ 20,000 samples per analysis.
- **No bundled optical imagery** (Moon Trek/LROC tiles load live at runtime where the network allows; imagery textures are visual context, never analysis data); map layers are LOLA-derived.
- **Horizons** is a validation reference (fixtures), not a live runtime provider.

## Platform and operations
- **Database pooler limit (open recommendation).** The Supabase session pooler gives the whole app 15 server connections; under a large burst of simultaneous visitors some requests can still wait or fail even with the per-instance limits now in place. The fix is switching `DATABASE_URL` to the transaction pooler (port 6543); see `DEPLOYMENT.md`. Not changed because it alters a production variable and needs the owner's decision.
- **Browser noise when navigating mid-load.** If a visitor leaves a page while its lazy code or data is still loading, Firefox/Safari may log a cancelled request (`Load failed`, `ChunkLoadError`) to the console. There is no user impact; the automated tests wait for pages to settle instead of ignoring these.
- **Intermittent Firefox console error (not reproduced).** One full-suite run showed an error-boundary log in Firefox on the demo tour; it was traced to the `api()` helper treating an unreadable response as success (fixed). 14 consecutive repeats and 60+ manual runs did not reproduce it afterwards.
- **Leftover privileged test accounts in production (closed 2026-11-13: demoted and suspended, 0 privileged accounts remain).** Nine `@example.test` accounts (admin/curator, MFA on) and the seeded dev admin (no MFA) from old test runs against the shared database; cleanup needs the owner's approval (`FINAL_PRODUCTION_READINESS_REPORT.md` section B.1).
- **No administrator of the owner's exists yet.** The first administrator is created by the owner with `scripts/grant-role.ts` (see `DEPLOYMENT.md` §6); two-factor is required for admin pages.
- **Deployment: live on Vercel** (https://moonnav.vercel.app; Vercel + Supabase + an internal FastAPI service, see `DEPLOYMENT.md`).
  - Serverless limits: each analysis job must finish within one function run (≤ 300 s on Hobby). A longer job's lease expires and it is retried.
  - The cron backstop runs only daily on the Hobby plan; submissions and status polls trigger jobs immediately.
  - Science cold starts take several seconds (Python packages are installed at runtime); after a cold start the 5 m LOLA tiles are re-fetched from NASA into `/tmp`.
  - Data and accounts: Production, Preview and local development share one Supabase database; the isolated test stack (`npm run test:e2e:stack`) does not.
  - On Vercel, long-term Sun/Earth visibility values come from copies rounded to 0.001 (max error 0.0005); PSR is exact.
  - Local development, Preview and Production share one Supabase database and storage bucket. A local worker can therefore process production jobs; results stay readable because storage is shared.
- **Curator direct file uploads are disabled in production.** `POST /api/v1/storage/presign-upload` needs the (unused) R2 storage driver and returns 501 on Supabase Storage. Source data is ingested with the scripts (`scripts/fetch_data.sh`, `npm run data:illum`, `npm run data:hires`).
- **`science/Dockerfile`** is for self-hosting only; it is not used by the Vercel deployment and has not been built on the development machine (no Docker).
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

## Deletion
- Deletion is permanent (rows are removed and their stored result/report files are deleted best-effort); there is no recycle bin. Archive a project instead if it may be needed again. Audit records are kept.
- Account deletion removes the personal field book with the account; a personal workspace cannot be deleted on its own, not even by an administrator.
- If a stored file cannot be removed, the row is still deleted and the audit record's `filesNotRemoved` count says how many files remain in storage.

## Mission Emergency Simulator
- Educational decision support only: the vehicle model (point mass, uniform gravity, no attitude or sensor dynamics), its default mass/thrust/Isp values and the relay orbit (circular, hypothetical) are illustrative. No real spacecraft, Gateway or Lunar Reconnaissance Orbiter relay data is used or implied.
- Terrain-aware visibility uses the LOLA horizon computed at the landing target, corrected for the lander's altitude but not for its lateral offset; candidate-zone terrain is at most 240 m (often 20 m) posting resampled to 60 m cells and does not resolve boulders.
- A geometric relay or Earth window does not prove a working radio link; the optional RF margin is free-space arithmetic from user-supplied values only.
- QuickMap and the Canadian Space Agency portal are reference links only (no documented programmatic data interface was used).
