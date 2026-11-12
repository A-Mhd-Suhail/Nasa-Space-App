# MoonNav — Scientific implementation status

Method version `moonnav-method-1.1.0`. Status words: **Verified** (exercised by an automated test or reference comparison), **Implemented, not fully verified**, **Partial**, **Unavailable**. "Before" is the state found by the audit at the start of this pass.

| # | Capability | Before | Change in this pass | Now | Evidence | Limits |
|---|---|---|---|---|---|---|
| 1 | Coordinate and time conventions (UTC/TDB, MOON_ME, planetocentric, east-positive, azimuth from north) | Done and documented | Consolidated in `SCIENTIFIC_METHODOLOGY.md` | Verified | SPICE time-identity records; coordinate tests | Longitudes accepted ±360, latitude within 75°S for sites |
| 2 | Sun and Earth ephemeris from the surface point (SPICE, light time + stellar aberration) | Done | none | Verified | 20 Horizons + 12 SVS records, max ≈1e-6° vs Horizons (print-limited) | Shares DE-family lineage with Horizons |
| 3 | Terrain horizon with lunar curvature, multi-resolution LOLA | Done | none | Verified | horizon tests, LOLA records | 300 km ray limit; unknown beyond coverage |
| 4 | Partial disk visibility, refined event times | Done | extra analytic tests (circular segment, analytic crossing roots, clipped windows) | Verified | `test_earth_visibility_geometry.py` | default tolerance 10 s |
| 5 | Solar illumination metrics | Done | **darkness metrics**: longest visible, longest dark, total dark, dark-interval and interruption counts | Verified | `test_solar_surface_analysis.py` | dark = Sun fully not visible by the chosen rule |
| 6 | Surface incidence from the terrain normal | Missing (panel used a flat local frame) | **new** `surface.py`: DEM central-difference normal, slope, aspect, incidence | Verified | `test_surface.py` | baseline 2× finest pixel; incidence at Sun-disk centre |
| 7 | Ground irradiance (direct beam) | Missing | **new** per-sample `terrainIrradianceWm2`, mean/peak/Wh per m² | Verified | analytic scaling tests | direct beam only: no albedo, no scattering |
| 8 | Configurable panel energy | Fixed / tracking only | **new** orientation `terrain_aligned`; per-sample panel irradiance | Verified | tests; E2E 30-day window | idealized electrical model |
| 9 | Geometric DTE windows (with antenna mask) | Done | Earth distance per sample, analytic window tests | Verified | tests + E2E | geometric only, never RF availability |
| 10 | RF link margin | Missing (explicitly out of scope) | **new, optional**: FSPL, C/N0, Eb/N0 margin from user-supplied values; `POST /api/v1/link-budget` | Verified (arithmetic) | `test_link_budget.py`, API E2E | illustrative; no DSN schedule, antenna pattern, weather, pointing |
| 11 | Slope / roughness / relief / hazard screening | Done | analytic tests (plane, Gaussian crater, noise, no-data) | Verified | `test_terrain_assessment.py` | stencil-scale roughness, not lander-foot scale |
| 12 | Site/date comparison, transparent scoring, Pareto | Done | none | Verified | compare tests/E2E | weights are user-adjustable defaults, not NASA criteria |
| 13 | 3D / horizon visualisation tied to results | Done | surface and irradiance panel beside the timeline | Verified | E2E | 3D scene itself unchanged by design |
| 14 | Provenance and quality | Done | method-version staleness banner for pre-1.1.0 analyses | Verified | E2E | — |
| 15 | Validation suite | 52/0/1 | regenerated against 1.1.0 | Verified | `SCIENTIFIC_VALIDATION_REPORT.md` | one reference unavailable |
| 16 | APIs and error contracts | Done | link-budget route; NaN/inf bodies → 422 instead of 500 | Verified | API E2E | — |
| 17 | Reports and exports | Done | darkness, ground slope, direct-beam irradiance lines in report/PDF/CSV/JSON | Verified | unit + E2E | older analyses show "not in this analysis" |
| 18 | UX (Simple/Advanced) | Done | new panels; header chip fix for on-demand worker | Verified | unit + E2E | — |
| 19 | Website knowledge base | Missing | `MOONNAV_COMPLETE_WEBSITE_REFERENCE.md`, generated from source and a real crawl | Verified (generated) | crawl of 72 page visits | destructive actions documented, not clicked |
| 20 | Defects found | — | link-budget NaN 500; header chip; `/invite/[token]` crash (no QueryClient provider) | Fixed | tests | — |

## Not implemented (and why)
- Atmosphere-free multi-bounce illumination, albedo and secondary scattering: outside the direct-beam model; not claimed.
- Dust, thermal and mechanical lander models; wheel/foot-scale hazards; shadow of the lander itself.
- Real DSN/ground-station scheduling, antenna patterns and RF propagation beyond free space.
- Terrain products finer than LOLA's 5 m near the pole.

## Owner actions that remain (unchanged)
Credential rotations and the first administrator (`FINAL_PRODUCTION_READINESS_REPORT.md` §B); deploying the 1.1.0 code to production when wanted (`docs/DEPLOYMENT.md`).
