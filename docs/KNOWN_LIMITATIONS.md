# Known limitations

What this build cannot claim (also printed in every PDF report and on `/limitations`).

## Science and data
- **Terrain resolution 240 m.** Near-field horizon (< ~1 km) is smoothed; lander-scale slopes, rocks and hazards are not assessed. Quality never exceeds "medium".
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
- **Not deployed.** Vercel, managed PostgreSQL (e.g. Neon), Cloudflare R2, Cloud Run and an email provider need the owner's accounts and credentials (see `docs/DEPLOYMENT.md`). Locally, storage uses the filesystem driver and email is written to `data/outbox/`.
- **R2 driver and presigned uploads are implemented but not exercised against a real bucket** (no credentials). Status: BLOCKED.
- **Docker image** (`science/Dockerfile`) was written but not built here (Docker is not installed on the development machine).
- **Data ingestion** is script-driven (`scripts/fetch_data.sh`, catalogue JSON) plus the curator status workflow in `/admin/data`; there is no automated web-triggered download/validation pipeline for new products yet.
- **OAuth/social login** not configured (only email/password + TOTP MFA).
- **AI assistant** not implemented (optional in the brief).
- **Analyst annotations / sharing scenarios across workspaces**: workspace roles exist in the schema (owner/editor/viewer) but there is no UI for inviting members; sharing is via read-only report links.
- **Repository URL** in the footer appears only if `NEXT_PUBLIC_REPO_URL` is set.
- **MOON_ME frame kernel fallback.** When the preferred NAIF release `moon_de440_250416.tf` is not locally present, the checksum-verified predecessor `moon_de440_220930.tf` is used and every affected analysis result carries a disclosure warning; empirical effect on shipped artifacts is nil for the demo analyses and ≤ 0.0062 in grid sunFractions (see DECISION_LOG D-022).
