# API reference

Web (BFF) API: Next.js route handlers under `/api/v1`, cookie session (Better Auth), JSON. Science API: FastAPI, internal, bearer token — generated schema in `docs/openapi-science.json` (also live at `/docs` on the science service).

## Error contract
```json
{ "error": { "code": "invalid_input", "message": "Request validation failed", "requestId": "…", "fieldErrors": [{ "field": "site.latitudeDeg", "message": "…" }] } }
```
Codes: `unauthorized` 401, `forbidden` / `mfa_required` / `forbidden_origin` 403, `not_found` 404 (also used for objects in other workspaces), `not_ready` / `lease_lost` / `invalid_transition` 409, `invalid_input` 422, `rate_limited` 429, `science_unavailable` 503. No stack traces. Every response has `x-request-id`.

## Public
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/health` | web, database, science (kernels/terrain), worker readiness |
| GET | `/api/v1/sites`, `/api/v1/sites/{siteId}` | verified site catalogue |
| GET | `/api/v1/data-products` | source registry |
| GET | `/api/v1/terrain/point?lat&lon` | LOLA height/slope or `covered:false` (rate limited) |
| GET | `/api/v1/terrain/profile?lat&lon&azimuth&maxM` | heights + elevation angles along one azimuth |

## Signed-in
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/api/v1/projects` | list / create |
| GET/PATCH | `/api/v1/projects/{id}` | detail + scenarios / rename, notes, archive |
| POST | `/api/v1/projects/{id}/duplicate` | copies scenarios as new versions |
| POST | `/api/v1/scenarios` | immutable scenario (see `scenarioInput` in `src/lib/contracts.ts`) |
| GET | `/api/v1/scenarios/{id}` | |
| POST | `/api/v1/analyses` | `{scenarioId}` → **202** `{jobId, analysisId, status, reused}` (idempotent) |
| GET | `/api/v1/analyses/{id}` | status, summary, provenance |
| GET | `/api/v1/analyses/{id}/timeseries?maxPoints&full=1` | downsampled series (full result for `full=1`) |
| GET/DELETE | `/api/v1/jobs/{id}` | progress, attempts, log / cancel |
| POST | `/api/v1/comparisons` | `{analysisIds[2..4], gates, weights}` |
| GET/POST | `/api/v1/reports` | list / `{analysisId, format: pdf|csv|json}` |
| GET | `/api/v1/reports/{id}` | metadata + 5-min download URL |
| GET/POST | `/api/v1/reports/{id}/share-links` | list / create (token shown once) |
| DELETE | `/api/v1/share-links/{id}` | revoke |
| POST | `/api/v1/storage/presign-download` | `{reportId}` → short-lived URL |
| POST | `/api/v1/terrain/horizon` | horizon profile for a coordinate |
| GET | `/api/v1/terrain/patch?lat&lon` | 3D terrain patch |
| GET/PATCH/DELETE | `/api/v1/me` | profile, onboarding, account deletion (`{confirm:"DELETE"}`) |
| GET | `/api/v1/me/export` | personal data export |

## Curator / admin (MFA required)
| Method | Path | Role |
|---|---|---|
| PATCH | `/api/v1/admin/products/{id}/status` | curator — `{status, reason}` with allowed transitions |
| POST | `/api/v1/storage/presign-upload` | curator — R2 only |
| PATCH | `/api/v1/admin/users/{id}/role` | admin — `{role, reason}` |
| POST | `/api/v1/admin/jobs/{id}/retry` | admin |

## Internal (worker, bearer `SCIENCE_SERVICE_TOKEN`)
`POST /api/internal/jobs/claim` (204 when empty) · `POST /api/internal/jobs/{id}/heartbeat` · `/complete` · `/fail` — all require the current `leaseToken`.

## Example analysis request (scenario definition sent to the worker)
```json
{
  "site": { "latitudeDeg": -85.98, "longitudeEastDeg": 358.33, "observerHeightM": 2 },
  "timeRange": { "startUtc": "2026-11-15T00:00:00Z", "endUtc": "2026-11-22T00:00:00Z", "sampleStepSeconds": 600 },
  "products": { "terrainProductId": "lola-ldem-75s-240m-v2", "ephemerisProvider": "spice" },
  "assumptions": { "antennaMinimumElevationDeg": 5, "solarPanel": null },
  "options": { "sunVisibilityRule": "any_disk", "earthVisibilityRule": "any_disk", "refineToleranceSeconds": 10, "aberrationCorrection": "LT+S" }
}
```

## Worker-facing result contract

The complete result schema the worker posts (`POST /api/internal/jobs/{id}/complete`) mirrors `src/lib/analysis-types.ts` (`AnalysisResult`): status/quality(+rule/reasons), site, timeRange, sun & earth summaries with refined intervals (DTE windows separate from geometric visibility), power block (status-gated by panel assumptions), 720-bin horizon with unseen-terrain bounds, full time series and provenance (kernel files + SHA-256, coverage, DEM product metadata, method/software versions). Validation lives in the completion route's Zod schema.

## Metadata routes

`GET /robots.txt`, `GET /sitemap.xml` (Next metadata routes; public pages crawlable, workspace/admin/API/share disallowed).
