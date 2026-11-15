# Data source provenance — Mission Emergency Simulator

Retrieval metadata below was produced on **2026-11-15** by the page's own source checks (`GET /api/v1/contingency/sources`, `src/lib/contingency-sources.ts`) and by loading real environments through `POST /api/v1/contingency/environment` on the isolated test stack. The same checks run live in the page's *Data sources & scientific provenance* section and are cached for 30 minutes. Distinctions used throughout: **live** (fetched when you load the page or site data), **downloaded/cached** (LOLA tiles and kernels already in MoonNav's science service, checksum-verified), and **illustrative** (assumptions typed or defaulted by the simulator, never labelled as measurements).

## 1. QuickMap — Arizona State University / LROC (NASA LRO data)
* **URL:** https://quickmap.lroc.asu.edu/ (responds HTTP 200 after redirect on 2026-11-15).
* **Provider, stated accurately:** QuickMap is a web application of the LROC Science Operations Center at Arizona State University presenting data from NASA's Lunar Reconnaissance Orbiter. It is **not** a NASA-operated API.
* **Investigation:** the LROC web-map-service host (`https://data.lroc.im-ldi.com/lroc`, redirected from `wms.lroc.asu.edu`) was probed with WMS `GetCapabilities` requests; every request returned the HTML browsing page, not a capabilities document, and no documented machine-readable QuickMap data interface was found. The application's interface was **not** scraped.
* **Status: REFERENCE ONLY.** Linked on the page for visual context. No QuickMap data enters any calculation. The same LRO WAC imagery reaches MoonNav through Moon Trek (below).
* **Owner follow-up (optional):** if ASU documents a public tile or WMS endpoint, it can be added as a further imagery layer.

## 2. NASA Moon Trek — https://trek.nasa.gov/moon/
* **Service used:** WMTS tile service.
* **Product:** `LRO_WAC_Mosaic_SPole60_100m_v02` (south-pole mosaic, ~100 m/px; image/png; matrix set `default028mm`), LRO WAC mosaic by NASA/GSFC/Arizona State University, served by NASA/JPL Solar System Treks. Global equirectangular companion: `LRO_WAC_Mosaic_Global_303ppd_v02`.
* **Retrieval method:** HTTP GET of `https://trek.nasa.gov/tiles/Moon/SP/LRO_WAC_Mosaic_SPole60_100m_v02/1.0.0/WMTSCapabilities.xml` and tiles `…/default/default028mm/{matrix}/{row}/{col}.png`.
* **Retrieval record (2026-11-15):** capabilities HTTP 200, 6,446 bytes, sha256 `88dc1f7ef0acb72d…`; tile 2/1/1 HTTP 200, 71,458 bytes, sha256 `37034df7f49bef6f…`. A listed product, `LRO_LOLA_ClrShade_Global_128ppd_v04` (equatorial LOLA colour-shaded elevation), was confirmed published (capabilities HTTP 200, 6,466 bytes, sha256 `e677a33c9e15917c…`) but is **not** used for the polar 3D terrain.
* **Used for:** the surface imagery of the orbit-view Moon (through MoonNav's existing globe texture loader) and the map basemap elsewhere in MoonNav.
* **Status: DATA INTEGRATED (imagery).** Moon Trek serves rendered tiles; numeric elevation, slope and illumination are **not** taken from tile pixels.
* **Limitation:** layer availability and tile matrices are as published at retrieval time; no Moon Trek elevation or slope download was integrated in this feature (heights come from the LOLA products below).

## 3. NASA JPL Horizons — https://ssd.jpl.nasa.gov/horizons/
* **API:** `https://ssd.jpl.nasa.gov/api/horizons.api` (documentation https://ssd-api.jpl.nasa.gov/doc/horizons.html). Reported by the service on 2026-11-15 as *NASA/JPL Horizons API v1.2*; retrieval record HTTP 200, 1,719 bytes, sha256 `e07bf31417445d3e…` (Moon object data; Horizons' volumetric mean radius 1737.53 km, whereas MoonNav uses the 1737.4 km IAU reference sphere for its geometry and tells Horizons the site on that sphere).
* **Request actually used for the cross-check:** observer table with `COMMAND='10'` (Sun) and `'399'` (Earth), `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='E-lon,lat,height_km'`, `QUANTITIES='4'` (apparent azimuth and elevation), `APPARENT='AIRLESS'`, `ANG_FORMAT='DEG'`, `TIME_DIGITS='SECONDS'`, `CSV_FORMAT='YES'`. This configuration was validated earlier against SPICE (`science/moonnav_science/horizons_live.py`, `docs/VALIDATION_REPORT.md`).
* **Frame, units, time scale:** body-fixed lunar site (east-positive longitude), degrees, UTC. Azimuth clockwise from north, elevation above the local airless horizontal.
* **Used for:** an independent check of the Sun and Earth directions at the landing target, at 3 epochs over 1 hour from the chosen epoch, run when site data is loaded. Result shown in the page: `pass` / `warn` / `fail` with the maximum separation, e.g. Mons Malapert 2026-12-01T06:00Z → `pass`, max separation ≈ 1×10⁻⁶°.
* **Runtime provider remains NAIF SPICE** (`spkcpo`, light time + stellar aberration, MOON_ME). Horizons is a validation, never a silent substitute. If it cannot be reached the page shows `Horizons check: unavailable` and the SPICE result is unchanged and marked unverified by Horizons.
* **Independence caveat:** SPICE kernels and Horizons derive from closely related JPL planetary ephemerides; agreement validates frames, light-time and time conversions, not the ephemeris itself.
* **Status: DATA INTEGRATED (validation).** Fair use: sequential bounded requests, in-process cache, application-specific User-Agent.

## 4. Canadian Space Agency — Moon exploration — https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/
* **Content confirmed on 2026-11-15 (HTTP 200):** the portal lists Canadarm3 ("Gateway's robotic system"), Gateway ("the next major international collaboration in human space exploration"), the Canadian utility rover, the Artemis campaign, and the Lunar Exploration Accelerator Program.
* **Used for:** the explanatory text of why future lunar orbital infrastructure and robotics matter to surface missions, and to frame the **simulated** relay.
* **Status: REFERENCE ONLY.** An information portal; not a telemetry, ephemeris or relay-availability service. **No numerical value from it is used.** Gateway is described as planned future infrastructure; no Gateway or LRO relay availability is asserted.

## 5. MoonNav's existing scientific sources (used by this feature)
| Data | Source | Identifier / resolution | How it enters |
|---|---|---|---|
| Terrain heights, slope, roughness, hazard class | NASA LRO LOLA, PGDA | `lola-ldem-75s-240m-v2` (240 m); `lola-multires-v1` near the pole (5/20/40 m tiles when cached) | `/v1/terrain/hazards`, resampled to ≤ 60 m cells; candidate zones and the 3D terrain |
| 360° terrain horizon | LOLA, curvature-aware engine | 0.5° bins, ≤ 300 km | `/v1/horizon` at the target; direct-Earth and lander→relay terrain checks |
| Sun/Earth direction | NAIF SPICE kernels (manifest `moonnav-kernels-2026-11-10-a`, 1849–2150) | MOON_ME topocentric | `/v1/ephemeris` |
| Long-term Sun/Earth visibility, permanent shadow | LOLA team products (PGDA 69) | 18.6-year averages, 120 m PSR | `/v1/illumination/point` per candidate zone |
Checksums and licences: `science/catalog/*.json`, `docs/DATA_CATALOG.md`.

## 6. Which calculations use which data
| Calculation | Real data used | Illustrative assumptions |
|---|---|---|
| Direct Earth visibility | SPICE Earth az/el, LOLA horizon | antenna mask, lander altitude profile |
| Lander→relay, relay→Earth | SPICE Earth direction, LOLA horizon (leg 1), Moon sphere (leg 2) | relay orbit (altitude, inclination, RAAN, phase) |
| Descent, deviation, recovery | lunar GM and radius | vehicle mass/thrust/Isp/limits, start state, deviation sizes |
| Alternative sites | LOLA slope/roughness/height, long-term illumination | thresholds (15°, 1.5 m, 20 %, 10 %), score weights |
| Optional RF margin | distances from the geometry | **every RF value is typed by the user** |
| Horizons cross-check | Horizons observer table | — |

## 7. Failure behaviour
* Environment API unreachable or Horizons failing → shown as such; the simulator falls back to **ILLUSTRATIVE** geometry (hand-set Earth angles, optional flat horizon) and says so everywhere (`env-error`, `env-meta`). Nothing in that mode is presented as measured.
* Incomplete or out-of-range ephemeris (missing Earth fields, elevation outside ±90°, distance outside 300,000–500,000 km, non-finite numbers) is rejected, not repaired.
* Missing terrain/horizon data → visibility `unknown`; missing candidate data → `unknown` checks → the zone is `UNVERIFIED` and never recommended as safe.
* A Moon Trek or QuickMap outage → the live-check line shows ✗ with the HTTP status; the 3D globe falls back to an untextured sphere.
