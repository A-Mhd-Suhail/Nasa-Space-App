# API reference (checklist endpoints)

Versioned routes live under `/api/v1/*` (full list in `API.md`). The checklist's endpoint names are served by rewrites in `next.config.ts` onto those routes, so both forms work. All responses are JSON; errors use `{ "error": { "code", "message", "requestId", "fieldErrors?" } }` with proper HTTP status codes (400/401/403/404/409/422/429/502/503). Stack traces are never returned. Coordinates: planetocentric latitude, **east-positive** longitude (any input in −360…360 is normalised to [0, 360)), frame MOON_ME. Times: UTC ISO-8601 with `Z`.

| Checklist endpoint | Route | Auth | Notes |
|---|---|---|---|
| `GET /api/sites` | `/api/v1/sites` | public | Curated catalogue (IAU Gazetteer centres + LOLA heights) via the repository layer |
| `GET /api/sites/{id}` | `/api/v1/sites/{id}` | public | 404 when unknown |
| `POST /api/sites` (save custom site) | `POST /api/locations` → `/api/v1/locations` | signed in, editor | `{name, latitudeDeg, longitudeEastDeg, siteId?, note?}`; must be inside 75°S–90°S |
| *(edit saved site)* | `PATCH /api/locations/{id}` | editor | `{name?, note?}` |
| `DELETE /api/sites/{id}` | `DELETE /api/locations/{id}` | editor | catalogue sites are read-only |
| `GET /api/terrain/elevation?lat&lon` | `/api/v1/terrain/point` | public, rate-limited | height, slope (480 m baseline), coverage, product metadata; outside coverage → `covered:false`, `heightM:null` |
| `GET /api/terrain/horizon` | `POST /api/v1/terrain/horizon` | public, rate-limited | 360° curvature-aware horizon profile |
| `GET /api/ephemeris/sun?lat&lon&date&time` (or `&utc=`) | `/api/v1/ephemeris/sun` | public, rate-limited | `azimuthDeg, elevationDeg, distanceKm, angularRadiusDeg, terrainHorizonDeg, state, visible, clearanceDeg, provenance` |
| `GET /api/ephemeris/earth?...` | `/api/v1/ephemeris/earth` | public | same shape; `elevationDeg` is signed |
| `POST /api/analyze` | `/api/v1/analyze` | public, 20/min/IP | Synchronous, **not persisted**: `{latitudeDeg, longitudeDeg, longitudeConvention?, startUtc, hours≤744, stepSeconds, observerHeightM?, antennaMinimumElevationDeg?}` → full result (≤ 5000 samples) |
| `POST /api/compare` | `/api/v1/comparisons` | signed in | `{analysisIds[2..8], gates{minSunFraction, minDteFraction, maxUnknownFraction, minSunHours?, minDteHours?}, weights{sun,dte,energy}}` → rows with `score100`, `breakdown`, `rank`, `tiedWith`, `pareto`, `recommendation`, plus `tradeoffs`, `matrix`, `summary`, `method` |
| *(comparison report)* | `GET /api/v1/comparisons/{id}?format=pdf\|json` | workspace member | downloadable comparison report |
| `GET /api/timeline?lat&lon&date[&time&hours&stepSeconds]` | `/api/v1/timeline` | public, rate-limited | Sun and Earth time series + sunlit intervals + geometric DTE windows |
| `POST /api/reports/generate` | `/api/v1/reports` | editor | `{analysisId, format: pdf\|csv\|json}`; stored with SHA-256, download via presigned URL |
| *(printable mission report)* | page `/app/analyses/{id}/report` | member | Print / Save as PDF, report JSON |
| `GET /api/scenarios` | `/api/v1/scenarios` | signed in | workspace scenarios with latest analysis status |
| `POST /api/scenarios` | `/api/v1/scenarios` | editor | validated scenario input; immutable scientific definition + SHA-256 hash |
| *(rename)* | `PATCH /api/scenarios/{id}` | editor | `{name}` — only the name can change (DB trigger, migration 0008) |
| `DELETE /api/scenarios/{id}` | `/api/v1/scenarios/{id}` | editor | cascades its analyses |
| *(run analysis)* | `POST /api/v1/analyses` `{scenarioId}` | editor | queued job, idempotent per scenario |
| *(validate)* | `POST /api/v1/analyses/{id}/validate` | editor, 6/min | live JPL Horizons cross-check; stored on the analysis; 503 `horizons_unavailable` when Horizons is down |
| *(preferences)* | `GET/PUT /api/v1/me/preferences` | signed in | mode, units, time zone, scoring weights, mission thresholds |

## Science service (internal, bearer `SCIENCE_SERVICE_TOKEN`)
`GET /health` · `GET /v1/products` · `GET /v1/terrain/point|patch|profile` · `POST /v1/horizon` · `POST /v1/analyze` · `POST /v1/ephemeris` · `POST /v1/validate/horizons`. OpenAPI at `/docs` when the service runs; snapshot in `openapi-science.json`.

## Example
```bash
curl "http://localhost:3100/api/ephemeris/earth?lat=-85&lon=31&utc=2026-12-01T06:30:00Z"
# {"body":"earth","azimuthDeg":335.75,"elevationDeg":2.54,"terrainHorizonDeg":4.57,"state":"terrain_blocked","visible":false,...}
```

## Added in the core-feature pass
| Route | Auth | Notes |
|---|---|---|
| `POST /api/v1/terrain/hazards` | public, 30/min | `{latitudeDeg (−90…−75), longitudeEastDeg, halfSizeM ≤ 10 km, slopeCautionDeg, slopeMaxDeg, roughnessCautionM, roughnessMaxM, landingRadiusM}` → height/slope/roughness/relief/class grids, zone summary, verdict, reasons, products used |
| `POST /api/v1/suitability/grid` | public, 12/min | `{latitudeDeg, longitudeEastDeg, startUtc, endUtc, stepSeconds ≥ 600, gridSize 1–21, halfSizeM, config{minSunPct, minDtePct, maxSlopeDeg, maxRoughnessM, maxUnknownPct, maxDarkHours, antennaMaskDeg, weights{sun,dte,slope,roughness,solarElevation}}}` → per-cell metrics, constraint checks, score + breakdown |
| `POST /api/v1/suitability/matrix` | public, 12/min | `{sites[≤8]{key,latitudeDeg,longitudeEastDeg}, startsUtc[≤8], hours, stepSeconds, config}` → site × window evaluations |
| `POST /api/v1/sensitivity` | public, 12/min | `{latitudeDeg, longitudeEastDeg, startUtc, hours, stepSeconds, spacingM, gridSize 3–9 (odd), dayShifts[]}` → location grid deltas, date series, ranges, computed better alternatives |
| `GET /api/terrain/elevation` | public | now also returns `highResolution {productId, resolutionM, heightM, slopeDeg, roughnessM}` when 5/20/40 m tiles are cached |
| `POST /api/v1/demo` | public form POST, 5 per 10 min per IP | creates an isolated 24 h demo account seeded with precomputed analyses and signs it in (303 → `/app`) |
| `/validation` (page) | public | latest validation report (`public/data/validation.json`) |
Science service: `POST /v1/terrain/hazards`, `/v1/suitability/grid`, `/v1/suitability/matrix`, `/v1/sensitivity` (SPICE calls serialised by a process lock).
