# MoonNav — Scientific methodology (method `moonnav-method-1.1.0`)

Code: `science/moonnav_science/`. Tests: `science/tests/` (129 pytest tests) and the reference suite `npm run science:validate`. This document is the consolidated methodology; `docs/SCIENTIFIC_METHODS.md` keeps the detailed derivations and per-version notes and does not contradict it. What was added in 1.1.0 is marked **(1.1.0)**.

MoonNav is an educational and mission-planning decision-support tool. It is not a flight-certified navigation, landing-hazard-avoidance, solar-power or radio-communications system (see §12).

## 1. Data sources

| Source | Used for | Identifier / version | Integration |
|---|---|---|---|
| NASA/JPL NAIF SPICE kernels | Sun and Earth positions, Moon orientation, time conversion | `naif0012.tls`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, `de440s.bsp`, one MOON_ME frame kernel (`moon_de440_250416.tf`, or its checksum-verified predecessor `moon_de440_220930.tf` with a disclosed warning) | Downloaded from NAIF (checksum-verified mirrors as fallback); SHA-256 pinned in `science/catalog/kernels.json`; coverage checked per analysis (1849–2150 UTC) |
| NASA PDS — LRO LOLA GDR | Terrain heights | `LDEM_75S_240M` v2.0 (3812², 240 m); `LDEM_80S_40M`, `LDEM_85S_20M`, `LDEM_875S_5M` (v2.0, byte-range tiles, near field ≤ 6 km); `LDEM_16` v3.1 (global relief, display) | SHA-256 and PDS-label checks in `science/catalog/products.json`; tiles cached with provenance sidecars |
| LOLA team illumination products (Mazarico et al. 2011, NASA PGDA product 69) | Permanent shadow (PSR) and 18.6-year average Sun/Earth visibility, source layers only | `LPSR_75S_120M_201608`, `AVGVISIB_75S_120M_201608`, `…_EARTH` (V1.05, 120 m, 75°S–pole) | Labelled "source data"; never derived by MoonNav; unknown outside 75°S, never 0 |
| JPL Horizons API v1.2 | Independent validation of Sun/Earth azimuth and elevation | request `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `APPARENT='AIRLESS'` | Offline fixtures in `science/tests/fixtures/` plus a live per-analysis cross-check; never a silent runtime substitute |
| NASA SVS Dial-a-Moon API (values stamped on SVS 4930 frames) | Validation of sub-Earth/sub-solar points, distance, RA/Dec, diameter, illuminated fraction | `svs.gsfc.nasa.gov/api/dialamoon/<UTC>` (tables end 2026-12-31) | `validation.svs_dialamoon`; clamped epochs are "unavailable" |
| NASA Moon Trek WMTS | 2D/3D imagery texture (visual context only) | LRO WAC layers | Browser-side; never used for elevation |
| IAU/USGS Gazetteer | Named-site centres | `src/data/sites.json` (17 sites) | Catalogue, labelled "feature centres, not NASA candidate sites" |

Full provenance (retrieval dates, checksums, licences): `docs/DATA_CATALOG.md`, `docs/DATA_SOURCES.md`. Every analysis stores kernel manifest ID, per-file SHA-256, terrain product ID and metadata, method and software versions, sampling and tolerance (`result.provenance`), and the UI exposes them in Advanced mode and in every report.

## 2. Coordinate systems

| Item | Convention |
|---|---|
| Body-fixed frame | `MOON_ME` (alias of `MOON_ME_DE440_ME421`, the mean-Earth/polar-axis frame of the LOLA products) |
| Latitude | planetocentric, degrees, north positive. Never mixed with geodetic latitude: Horizons "GEODETIC" on a 1737.4 km sphere equals planetocentric |
| Longitude | east-positive, canonical [0, 360); west-positive input is converted explicitly; wrapping tested (`-230.22 ≡ 129.78`) |
| Reference surface and datum | sphere R = 1737.4 km; heights are metres relative to that sphere (LOLA `OFFSET`) |
| Observer | LOLA surface height at the site plus observer height (default 2 m) |
| Local frame (ENU) | `up = (cos φ cos λ, cos φ sin λ, sin φ)`, `east = (−sin λ, cos λ, 0)`, `north = (−sin φ cos λ, −sin φ sin λ, cos φ)`; at exactly ±90° "north" points along the site's longitude meridian (documented, tested) |
| Azimuth | clockwise from local north: 0 N, 90 E, 180 S, 270 W |
| Elevation | degrees above the local horizontal plane; negative below |
| DEM plane | spherical south-polar stereographic, `x = 2R tan(π/4 + φ/2) sin λ`, `y = 2R tan(π/4 + φ/2) cos λ`; scale factor differs from 1 by < 0.5 % inside 75°S |

## 3. Time systems

UTC in and out (a trailing `Z` is required); SPICE TDB/ET internally via `naif0012.tls` (`utc_to_et`). Tests: UTC↔ET round trip and a known offset; ΔT 2026 within 0.002 s (periodic TDB−TT term < 1.7 ms). Sampling is a uniform step (30 s – 24 h, at most 20,000 samples). The UI labels all times UTC.

## 4. Sun and Earth ephemeris

`spkcpo(target, et, "MOON_ME", "OBSERVER", "LT+S", site_km, "MOON", "MOON_ME")`: a constant-position observer on the rotating Moon's surface, apparent geometry with light time and stellar aberration (`aberrationCorrection` is part of the scenario and the provenance). Per sample the engine returns Sun and Earth azimuth, elevation, distance, angular radius (Sun radius 695,700 km, IAU 2015 B3; Earth equatorial radius from `pck00011.tpc`) and the terrain horizon at each body's azimuth. Earth–Moon distance is reported per sample **(1.1.0: `earthDistanceKm`)**.

No ephemeris is invented: an unsupported epoch raises a typed 422 (kernel coverage), and there is no approximate fallback.

**Validation (see `SCIENTIFIC_VALIDATION_REPORT.md`):** Horizons vs SPICE great-circle separation ≤ 1×10⁻⁶°; SVS Dial-a-Moon sub-points ≤ 0.00071°, distance ≤ 0.6 km, RA/Dec ≤ 0.00075°, diameter ≤ 0.04″.

## 5. Terrain horizon (curvature-aware)

For azimuth bins θ (default 0.5°) and distances d from one DEM pixel to 300 km in pixel steps, a point on the reference sphere `p = cos δ·up + sin δ·(sin θ·east + cos θ·north)`, δ = d/R, is projected to the DEM and sampled. The elevation from the observer (radius r₀ = R + h_site + h_obs) is
`el = atan2((R + h)·cos δ − r₀, (R + h)·sin δ)`,
exact 3D geometry, so lunar curvature is included. Horizon(θ) is the maximum over the covered part of the ray; at a Sun/Earth azimuth it is interpolated across bins (wrap-around tested). A ray is "covered" until its first no-data sample; beyond it, an **upper bound** assuming +11 km terrain (above the Moon's highest point) is computed, and any state that would change under that bound is reported **unknown**, never "clear". Near-field terrain (≤ 6 km) uses the finest cached LOLA product (5/20/40 m); the far field uses 240 m. The result lists blocking distance, coverage and truncated rays; terrain beyond DEM coverage is never invented.

## 6. Visibility, partial disks and event times

With disk centre elevation e, angular radius r and horizon h:
- `visible` if e − r ≥ h; `partial` if e − r < h < e + r; `terrain_blocked` if e + r ≤ h and e + r > 0; `below_horizon` if e + r ≤ h and e + r ≤ 0; `unknown` if the state would change under the unseen-terrain bound, or the horizon is null.
- Visible fraction of a partial disk: `f = 1 − (acos d − d·√(1 − d²))/π`, d = clamp((e − h)/r, −1, 1) (circular-segment area; tested at tangency and limits).
- Lit rule: `any_disk` (default), `full_disk` or `center`.

**Event refinement.** Intervals are built from the samples; every change of the lit flag is bisected between the two bracketing samples until the bracket is ≤ the refinement tolerance (default 10 s). Edges at the analysis bounds are flagged unrefined. The sampling step and the numerical tolerance are separate, both reported: an interval boundary is a refined event time, never a sample time. Sampling-sensitivity test: 60/15/5-minute steps agree within 60 s.

**Darkness metrics (1.1.0).** `totalDarkSeconds` is the known not-visible time between visible/unknown intervals; `longestDarkS`, `longestVisibleS`, `darkIntervalCount` and `interruptionCount` (dark gaps between two visible intervals) follow from the refined interval edges. Time accounting is tested: visible + dark + unknown = analysis window (±1 s) at four sites for Sun and Earth.

## 7. Solar irradiance, incidence and energy

Three different quantities are kept apart:
1. **Sun geometry** (position, visibility): §4–§6.
2. **Direct sunlight on the ground** (physical irradiance): `S(t) = 1361 W/m² × (1 AU / r_sun)²` (TSI at 1 AU, Kopp & Lean 2011) scaled by `max(0, n_terrain · ŝ)` and the visible Sun-disk fraction. Reported per sample as `sunIrradianceWm2` (normal to the Sun), `surfaceIncidenceDeg`, `terrainIrradianceWm2` **(1.1.0)**.
3. **Panel electrical output (modelled, user-configured):** `P = S·A·η·max(0, n̂_panel·ŝ)·f_vis·derating`, capped at `P_max`; energy by the trapezoidal rule over the samples. Panel orientation: fixed normal (azimuth/elevation; tilt = 90° − normal elevation), two-axis tracking (cos = 1), or **terrain-aligned (1.1.0)**, where the panel normal is the DEM surface normal. Without panel assumptions the result states `not_calculated_missing_panel_assumptions`; sunlight hours are never presented as electrical output.

**Surface normal (1.1.0, `surface.py`).** Heights are sampled at ±baseline/2 east, west, north and south of the site along the local ENU axes (central differences; baseline = 2 × the finest local DEM pixel: 10 m on 5 m data, 480 m on 240 m data); `n = normalise(−∂h/∂E, −∂h/∂N, 1)`. Slope = angle from local up; aspect = the azimuth the surface faces (downhill). Missing heights make the normal **unavailable**: nothing is assumed flat, and a terrain-aligned panel then fails with a typed 422. Verified against analytic planes (5–20° slopes, four facing directions, the pole) and the incidence limits (normal, grazing, behind-slope).
Limits: the incidence angle is evaluated at the Sun-disk centre (a sliver of disk showing while the surface faces away correctly gives zero); the normal represents terrain at the baseline scale, not lander-foot scale; direct beam only (no scattered/reflected light, earthshine, temperature, dust or storage).

## 8. Geometric Direct-to-Earth visibility, and the optional link margin

A geometric DTE window requires Earth lit under the selected rule and, if configured, Earth's centre above the antenna elevation mask (`below_antenna_mask` is reported separately). Outputs: windows (refined start/end, duration), total and fractional visibility, per-sample Earth azimuth, elevation, horizon, distance and state. **This is line of sight, not a radio link.** The UI, API, reports and exports say so.

**Optional link margin (1.1.0, `link_budget.py`, Advanced mode).** From values the user supplies (no defaults): `FSPL = 20 log₁₀(4π d f / c)`; `C/N₀ = EIRP − FSPL − L_other + G/T + 228.6`; `Eb/N₀ = C/N₀ − 10 log₁₀ R`; `margin = Eb/N₀ − Eb/N₀_required`. Evaluated at the Earth–Moon distance of each geometric-DTE sample. Not modelled: antenna patterns and pointing (use "other losses"), ground-station availability and DSN scheduling, weather, terrain multipath, coding details. Verified against the textbook form `20 log d_km + 20 log f_MHz + 32.44` (≤ 0.01 dB) and 6.02 dB per doubled distance or frequency, 3.01 dB per doubled data rate.

## 9. Slope, roughness and hazard screening

All on a regular local grid (spacing = max(finest DEM pixel, 2·half-size/(max cells − 1))) in the polar-stereographic plane.
- **Slope:** central differences over 2 × spacing, `atan(|∇h|)`.
- **Roughness:** RMS of residuals of a 3×3 best-fit plane (metres), valid at the stencil scale only. With a 240 m DEM this is not spacecraft-scale roughness and is labelled by its resolution.
- **Relief:** 3×3 max − min; **curvature:** Laplacian; rims/ridges: convex and steeper than the caution slope.
- **Hazard classes** (configurable): within thresholds / caution (> 8° slope or > 0.5 m roughness) / exceeds (> 15° or > 1.5 m) / unknown (any no-data neighbour). Defaults are screening starting points, **not** a universal safe-landing threshold; the landing-zone verdict uses a user radius (default 100 m). Missing data is never counted as safe.
- Edge cells and cells next to no-data are `NaN`. Tests: plane slope exact, roughness zero on planes, steep terrain flagged, unknown data never a pass.

## 10. Comparison and suitability

Candidates are compared only when compatible (time span ±1 step, step, terrain product, kernel manifest, method version, visibility rules, antenna mask); otherwise ranking is withheld with the reason. Hard gates (minimum sunlit fraction, minimum DTE fraction, maximum unknown fraction, maximum slope, maximum dark hours) give pass/fail/unknown; the weighted score uses bounded metrics (defaults: Sun 35, DTE 30, slope 20, roughness 10, solar elevation 5; user-editable) and treats missing values as unknown, never zero. Panel energy enters only when assumptions are identical. Trade-off text and the Pareto set are computed from the same numbers. Recommendations are conditional on date, assumptions, data quality and weights; no site is "optimal" in general.

## 11. Uncertainty and data quality

Quality `high` requires a ≤ 20 m near-field DEM; `medium` a 240 m DEM with complete coverage and no unknown samples; `low` < 5 % unknown samples; otherwise `insufficient`. Reasons are returned with every analysis. Resolution caveats: 240 m smooths the near-field horizon (the Shackleton–de Gerlache ridge differs by ≈ 0.19 in mean sunlight between 240 m and multi-resolution terrain); sub-120 m shadows are not in the LOLA PSR product; the 5/20/40 m products cover only 87.5°S / 85°S / 80°S to the pole.

## 12. Assumptions and limitations

Idealized geometry and direct-beam irradiance only; spherical reference surface; no atmosphere (airless); no dust, thermal, battery or electrical-system effects; Earth modelled as a sphere of equatorial radius; no RF link or DSN modelling beyond the optional margin; no flight certification of any kind. Where data cannot support a conclusion the result says "unknown" or "unavailable". See `docs/KNOWN_LIMITATIONS.md`.

## 13. Reproducibility and caching

Same inputs produce the same output (`test_analysis_is_deterministic`). Horizons for a site are cached by (DEM product, site, horizon parameters); tiles are cached with SHA-256 sidecars and provenance; job results are stored once with a SHA-256 re-verified on read. Idempotency keys combine the scenario definition hash and the queue version. A change of method version marks earlier analyses as "computed with an earlier method" in the UI.
