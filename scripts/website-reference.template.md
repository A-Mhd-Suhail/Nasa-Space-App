# MoonNav Complete Website Reference

> Generated {{GENERATED_AT}} by `scripts/build-website-reference.mjs` from this template (`scripts/website-reference.template.md`) plus live inventories scanned from the source and a real crawl of the running application. Regenerate with `node scripts/build-website-reference.mjs` after any UI or API change; do not edit the generated tables by hand.
> Inventory size: {{COUNTS}}
> Crawl evidence: {{STATS}}

---

## 1. Document purpose and scope

This file is the single reference for the implemented MoonNav website: what every page, menu, control, form, workflow, API and scientific feature is, what it does when used, and how well that has been verified. It describes **what exists today**, not plans.

How it was produced and how far to trust it:
- **Source-derived:** routes, access rules, API handlers (methods, guards, rate limits, science calls), internal science endpoints, database tables, environment-variable *names*, UI strings, components and tests were scanned from the repository.
- **Observed:** every page was loaded in a real browser (Chromium 1440×900, plus 390×844 for key pages) in four viewer roles (anonymous, demo, ordinary signed-in user, admin with MFA) against the **isolated local test stack** (`scripts/test-stack.mjs`, local test database, outbox mail). Headings, navigation, buttons, links, form fields, tabs, tables and notices in section 19/20/7–18 are read from the live DOM, not written from memory. Up to nine non-destructive buttons per distinct page were actually clicked and their effect recorded (navigation, dialog, API call, state toggle).
- **Not executed on purpose:** sign-out, delete/remove/revoke/archive, role changes, ingestion, job retry/cancel, password/MFA changes and every form submit were inspected but not clicked in the crawl; they are documented from the source and from the automated tests named in section 31.
- **Production:** public pages and the demo were separately verified against https://moonnav.vercel.app by the read-only production suites (section 31). Nothing destructive was run there.
- **Secrets:** no credentials, tokens, keys or user records appear here; environment variables are listed by name only.

Status vocabulary used throughout: **VERIFIED WORKING** (implemented, and exercised by an automated test or the crawl), **IMPLEMENTED — NOT FULLY VERIFIED**, **PARTIALLY IMPLEMENTED**, **UNAVAILABLE**, **BROKEN**, **BLOCKED**.

## 2. MoonNav product overview

**MoonNav — Lunar Landing Site Navigator** answers the NASA Space Apps 2026 challenge: *where and when should a lander consider touching down, judged by sunlight, geometric Direct-to-Earth (DTE) visibility and terrain?* Given a lunar south-polar site (a named feature or any point inside 75°S), a UTC window and optional solar-panel assumptions, it:

1. computes the Sun and Earth positions seen from that exact surface point (NASA/JPL NAIF SPICE, light-time and aberration corrected);
2. builds a 360° terrain horizon from NASA LRO LOLA elevation data, including lunar curvature, and compares each body's *disk* with it (visible, partial, terrain-blocked, below horizon, unknown);
3. refines every sunrise, sunset and Earth-visibility edge to seconds;
4. reports sunlight, darkness, ground irradiance and (if configured) idealized panel energy;
5. reports geometric DTE windows (explicitly **not** radio-link availability), plus an optional illustrative link margin from user-supplied values;
6. screens terrain (slope, roughness, relief, rim/ridge signatures) and compares several sites and dates with transparent constraints and weights;
7. exports reports (PDF, JSON, CSV) with full provenance.

It is an educational and decision-support prototype. It is **not** NASA-owned or endorsed, not a flight-certified navigation, hazard-avoidance, power or communications tool, and it never presents unknown data as safe or visible (`/limitations`).

Architecture in one paragraph: Next.js 16 app (public) → Supabase PostgreSQL + Supabase Storage + Gmail SMTP, calling an internal FastAPI science service (SPICE + LOLA) over a bearer token; queued analyses are drained on demand (Vercel) or by a polling worker (local). Details: section 23, `docs/DEPLOYMENT.md`, `SCIENTIFIC_METHODOLOGY.md`.

## 3. Important terminology and glossary

| Term | Meaning in MoonNav |
|---|---|
| Site | A named IAU feature centre (17 in the catalogue) or any user point inside 75°S–90°S. Not a NASA candidate site. |
| Scenario | An immutable set of inputs: site, UTC window, step, terrain product, assumptions. Editing creates a new version. |
| Analysis | The completed result of running a scenario through the science engine. Stored once with a SHA-256. |
| Job | The queued unit of work that produces an analysis (`queued → running → completed/failed/cancelled`). |
| Sunlit / direct sunlight | Time when any part of the Sun's disk is above the local terrain horizon (default rule `any_disk`; also `full_disk`, `center`). |
| Partial | Disk straddles the horizon; visible area fraction is reported. |
| Terrain blocked / below horizon | Disk entirely under the terrain line / under the geometric horizon. |
| Unknown | DEM coverage cannot settle the state; never counted as visible or safe. |
| Geometric DTE | Earth in line of sight above the terrain (and above the antenna mask, if set). **Not** a communications link. |
| Antenna elevation mask | Minimum Earth elevation your antenna can use; windows below it are reported as `below_antenna_mask`. |
| Terrain horizon | Maximum elevation angle of the terrain at each azimuth, curvature-aware (LOLA). |
| PSR | Permanently shadowed region (LOLA team product, 120 m); source data, never derived by MoonNav. |
| Ground irradiance | Direct-beam W/m² on the real ground (surface normal from the DEM): physical, not electrical. |
| Panel energy | Idealized electrical output of the user's panel assumptions (Wh); modelled. |
| DEM / LOLA | Digital elevation model from NASA's Lunar Orbiter Laser Altimeter (240 m everywhere; 40/20/5 m near the pole). |
| Method version | Version of the science engine (`moonnav-method-1.1.0`); older analyses show "computed with an earlier method". |
| Simple / Advanced mode | Header switch: plain-language summaries vs. quality, provenance and expert panels. |
| Demo workspace | An isolated 24-hour account pre-seeded with four precomputed analyses; labelled precomputed. |
| Data tags | Small badges: calculated, precomputed, modelled, cached, unavailable (what kind of number this is). |

## 4. Complete website sitemap

Routes from the Next.js router (every `page.tsx`), with the access rule found in code and the first components each page imports:

{{SITEMAP}}

Route groups: `(public)` is the marketing/reference/auth area; `/app/**` is the signed-in workspace; `/admin/**` requires role curator or admin **and** enabled two-factor authentication; `/settings/**` is account settings for signed-in users; `/dev/mail` is the local outbox viewer (development only). Dynamic segments: `[analysisId]`, `[projectId]`, `[siteId]` (a catalogue site key such as `mons-malapert`), `[token]` (share-link or invitation token).

### 4.1 What each viewer role actually gets (crawl)

HTTP status (or redirect target) when each role opened each URL in the isolated stack. A redirect means the route is protected for that role.

{{ACCESS_MATRIX}}

## 5. Global navigation and menus

### 5.1 Public header (all `(public)` pages)
Left to right: the **MoonNav** logo (links to `/`), then the primary navigation **Explore → `/explore`**, **Learn → `/learn`**, **Methodology → `/methodology`**, **Data sources → `/sources`**, **Validation → `/validation`**, **About → `/about`**; then the **Simple / Advanced** mode switch (radiogroup “Display mode”, advanced hides nothing on public pages but reveals expert panels), the **colour theme** switch (radiogroup “Colour theme”: *Light theme*, *Dark theme*, *Match system*), then either **Sign in → `/login`** and **Start planning → `/register`** (anonymous) or **Open workspace → `/app`** (signed in). On screens narrower than the `sm` breakpoint the navigation collapses into a mobile menu button (`PublicMobileNav`) containing the same links and the sign-in actions. The footer carries the legal and reference links and an external link to the NASA Space Apps challenge page (opens in a new tab with `rel="noopener noreferrer"`).

### 5.2 Workspace header and sidebar (`/app/**`, `/settings/**`, `/admin/**`)
Header (left to right): **MoonNav** logo (→ `/app`), the **workspace switcher** (shows the current workspace name and role; lists the workspaces you belong to and switches the active one through `POST /api/v1/workspaces/{id}/switch`), the **Simple / Advanced** switch, the global **search** button (opens the command palette, also **Ctrl/Cmd + K**), the live **service status chip** (links to `/sources`), the **theme** switch and the **profile menu** (avatar with your initials). A yellow **demo banner** appears under the header for demo accounts.

Sidebar groups and items in their displayed order:
- **Plan:** Overview (`/app`), Projects (`/app/projects`), Scenario Builder (`/app/scenarios/new`), Workspaces (`/app/workspaces`).
- **Analyse:** Site Explorer (`/app/explorer`), Site Detail & 3D (`/app/sites/mons-malapert`), Sun & Power (`/app/analysis/sun`), Earth & DTE (`/app/analysis/earth`), Mission Planner (`/app/planner`), Emergency Simulator (`/app/contingency`), Compare (`/app/compare`), Reports (`/app/reports`).
- **Reference:** Learn (`/learn`), Methodology (`/methodology`), Data sources (`/sources`).
- **Administration** (only for curator/admin): Operations (`/admin`), Data products (`/admin/data`), Ingestion (`/admin/ingestion`), Jobs (`/admin/jobs`); admins additionally see Users & roles (`/admin/users`) and Audit log (`/admin/audit`).
On small screens the sidebar becomes the navigation drawer opened from the header.

### 5.3 Profile menu (avatar)
Items: **Profile & preferences → `/settings/profile`**, **Security & MFA → `/settings/security`**, **All settings → `/app/settings`**, **Sign out** (ends the session through Better Auth and returns to the public site).

### 5.4 Command palette (search)
Opens from the header **search** button or **Ctrl/Cmd + K**. A dialog labelled “Search” with a combobox (placeholder “Search pages, sites, projects, scenarios…”, accessible name “Search pages, sites, projects, scenarios and locations”). Results are grouped **Pages**, **Sites**, **Projects**, **Scenarios**, **Saved locations** (from `GET /api/v1/search`, debounced). Arrow keys move the selection, **Enter** opens it, **Esc** or the “Close search” backdrop closes it and returns focus to the button.

### 5.5 Live navigation observed in the crawl

{{NAVIGATION}}

### 5.6 Mode and theme switches
**Simple** (default) shows plain-language summaries (“PlainSummary”, “BlockExplanation”) and hides expert panels; **Advanced** adds data-quality, provenance, kernel/terrain identifiers, the optional link-margin panel and the diagnostics (“Perf”) button. Switching does not reload the page and persists (browser storage + `PATCH /api/v1/me/preferences` when signed in); a toast confirms the change. The theme switch sets `data-theme` and persists.

## 6. User roles and access permissions

| Role | How obtained | Can do |
|---|---|---|
| Anonymous visitor | — | All `(public)` pages: Explore map/3D with real LOLA data, Learn, Methodology, Data sources, Validation, About, legal pages; sign up, sign in, reset password, verify email; open share links and invitations; start the demo. |
| Demo user | “Try the demo, no account” / “Continue with demo” | Everything an ordinary user can see, in an isolated 24-hour workspace with four prepared analyses. **Cannot:** change password/email or MFA, delete the account, invite members, reach `/admin`, receive email. Deleted after 24 h. |
| User | Registration + email verification | Own workspace(s): projects, scenarios, analyses, planner, compare, reports, share links, saved locations, annotations, settings, MFA. |
| Analyst | Role set by an admin | As user (rank 2). |
| Curator | Role set by an admin; **MFA required** | Data-product curation: `/admin`, `/admin/data`, `/admin/ingestion`, `/admin/jobs`; ingestion and product status APIs. |
| Admin | First admin created by the owner with `scripts/grant-role.ts`; **MFA required** | Everything above plus `/admin/users` (change roles, with a reason) and `/admin/audit`. |

Workspace roles (separate from account roles): **owner**, **editor**, **viewer**; viewers cannot create or edit. Enforcement is server-side on every request (`src/lib/dal.ts`: `requirePageUser`, `requirePageRole`, `requireApiRole`, `assertWorkspaceAccess`): unauthenticated page requests redirect to `/login?next=…`, insufficient role redirects to `/app?denied=1` (“Access denied”), admin without MFA redirects to `/settings/security?mfa=required`; API calls answer 401/403/404 with the standard error contract. The access matrix in 4.1 shows the observed result per role.

## 7. Homepage — complete documentation (`/`)

**Purpose:** introduce the product, let a visitor try it with no account, and explain the mechanism. **Access:** public. **Reach it:** the MoonNav logo or the address `/`.

Top to bottom (live headings and controls are listed in the generated page record PG-01 below): hero with the H1 and sub-text; call-to-action buttons **Start mission planning** (→ `/app/scenarios/new?guided=1`, which routes anonymous visitors through sign-in), **Explore without an account** (→ `/explore`), **Try the demo, no account** (form `POST /api/v1/demo`), **How it works** (in-page anchor `#method`); a rotating 3D Moon (React Three Fiber, real LOLA relief and NASA imagery) showing the four precomputed stations; sections explaining the mechanism (a real horizon, demonstrated), audiences, validation and sources; footer.
**What happens on “Try the demo, no account”:** the button shows “Preparing your demo…” and is disabled; the browser POSTs to `/api/v1/demo` (CSRF-checked, 20 per 10 minutes per client); the server creates an isolated demo user, seeds four precomputed analyses and signs it in; a `303` redirect lands on `/app?demo=1`. If anything fails the visitor is redirected to `/login?demo=failed` (“Demo could not be started”) or `?demo=busy`. **Status: VERIFIED WORKING** (5 demo tests × 3 browsers locally; production demo start 3.4 s).

## 8. Explore page — complete documentation (`/explore`, and `/app/explorer`)

**Purpose:** a public, no-account view of the south pole: LOLA map layers, named sites, any-point inspection, precomputed Sun/Earth results and the 3D scenes. The same component (`ExploreClient`) powers the signed-in Site Explorer, which adds saving.
**Reach it:** header **Explore**, or sidebar **Site Explorer**. **State is in the URL** (`?site=…&tab=…`).

Components: the **polar map** (OpenLayers, custom polar projection, LOLA hillshade by default) with a basemap switch (*LOLA relief* / *LROC WAC imagery* via NASA Moon Trek), layer checkboxes (feasibility, elevation, slope, **Permanent shadow (PSR)**, **Long-term sunlight**, graticule, named sites, coverage edge, saved locations), legends with data source and caveats, a coordinate form (“lat e.g. -89.45”, “lon °E e.g. 222.7”), a **site list** with search, and a results area with tabs **Sun & Power**, **Earth & DTE**, **Site 3D**, **Polar region 3D**, **Global Moon**. Clicking the map picks a point: the clicked-point card shows coordinates, LOLA height and slope, permanent-shadow flag and the 18.6-year average Sun/Earth visibility (from `GET /api/v1/illumination/point`) with its caveat. The feasibility layer screens a real grid against user thresholds. Selecting a featured station shows its precomputed analysis (labelled *precomputed*); **Run analysis / Save** links go to sign-in when anonymous.
**APIs:** `/api/v1/sites`, `/api/v1/terrain/point`, `/api/v1/terrain/profile`, `/api/v1/illumination/point`, `/api/v1/locations` (signed in). **Status: VERIFIED WORKING** (`public.spec.ts`: map, layers, PSR, feasibility, globe, Moon Trek tiles, sky plot; three browsers).

## 9. Analysis pages

### 9.1 Scenario Builder (`/app/scenarios/new`)
**Purpose:** define an immutable scenario and run it. Numbered sections: **1 · Project and name** (project select, scenario name), **2 · Site** (*Verified named site* or *Custom coordinates* with latitude/longitude and longitude convention; observer height), **3 · Time window** (UTC start/end, preset span buttons, **Time step** select with the sample count and the 20,000-sample limit shown), **4 · Assumptions** (antenna mask, **solar panel** area/efficiency/derating and **Orientation**: *Two-axis Sun tracking*, *Fixed normal* (azimuth and elevation of the panel normal), *Flat on the ground (follows the local DEM slope)*; maximum output), and options (visibility rules, refinement tolerance, terrain product). A right-hand **Validation & coverage** card checks the input live (terrain coverage at the site, sample count, ephemeris coverage, horizon settings). Buttons: **Save & run analysis** (creates the scenario, creates the analysis job, then opens `/app/analyses/{id}`), **Save scenario only** (opens the project). With `?guided=1` the form is pre-filled with a one-week Mons Malapert example. Server validation errors appear next to the field.
**APIs:** `POST /api/v1/scenarios`, `POST /api/v1/analyses`; validation `scenarioInput` in `src/lib/contracts.ts`. **Status: VERIFIED WORKING** (`workspace.spec.ts`, `solar-surface.spec.ts`).

### 9.2 Analysis status and results (`/app/analyses/[analysisId]`)
Header with the scenario name/version, a status badge and **Cancel analysis** while queued/running. While running, a **Job progress** card shows attempt, real stage names (validating_input, loading_spice_kernels, loading_dem, computing_terrain_horizon, sampling_sun_and_earth, extracting_sun_intervals, integrating_solar_power, uploading_result) and a log; polling is 1 s, then 2.5 s, then 5 s. When complete: a summary card (quality, method version, completion time), links **Sun & Power**, **Earth & DTE**, **Report**, an optional **Validate against JPL Horizons** card, annotations, and a stale-method banner if the analysis predates the current engine. **Status: VERIFIED WORKING.**

### 9.3 Sun & Power (`/app/analysis/sun?analysisId=…`) and Earth & DTE (`/app/analysis/earth?analysisId=…`)
See section 10.

### 9.4 Mission Planner (`/app/planner`)
Four tools sharing one **Site and window** card: **Landing suitability map** (grid of cells scored for the window: SPICE Sun/Earth, terrain horizon, LOLA slope/roughness, hard constraints and an explainable score), **Site × date suitability matrix**, **Terrain hazard screening** (slope, roughness, relief, rim/ridge signatures at the finest LOLA product available; a “Fetch high-resolution terrain” checkbox and a coverage box showing which 5/20/40 m tiles are cached and the estimated download), and **Location and date sensitivity** (5×5 grid and −7…+7 day shifts; every alternative shown was computed). Results carry a `terrainData` note stating which products served the answer (ok / partial / fallback / cached-only). **APIs:** `/api/v1/suitability/grid`, `/api/v1/suitability/matrix`, `/api/v1/terrain/hazards`, `/api/v1/sensitivity`, `/api/v1/terrain/coverage`. **Status: VERIFIED WORKING** (`planner.spec.ts`).

### 9.4b Mission Emergency Simulator (`/app/contingency`)
A 3D decision-support simulation (labelled `SIMULATED MISSION — NOT LIVE SPACECRAFT CONTROL`): six preset scenarios, a descent (LOLA terrain) view and an orbit (relay) view, simulation controls (Start/Pause/Resume/Reset, speed, timeline), emergency triggers (communication blackout, overshoot, undershoot, excessive descent velocity), maneuver evaluation (emergency braking, lateral correction, alternative-site evaluation), status panels (spacecraft, communication, recovery, outcome), a state machine log, communication-window timeline, an optional RF margin (user values only), a historical-learning section, the CSA infrastructure note and a live Data Sources & Scientific Provenance section. **APIs:** `POST /api/v1/contingency/environment`, `GET /api/v1/contingency/sources`. **Status: VERIFIED WORKING** (`contingency.spec.ts`; see `MISSION_CONTINGENCY_SIMULATOR.md`).

### 9.5 Compare (`/app/compare?ids=a,b,…`)
Needs at least two completed analyses (otherwise “At least two completed analyses are needed”). **Mission requirements** (hard constraints: min sunlit fraction/hours, min DTE fraction/hours, max unknown fraction, max local slope) are applied first and never averaged into the score; **weights** (Sun 35, DTE 30, slope 20, roughness 10, solar elevation 5 by default) are editable; outputs: ranked table, **Score breakdown**, **Combined: sunlit vs geometric DTE fraction** with the dashed **Pareto** front, **Direct-to-Earth hours per scenario**, **Direct-to-Earth across dates**, **Mission trade-offs** in plain language, the **site × date matrix**, and exports (JSON/CSV/PDF). Ranking is withheld with a reason when analyses are incompatible (different step, terrain product, kernels, method version, rules or mask). **API:** `POST /api/v1/comparisons`. **Status: VERIFIED WORKING** (`features.spec.ts`).

## 10. Scientific results pages

**Sun & Power** top to bottom: live summary strip (selected time), the **time controller** (reset, step back, play/pause, step forward, speed 1×–86,400×, step size, playback range, scrubber; scientific values are read from the sampled timeline, never computed per animation frame), plain-language summary (Simple mode), the “why is it blocked” explanation, operational windows panel, stat tiles (Sun azimuth, Sun elevation, terrain horizon at the Sun's azimuth, clearance, state at selected time with visible-disk %), totals (direct sunlight, sunlit intervals, elevation while lit, next transition), the **Sunlight timeline** chart (Sun elevation vs terrain horizon with shaded sunlit intervals; click selects a time), the **polar sky plot / horizon panorama** (stored 360° horizon with Sun and Earth tracks, zoom/full-sky toggle), the **Direct-sunlight intervals** table (refined start/end, duration, “refined” flags), **Ground surface and irradiance** (new in method 1.1.0: ground slope and the azimuth it faces, Sun incidence angle on the ground, irradiance now and mean/peak/energy per m², longest continuous darkness and number of interruptions; labelled physical irradiance, not electrical output), **Solar-panel energy** (assumptions, energy Wh, peak/mean W, trapezoidal integration note) with the **power chart**, and in Advanced mode the quality and provenance panels (kernels, terrain product, frames, versions).

**Earth & DTE** adds the same controls and the red/violet **Earth visibility timeline** with the antenna-mask line and DTE bands, the Earth stat tiles, the **Geometric DTE windows** table and, in Advanced mode, the **Optional link-margin estimate** (you supply frequency, EIRP, receiver G/T, data rate, required Eb/N0 and other losses; **Estimate link margin** calls `POST /api/v1/link-budget` for the Earth–Moon distances of the geometric-DTE samples and shows worst/mean margin, the share of samples with margin ≥ 0 dB and the free-space path loss). The mandatory notice “Geometric Direct-to-Earth visibility — not RF link availability” is always shown. **Status: VERIFIED WORKING** (`features.spec.ts`, `solar-surface.spec.ts`, `reliability.spec.ts`; science results validated, see `SCIENTIFIC_VALIDATION_REPORT.md`).

## 11. Terrain and visualization pages
- **Site Detail & 3D (`/app/sites/[siteId]`):** a catalogue site with local terrain patch (Three.js, real LOLA relief), light direction from the selected analysis time, and links to analyses.
- **Polar region 3D / Site 3D / Global Moon** (Explore tabs): R3F scenes with real elevation; the global Moon uses LOLA `LDEM_16` relief at true scale by default (exaggeration is labelled) and NASA WAC imagery; selecting a site flies to it.
- **Diagnostics (“Perf” button, Advanced only, or `?perf=1`):** live FPS, frame-time percentiles and long tasks, “Record 10 s” and JSON export. Baseline: 60 FPS on the test machine (`docs/perf/`).
**Status: VERIFIED WORKING** (visual regression, globe and region E2E, perf-panel E2E).

## 12. Validation pages
`/validation` lists every reproducible comparison with NASA/JPL references (SPICE time identities, Horizons az/el, SVS Dial-a-Moon, LOLA cross-product and cross-projection, LOLA illumination products), each with source, product, epoch, method, MoonNav value, reference value, difference, tolerance and result; “unavailable” references are shown as such. Source data is `public/data/validation.json`, regenerated by `npm run science:validate`. **Status: VERIFIED WORKING** (52 pass, 0 fail, 1 unavailable). Per-analysis **Validate against JPL Horizons** (analysis page) runs a live cross-check through `POST /api/v1/analyses/{id}/validate` and reports an outage honestly.

## 13. Reports and export pages
- **Reports (`/app/reports`):** list of generated reports with format, size, created time; download (short-lived signed URL), **share link** creation (expiry, revoke) and deletion.
- **Mission report (`/app/analyses/[analysisId]/report`):** the printable report: site, window, assumptions, results (including darkness, ground slope/irradiance, panel energy), the Sun/Earth chart, horizon, DTE windows, quality, provenance, limitations. Buttons: **Print** and the export bar **PDF / CSV / JSON** (each creates a report row via `POST /api/v1/reports`, stores the file in Supabase Storage and downloads it through `POST /api/v1/storage/presign-download`).
- **Shared report (`/share/[token]`):** read-only public view of one report, no account; invalid or revoked links show an explanatory page.
**Status: VERIFIED WORKING** (PDF/CSV/JSON export, signed-URL tamper check, share/revoke in `workspace.spec.ts`).

## 14. Authentication pages
| Page | Route | What it does |
|---|---|---|
| Sign in | `/login` | Email + password; **Forgot password?**; **Continue with demo**; “Verify your email first” notice with **Send a new link** for unverified accounts; MFA accounts are redirected to the code page; wrong credentials show an error; rate-limited (8/min per client). |
| Two-factor | `/login/two-factor` | 6-digit authenticator code, or a one-time **backup code**; successful verification continues to `?next=` (validated by `safeNext`). |
| Create account | `/register` | Name, email, password, confirm, terms checkbox. Client rules: name required; valid email; password ≥ 12 characters with letters and a number/symbol, not containing the email name; passwords match; terms accepted. On success: “Check your inbox” (verification link valid 24 h). If the address already has an account: **“You have already created an account with this email address. Please sign in.”** with **Sign in**, **Forgot password?**, **Use a different email** and a rate-limited **Send a new link** (409 `ACCOUNT_EXISTS`; nothing else about the account is revealed). Sign-up is limited to 5/min per client; email is trimmed and lower-cased; the database enforces uniqueness on `lower(email)`. |
| Verify email | `/verify-email` | Form to request a new link; the emailed link calls `GET /api/auth/verify-email?token=…`, which verifies, signs in and redirects; invalid/expired tokens return here with an error banner (“This verification link is invalid or has expired”). Already-used links are harmless. |
| Forgot password | `/forgot-password` | Email form (pre-filled from `?email=`); always answers “If an account exists for that address…” (non-enumerating); 3 requests per 5 minutes per client. |
| Reset password | `/reset-password?token=…` | New password + confirm; success returns to `/login?reset=1`; all other sessions are revoked. |
| Invitation | `/invite/[token]` | Shows the workspace invitation and **Accept** (signed-in) or sign-in prompt. |
**Status: VERIFIED WORKING** (`auth-fixes`, `workspace`, `signup-duplicates`, `verification`, `security` specs on three browsers; production email delivery confirmed by the owner).

## 15. User account and settings pages
- **Onboarding (`/app/onboarding`):** first-run choice of mode and terms acknowledgement; required before the dashboard for new accounts.
- **Overview (`/app`):** workspace name, **Projects** and **New scenario** buttons, **Guided demo tour** (demo accounts), **Recent analyses** table, a “Getting started” card (Simple mode), service/worker status card and recent saved locations.
- **Projects (`/app/projects`, `/app/projects/[projectId]`):** create, open, duplicate, rename, delete (type the project name to confirm), list scenarios and analyses.
- **Workspaces (`/app/workspaces`):** switch, create, rename; members (invite by email with a role, change role, remove), pending invitations (revoke).
- **Profile & preferences (`/settings/profile`):** name, preferred mode, display time zone (display only; science is UTC), data export, delete account (type DELETE).
- **Security & MFA (`/settings/security`):** change password (revokes other sessions), enable two-factor (password → QR code + secret + one-time backup codes → verify a code), regenerate backup codes, disable, list and revoke sessions.
- **All settings (`/app/settings`):** units, scoring weights and mission thresholds saved per user (`PATCH /api/v1/me/preferences`).
**Status: VERIFIED WORKING** (`workspace.spec.ts`, `security.spec.ts`, `features.spec.ts`).

## 16. Demo experience
Entry points: home **Try the demo, no account**, login **Continue with demo**. The demo user is created by `startDemo` (`src/lib/demo.ts`), email `demo-…@demo.moonnav.invalid` (never emailed), pre-verified, role user, expires after 24 h. Seeding copies four precomputed analyses (Mons Malapert, Mons Mouton, Shackleton, de Gerlache; computed by the same engine, labelled *precomputed*, with generated time) and four saved locations into a project “Demo · South Pole candidates”. The dashboard shows the **Guided demo tour** (six steps: Open a prepared analysis → Watch the Sun and Earth → Compare sites and dates → Screen the terrain → Export the mission report → Run your own scenario). Demo users can run real new analyses through the normal pipeline. Restrictions and isolation are enforced server-side and tested. **Status: VERIFIED WORKING** (locally 15/15 demo tests; production 15/15).

## 17. Admin pages and workflows
Roles: curator can use `/admin`, `/admin/data`, `/admin/ingestion`, `/admin/jobs`; admin additionally `/admin/users` and `/admin/audit`. MFA must be enabled first.
- **Operations (`/admin`):** system health (web, database, science, worker incl. on-demand mode), job counts by status, links.
- **Data products (`/admin/data`):** the product registry with provenance; **status transitions** (discovered → validated → approved → deprecated…) each requiring a reason and written to the audit log; invalid transitions are refused (422).
- **Ingestion (`/admin/ingestion`):** ingestion runs and per-product ingest (`POST /api/v1/admin/products/{id}/ingest`); direct file upload is **UNAVAILABLE** on Supabase Storage (`presign-upload` returns 501; data is loaded with scripts).
- **Jobs (`/admin/jobs`):** all jobs with status, attempts, errors; **retry** a failed job (`POST /api/v1/admin/jobs/{id}/retry`).
- **Users & roles (`/admin/users`, admin):** search users, change role with a mandatory reason (`PATCH /api/v1/admin/users/{id}/role`); escalation to admin by a curator is refused; every change is audited.
- **Audit log (`/admin/audit`, admin):** filterable list of audit events.
**Status: VERIFIED WORKING** for access control, MFA enforcement and role/status changes (`security.spec.ts`); the page contents above are from the crawl as admin (section 7–18 live records), destructive buttons were not clicked.

## 18. Curator pages and workflows
Curators see the Administration group limited to Operations, Data products, Ingestion and Jobs. They can change a data product's status with a reason and run ingestion; they cannot change user roles or read the audit log. **Status: VERIFIED WORKING** (curator role tested in `security.spec.ts`; crawl covered the admin view of the same pages).

## 19. Complete button and interaction inventory

Every page's buttons, links, tabs, tables and notices, read from the live DOM per distinct page (IDs `PG-nn` for pages and `BTN-nn-mm` for buttons are stable only within one generated document; use the page route plus the exact label to cite an element). For each button the last column is what actually happened when it was clicked in the isolated stack, or why it was not clicked.

{{PAGE_DETAILS}}

## 20. Complete form and input inventory

The form-field tables inside each page record above are the exhaustive list (label, element type, placeholder, required, constraints, default, options) as rendered. Validation messages and error strings implemented in the code:

{{ERRORS}}

Server-side contracts (zod): `src/lib/contracts.ts` (scenario input, panel, rules), `src/app/api/v1/**/route.ts` (each route validates its body; invalid input returns **422** `invalid_input` with `fieldErrors`; malformed JSON returns **400** `invalid_json`; oversize bodies **413**).

## 21. Complete user workflow documentation

### WF-01 First visit and public exploration
1. Open `https://moonnav.vercel.app/`. 2. Click **Explore without an account** (or header **Explore**). 3. On `/explore` the polar map loads with LOLA relief. 4. Click a named site in the list (for example **Shackleton**) or click anywhere inside 75°S on the map. 5. Read the clicked-point card (height, slope, permanent shadow, long-term sunlight). 6. Switch the result tabs **Sun & Power**, **Earth & DTE**, **Site 3D**, **Polar region 3D**, **Global Moon**. *Outcome:* real, labelled data; nothing is saved. *Errors:* tile failures show a notice and fall back to LOLA layers.

### WF-02 Try the demo
1. On `/` click **Try the demo, no account** (or on `/login` click **Continue with demo**). 2. Wait for “Preparing your demo…” (about 3 s). 3. You land on `/app?demo=1` with the demo banner and **Guided demo tour**. 4. Follow the six tour links in order. *Failure:* `/login?demo=failed` explains that the sample workspace could not be prepared and links to `/explore`; `?demo=busy` means too many demos from your network.

### WF-03 Choose a site, a date and run an analysis
1. Sign in (or use the demo). 2. Sidebar **Scenario Builder**. 3. Pick the project; type a scenario name. 4. In **Site** choose *Verified named site* and a site, or *Custom coordinates*. 5. In **Time window** set UTC start and end (or a preset span) and a **Time step**. 6. Optionally open the solar-panel section and set area, efficiency, derating and **Orientation**. 7. Check the **Validation & coverage** card for green ticks. 8. Click **Save & run analysis**. 9. The analysis page shows **Job progress** with real stages; when finished the summary and links appear. *If the form is invalid* the **Save** buttons stay disabled and the field shows the server or client message.

### WF-04 Inspect Sun, terrain obstruction, irradiance and panel energy
1. From the analysis page open **Sun & Power**. 2. Click or drag the timeline, or press **Play** and choose a speed; the state tiles, the polar horizon plot and the panorama follow the selected sample. 3. Read **Direct sunlight over interval**, the intervals table, **Ground surface and irradiance** and **Solar-panel energy**. 4. Switch to **Advanced** to see data quality and provenance.

### WF-05 Inspect Earth visibility and DTE windows
1. Open **Earth & DTE**. 2. Read the warning that geometric visibility is not a radio link. 3. Use the timeline and the **Geometric DTE windows** table. 4. Optional (Advanced): fill the link-margin form and click **Estimate link margin**.

### WF-06 Terrain suitability and hazards
1. Sidebar **Mission Planner**. 2. In **Site and window** choose a site and window. 3. Run **Landing suitability map**, **Terrain hazard screening**, **Site × date suitability matrix** or **Location and date sensitivity**. 4. For hazards, tick **Fetch high-resolution terrain** to use 5/20/40 m tiles (a coverage box shows the download estimate); untick to use only cached tiles.

### WF-07 Compare sites and dates
1. Run (or open) at least two analyses. 2. Sidebar **Compare**, select analyses (or arrive from the demo tour link). 3. Set **Mission requirements** and weights. 4. Read the ranking, **Score breakdown**, **Pareto** chart and **Mission trade-offs**. 5. Export JSON/CSV/PDF.

### WF-08 Export, download and share a report
1. Open an analysis → **Report**. 2. Click **PDF**, **CSV** or **JSON**. 3. The file downloads through a signed URL that expires after 5 minutes. 4. In **Reports** create a **share link** and copy it; open it in a private window to check; revoke it to disable it.

### WF-09 Sign up and verify
1. `/register`, fill the form, tick the terms checkbox, **Create account**. 2. “Check your inbox”. 3. Open the email (subject “Verify your MoonNav email”), click the link (valid 24 h). 4. You are signed in and sent to onboarding. If the email has not arrived: `/login` → sign in → **Send a new link** (3 per minute). *Duplicate address:* the existing-account screen described in section 14.

### WF-10 Sign in, reset a password
Sign in at `/login`. Forgot: **Forgot password?** → email → reset link (valid 30 minutes) → `/reset-password` → new password → sign in.

### WF-11 Enable two-factor authentication
`/settings/security` → **Enable** (password) → scan the QR code → store the backup codes → enter a 6-digit code → verified. Later sign-ins ask for a code at `/login/two-factor` (or a backup code).

### WF-12 Update account settings
`/settings/profile` for name, mode and time zone; `/app/settings` for units, weights and thresholds; `/settings/security` for password and sessions.

### WF-13 Admin: first administrator and routine tasks
See `DEPLOYMENT.md` §6: the person registers and verifies, the owner runs `scripts/grant-role.ts` from a trusted shell, the user enables MFA, then `/admin` opens. Routine: change a product status (reason required), retry a failed job, change a role (reason required), read the audit log.

### WF-14 Curator
As an admin with the Administration group reduced to Operations, Data products, Ingestion and Jobs.

### WF-15 Workspace collaboration
`/app/workspaces` → invite by email and role → the invitee opens `/invite/[token]` → **Accept**.

## 22. Scientific capability-to-UI mapping

| Scientific capability | Page | UI component (source) | User action | API | Calculation (science) | Result shown |
|---|---|---|---|---|---|---|
| Sun ephemeris (az/el, distance, angular radius) | Sun & Power | `AnalysisViews.SunView` stat tiles | move the timeline / play | `GET /api/v1/analyses/{id}/timeseries` (stored result); new run: `POST /api/v1/analyses` → job → `POST /v1/jobs/compute` | `ephemeris.SpiceEphemeris` (`spkcpo`, MOON_ME, LT+S) in `analysis.run_analysis` | Sun azimuth, elevation, distance per sample |
| Earth ephemeris | Earth & DTE | `AnalysisViews.EarthView` | same | same | same, target EARTH | Earth azimuth, elevation, distance (`earthDistanceKm`) |
| Terrain horizon | Sun / Earth pages, Explore | `HorizonCard`, `PolarSkyPlot`, `HorizonPanorama` | timeline selection | stored in `result.horizon`; point lookups `GET /api/v1/terrain/horizon` | `horizon.compute_horizon` (curvature-aware, multi-resolution) | 360° horizon, blocking distance, truncated rays |
| Visibility, partial disk | Sun / Earth | `StatePill`, state tiles | timeline | stored | `visibility.classify`, `disk_fraction_above` | visible / partial / blocked / below / unknown and visible-disk % |
| Event times | Sun / Earth tables | `IntervalTable` | — | stored | `visibility.extract_intervals` (bisection to the tolerance) | refined start/end, duration, “refined” flags |
| Solar illumination and darkness | Sun & Power | totals, `SolarSurfacePanel` | — | stored | `analysis.summary` (longest dark, interruptions, total dark) | sunlit hours, %, darkness metrics |
| Surface incidence and ground irradiance | Sun & Power | `SolarSurfacePanel` | timeline | stored | `surface.terrain_normal`, `incidence_cos`; `power.irradiance_w_m2` | slope, aspect, incidence, W/m², Wh/m² |
| Solar panel energy | Sun & Power | `PowerPanel`, `PowerChart` | set panel in Scenario Builder | `POST /api/v1/scenarios` | `power.power_w`, `integrate_wh` | W, Wh, peak, mean |
| Geometric DTE windows | Earth & DTE | `IntervalTable`, `ElevationTimeline` | timeline | stored | `analysis` DTE intervals with antenna mask | windows, %, count |
| Optional link margin | Earth & DTE (Advanced) | `LinkBudgetPanel` | fill form → **Estimate link margin** | `POST /api/v1/link-budget` → `POST /v1/link-budget` | `link_budget.margin_db`, `fspl_db` | margin dB, FSPL (illustrative) |
| Slope, roughness, hazards | Mission Planner | `PlannerClient` | **Terrain hazard screening** | `POST /api/v1/terrain/hazards` → `/v1/terrain/hazards` | `screening.hazard_screen`, `slope_roughness` | hazard map, class shares, landing-zone verdict |
| Suitability, matrix, sensitivity | Mission Planner | `PlannerClient` | run each tool | `/api/v1/suitability/grid`, `/matrix`, `/sensitivity` | `screening.evaluate` family | scored maps, tables, alternatives |
| Site/date comparison, Pareto | Compare | `CompareClient` | choose analyses, weights | `POST /api/v1/comparisons` | `src/lib/compare.ts` | ranking, gates, trade-offs |
| PSR and long-term sunlight | Explore map, mission report | `ExploreClient`, `MissionReport` | toggle layers, click | `GET /api/v1/illumination/point` | `illumination.point` (LOLA team rasters) | PSR flag, Sun/Earth average visibility |
| Validation | Validation page; analysis page | `validation/page.tsx`, `HorizonsValidation` | **Validate against JPL Horizons** | `POST /api/v1/analyses/{id}/validate` | `horizons_live.cross_check` | az/el difference vs Horizons |

Live-updating inputs: moving the timeline updates every tile, chart marker and the sky plot for that sample (values come from the stored result, no recomputation). Changing site, window, step or panel requires a new scenario and analysis (inputs are immutable by design).

## 23. API and backend data flow

Typical flow (new analysis): browser form → client validation (`ScenarioBuilder`) → `POST /api/v1/scenarios` (auth, workspace access, zod `scenarioInput`, immutable row + SHA-256 definition hash) → `POST /api/v1/analyses` (idempotency key = definition hash + queue version; creates `analysis` and `analysis_jobs` rows; after the response `after()` starts `drainJobs()`) → `drainJobs` leases the job (`FOR UPDATE SKIP LOCKED`) and calls science `POST /v1/jobs/compute` (bearer token) → `run_analysis` (kernels, DEM, horizon cache, sampling, intervals, power, surface) returns the result and real stage timestamps → the app stores the result in Supabase Storage (`analysis/<workspace>/<analysis>/result.json`, SHA-256) and marks the job completed → the status page polls `GET /api/v1/jobs/{id}` → the result page loads `GET /api/v1/analyses/{id}/timeseries`. Locally a polling worker (`science/moonnav_science/worker.py`) replaces `drainJobs`. Caches: horizon by (DEM product, site, params); LOLA tiles on disk with SHA-256 sidecars (`MOONNAV_TILE_CACHE`); result by definition hash; static assets via CDN headers. Errors: typed 422 for invalid input and coverage, 503 `science_unavailable`, upstream outage codes passed through, job retry with attempt limit.

Web API routes (`src/app/api/**/route.ts`):

{{API_TABLE}}

Internal science service (FastAPI, not publicly routable; every route except `/health` needs `SCIENCE_SERVICE_TOKEN`):

{{SCI_TABLE}}

## 24. Database and storage mapping
Supabase PostgreSQL tables (Drizzle schema `src/db/schema.ts`, migrations `drizzle/0000…0009`, RLS enabled): {{TABLES}}. Identity tables (`user`, `session`, `account`, `verification`, `two_factor`, `rate_limit`) belong to Better Auth; `user` has a unique index on `lower(email)` and a check that emails are trimmed and lower-case. Object storage: Supabase Storage private bucket `moonnav-objects` (analysis results and reports; server-side access only, signed URLs expire after 5 minutes) and `moonnav-build-assets` (packed LOLA sunlight rasters for the science build). Environment variable names the app reads (`src/lib/env.ts`): {{ENV}}.

## 25. Scientific data sources and assets
See `SCIENTIFIC_METHODOLOGY.md` §1 for the table (NAIF SPICE kernels, LOLA GDR 240/40/20/5 m and global LDEM_16, LOLA illumination products, Horizons, SVS, Moon Trek, IAU Gazetteer), checksums in `science/catalog/*.json`, licences in `docs/DATA_CATALOG.md`. Static web assets generated by `science/scripts/build_assets.py` and `build_illumination_layers.py`: map layers (`public/data/lola_*`), terrain patches, the feasibility grid, the four demo analyses (`public/data/demo`), relief grids, `validation.json`.

## 26. Loading, empty, error and success states

Empty states implemented:

{{EMPTY}}

Notices and alerts implemented (titles):

{{NOTICES}}

General patterns: forms show per-field errors and disable their submit button while busy; analysis jobs show real stages and a log; data tags say whether a number is calculated, precomputed, modelled, cached or unavailable; unknown or missing scientific data is shown as “unknown/unavailable”, never as zero or safe; service outages show the banner “MoonNav could not reach its server…” or the status chip; 404 shows a branded page; unexpected render errors show “Something went wrong on this page” with **Try again** and **Back to MoonNav** (the error message name is logged to the console for diagnosis).

## 27. Responsive design and browser behavior
- **Desktop/laptop (≥1280 px):** full header with status chip, sidebar visible, two-column result layouts.
- **Tablet and phone:** the public navigation collapses into a menu button; the workspace sidebar becomes a drawer; result grids stack; charts resize with their container; tables scroll horizontally inside their card; the demo tour and dashboard fit a 375 px viewport with no sideways page scroll (tested). The service status chip is hidden below the `xl` breakpoint. The 3D scenes use pointer/touch orbit and pinch zoom; keyboard focus styles and reduced-motion are respected.
- **Browsers:** the full E2E suite (88 tests) passes on **Chromium, Firefox and WebKit**; WebKit/Firefox-specific bugs fixed in this pass include a time-zone hydration mismatch and a cancelled-fetch crash. Mobile *layout* was tested in an emulated 390×844 Chromium viewport; no physical phone or Safari-on-iOS testing was done (stated as a limitation).

## 28. Component inventory and source file mapping

{{COMPONENTS}}

## 29. Exact UI labels and terminology
Use the live-DOM records in section 19 for exact labels per page. Naming rules in the product: “direct sunlight” (not “daylight”), “geometric DTE” (never “communication” without “not RF link availability”), “precomputed” vs “calculated” vs “modelled” data tags, UTC everywhere for science, azimuth clockwise from north, elevation above the local horizon, planetocentric latitude, east-positive longitude. Mode names: **Simple**, **Advanced**. Theme options: **Light theme**, **Dark theme**, **Match system**. Primary buttons: **Save & run analysis**, **Save scenario only**, **Create account**, **Sign in**, **Send reset link**, **Estimate link margin**, **Try the demo, no account**, **Continue with demo**.

## 30. Known limitations and unavailable features
- **UNAVAILABLE:** curator direct file upload (needs the unused R2 driver; scripts load data); mobile-device (physical) testing; OAuth/social login; AI assistant.
- **PARTIALLY IMPLEMENTED:** RF link modelling (optional illustrative margin only; no DSN scheduling, antenna patterns, weather or multipath); roughness is at DEM-stencil scale (not lander-foot scale); 5/20/40 m terrain only near the pole (5 m to 87.5°S, 20 m to 85°S, 40 m to 80°S); ground irradiance is direct-beam only and incidence is evaluated at the Sun-disk centre; long-term Sun/Earth visibility on Vercel uses 0.001-rounded copies.
- **BLOCKED / owner:** none for the website itself; production credentials rotation and the first administrator are owner actions (`FINAL_PRODUCTION_READINESS_REPORT.md`).
- **Defect found by the first crawl and fixed:** `/invite/[token]` returned a 500 for every link (missing query provider). It was fixed in commit `907d38b`, covered by an E2E test, verified on production, and the crawl in this document was re-run on the fixed code: the page now renders (an unknown token shows the invalid-invitation state). The valid-token state (invitee accepts) is documented from the source (`InvitationAcceptClient`); the API emails the token and never returns it, so the crawl could not open a live one.
- Full list: `docs/KNOWN_LIMITATIONS.md`, `SCIENTIFIC_METHODOLOGY.md` §12.


## 30.1 Current deployment and production route status
- Repository `A-Mhd-Suhail/Nasa-Space-App` (private), branch `main`, deployed commit `907d38b` (method `moonnav-method-1.1.0`). Vercel project `hack-zz/moonnav`, production deployment `dpl_FRa2u69REnyutZ86aEjhJD7v1fsn` (`moonnav-7x3tj4e4p-hack-zz.vercel.app`), region `hnd1`, served at https://moonnav.vercel.app. Deployed with the Vercel CLI from the clean working tree (the project has no Git integration, so Vercel records no Git SHA; see `FINAL_PRODUCTION_RELEASE_REPORT.md`).
- HTTP status of each URL on production, anonymous, redirects not followed (307 = redirect to sign-in, i.e. protected; `/dev/mail` 404 = development-only page is absent in production):

| URL | Status |
|---|---|
| `/` | 200 |
| `/explore` | 200 |
| `/learn` | 200 |
| `/methodology` | 200 |
| `/sources` | 200 |
| `/validation` | 200 |
| `/about` | 200 |
| `/login` | 200 |
| `/register` | 200 |
| `/forgot-password` | 200 |
| `/verify-email` | 200 |
| `/reset-password` | 200 |
| `/invite/x` | 200 |
| `/share/x` | 200 |
| `/app` | 307 |
| `/app/projects` | 307 |
| `/admin` | 307 |
| `/settings/security` | 307 |
| `/dev/mail` | 404 |
| `/api/v1/health` | 200 |
| `/api/v1/sites` | 200 |


## 31. Verification and test evidence

| Evidence | Result |
|---|---|
| Full E2E, isolated stack (`npm run test:e2e:stack`) | 264 passed, 0 failed (88 per browser × Chromium, Firefox, WebKit), 2026-11-13 |
| Production read-only suites after deploying `907d38b` (Chromium) | 35 passed: public, demo, reliability and solar-surface (disposable demo accounts only) |
| Science (pytest) | 129 tests; scientific reference suite 52 pass / 0 fail / 1 unavailable |
| Unit (Vitest) | 62 tests |
| Production read-only suites (public, demo, reliability) | recorded in `docs/TESTING.md` |
| Crawl behind this document | {{STATS}} |

Automated tests (titles as written):

{{TESTS}}

## 32. Screenshot inventory

{{SHOTS}}

## 33. Common troubleshooting
| Symptom | Check |
|---|---|
| “Demo could not be started” | `GET /api/v1/health` (database, science); production logs for `demo start failed … cause`; files under `public/` must be in `outputFileTracingIncludes` (`next.config.ts`). |
| Analysis stays queued | Local: is the worker running (`npm run dev`)? Vercel: `worker.status` should be `on_demand`; check `drainJobs` errors and that `SCIENCE_SERVICE_TOKEN` matches in both services. |
| “Failed query” / random 500s in production | Supabase session-pooler connection limit (15): see `docs/DEPLOYMENT.md` “Database connections”. |
| Email not received | `npx vercel logs -e production --json` and look for `mail.delivery` (status, SMTP response, message id); search Gmail by `rfc822msgid:`; remember the three per-client rate limits. |
| Analysis shows “computed with an earlier method” | Re-run the scenario (the stale banner has the action). |
| No ground-irradiance panel data | The analysis predates method 1.1.0, or the DEM has no heights around the site (the panel says which). |
| Firefox fails to launch in automation | Run Playwright from a normal terminal, not a sandboxed tool shell. |

## 34. Developer maintenance guide
- Run everything locally: `npm run dev` (database, science, worker, web). Isolated test stack: `npm run test:e2e:stack`. Science: `npm run science:test`, `npm run science:validate`. Regenerate this reference: start the stack with `STACK_ONLY=1 node scripts/test-stack.mjs`, run `node scripts/crawl-site.mjs`, then `node scripts/build-website-reference.mjs`.
- Add a page: create `src/app/<route>/page.tsx`, guard with `requirePageUser`/`requirePageRole`, add it to the navigation arrays (`PUBLIC_NAV` in `PublicShell.tsx`, `GROUPS`/`ADMIN` in `AppNav.tsx`), add an E2E test, regenerate this document.
- Add an API route: `route()` wrapper from `src/lib/http.ts`, validate with zod, authorise with `requireApiUser`/`requireApiRole`, rate-limit sensitive routes, add a test.
- Add a scientific output: implement in `science/moonnav_science/`, add pytest with an analytic expectation, bump `METHOD_VERSION` when results change, regenerate the demo analyses (`build_demos`), update `SCIENTIFIC_METHODOLOGY.md` and the validation report.
- Deploy: `docs/DEPLOYMENT.md`. Never run the registering/security E2E specs against production.

## 35. Quick navigation and feature lookup index
Sun position → section 10 / `AnalysisViews.SunView`. Earth visibility → section 10 / `EarthView`. DTE windows → 10, 22. Terrain horizon → 22 / `horizon.py`. Irradiance and slope → 10 / `SolarSurfacePanel`. Panel energy → 10 / `PowerPanel`. Link margin → 10 / `LinkBudgetPanel`. Hazards → 9.4. Compare → 9.5. Reports → 13. Demo → 16. Login/sign-up/duplicate → 14. MFA → 15, WF-11. Admin → 17. API list → 23. Tables → 24. Tests → 31. Screenshots → 32.

### Ask Me Anything About MoonNav — AI Quick Reference
| Question | Answer |
|---|---|
| Where do I start an analysis? | Sidebar **Scenario Builder** (`/app/scenarios/new`); button **Save & run analysis**. |
| What does **Save & run analysis** do? | `POST /api/v1/scenarios` then `POST /api/v1/analyses`, then opens `/app/analyses/{analysisId}` with live job progress. |
| Which API computes sunlight? | The job calls science `POST /v1/jobs/compute` → `analysis.run_analysis`; results are read with `GET /api/v1/analyses/{id}/timeseries`. |
| Which page shows terrain blocking the Sun? | **Sun & Power** (`/app/analysis/sun`): timeline (horizon grey area), sky plot/panorama, state tiles. |
| Is “Earth visible” a communications guarantee? | No. It is geometric line of sight; the page says so. The optional **Estimate link margin** uses only user-supplied values. |
| What decides “unknown”? | DEM coverage cannot settle the state (rays leave coverage, or null horizon). Never shown as visible or safe. |
| Where is the 3D Moon? | Home hero; Explore tab **Global Moon**; **Polar region 3D**; **Site 3D**. |
| How do I compare sites? | **Compare** with ≥ 2 completed analyses; or **Mission Planner → Site × date suitability matrix**. |
| Where are exports? | Mission report page (**PDF**, **CSV**, **JSON**) and **Reports**; downloads use 5-minute signed URLs. |
| Who can open `/admin`? | Role curator or admin with MFA enabled; users and audit are admin only. |
| Why did the demo fail in production once? | `public/data/demo/*.json` was not bundled into the function; fixed with `outputFileTracingIncludes`. |
| Which component renders X? | Section 28 (file, exports, props, API paths, pages). |
| How do I reproduce a user workflow? | Section 21 (WF-01…WF-15), click by click. |
| What should I check when a page is empty? | Section 33. |

## 36. Final completeness checklist
- [x] Routes compared with the Next.js router (section 4 is generated from `page.tsx` files; {{COUNTS}})
- [x] Navigation compared with the live DOM (5.5) and the source (`PUBLIC_NAV`, `AppNav`)
- [x] Buttons, links, fields, tabs, tables per page from the live DOM (section 19)
- [x] Components scanned from `src/components` (section 28)
- [x] API routes and science endpoints scanned from source (section 23)
- [x] Status labels follow test evidence (section 31)
- [ ] Not covered by an executed click: every form submit and destructive action (listed as “Not executed” with reasons in section 19)
- [ ] Physical-device and Safari-on-iOS testing not performed (section 27)
