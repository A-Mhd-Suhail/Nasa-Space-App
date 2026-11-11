# Scientific methods — `moonnav-method-1.0.0`

Code: `science/moonnav_science/`. Tests: `science/tests/` (48 tests).

## 1. Conventions

| Item | Convention |
|---|---|
| Body | Moon, NAIF ID 301 |
| Body-fixed frame | `MOON_ME` (= `MOON_ME_DE440_ME421`, aligned with DE421 mean-Earth/polar-axis — the LOLA product frame) |
| Latitude | planetocentric, degrees, north positive |
| Longitude | east-positive, canonical [0, 360); west-positive input converted explicitly |
| Reference surface | sphere R = 1737.4 km (LOLA `OFFSET`) |
| Height | metres relative to the reference sphere; observer = LOLA surface (bilinear) + observer height (default 2 m) |
| Azimuth | degrees clockwise from local north: 0 N, 90 E, 180 S, 270 W |
| Elevation | degrees above the local horizontal plane (normal = radial "up" of the sphere) |
| Time | UTC in/out (`Z` required); TDB internally via `naif0012.tls` |
| South-pole ENU | at exactly −90°, "north" points along the site's longitude meridian |

## 2. Site → local ENU → azimuth/elevation

`up = (cos φ cos λ, cos φ sin λ, sin φ)`, `east = (−sin λ, cos λ, 0)`, `north = (−sin φ cos λ, −sin φ sin λ, cos φ)`.
For a site→target vector v: `E = v·east, N = v·north, U = v·up`; `az = atan2(E, N) mod 360`; `el = atan2(U, √(E²+N²))`.
Tests: cardinal azimuths, 0/360 wrap, known-vector elevations, orthonormal right-handed basis incl. the pole, zenith target.

## 3. Ephemeris

`spkcpo(target, et, "MOON_ME", "OBSERVER", "LT+S", site_km, "MOON", "MOON_ME")` — constant-position observer on the Moon's surface; apparent geometry with light-time and stellar aberration. Kernels (`science/catalog/kernels.json`, SHA-256 verified at load): `naif0012.tls`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, `de440s.bsp`, plus exactly one MOON_ME frame kernel — preferred `moon_de440_250416.tf`, checksum-verified predecessor `moon_de440_220930.tf` as documented fallback (DECISION_LOG D-022; the substitution adds a warning line to affected results). Coverage computed with `spkcov`/`pckcov`: 1849-12-25 → 2150-01-21; requests outside are rejected.

**Validation against JPL Horizons** (independent service; raw responses in `science/tests/fixtures/`): request `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='E-lon,lat,h_km'`, `QUANTITIES='4'`, `APPARENT='AIRLESS'`. Horizons reports `Center pole/equ: MEAN_ME (high precision)` and radii 1737.4 km, i.e. the same frame and datum. Result: Sun and Earth az/el at the pole, Mons Mouton and a rim point (15 epochs each, 15–22 Nov 2026) agree to **< 0.01°** (example: Sun at Mons Mouton 2026-11-15 00:00 UTC — Horizons 83.605868° / 2.166355°, MoonNav 83.6059° / 2.1664°).

## 4. DEM

`LDEM_75S_240M.IMG` (LRO-L-LOLA-4-GDR-V1.0, product v2.0): 3812×3812 LSB int16, height = DN × 0.5 m, radius = height + 1737400 m, spherical polar stereographic, `LINE/SAMPLE_PROJECTION_OFFSET = 1905.5`, 240 m/px.
Projection (south): `x = 2R tan(π/4 + φ/2) sin λ`, `y = 2R tan(π/4 + φ/2) cos λ`; `row = 1905.5 − y/240`, `col = 1905.5 + x/240` (0-based pixel centres). Bilinear interpolation. Samples north of 75°S, outside the grid, or adjacent to invalid pixels are **NaN → null**, never zero.
Gate before use: required label keywords, projection type, sample type, east-positive longitudes, planetocentric latitude, spherical body, file size = lines × samples × 2, SHA-256 equal to the catalogue. Tests: label parsing/rejection, projection round-trip, scale factor, known features (Shackleton floor < −2 km, pole > +1 km, Shoemaker floor −3.5…−4.3 km), out-of-coverage null.

## 5. Terrain horizon

For azimuth bins θ (default 0.5°) and distances d from 240 m to 300 km every 240 m: point on the reference sphere `p = cos δ·up + sin δ·(sin θ·east + cos θ·north)`, δ = d/R → (lat, lon) → LOLA height h. Elevation from the observer at radius r₀ = R + h_site + h_obs:
`el = atan2((R+h)·cos δ − r₀, (R+h)·sin δ)` — this is exact 3D geometry, so **lunar curvature is included**.
Horizon(θ) = max el over the covered part of the ray. A ray is covered up to its first null sample; beyond it, an upper bound is computed assuming terrain of +11 km (above the Moon's highest point, ≈ +10.8 km) at every unseen distance.
Tests: open sphere (small negative dip), single ridge blocks low target / not high, distant mountain lowered by curvature, crater rim from floor, no-data gap → unknown (not clear), azimuth wrap interpolation.

## 6. Visibility states and intervals

Disks: Sun radius 695,700 km (IAU 2015 B3), Earth equatorial radius from `pck00011.tpc`. With centre elevation e, angular radius r, horizon h:

* `visible` if e − r ≥ h; `partial` if e − r < h < e + r; `terrain_blocked` if e + r ≤ h and e + r > 0; `below_horizon` if e + r ≤ h and e + r ≤ 0;
* `unknown` if the result (state or lit flag) would change when h is raised to the unseen-terrain bound, or the horizon is null.
* Lit rule: `any_disk` (default), `full_disk`, `center`. Visible area fraction of a partial disk: `f = 1 − (acos d − d√(1−d²))/π`, d = clamp((e−h)/r, −1, 1).

Intervals: sample every step; for each change of the lit flag (True/False/None), bisect between the two samples until the bracket is ≤ tolerance (default 10 s). Edges at the analysis bounds are reported as unrefined. Tests: refinement within 1 s at 1000/300/60 s steps; unknown intervals; edge flags; sensitivity (60/15/5-minute steps agree within 60 s for Mons Mouton).

## 7. Power (optional, modelled)

`P = S·A·η·max(0, n̂·ŝ)·f_vis·derating`, capped at `P_max`; `S = 1361 W/m² × (1 AU / r_sun)²` (Kopp & Lean 2011). Orientation: fixed normal (az, el in ENU) or two-axis tracking (cos = 1). Energy: trapezoidal rule over samples. Without assumptions → `not_calculated_missing_panel_assumptions`, `energyWh: null`. Tests: incidence max when aligned/zero facing away, constant-power integration, cap, zero power when blocked.

## 8. Geometric DTE

Earth visibility uses §6. A DTE window requires lit (selected rule) and, if configured, Earth centre ≥ antenna mask. The state `below_antenna_mask` is reported separately. No RF link budget is computed; every page, export and API label says so.

## 9. Comparison

Compatibility (time span ±1 step, step, terrain product, kernel manifest, method version, visibility rules, antenna mask) → hard gates (min sunlit fraction, min DTE fraction, max unknown fraction; pass/fail/unknown) → weighted score of bounded metrics (fractions as-is; energy ÷ max energy, only when panel assumptions are identical). Incompatible inputs: ranking withheld. Tests in `tests/unit/core.test.ts`.

## 10. Quality

`medium` = 240 m DEM, no truncated rays, no unknown samples; `low` < 5% unknown; else `insufficient`. `high` is reserved for ≤ 20 m DEMs (not registered in this build). Reasons and raw indicators are returned with every analysis.

## 11. Reproducibility

Every analysis stores: canonical scenario definition + SHA-256, kernel manifest ID + per-file SHA-256, terrain product ID + SHA-256, method and software versions, horizon parameters and cache key, sampling and tolerance. Results are written once to object storage with a SHA-256 that is re-verified on read. Same inputs → identical output (test `test_analysis_is_deterministic`).

## 9. Worker stage contract and asset pipeline (completion pass)

`run_analysis(scenario, progress)` emits named stages in order — `validating_input`, `loading_spice_kernels`, `loading_dem`, `computing_terrain_horizon`, `sampling_sun_and_earth`, `extracting_sun_intervals`, `integrating_solar_power` — and the worker posts each as a heartbeat, then `uploading_result` before uploading; the job log renders them in order (asserted by `tests/e2e/workspace.spec.ts`).

`science/scripts/build_assets.py` regenerates every derived asset from the approved products: 480 m map layers (hillshade/elevation/slope webp + `map_meta.json`), the 17-site IAU Gazetteer catalogue with LOLA heights, the four precomputed demo analyses + 161² terrain patches, the 320² regional polar cap and the 61×61 feasibility grid (`moonnav-method-1.0.0+grid-1`: 1.0° azimuth step, 150 km radius, 7200 s sampling, unknown samples reported not zero-filled). Options: `--out DIR` (scratch), `--skip-grid`, `--grid-size N`, `--only-grid`.

Reproducibility evidence (completion pass): demo rebuilds are byte-identical to the shipped demos except the FK-provenance substitution and its warning; the full grid rebuild matches the shipped grid within the FK-substitution tolerance (max 0.0062 sunFraction, one 2 h sample in longestDarkHours) — see D-022.

## 12. Comparison engine v2 (2026-11-11 pass) — `src/lib/compare.ts`
Order: compatibility check → hard gates → weighted score → Pareto front → plain-language trade-offs.
- **Hard gates** (never averaged): minimum sunlit fraction or **hours**, minimum geometric DTE fraction or **hours**, maximum unknown fraction. A value that could still pass if every coverage-limited (unknown) period turned out favourable is `unknown`, never `pass`; unknown and failing scenarios are not ranked.
- **Score (0–100)**: `100 · (w_sun·f_sun + w_dte·f_dte [+ w_E·E/E_max]) / Σw`, where `f` are the sunlit and DTE fractions of the window. The breakdown (points per criterion) sums to the score. Labelled everywhere as a *simplified MoonNav mission suitability score — not an official NASA mission feasibility rating*.
- **Ties**: scores within 0.05 points share a rank (competition ranking 1, 1, 3) and are flagged "Tie".
- **Pareto front** on (sunlight hours, DTE hours) among gate-passing scenarios; non-dominated scenarios are recommended for *further investigation*, dominated ones list the scenarios that dominate them. No single winner is declared.
- **Trade-off text**: for each pair with opposing strengths (≥ 0.05 h each way) MoonNav states which provides more sunlight and which more DTE time, with both values.
- **Site × date matrix**: sites keyed by coordinates rounded to 0.001°, windows keyed by UTC start.

## 13. Single-epoch ephemeris endpoint — `POST /v1/ephemeris` (science)
SPICE `spkcpo` (LT+S) from the site at radius `1737.4 km + LOLA height + observer height`, ENU az/el with `el = atan2(U, √(E²+N²))`, `az = atan2(E, N)` (0–360° from north). Inside LOLA coverage the body's disk is classified against the curvature-aware horizon at its azimuth (`any_disk` rule); outside coverage terrain fields are `null` and the state is `unknown` (or `below_horizon`), never `visible`. Times outside the kernel coverage are rejected (422).

## 14. Live JPL Horizons validation — `science/moonnav_science/horizons_live.py`
Per analysis, MoonNav asks the Horizons API (observer table, `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='E-lon,lat,h'`, `QUANTITIES='4'`, `APPARENT='AIRLESS'`) for the Sun and Earth over up to 13 epochs in the first 14 days of the window and computes the great-circle separation from the SPICE az/el. `pass` < 0.01°, `warn` < 0.05°, otherwise `fail`. Observed on 2026-11-11 for Mons Malapert and an 89.45°S site: max separation ≈ 1 × 10⁻⁶°. Requests are sequential, bounded (≤ 200 rows), cached, retried with exponential backoff only on 429/5xx/timeouts, and identify MoonNav in the User-Agent. Horizons is never substituted for SPICE: if it is unreachable the check reports `horizons_unavailable` and results are unchanged. The latest check is stored in `analyses.validation` and printed in the mission report.

**NASA SVS illumination products (e.g. SVS 4930)** are *not* compared automatically: they are 2-hour, regional visualization products rather than arbitrary-coordinate references. The report states this explicitly instead of implying a validation that was not performed.

## 15. Lunar time
The mission time is the analysis start (UTC). Analysis intervals are explicit (start/end UTC); a 24-hour window is an *operational interval*, not a lunar day (≈ 29.53 Earth days). UTC is converted to TDB/ET with `naif0012.tls` inside the science service; all user-facing times are labelled UTC.

## 16. Multi-resolution terrain (`lola-multires-v1`) — 2026-11-11 core pass
- **Products** (NASA PDS Geosciences Node, LOLA GDR V2.0, south polar stereographic, 1737.4 km sphere, MEAN EARTH/POLAR AXIS OF DE421): `LDEM_875S_5M` (5 m, 87.5°S–pole), `LDEM_85S_20M` (20 m, 85°S–pole), `LDEM_80S_40M` (40 m, 80°S–pole), over `LDEM_75S_240M`. Labels are validated against the PDS file sizes; tiles of 512×512 pixels are read with multipart HTTP byte ranges (one range per row) and stored unchanged (int16 DN) with a JSON sidecar (URL, label SHA-256, byte-range count, tile SHA-256, retrieval time). Nothing is resampled at ingestion.
- **Sampling rule**: the finest product with a valid sample wins; missing tiles fall back to coarser products; outside coverage → NaN (never 0).
- **Horizon**: two passes from the same observer (site height from the finest product): near field 0–6 km sampled every 2× the finest pixel (10 m at 5 m), far field 6–300 km at 240 m; per-azimuth maximum; truncation inherited from the far field. Example (89.45°S 222.69°E, 1–8 Dec 2026): 168.0 h of sunlight with 240 m terrain vs 164.7 h with the 5 m near field — 645 of 720 horizon azimuths are set by near-field terrain.
- **Quality**: `high` is now assigned when the near field is ≤ 20 m and there is no truncation/unknown time.

## 17. Terrain hazard screening (`screening.hazard_screen`)
Grid in the polar stereographic plane at the finest available spacing (≤ 201×201 cells). Slope = central differences (baseline 2 cells); roughness = RMS residual from a 3×3 least-squares plane; local relief = 3×3 max−min; rim/ridge = convex (Laplacian in the 10 % most-negative tail) and steeper than the caution slope. Classes: within thresholds / caution / exceeds / unknown (any NaN in the stencil). Landing-zone summary within a configurable radius; verdict is `unknown` if any zone cell lacks data. Cells larger than 20 m explicitly state that boulders/small craters are not assessed. Screening only — not a hazard certification.

## 18. Dynamic suitability, matrix and sensitivity (`screening.py`)
Per point: finest-LOLA height/slope/roughness (5×5 stencil), curvature-aware 240 m horizon (grid: 2° bins / 150 km; date series: 1° / 300 km), Sun/Earth from one SPICE `spkpos` per epoch (Moon centre, MOON_ME, LT+S) minus the cell position (parallax), any-disk visibility, unknown where the horizon bound makes the state undecidable. Metrics: sunlight % and h, mean solar elevation while lit, Earth %, DTE % and h (optional antenna mask), longest darkness/blackout (sample resolution), Sun-up-but-terrain-blocked %, unknown %. Hard constraints first (missing → `unknown`, never pass); explainable 0–100 score whose breakdown sums to the score; unscored if any weighted input is missing. Sensitivity re-runs the same engine on an n×n grid (spacing user-set) and for date shifts (default −7…+7 days); only computed alternatives that pass every constraint are listed.

## 19. Operational windows (`src/lib/operations.ts`)
Next sunset/sunrise, Earthset, next DTE window, time remaining and darkness/blackout gaps come only from the engine's bisection-refined intervals (10 s), airless (no refraction). Events beyond the analysed window are reported as such, never extrapolated; unknown time is neither visible nor a gap.

## 20. Whole-Moon relief (display)
`LDEM_16` (16 px/deg, V3.1) block-averaged exactly to 4 and 8 px/deg int16 maps; the globe mesh (1° and ⅓° grids, LOD by camera distance) is displaced by `1 + e·h/1737.4 km` with the same parameterisation as the textured sphere, so markers, Moon Trek texture and the regional/site views share coordinates. Default `e = 1.0` (true scale); other values are labelled "visual exaggeration — display only". Science never reads these display maps.

## 21. Validation suite (`science/moonnav_science/validation.py`, `npm run science:validate`)
See `docs/VALIDATION_REPORT.md` (latest: 38 pass, 0 fail, 1 reference unavailable).

## 22. Long-term illumination and permanent shadow (source layers) — `science/moonnav_science/illumination.py`
- **Products**: LOLA team `LPSR_75S_120M_201608` (binary permanent shadow) and `AVGVISIB_75S_120M_201608` / `_EARTH` (average fraction of the Sun's / Earth's disk visible), from Mazarico et al. (2011), NASA GSFC PGDA product 69. These cover 75°S to the pole at 120 m, south polar stereographic on a 1737.4 km sphere, and were computed from LOLA topography with hourly positions over an 18.6-year cycle.
- **Reading**: the label-driven PDS3 reader uses the same projection maths as the DEM reader; values are `DN × SCALING_FACTOR + OFFSET`. Point lookups use the nearest pixel (the products are pixel-registered). Points outside the labelled latitude bound return `null` ("unknown"), never 0.
- **Map layers**: `build_illumination_layers.py` resamples 2×2 to the 240 m map grid. A cell is PSR when ≥ 2 of its 4 source pixels are. Sunlight is an RGBA ramp. Both layers share the map's ±457,440 m extent.
- **Use**: MoonNav shows these as *source data* and never derives PSR boundaries from its own short-window runs. A PSR flag is not evidence of ice and is not a hazard verdict.

## 23. Validation against LOLA illumination products (rows `lola-*`)
- MoonNav's mean Sun visible fraction over 2025-01-01 to 2026-12-31 (6 h samples, SPICE + LOLA horizon, observer 2 m) is compared with AVGVISIB. Solar geometry at the Moon repeats yearly, so a 2-year window represents the Sun; Earth is not compared (it needs the full 18.6-year cycle).
- Checks, with tolerances fixed before the run:
  - 15 random PSR-interior points (5×5 PSR block) need ≥ 90% at ≤ 1% sunlight. Result: 15/15 at 0.
  - 15 random sunlit points need mean |Δ| ≤ 0.05 and max ≤ 0.10. Result: 0.011 / 0.022, Spearman 0.96.
  - Six named sites with multi-resolution terrain need |Δ to the centre pixel| ≤ 0.10, or to fall within the 3×3 range ± 0.05.
- **Resolution map used in analyses**: near-field horizon (≤ 6 km) and hazard/suitability stencils use the finest product available (5 / 20 / 40 m). The far-field horizon (to 300 km) and the suitability grid spacing use 240 m.

## 24. SVS Dial-a-Moon comparison (extended)
For each epoch: sub-Earth and sub-solar points (`subpnt`/`subslr`, LT+S, MOON_ME), Earth–Moon distance, geocentric J2000 RA/Dec (`spkpos` LT+S), apparent diameter 2·asin(1737.4 km / d), and illuminated fraction (1 + cos phase angle)/2 (`phaseq`). Tolerances follow SVS's published precision. Epochs the API clamps (after 2026-12-31) are recorded as *unavailable*, never pass.
