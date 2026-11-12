# MoonNav Complete Website Reference

> Generated 2026-11-12T23:35:21Z by `scripts/build-website-reference.mjs` from this template (`scripts/website-reference.template.md`) plus live inventories scanned from the source and a real crawl of the running application. Regenerate with `node scripts/build-website-reference.mjs` after any UI or API change; do not edit the generated tables by hand.
> Inventory size: 43 pages, 68 web API route files, 12 internal science endpoints, 25 database tables, 67 component files.
> Crawl evidence: 72 page visits (51 distinct URLs) as roles anonymous, demo, user, admin; 1117 button observations, 299 buttons actually clicked, 344 form-field observations. Crawl generated 2026-11-12T23:25:24.299Z against the isolated local stack.

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

| Route | Source file | Access (from code) | Components reached (direct imports) | API paths referenced |
|---|---|---|---|---|
| `/` | `src/app/(public)/page.tsx` | public | HeroChart, HomeGlobe, HorizonPlate, DemoButton, ui | /api/v1/demo |
| `/about` | `src/app/(public)/about/page.tsx` | public | ui | — |
| `/admin` | `src/app/admin/page.tsx` | curator or admin (MFA required) | ui | /api/v1/storage/local |
| `/admin/audit` | `src/app/admin/audit/page.tsx` | admin (MFA required) | ui | — |
| `/admin/data` | `src/app/admin/data/page.tsx` | curator or admin (MFA required) | ui, DataProductsClient | /api/v1/admin/products/{id}/ingest, /api/v1/admin/products/{id}/status |
| `/admin/ingestion` | `src/app/admin/ingestion/page.tsx` | curator or admin (MFA required) | ui, IngestionClient | /api/v1/admin/products/{id}/ingest |
| `/admin/jobs` | `src/app/admin/jobs/page.tsx` | curator or admin (MFA required) | ui, JobsClient | /api/v1/admin/jobs/{id}/retry, /api/v1/jobs/{id} |
| `/admin/users` | `src/app/admin/users/page.tsx` | admin (MFA required) | ui, UsersClient | /api/v1/admin/users/{id}/role |
| `/app` | `src/app/app/page.tsx` | signed in (any role) | ui | /api/v1/storage/local |
| `/app/analyses/[analysisId]` | `src/app/app/analyses/[analysisId]/page.tsx` | signed in (any role) | AnalysisStatusClient | /api/v1/analyses/{id}, /api/v1/analyses/{id}/annotations, /api/v1/analyses/{id}/rerun, /api/v1/analyses/{id}/validate, /api/v1/annotations/{id}, /api/v1/jobs/{id} |
| `/app/analyses/[analysisId]/report` | `src/app/app/analyses/[analysisId]/report/page.tsx` | signed in (any role) | MissionReport, HorizonsValidation | /api/v1/analyses/{id}, /api/v1/analyses/{id}/rerun, /api/v1/analyses/{id}/timeseries, /api/v1/analyses/{id}/validate, /api/v1/illumination/point, /api/v1/link-budget |
| `/app/analysis/earth` | `src/app/app/analysis/earth/page.tsx` | signed in (any role) | ui, AnalysisPicker, ResultLoader | /api/v1/analyses/{id}, /api/v1/analyses/{id}/rerun, /api/v1/analyses/{id}/timeseries, /api/v1/link-budget, /api/v1/me/preferences, /api/v1/reports |
| `/app/analysis/sun` | `src/app/app/analysis/sun/page.tsx` | signed in (any role) | ui, AnalysisPicker, ResultLoader | /api/v1/analyses/{id}, /api/v1/analyses/{id}/rerun, /api/v1/analyses/{id}/timeseries, /api/v1/link-budget, /api/v1/me/preferences, /api/v1/reports |
| `/app/compare` | `src/app/app/compare/page.tsx` | signed in (any role) | ui, CompareClient | /api/v1/comparisons, /api/v1/comparisons/{id}, /api/v1/me/preferences, /api/v1/storage/local |
| `/app/explorer` | `src/app/app/explorer/page.tsx` | signed in (any role) | ExploreClient | /api/v1/illumination/point, /api/v1/link-budget, /api/v1/locations, /api/v1/locations/{id}, /api/v1/me/preferences, /api/v1/terrain/point |
| `/app/onboarding` | `src/app/app/onboarding/page.tsx` | signed in (any role) | ui, OnboardingForm | /api/v1/me |
| `/app/planner` | `src/app/app/planner/page.tsx` | signed in (any role) | ui, PlannerClient | /api/v1/me/preferences, /api/v1/sensitivity, /api/v1/suitability/grid, /api/v1/suitability/matrix, /api/v1/terrain/coverage, /api/v1/terrain/hazards |
| `/app/projects` | `src/app/app/projects/page.tsx` | signed in (any role) | ui, ProjectsClient | /api/v1/projects, /api/v1/storage/local |
| `/app/projects/[projectId]` | `src/app/app/projects/[projectId]/page.tsx` | signed in (any role) | ProjectDetailClient | /api/v1/analyses, /api/v1/projects/{id}, /api/v1/projects/{id}/duplicate, /api/v1/storage/local |
| `/app/reports` | `src/app/app/reports/page.tsx` | signed in (any role) | ui, ReportsClient | /api/v1/reports, /api/v1/reports/{id}/share-links, /api/v1/share-links/{id}, /api/v1/storage/local, /api/v1/storage/presign-download |
| `/app/scenarios/new` | `src/app/app/scenarios/new/page.tsx` | signed in (any role) | ui, ScenarioBuilder | /api/v1/analyses, /api/v1/projects, /api/v1/scenarios, /api/v1/storage/local |
| `/app/settings` | `src/app/app/settings/page.tsx` | signed in (any role) | ui | — |
| `/app/sites/[siteId]` | `src/app/app/sites/[siteId]/page.tsx` | signed in (any role) | ui, SiteDetailClient | /api/v1/analyses/{id}, /api/v1/analyses/{id}/rerun, /api/v1/analyses/{id}/timeseries, /api/v1/link-budget, /api/v1/me/preferences, /api/v1/reports |
| `/app/workspaces` | `src/app/app/workspaces/page.tsx` | signed in (any role) | ui, WorkspacesClient | /api/v1/workspaces, /api/v1/workspaces/{id}, /api/v1/workspaces/{id}/invitations, /api/v1/workspaces/{id}/invitations/{id}, /api/v1/workspaces/{id}/members, /api/v1/workspaces/{id}/members/{id} |
| `/dev/mail` | `src/app/dev/mail/page.tsx` | public | Mark, ui | — |
| `/explore` | `src/app/(public)/explore/page.tsx` | public | ExploreClient | /api/v1/illumination/point, /api/v1/link-budget, /api/v1/locations, /api/v1/locations/{id}, /api/v1/me/preferences, /api/v1/terrain/point |
| `/forgot-password` | `src/app/(public)/forgot-password/page.tsx` | public | SubmitButton, AuthCard, ui | — |
| `/invite/[token]` | `src/app/(public)/invite/[token]/page.tsx` | public | InvitationAcceptClient, Providers, PublicShell | /api/v1/invitations/accept, /api/v1/invitations/{id}, /api/v1/me/preferences |
| `/learn` | `src/app/(public)/learn/page.tsx` | public | ui, GuidedExample | — |
| `/limitations` | `src/app/(public)/limitations/page.tsx` | public | ui | — |
| `/login` | `src/app/(public)/login/page.tsx` | public | AuthCard, LoginForm | /api/v1/demo |
| `/login/two-factor` | `src/app/(public)/login/two-factor/page.tsx` | public | SubmitButton, AuthCard, ui | — |
| `/methodology` | `src/app/(public)/methodology/page.tsx` | public | ui | — |
| `/privacy` | `src/app/(public)/privacy/page.tsx` | public | ui | — |
| `/register` | `src/app/(public)/register/page.tsx` | public | AuthCard, RegisterForm | — |
| `/reset-password` | `src/app/(public)/reset-password/page.tsx` | public | SubmitButton, AuthCard, PasswordInput, RegisterForm, ui | — |
| `/settings/profile` | `src/app/settings/profile/page.tsx` | signed in (any role) | ui, ProfileForm | /api/v1/me, /api/v1/me/export |
| `/settings/security` | `src/app/settings/security/page.tsx` | signed in (any role) | ui, SecurityClient | — |
| `/share/[token]` | `src/app/(public)/share/[token]/page.tsx` | public | ui | /api/v1/storage/local |
| `/sources` | `src/app/(public)/sources/page.tsx` | public | ui | — |
| `/terms` | `src/app/(public)/terms/page.tsx` | public | ui | — |
| `/validation` | `src/app/(public)/validation/page.tsx` | public | ui | — |
| `/verify-email` | `src/app/(public)/verify-email/page.tsx` | public | SubmitButton, AuthCard, ui | — |


Route groups: `(public)` is the marketing/reference/auth area; `/app/**` is the signed-in workspace; `/admin/**` requires role curator or admin **and** enabled two-factor authentication; `/settings/**` is account settings for signed-in users; `/dev/mail` is the local outbox viewer (development only). Dynamic segments: `[analysisId]`, `[projectId]`, `[siteId]` (a catalogue site key such as `mons-malapert`), `[token]` (share-link or invitation token).

### 4.1 What each viewer role actually gets (crawl)

HTTP status (or redirect target) when each role opened each URL in the isolated stack. A redirect means the route is protected for that role.

| Route visited (crawl) | anonymous | demo | user | admin |
|---|---|---|---|---|
| `/` | 200 | — | — | — |
| `/explore` | redirect → /explore | — | — | — |
| `/explore?site=mons-malapert&tab=globe` | 200 | — | — | — |
| `/learn` | 200 | — | — | — |
| `/methodology` | 200 | — | — | — |
| `/sources` | 200 | — | — | — |
| `/validation` | 200 | — | — | — |
| `/about` | 200 | — | — | — |
| `/limitations` | 200 | — | — | — |
| `/privacy` | 200 | — | — | — |
| `/terms` | 200 | — | — | — |
| `/login` | 200 | — | — | — |
| `/login/two-factor` | 200 | — | — | — |
| `/register` | 200 | — | — | — |
| `/forgot-password` | 200 | — | — | — |
| `/reset-password` | 200 | — | — | — |
| `/verify-email` | 200 | — | — | — |
| `/share/XSS8QPPhrrhJGQS-_Kw1vzA2GgDpiGHhj4JdI4uy2-8` | 200 | — | — | — |
| `/invite/sample-invalid-token` | 200 | — | — | — |
| `/does-not-exist` | 404 | — | — | — |
| `/app` | — | 200 | 200 | — |
| `/app/projects` | — | 200 | 200 | — |
| `/app/projects/prj_acf7409a-e367-4e90-85cc-5a89d7cd7efb` | — | 200 | 200 | — |
| `/app/explorer` | — | redirect → /app/explorer | redirect → /app/explorer | — |
| `/app/explorer?site=shackleton&tab=region` | — | 200 | 200 | — |
| `/app/sites/mons-malapert` | — | 200 | 200 | — |
| `/app/analysis/sun?analysisId=ana_92ac2083-0218-4d26-9aa5-746d8ff84407` | — | 200 | 200 | — |
| `/app/analysis/earth?analysisId=ana_92ac2083-0218-4d26-9aa5-746d8ff8440` | — | 200 | 200 | — |
| `/app/compare?ids=ana_cf964f14-25b6-4032-9e54-bf792c3a5756,ana_2d041a4d` | — | 200 | 200 | — |
| `/app/planner` | — | 200 | 200 | — |
| `/app/reports` | — | 200 | 200 | — |
| `/app/scenarios/new` | — | 200 | 200 | — |
| `/app/scenarios/new?guided=1` | — | 200 | 200 | — |
| `/app/workspaces` | — | 200 | 200 | — |
| `/app/settings` | — | 200 | 200 | — |
| `/settings/profile` | — | 200 | 200 | — |
| `/settings/security` | — | 200 | 200 | — |
| `/dev/mail` | — | 200 | 200 | — |
| `/app/analyses/ana_1a3f07a7-3cbe-4c06-897c-9ee799dd9e5b` | — | 200 | — | — |
| `/app/analysis/sun?analysisId=ana_1a3f07a7-3cbe-4c06-897c-9ee799dd9e5b` | — | 200 | — | — |
| `/app/analysis/earth?analysisId=ana_1a3f07a7-3cbe-4c06-897c-9ee799dd9e5` | — | 200 | — | — |
| `/admin` | — | redirect → /app | redirect → /app | 200 |
| `/app/analyses/ana_92ac2083-0218-4d26-9aa5-746d8ff84407` | — | — | 200 | — |
| `/app/analyses/ana_92ac2083-0218-4d26-9aa5-746d8ff84407/report` | — | — | 200 | — |
| `/app/onboarding` | — | — | 200 | — |
| `/admin/users` | — | — | — | 200 |
| `/admin/data` | — | — | — | 200 |
| `/admin/ingestion` | — | — | — | 200 |
| `/admin/jobs` | — | — | — | 200 |
| `/admin/audit` | — | — | — | 200 |
| `/admin/users?x=1` | — | — | — | 200 |


## 5. Global navigation and menus

### 5.1 Public header (all `(public)` pages)
Left to right: the **MoonNav** logo (links to `/`), then the primary navigation **Explore → `/explore`**, **Learn → `/learn`**, **Methodology → `/methodology`**, **Data sources → `/sources`**, **Validation → `/validation`**, **About → `/about`**; then the **Simple / Advanced** mode switch (radiogroup “Display mode”, advanced hides nothing on public pages but reveals expert panels), the **colour theme** switch (radiogroup “Colour theme”: *Light theme*, *Dark theme*, *Match system*), then either **Sign in → `/login`** and **Start planning → `/register`** (anonymous) or **Open workspace → `/app`** (signed in). On screens narrower than the `sm` breakpoint the navigation collapses into a mobile menu button (`PublicMobileNav`) containing the same links and the sign-in actions. The footer carries the legal and reference links and an external link to the NASA Space Apps challenge page (opens in a new tab with `rel="noopener noreferrer"`).

### 5.2 Workspace header and sidebar (`/app/**`, `/settings/**`, `/admin/**`)
Header (left to right): **MoonNav** logo (→ `/app`), the **workspace switcher** (shows the current workspace name and role; lists the workspaces you belong to and switches the active one through `POST /api/v1/workspaces/{id}/switch`), the **Simple / Advanced** switch, the global **search** button (opens the command palette, also **Ctrl/Cmd + K**), the live **service status chip** (links to `/sources`), the **theme** switch and the **profile menu** (avatar with your initials). A yellow **demo banner** appears under the header for demo accounts.

Sidebar groups and items in their displayed order:
- **Plan:** Overview (`/app`), Projects (`/app/projects`), Scenario Builder (`/app/scenarios/new`), Workspaces (`/app/workspaces`).
- **Analyse:** Site Explorer (`/app/explorer`), Site Detail & 3D (`/app/sites/mons-malapert`), Sun & Power (`/app/analysis/sun`), Earth & DTE (`/app/analysis/earth`), Mission Planner (`/app/planner`), Compare (`/app/compare`), Reports (`/app/reports`).
- **Reference:** Learn (`/learn`), Methodology (`/methodology`), Data sources (`/sources`).
- **Administration** (only for curator/admin): Operations (`/admin`), Data products (`/admin/data`), Ingestion (`/admin/ingestion`), Jobs (`/admin/jobs`); admins additionally see Users & roles (`/admin/users`) and Audit log (`/admin/audit`).
On small screens the sidebar becomes the navigation drawer opened from the header.

### 5.3 Profile menu (avatar)
Items: **Profile & preferences → `/settings/profile`**, **Security & MFA → `/settings/security`**, **All settings → `/app/settings`**, **Sign out** (ends the session through Better Auth and returns to the public site).

### 5.4 Command palette (search)
Opens from the header **search** button or **Ctrl/Cmd + K**. A dialog labelled “Search” with a combobox (placeholder “Search pages, sites, projects, scenarios…”, accessible name “Search pages, sites, projects, scenarios and locations”). Results are grouped **Pages**, **Sites**, **Projects**, **Scenarios**, **Saved locations** (from `GET /api/v1/search`, debounced). Arrow keys move the selection, **Enter** opens it, **Esc** or the “Close search” backdrop closes it and returns focus to the button.

### 5.5 Live navigation observed in the crawl

#### Navigation seen by role **anonymous** (page `/`)

- **Primary:** “Explore” → `/explore` · “Learn” → `/learn` · “Methodology” → `/methodology` · “Data sources” → `/sources` · “Validation” → `/validation` · “About” → `/about`

#### Navigation seen by role **user** (page `/app`)

- **Workspace:** “Overview” → `/app` · “Projects” → `/app/projects` · “Scenario Builder” → `/app/scenarios/new` · “Workspaces” → `/app/workspaces` · “Site Explorer” → `/app/explorer` · “Site Detail & 3D” → `/app/sites/mons-malapert` · “Sun & Power” → `/app/analysis/sun` · “Earth & DTE” → `/app/analysis/earth` · “Mission Planner” → `/app/planner` · “Compare” → `/app/compare` · “Reports” → `/app/reports` · “Learn” → `/learn` · “Methodology” → `/methodology` · “Data sources” → `/sources`

#### Navigation seen by role **admin** (page `/admin`)

- **Workspace:** “Overview” → `/app` · “Projects” → `/app/projects` · “Scenario Builder” → `/app/scenarios/new` · “Workspaces” → `/app/workspaces` · “Site Explorer” → `/app/explorer` · “Site Detail & 3D” → `/app/sites/mons-malapert` · “Sun & Power” → `/app/analysis/sun` · “Earth & DTE” → `/app/analysis/earth` · “Mission Planner” → `/app/planner` · “Compare” → `/app/compare` · “Reports” → `/app/reports` · “Learn” → `/learn` · “Methodology” → `/methodology` · “Data sources” → `/sources` · “Operations” → `/admin` · “Data products” → `/admin/data` · “Ingestion” → `/admin/ingestion` · “Jobs” → `/admin/jobs` · “Users & roles” → `/admin/users` · “Audit log” → `/admin/audit`

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
| Verify email | `/verify-email` | Form to request a new link; the emailed link calls `GET /api/auth/verify-email?token=[REDACTED]`, which verifies, signs in and redirects; invalid/expired tokens return here with an error banner (“This verification link is invalid or has expired”). Already-used links are harmless. |
| Forgot password | `/forgot-password` | Email form (pre-filled from `?email=`); always answers “If an account exists for that address…” (non-enumerating); 3 requests per 5 minutes per client. |
| Reset password | `/reset-password?token=[REDACTED]` | New password + confirm; success returns to `/login?reset=1`; all other sessions are revoked. |
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

### PG-01 · Read the light before you land.  `/`

- **Document title:** MoonNav — Lunar south-pole site navigator
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/page.tsx` · access rule in code: public
- **Section headings (h2), top to bottom:** “Google Maps, but for planning Moon landings” · “Four stations, one month of light” · “Three things decide whether a polar site works” · “How it works, in plain words” · “In the field book”
- **Card/sub-headings (h3):** “Sunlight” · “Earth in view” · “Terrain and date” · “Mission planners” · “Educators & students” · “Curious visitors”
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” (selected) · “Dark theme” · “Match system”
- **Tables:** “Precomputed sunlight and Earth visibility at the featured stations”: Station / Position / LOLA height / Sunlit / Earth in view / Open / Shackleton / de Gerlache / Mons Malapert / Mons Mouton (4 rows)
- **Graphics:** 1 canvas element(s) (3D/map); charts: LOLA south-polar relief map with the four featured stations joined by a traverse line
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `home-demo-button`, `globe`, `relief-status`, `globe-readout`, `home-simple`
- **Visible text excerpt:**

  > Read the light before you land. ⏎ At the lunar south pole the Sun skims the horizon and Earth hangs low. MoonNav traces both against the real terrain — LOLA laser altimetry with lunar curvature, NAIF SPICE ephemerides checked against JPL Horizons — and turns it into sunlight intervals, direct-to-Earth windows and comparisons you can defend. ⏎ Start mission planning ⏎ Explore without an account ⏎ Try the demo, no account ⏎ How it works ⏎ Terrain ⏎ 240 m LOLA ⏎ Horizon ⏎ 300 km, curved ⏎ Ephemeris ⏎ < 0.01° vs JPL ⏎ de Gerlache ⏎ sun 0% · earth 0% ⏎ Shackleton ⏎ sun 0% · earth 0% ⏎ Mons Malapert ⏎ sun 58% · earth 100% ⏎ Mons Mouton ⏎ sun 42% · earth 61% ⏎ LOLA LDEM_75S_240M relief, south polar

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-01-00 | Simple | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-01-01 | Advanced | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-01-02 | Light theme | header | button |  | Clicked: toggles aria-pressed → true |
| BTN-01-03 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-01-04 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-01-05 | Try the demo, no account | main | submit | home-demo-button | Not executed: form submit: documented from the form, not clicked blindly |
| BTN-01-06 | Reset view | main | button |  | Not executed: destructive or session-changing action: inspected, not executed |
| BTN-01-07 | South-pole view | main | button |  | Clicked: changes on-page state only (no navigation, no API call) |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Start mission planning | `/app/scenarios/new?guided=1` | no |
| Explore without an account | `/explore` | no |
| Open | `/explore?site=shackleton` | no |
| Open | `/explore?site=de-gerlache` | no |
| Open | `/explore?site=mons-malapert` | no |
| Open | `/explore?site=mons-mouton` | no |
| Site Explorer LOLA relief, slope and elevation layers in the polar projection, 17 named features, coordinate inspection  | `/explore` | no |
| Sun & Power Sun azimuth and elevation against the terrain horizon, refined sunlit intervals and, only with panel assumpt | `/explore?site=mons-mouton&tab=sun` | no |
| Earth & DTE Earth line of sight above terrain and an antenna mask. Geometry only: never presented as radio-link availabi | `/explore?site=mons-malapert&tab=earth` | no |
| 3D terrain A 40 km LOLA patch in the site's own frame and a regional view of the whole 75°S cap, lit from the computed S | `/explore?site=mons-malapert&tab=3d` | no |
| Comparison Two to eight scenarios: compatibility first, hard gates second, weighted preferences last. Ranking is withhel | `/register` | no |
| Reports PDF briefs, CSV series and JSON with kernel and terrain checksums, shared through expiring, revocable links. | `/register` | no |
| Start planning | `/register` | no |
| Open Learn | `/learn` | no |
| Explore the pole | `/explore` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Globe lighting | select[select-one] |  | no |  | relief | Relief (camera) · Unlit mosaic |
| Vertical exaggeration | select[select-one] |  | no |  | 1 | 1.0× true · 2× (visual) · 5× (visual) · 10× (visual) · 20× (visual) |

- **Mobile (390×844):** header controls: “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Light theme”, “Dark theme”, “Match system”, “Open menu”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/anonymous-home-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/anonymous-home-desktop.png` (1440×900)

### PG-02 · About MoonNav  `/about`

- **Document title:** About · MoonNav
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/about/page.tsx` · access rule in code: public
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > About MoonNav ⏎ A decision-support tool for comparing lunar south-pole sites and dates by terrain-aware sunlight and geometric Earth visibility. ⏎ MoonNav answers a planner's first questions about a polar site: when does sunlight reach it, when is Earth in line of sight, and how do those answers change with a few kilometres of position or a few days of schedule. It computes Sun and Earth directions with NASA/JPL's SPICE toolkit and compares them with a 300 km terrain horizon traced through NASA's LOLA elevation model, including the Moon's curvature. ⏎ Results are reproducible: every scenario is immutable, and every analysis records the terrain product, kernel set, method version and their ch

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-02-00 | Simple | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-02-01 | Advanced | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-02-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → false |
| BTN-02-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-02-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-02-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-02-06 | Close diagnostics | other | button |  | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1200ms exceeded. |
| BTN-02-07 | Record 10 s | other | button | perf-record | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1200ms exceeded. |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| “Lunar Landing Site Navigator” | `https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/` | yes |
| methodology | `/methodology` | no |
| data sources | `/sources` | no |
| known limitations | `/limitations` | no |


### PG-03 · System and data overview  `/admin`

- **Document title:** Operations · MoonNav
- **Observed per viewer role:** demo → redirected to `/app`; user → redirected to `/app`; admin → 200
- **Source:** `src/app/admin/page.tsx` · access rule in code: curator or admin (MFA required)
- **Section headings (h2), top to bottom:** “Science service” · “Workers & jobs” · “Registry” · “Recent audit events”
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” (selected) · “Dark theme” · “Match system”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > System and data overview ⏎ Science service ⏎ Ok ⏎ Kernels: ok moonnav-kernels-2026-11-10-a ⏎ Coverage: 1849-12-25T23:59:19Z → 2150-01-21T23:58:51Z ⏎ Terrain: ok lola-ldem-75s-240m-v2, lola-multires-v1 ⏎ Workers & jobs ⏎ Ok ⏎ Live workers: 1 ⏎ Last seen: 2026-11-12 23:33:30 ⏎ Completed: 9 ⏎ Registry ⏎ Superseded Products: 1 ⏎ Approved Products: 11 ⏎ Users: 4 ⏎ Recent audit events ⏎ demo.start · user 973ThGsfoTmpq2qcf6 ⏎ 2026-11-12 23:27:14 ⏎ scenario.create · scenario scn_63249d53-3042- ⏎ 2026-11-12 23:27:14 ⏎ scenario.create · scenario scn_af5918fe-4113- ⏎ 2026-11-12 23:27:14 ⏎ scenario.create · scenario scn_6048a03e-f820- ⏎ 2026-11-12 23:27:14 ⏎ scenario.create · scenario scn_a5c69216-a467-

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-03-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner Crawl's field book Personal · Owner” |
| BTN-03-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-03-02 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-03-03 | Search (Command K) | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-03-04 | Light theme | header | button |  | Clicked: opens “Esc PAGES Overview Projects New scenario Site Explorer Sun & Power Earth & DTE C” |
| BTN-03-05 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-03-06 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-03-07 | CA Account menu for Crawl admin | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-03-08 | Collapse sidebar | sidebar | button |  | Clicked: opens “Crawl admin [test-account]@example.test ADMIN Profile & preferences Security & M” |

- **Mobile (390×844):** header controls: “Open navigation”, “CCrawl's field bookPersonal · owner”, “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Search (Command K)”, “Light theme”, “Dark theme”, “Match system”, “CA
Account menu for Crawl admin”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/admin-admin-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/admin-admin-desktop.png` (1440×900)

### PG-04 · Audit log  `/admin/audit`

- **Document title:** Audit log · MoonNav
- **Observed per viewer role:** admin → 200
- **Source:** `src/app/admin/audit/page.tsx` · access rule in code: admin (MFA required)
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Tables:** Time (UTC) / Actor / Action / Object / Details (17 rows)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Administration ⏎ Audit log ⏎ Audit log ⏎ Append-only: a database trigger rejects updates and deletes on audit events. ⏎ Time (UTC)	Actor	Action	Object	Details ⏎ 2026-11-12 23:27:14	demo-cf825c6e-035@demo.moonnav.invalid	demo.start	user 973ThGsfoTmpq2qcf6VR	{"ttlHours":24} ⏎ 2026-11-12 23:27:14	demo-cf825c6e-035@demo.moonnav.invalid	scenario.create	scenario scn_63249d53-3042-4c	{"projectId":"prj_95bbdbca-28d0-43d3-a3b0-fb135590bb03","definitionHash":"eb7f68414cb156714e6f5b506c85a051ef77fed636a78ae8e749789c362386ff"} ⏎ 2026-11-12 23:27:14	demo-cf825c6e-035@demo.moonnav.invalid	scenario.create	scenario scn_af5918fe-4113-44	{"projectId":"prj_95bbdbca-28d0-43d3-a3b0-fb135590bb03","definitionHash"

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-04-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner Crawl's field book Personal · Owner” |
| BTN-04-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-04-02 | Advanced | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-04-03 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1184.435999999987ms exceeded. |
| BTN-04-04 | Search (Command K) | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-04-05 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-04-06 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-04-07 | Match system | header | button |  | Clicked: opens “Crawl admin [test-account]@example.test ADMIN Profile & preferences Security & M” |
| BTN-04-08 | CA Account menu for Crawl admin | header | button |  | Clicked: toggles aria-expanded → false |
| BTN-04-09 | Collapse sidebar | sidebar | button |  | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Administration | `/admin` | no |
| demo.start | `/admin/audit?action=demo.start` | no |
| scenario.create | `/admin/audit?action=scenario.create` | no |
| project.create | `/admin/audit?action=project.create` | no |
| share.create | `/admin/audit?action=share.create` | no |
| report.create | `/admin/audit?action=report.create` | no |
| analysis.submit | `/admin/audit?action=analysis.submit` | no |


### PG-05 · Data-product registry  `/admin/data`

- **Document title:** Data products · MoonNav
- **Observed per viewer role:** admin → 200
- **Source:** `src/app/admin/data/page.tsx` · access rule in code: curator or admin (MFA required)
- **Section headings (h2), top to bottom:** “LDEM_75S_240M · PRODUCT_VERSION_ID V2.0 (created 2017-06-15) Approved” · “LDEM_875S_5M · PRODUCT_VERSION_ID V1.0 Superseded” · “MOON_nomenclature_center_pts · nightly export retrieved 2026-11-10 Approved” · “LDEM_875S_5M · PRODUCT_VERSION_ID V2.0 Approved” · “LDEM_85S_20M · PRODUCT_VERSION_ID V2.0 Approved” · “LDEM_80S_40M · PRODUCT_VERSION_ID V2.0 Approved” · “LOLA multi-resolution composite · moonnav composite 1 (5/20/40 m tiles over LDEM_75S_240M V2.0) Approved” · “LDEM_16 · PRODUCT_VERSION_ID V3.1 Approved” · “LPSR_75S_120M_201608 · PRODUCT_VERSION_ID V1.05 (created 2016-09-15; input topography 2009-07-13 .. 2013-07-18) Approved” · “AVGVISIB_75S_120M_201608 · PRODUCT_VERSION_ID V1.05 (created 2016-09-15; input topography 2009-07-13 .. 2013-07-18) Appr” · “AVGVISIB_75S_120M_201608_EARTH · PRODUCT_VERSION_ID V1.05 (created 2016-09-15; input topography 2009-07-13 .. 2013-07-18” · “naif-generic-kernels · moonnav-kernels-2026-11-10-a Approved” · “Ingestion / validation runs”
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Administration ⏎ Data products ⏎ Data-product registry ⏎ Products move discovered → downloaded → validated → approved, or to failed / blocked / deprecated. Approved versions are immutable; a new release is registered as a new product version. ⏎ LDEM_75S_240M ⏎ · PRODUCT_VERSION_ID V2.0 (created 2017-06-15) ⏎ Approved ⏎ dem · NASA PDS Geosciences Node · 75 S to 90 S ⏎ Seeded from versioned catalogue after checksum + label validation (science/tests) ⏎ sha256 d031efe2611b17dfbf3c158f5e15dc04cd5719349dcbf6384bb21fd97697c490 ⏎ Trigger ingestion run ⏎ View all runs → ⏎ Reason (required, audited) ⏎ Mark deprecated ⏎ LDEM_875S_5M ⏎ · PRODUCT_VERSION_ID V1.0 ⏎ Superseded ⏎ dem · NASA PDS Geosciences 

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-05-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner Crawl's field book Personal · Owner” |
| BTN-05-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-05-02 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-05-03 | Search (Command K) | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-05-04 | Light theme | header | button |  | Clicked: opens “Esc PAGES Overview Projects New scenario Site Explorer Sun & Power Earth & DTE C” |
| BTN-05-05 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-05-06 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-05-07 | CA Account menu for Crawl admin | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-05-08 | Expand sidebar | sidebar | button |  | Clicked: opens “Crawl admin [test-account]@example.test ADMIN Profile & preferences Security & M” |
| BTN-05-09 | Trigger ingestion run | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-10 | Mark deprecated | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-11 | Trigger ingestion run | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-12 | Trigger ingestion run | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-13 | Mark deprecated | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-14 | Trigger ingestion run | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-15 | Mark deprecated | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-16 | Trigger ingestion run | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-17 | Mark deprecated | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-18 | Trigger ingestion run | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-19 | Mark deprecated | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-20 | Trigger ingestion run | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-21 | Mark deprecated | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-22 | Trigger ingestion run | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-23 | Mark deprecated | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-24 | Trigger ingestion run | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-25 | Mark deprecated | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-26 | Trigger ingestion run | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-27 | Mark deprecated | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-28 | Trigger ingestion run | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-29 | Mark deprecated | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-30 | Trigger ingestion run | main | button |  | Same control observed; not probed in this role/page |
| BTN-05-31 | Mark deprecated | main | button |  | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Administration | `/admin` | no |
| View all runs → | `/admin/ingestion` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Reason (required, audited) | input[text] | e.g. label + checksum verified | no |  |  |  |
| Reason (required, audited) | input[text] | e.g. label + checksum verified | no |  |  |  |
| Reason (required, audited) | input[text] | e.g. label + checksum verified | no |  |  |  |
| Reason (required, audited) | input[text] | e.g. label + checksum verified | no |  |  |  |
| Reason (required, audited) | input[text] | e.g. label + checksum verified | no |  |  |  |
| Reason (required, audited) | input[text] | e.g. label + checksum verified | no |  |  |  |
| Reason (required, audited) | input[text] | e.g. label + checksum verified | no |  |  |  |
| Reason (required, audited) | input[text] | e.g. label + checksum verified | no |  |  |  |
| Reason (required, audited) | input[text] | e.g. label + checksum verified | no |  |  |  |
| Reason (required, audited) | input[text] | e.g. label + checksum verified | no |  |  |  |
| Reason (required, audited) | input[text] | e.g. label + checksum verified | no |  |  |  |


### PG-06 · Data ingestion pipeline  `/admin/ingestion`

- **Document title:** Ingestion runs · MoonNav
- **Observed per viewer role:** admin → 200
- **Source:** `src/app/admin/ingestion/page.tsx` · access rule in code: curator or admin (MFA required)
- **Section headings (h2), top to bottom:** “No ingestion runs yet”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Administration ⏎ Ingestion ⏎ Data ingestion pipeline ⏎ Every web-triggered ingestion run is recorded here with its full stage log: discovered → fetching label → label parsed → downloading → downloaded → checksum verified → validated. Products then move to the curator approval workflow on /admin/data. ⏎ No ingestion runs yet ⏎ Trigger a run from Administration → Data products, or by POSTing to /api/v1/admin/products/[id]/ingest. ⏎ Refresh

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-06-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner Crawl's field book Personal · Owner” |
| BTN-06-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-06-02 | Advanced | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-06-03 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1196.76800000004ms exceeded. |
| BTN-06-04 | Search (Command K) | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-06-05 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-06-06 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-06-07 | Match system | header | button |  | Clicked: opens “Crawl admin [test-account]@example.test ADMIN Profile & preferences Security & M” |
| BTN-06-08 | CA Account menu for Crawl admin | header | button |  | Clicked: toggles aria-expanded → true |
| BTN-06-09 | Expand sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-06-10 | Refresh | main | button |  | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Administration | `/admin` | no |


### PG-07 · Analysis jobs  `/admin/jobs`

- **Document title:** Jobs · MoonNav
- **Observed per viewer role:** admin → 200
- **Source:** `src/app/admin/jobs/page.tsx` · access rule in code: curator or admin (MFA required)
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” · “Dark theme” · “Match system” (selected)
- **Tables:** Job / Scenario / Status / Attempts / Worker / Created / Actions (9 rows)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Administration ⏎ Jobs ⏎ Analysis jobs ⏎ Queued, running, failed, retried and completed jobs with logs. Retrying requires the admin role. ⏎ Filter ⏎ All ⏎ queued ⏎ running ⏎ completed ⏎ failed ⏎ cancelled ⏎ Job	Scenario	Status	Attempts	Worker	Created	Actions ⏎ job_46394245-699… ⏎ log ⏎ 	Precomputed demonstration · de-gerlache	 ⏎ Completed	0/3	—	2026-11-12 23:27:14	 ⏎ job_edeadc1d-ba5… ⏎ log ⏎ 	Precomputed demonstration · mons-mouton	 ⏎ Completed	0/3	—	2026-11-12 23:27:14	 ⏎ job_a313ffe5-43b… ⏎ log ⏎ 	Precomputed demonstration · shackleton	 ⏎ Completed	0/3	—	2026-11-12 23:27:14	 ⏎ job_50059c99-075… ⏎ log ⏎ 	Precomputed demonstration · mons-malapert	 ⏎ Completed	0/3	—	2026-11-12 23:27:14	 ⏎ job

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-07-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner Crawl's field book Personal · Owner” |
| BTN-07-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-07-02 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-07-03 | Search (Command K) | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-07-04 | Light theme | header | button |  | Clicked: opens “Esc PAGES Overview Projects New scenario Site Explorer Sun & Power Earth & DTE C” |
| BTN-07-05 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-07-06 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-07-07 | CA Account menu for Crawl admin | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-07-08 | Collapse sidebar | sidebar | button |  | Clicked: opens “Crawl admin [test-account]@example.test ADMIN Profile & preferences Security & M” |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Administration | `/admin` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Filter All queued running completed failed cancelled | select[select-one] |  | no |  |  | All · queued · running · completed · failed · cancelled |


### PG-08 · Users & roles  `/admin/users`

- **Document title:** Users & roles · MoonNav
- **Observed per viewer role:** admin → 200
- **Source:** `src/app/admin/users/page.tsx` · access rule in code: admin (MFA required)
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Tables:** User / Status / MFA / Role / Change role (reason required) (4 rows)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Administration ⏎ Users & roles ⏎ Users & roles ⏎ Role changes require a reason, are audited, and sign the user out so new privileges apply on their next sign-in. Curator and admin roles need MFA before their areas open. ⏎ User	Status	MFA	Role	Change role (reason required) ⏎ Demo Explorer ⏎ demo-cf825c6e-035@demo.moonnav.invalid ⏎ 	Active	off	User	 ⏎ user ⏎ analyst ⏎ curator ⏎ admin ⏎ Apply ⏎ Crawl admin ⏎ [test-account]@example.test ⏎ 	Active	on	Admin	You cannot change your own role ⏎ Crawl user ⏎ [test-account]@example.test ⏎ 	Active	off	User	 ⏎ user ⏎ analyst ⏎ curator ⏎ admin ⏎ Apply ⏎ Demo Explorer ⏎ demo-13375642-218@demo.moonnav.invalid ⏎ 	Active	off	User	 ⏎ user ⏎ analyst ⏎ cur

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-08-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner Crawl's field book Personal · Owner” |
| BTN-08-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-08-02 | Advanced | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-08-03 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1197.234999999986ms exceeded. |
| BTN-08-04 | Search (Command K) | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-08-05 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-08-06 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-08-07 | Match system | header | button |  | Clicked: opens “Crawl admin [test-account]@example.test ADMIN Profile & preferences Security & M” |
| BTN-08-08 | CA Account menu for Crawl admin | header | button |  | Clicked: toggles aria-expanded → false |
| BTN-08-09 | Collapse sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-08-10 | Apply | main | button, disabled |  | Same control observed; not probed in this role/page |
| BTN-08-11 | Apply | main | button, disabled |  | Same control observed; not probed in this role/page |
| BTN-08-12 | Apply | main | button, disabled |  | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Administration | `/admin` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| New role for Demo Explorer | select[select-one] |  | no |  | user | user · analyst · curator · admin |
| Reason | input[text] | Reason | no |  |  |  |
| New role for Crawl user | select[select-one] |  | no |  | user | user · analyst · curator · admin |
| Reason | input[text] | Reason | no |  |  |  |
| New role for Demo Explorer | select[select-one] |  | no |  | user | user · analyst · curator · admin |
| Reason | input[text] | Reason | no |  |  |  |


### PG-09 · Users & roles  `/admin/users?x=1`

- **Document title:** Users & roles · MoonNav
- **Observed per viewer role:** admin → 200
- **Source:** `src/app/admin/users/page.tsx` · access rule in code: admin (MFA required)
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” · “Dark theme” · “Match system” (selected)
- **Tables:** User / Status / MFA / Role / Change role (reason required) (4 rows)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Administration ⏎ Users & roles ⏎ Users & roles ⏎ Role changes require a reason, are audited, and sign the user out so new privileges apply on their next sign-in. Curator and admin roles need MFA before their areas open. ⏎ User	Status	MFA	Role	Change role (reason required) ⏎ Demo Explorer ⏎ demo-cf825c6e-035@demo.moonnav.invalid ⏎ 	Active	off	User	 ⏎ user ⏎ analyst ⏎ curator ⏎ admin ⏎ Apply ⏎ Crawl admin ⏎ [test-account]@example.test ⏎ 	Active	on	Admin	You cannot change your own role ⏎ Crawl user ⏎ [test-account]@example.test ⏎ 	Active	off	User	 ⏎ user ⏎ analyst ⏎ curator ⏎ admin ⏎ Apply ⏎ Demo Explorer ⏎ demo-13375642-218@demo.moonnav.invalid ⏎ 	Active	off	User	 ⏎ user ⏎ analyst ⏎ cur

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-09-00 | C Crawl's field book Personal · Owner | header | button |  | Same control observed; not probed in this role/page |
| BTN-09-01 | Simple | header | button |  | Same control observed; not probed in this role/page |
| BTN-09-02 | Advanced | header | button |  | Same control observed; not probed in this role/page |
| BTN-09-03 | Search (Command K) | header | button |  | Same control observed; not probed in this role/page |
| BTN-09-04 | Light theme | header | button |  | Same control observed; not probed in this role/page |
| BTN-09-05 | Dark theme | header | button |  | Same control observed; not probed in this role/page |
| BTN-09-06 | Match system | header | button |  | Same control observed; not probed in this role/page |
| BTN-09-07 | CA Account menu for Crawl admin | header | button |  | Same control observed; not probed in this role/page |
| BTN-09-08 | Expand sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-09-09 | Apply | main | button, disabled |  | Same control observed; not probed in this role/page |
| BTN-09-10 | Apply | main | button, disabled |  | Same control observed; not probed in this role/page |
| BTN-09-11 | Apply | main | button, disabled |  | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Administration | `/admin` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| New role for Demo Explorer | select[select-one] |  | no |  | user | user · analyst · curator · admin |
| Reason | input[text] | Reason | no |  |  |  |
| New role for Crawl user | select[select-one] |  | no |  | user | user · analyst · curator · admin |
| Reason | input[text] | Reason | no |  |  |  |
| New role for Demo Explorer | select[select-one] |  | no |  | user | user · analyst · curator · admin |
| Reason | input[text] | Reason | no |  |  |  |


### PG-10 · Crawl's field book  `/app`

- **Document title:** Overview · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/app/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “Recent analyses” · “Getting started” · “Projects” · “Saved locations”
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” (selected) · “Dark theme” · “Match system”
- **Tables:** “Recent analyses with status and results”: Scenario / Window (UTC) / Status / Sunlit / Geometric DTE (1 rows)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `overview-simple`
- **Visible text excerpt:**

  > Crawl's field book ⏎ Your personal field book. Resume a project, start a scenario or check on running analyses. ⏎ Projects ⏎ New scenario ⏎ Recent analyses ⏎ Latest results in this workspace, newest first ⏎ Compare ⏎ Recent analyses with status and results ⏎ Scenario	Status	Sunlit	Geometric DTE ⏎ Crawl scenario v1 ⏎ Crawl project · 85.98°S 358.33°E ⏎ 	 ⏎ Completed	73.2%	100.0% ⏎ Getting started ⏎ Four steps from a site to a report ⏎ 1. Choose a site — a named south-pole feature or any point you click. ⏎ 2. Pick dates and run — MoonNav works out sunlight and Earth visibility. ⏎ 3. Read the results — plain-language summaries explain what blocks the Sun or Earth. ⏎ 4. Compare and report — see t

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-10-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-10-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-10-02 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-10-03 | Search (Command K) | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-10-04 | Light theme | header | button |  | Clicked: opens “Esc PAGES Overview Projects New scenario Site Explorer Sun & Power Earth & DTE C” |
| BTN-10-05 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-10-06 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-10-07 | CU Account menu for Crawl user | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-10-08 | Collapse sidebar | sidebar | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Projects | `/app/projects` | no |
| New scenario | `/app/scenarios/new` | no |
| Crawl scenario v1 | `/app/analyses/ana_92ac2083-0218-4d26-9aa5-746d8ff84407` | no |
| 1. Choose a site | `/app/explorer` | no |
| 2. Pick dates and run | `/app/scenarios/new?guided=1` | no |
| 3. Read the results | `/app/analysis/sun` | no |
| 4. Compare and report | `/app/compare` | no |
| Crawl project 1 scenarios | `/app/projects/prj_acf7409a-e367-4e90-85cc-5a89d7cd7efb` | no |

- **Mobile (390×844):** header controls: “Open navigation”, “CCrawl's field bookPersonal · owner”, “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Search (Command K)”, “Light theme”, “Dark theme”, “Match system”, “CU
Account menu for Crawl user”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/user-app-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/user-app-desktop.png` (1440×900)

### PG-11 · Crawl scenario v1 Completed  `/app/analyses/:id`

- **Document title:** Analysis · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/app/analyses/[analysisId]/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “Open the analysis STORED RESULT” · “Independent validation · JPL Horizons” · “Analyst annotations”
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `run-horizons`, `horizons-status`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Projects ⏎ Project ⏎ Crawl scenario v1 ⏎ Crawl scenario ⏎ v1 ⏎ Completed ⏎ Analysis ana_92ac2083-0218-4d26-9aa5-746d8ff84407 ⏎ Direct sunlight ⏎ CALCULATED ⏎ 52.7h ⏎ Earth in line of sight ⏎ CALCULATED ⏎ 72.0h ⏎ Geometric DTE windows ⏎ CALCULATED ⏎ 72.0h ⏎ Panel energy ⏎ MODELLED ⏎ 1117Wh ⏎ Open the analysis ⏎ STORED RESULT ⏎ Quality medium · moonnav-method-1.1.0 · completed 2026-11-12 23:25:23 UTC ⏎ Sun & Power ⏎ Mission report ⏎ Earth & DTE ⏎ Site detail / 3D ⏎ Export report ⏎ Compare… ⏎ Result SHA-256 c7601f0122b6b674d0936ec94a21dbeff887e79ae6bfa9bcd3931b636f10e983 ⏎ Independent validation · JPL Horizons ⏎ Re-computes the Sun and Earth directions for this site with NASA/JPL Horizons and m

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-11-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-11-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-11-02 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-11-03 | Search (Command K) | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-11-04 | Light theme | header | button |  | Clicked: opens “Esc PAGES Overview Projects New scenario Site Explorer Sun & Power Earth & DTE C” |
| BTN-11-05 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-11-06 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-11-07 | CU Account menu for Crawl user | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-11-08 | Collapse sidebar | sidebar | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-11-09 | Run live cross-check | header | button | run-horizons | Same control observed; not probed in this role/page |
| BTN-11-10 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-11-11 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Projects | `/app/projects` | no |
| Project | `/app/projects/prj_acf7409a-e367-4e90-85cc-5a89d7cd7efb` | no |
| Sun & Power | `/app/analysis/sun?analysisId=ana_92ac2083-0218-4d26-9aa5-746d8ff84407` | no |
| Mission report | `/app/analyses/ana_92ac2083-0218-4d26-9aa5-746d8ff84407/report` | no |
| Earth & DTE | `/app/analysis/earth?analysisId=ana_92ac2083-0218-4d26-9aa5-746d8ff84407` | no |
| Site detail / 3D | `/app/sites/mons-malapert?analysisId=ana_92ac2083-0218-4d26-9aa5-746d8ff84407` | no |
| Export report | `/app/reports?analysisId=ana_92ac2083-0218-4d26-9aa5-746d8ff84407` | no |
| Compare… | `/app/compare?ids=ana_92ac2083-0218-4d26-9aa5-746d8ff84407` | no |


### PG-12 · Mons Malapert — Crawl scenario v1  `/app/analyses/:id/report`

- **Document title:** Mission report · MoonNav
- **Observed per viewer role:** user → 200
- **Source:** `src/app/app/analyses/[analysisId]/report/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “1. Site and mission time” · “2. Sun and Earth at mission time CALCULATED” · “3. Durations over the interval CALCULATED” · “4. Terrain horizon profile CALCULATED” · “Horizon panorama” · “Sun and Earth elevation vs terrain” · “5. Direct-sunlight intervals CALCULATED” · “6. Communication (geometric DTE) windows CALCULATED” · “7. Feasibility assessment MODELLED” · “8. Scientific confidence and validation” · “9. Data provenance STORED RESULT”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected) · “Polar zoom” (selected) · “Full sky”
- **Tables:** “Sunlit intervals”: Type / Start (UTC) / End (UTC) / Duration (h) (2 rows); “Geometric DTE windows”: Type / Start (UTC) / End (UTC) / Duration (h) (1 rows); “Hard-constraint assessment”: Constraint / Value / Result / Note (5 rows)
- **Graphics:** 3 canvas element(s) (3D/map); charts: Polar sky plot. Azimuth clockwise from north, north at top, east at right. Elevation from -6° at the outer ring to 6° at the centre. Shaded area is terrain above the local horizontal from the LOLA horizon profile; ochre dots are the Sun track and violet dots the Earth track over the analysis interval.
- **Notices / alerts shown:** “Independent research/education prototype — not NASA-owned, endorsed or flight-certified. Geometric direct-to-E”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `mission-report`, `polar-sky-plot`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > MOONNAV MISSION REPORT · CRAWL PROJECT ⏎ Mons Malapert — Crawl scenario v1 ⏎ Analysis ana_92ac2083-0218-4d26-9aa5-746d8ff84407 · completed 2026-11-12 23:25:23 UTC · report generated 2026-11-12 23:30:48 UTC · MoonNav 0.1.0 · method moonnav-method-1.1.0 ⏎ Print / Save as PDF ⏎ Report JSON ⏎ Export ⏎ PDF ⏎ CSV ⏎ JSON ⏎ Independent research/education prototype — not NASA-owned, endorsed or flight-certified. Geometric direct-to-Earth visibility is line of sight only, not RF link availability. The suitability score is a simplified MoonNav example, not an official NASA mission feasibility rating. ⏎ 1. Site and mission time ⏎ Site ⏎ Mons Malapert — Named-feature centre, not an official landing site.

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-12-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-12-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-12-02 | Advanced | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-12-03 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1196.8890000000247ms exceeded. |
| BTN-12-04 | Search (Command K) | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-12-05 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-12-06 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-12-07 | Match system | header | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-12-08 | CU Account menu for Crawl user | header | button |  | Clicked: toggles aria-expanded → false |
| BTN-12-09 | Collapse sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-12-10 | Print / Save as PDF | header | button |  | Same control observed; not probed in this role/page |
| BTN-12-11 | Report JSON | header | button |  | Same control observed; not probed in this role/page |
| BTN-12-12 | PDF | header | button |  | Same control observed; not probed in this role/page |
| BTN-12-13 | CSV | header | button |  | Same control observed; not probed in this role/page |
| BTN-12-14 | JSON | header | button |  | Same control observed; not probed in this role/page |
| BTN-12-15 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-12-16 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-12-17 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-12-18 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-12-19 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-12-20 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-12-21 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-12-22 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-12-23 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-12-24 | Polar zoom | main | button |  | Same control observed; not probed in this role/page |
| BTN-12-25 | Full sky | main | button |  | Same control observed; not probed in this role/page |
| BTN-12-26 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-12-27 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-12-28 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |


### PG-13 · Earth & DTE  `/app/analysis/earth?analysisId=:id`

- **Document title:** Earth & DTE · MoonNav
- **Observed per viewer role:** demo → 200; demo → 200; user → 200
- **Source:** `src/app/app/analysis/earth/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “Operations: communication CALCULATED” · “Earth visibility timeline CALCULATED” · “Horizon panorama CALCULATED” · “Optional link-margin estimate MODELLED” · “Geometric DTE windows CALCULATED” · “Data quality: Medium” · “Provenance & reproducibility STORED RESULT”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected) · “Panorama” (selected) · “Polar sky plot”
- **Tables:** “Geometric direct-to-Earth windows”: Type / Start (UTC) / End (UTC) / Duration (h) (1 rows)
- **Graphics:** 2 canvas element(s) (3D/map)
- **Notices / alerts shown:** “Geometric Direct-to-Earth visibility — not RF link availability These results say whether Earth is in line of ” · “Line of sight is not a link Earth being above the horizon is necessary, not sufficient. This estimate ignores ”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `time-readout`, `plain-earth`, `ops-earth`, `link-budget`, `link-budget-run`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Earth & DTE ⏎ Earth azimuth and elevation against the terrain horizon and antenna mask, and geometric direct-to-Earth windows (not RF link availability). ⏎ Analysis ⏎ Crawl scenario v1 · 2026-11-15 · 92ac2083 ⏎ 74 samples. ⏎ Export ⏎ PDF ⏎ CSV ⏎ JSON ⏎ Site 85.980 degrees south, 358.330 degrees east. 2026-11-15 00:00:00 UTC. Sun visible, elevation -0.21 degrees. Earth visible, elevation 0.47 degrees. ⏎ Geometric Direct-to-Earth visibility — not RF link availability ⏎ These results say whether Earth is in line of sight above the local terrain. They do not model transmitter power, frequency, antenna patterns, pointing, ground-station scheduling or link margin, so they are not a guarantee of co

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-13-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-13-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-13-02 | Advanced | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-13-03 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1196.6270000000368ms exceeded. |
| BTN-13-04 | Search (Command K) | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-13-05 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-13-06 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-13-07 | Match system | header | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-13-08 | CU Account menu for Crawl user | header | button |  | Clicked: toggles aria-expanded → true |
| BTN-13-09 | Expand sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-13-10 | PDF | main | button |  | Same control observed; not probed in this role/page |
| BTN-13-11 | CSV | main | button |  | Same control observed; not probed in this role/page |
| BTN-13-12 | JSON | main | button |  | Same control observed; not probed in this role/page |
| BTN-13-13 | Reset to start | main | button |  | Same control observed; not probed in this role/page |
| BTN-13-14 | Step backward | main | button |  | Same control observed; not probed in this role/page |
| BTN-13-15 | Play | main | button |  | Same control observed; not probed in this role/page |
| BTN-13-16 | Step forward | main | button |  | Same control observed; not probed in this role/page |
| BTN-13-17 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-13-18 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-13-19 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-13-20 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-13-21 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-13-22 | Panorama | header | button |  | Same control observed; not probed in this role/page |
| BTN-13-23 | Polar sky plot | header | button |  | Same control observed; not probed in this role/page |
| BTN-13-24 | Estimate link margin | main | button, disabled | link-budget-run | Same control observed; not probed in this role/page |
| BTN-13-25 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-13-26 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Analysis Crawl scenario v1 · 2026-11-15 · 92ac2083 | select[select-one] |  | no |  | ana_92ac2083-0218-4d26-9aa5-746d8ff84407 | Crawl scenario v1 · 2026-11-15 · 92ac2083 |
| Playback speed (multiple of real time) | select[select-one] |  | no |  | 3600 | 1× · 10× · 60× · 360× · 3,600× (1 h/s) · 21,600× (6 h/s) · 86,400× (24 h/s) |
| Step size | select[select-one] |  | no |  | 3600 | 1 sample · 1 h · 6 h · 1 day |
| Selected time sample | input[range] |  | no | min 0, max 73 | 0 |  |
| (unlabelled) | input[datetime-local] |  | no | min 2026-11-15T00:00, max 2026-11-18T00:00 | 2026-11-15T00:00 |  |
| (unlabelled) | input[datetime-local] |  | no | min 2026-11-15T00:00, max 2026-11-18T00:00 | 2026-11-18T00:00 |  |
| Frequency (GHz) | input[text] |  | no |  | 2.2 |  |
| EIRP (dBW) | input[text] |  | no |  |  |  |
| Receiver G/T (dB/K) | input[text] |  | no |  |  |  |
| Data rate (bit/s) | input[text] |  | no |  |  |  |
| Required Eb/N0 (dB) | input[text] |  | no |  |  |  |
| Other losses (dB) | input[text] |  | no |  | 0 |  |

- **Mobile (390×844):** header controls: “Open navigation”, “CCrawl's field bookPersonal · owner”, “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Search (Command K)”, “Light theme”, “Dark theme”, “Match system”, “CU
Account menu for Crawl user”, “Panorama”, “Polar sky plot”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/user-app_analysis_earth_analysisId_ana_92ac2083_0218_4d26_9aa5_746d8ff84407-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/user-app_analysis_earth_analysisId_ana_92ac2083_0218_4d26_9aa5_746d8ff84407-desktop.png` (1440×900)

### PG-14 · Sun & Power  `/app/analysis/sun?analysisId=:id`

- **Document title:** Sun & Power · MoonNav
- **Observed per viewer role:** demo → 200; demo → 200; user → 200
- **Source:** `src/app/app/analysis/sun/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “In plain language CALCULATED” · “Operations: sunlight CALCULATED” · “Sunlight timeline CALCULATED” · “Horizon panorama CALCULATED” · “Direct-sunlight intervals CALCULATED” · “Ground surface and irradiance CALCULATED” · “Solar-panel energy (idealized) MODELLED” · “Idealized panel power MODELLED”
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” · “Dark theme” · “Match system” (selected) · “Panorama” (selected) · “Polar sky plot”
- **Tables:** “Sunlit intervals with UTC start, end and duration”: Type / Start (UTC) / End (UTC) / Duration (h) (2 rows)
- **Graphics:** 3 canvas element(s) (3D/map)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `time-readout`, `plain-sun`, `ops-sun`, `surface-panel`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Sun & Power ⏎ Sun azimuth and elevation against the terrain horizon, direct-sunlight intervals and optional idealized panel energy. ⏎ Analysis ⏎ Crawl scenario v1 · 2026-11-15 · 92ac2083 ⏎ 74 samples. ⏎ Export ⏎ PDF ⏎ CSV ⏎ JSON ⏎ Site 85.980 degrees south, 358.330 degrees east. 2026-11-15 00:00:00 UTC. Sun visible, elevation -0.21 degrees. Earth visible, elevation 0.47 degrees. ⏎ 2026-11-15 00:00:00 UTC ⏎ Speed ⏎ 1× ⏎ 10× ⏎ 60× ⏎ 360× ⏎ 3,600× (1 h/s) ⏎ 21,600× (6 h/s) ⏎ 86,400× (24 h/s) ⏎ Step ⏎ 1 sample ⏎ 1 h ⏎ 6 h ⏎ 1 day ⏎ sampled every 1 h · 1/74 ⏎ 2026-11-15 00:00:00 UTC ⏎ Playback range ⏎ 2026-11-18 00:00:00 UTC ⏎ In plain language ⏎ CALCULATED ⏎ Over the 3.0 days analysed, the Sun i

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-14-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-14-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-14-02 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-14-03 | Search (Command K) | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-14-04 | Light theme | header | button |  | Clicked: opens “Esc PAGES Overview Projects New scenario Site Explorer Sun & Power Earth & DTE C” |
| BTN-14-05 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-14-06 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-14-07 | CU Account menu for Crawl user | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-14-08 | Expand sidebar | sidebar | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-14-09 | PDF | main | button |  | Same control observed; not probed in this role/page |
| BTN-14-10 | CSV | main | button |  | Same control observed; not probed in this role/page |
| BTN-14-11 | JSON | main | button |  | Same control observed; not probed in this role/page |
| BTN-14-12 | Reset to start | main | button |  | Same control observed; not probed in this role/page |
| BTN-14-13 | Step backward | main | button |  | Same control observed; not probed in this role/page |
| BTN-14-14 | Play | main | button |  | Same control observed; not probed in this role/page |
| BTN-14-15 | Step forward | main | button |  | Same control observed; not probed in this role/page |
| BTN-14-16 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-14-17 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-14-18 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-14-19 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-14-20 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-14-21 | Panorama | header | button |  | Same control observed; not probed in this role/page |
| BTN-14-22 | Polar sky plot | header | button |  | Same control observed; not probed in this role/page |
| BTN-14-23 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-14-24 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Analysis Crawl scenario v1 · 2026-11-15 · 92ac2083 | select[select-one] |  | no |  | ana_92ac2083-0218-4d26-9aa5-746d8ff84407 | Crawl scenario v1 · 2026-11-15 · 92ac2083 |
| Playback speed (multiple of real time) | select[select-one] |  | no |  | 3600 | 1× · 10× · 60× · 360× · 3,600× (1 h/s) · 21,600× (6 h/s) · 86,400× (24 h/s) |
| Step size | select[select-one] |  | no |  | 3600 | 1 sample · 1 h · 6 h · 1 day |
| Selected time sample | input[range] |  | no | min 0, max 73 | 0 |  |
| (unlabelled) | input[datetime-local] |  | no | min 2026-11-15T00:00, max 2026-11-18T00:00 | 2026-11-15T00:00 |  |
| (unlabelled) | input[datetime-local] |  | no | min 2026-11-15T00:00, max 2026-11-18T00:00 | 2026-11-18T00:00 |  |

- **Mobile (390×844):** header controls: “Open navigation”, “CCrawl's field bookPersonal · owner”, “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Search (Command K)”, “Light theme”, “Dark theme”, “Match system”, “CU
Account menu for Crawl user”, “Panorama”, “Polar sky plot”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/user-app_analysis_sun_analysisId_ana_92ac2083_0218_4d26_9aa5_746d8ff84407-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/user-app_analysis_sun_analysisId_ana_92ac2083_0218_4d26_9aa5_746d8ff84407-desktop.png` (1440×900)

### PG-15 · Compare scenarios  `/app/compare?ids=:id,:id,:id,:id`

- **Document title:** Compare · MoonNav
- **Observed per viewer role:** demo → 200; demo → 200; user → 200
- **Source:** `src/app/app/compare/page.tsx` · access rule in code: signed in (any role)
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” · “Dark theme” · “Match system” (selected)
- **Notices / alerts shown:** “At least two completed analyses are needed Run analyses for two sites, or for the same site on different dates”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Compare scenarios ⏎ Compare two to eight completed analyses — several sites, one site on several dates, or both. MoonNav checks that they are comparable, applies your hard gates, and only then uses weighted preferences. There is no universal best site — only the best match for stated criteria. ⏎ At least two completed analyses are needed ⏎ Run analyses for two sites, or for the same site on different dates, then come back.

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-15-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-15-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-15-02 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-15-03 | Search (Command K) | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-15-04 | Light theme | header | button |  | Clicked: opens “Esc PAGES Overview Projects New scenario Site Explorer Sun & Power Earth & DTE C” |
| BTN-15-05 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-15-06 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-15-07 | CU Account menu for Crawl user | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-15-08 | Collapse sidebar | sidebar | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-15-09 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-15-10 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

- **Mobile (390×844):** header controls: “Open navigation”, “CCrawl's field bookPersonal · owner”, “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Search (Command K)”, “Light theme”, “Dark theme”, “Match system”, “CU
Account menu for Crawl user”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/user-app_compare_ids_ana_cf964f14_25b6_4032_9e54_bf792c3a5756_ana_2d041a4d_498d_-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/user-app_compare_ids_ana_cf964f14_25b6_4032_9e54_bf792c3a5756_ana_2d041a4d_498d_-desktop.png` (1440×900)

### PG-16 · South-pole explorer  `/app/explorer`

- **Document title:** Site Explorer · MoonNav
- **Observed per viewer role:** demo → redirected to `/app/explorer`; user → redirected to `/app/explorer`
- **Source:** `src/app/app/explorer/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “Sites” · “Go to coordinate” · “Mons Malapert” · “Saved locations” · “Mons Malapert PRECOMPUTED” · “In plain language CALCULATED” · “Operations: sunlight CALCULATED” · “Sunlight timeline PRECOMPUTED” · “Horizon panorama PRECOMPUTED” · “Direct-sunlight intervals CALCULATED” · “Ground surface and irradiance PRECOMPUTED” · “Solar-panel energy UNAVAILABLE”
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” (selected) · “Dark theme” · “Match system” · “LOLA relief” (selected) · “LROC WAC imagery” · “Sun & Power” (selected) · “Earth & DTE” · “Site 3D” · “Polar region 3D” · “Global Moon” · “Panorama” (selected) · “Polar sky plot”
- **Tables:** “Sunlit intervals with UTC start, end and duration”: Type / Start (UTC) / End (UTC) / Duration (h) (3 rows)
- **Graphics:** 3 canvas element(s) (3D/map)
- **Notices / alerts shown:** “Precomputed demonstration · generated 2026-11-12 22:09:10 UTC 2026-11-15 00:00:00 UTC → 2026-12-15 00:00:00 UT” · “Not calculated — panel assumptions missing Provide panel area, efficiency, derating and orientation to estimat”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `demo-banner`, `time-readout`, `plain-sun`, `ops-sun`, `surface-panel`
- **Visible text excerpt:**

  > Workspace ⏎ Site Explorer ⏎ South-pole explorer ⏎ Inspect the LOLA terrain, pick a named feature or click any point inside 75°S. Featured stations carry a precomputed Sun and Earth analysis for 2026-11-15 → 2026-12-15. ⏎ Analyse this site ⏎ + ⏎ – ⏎ 200 km ⏎ Polar stereographic · 0°E up ⏎ Move over the map for coordinates ⏎ Map layers ⏎ LOLA relief ⏎ LROC WAC imagery ⏎ Feasibility ⏎ Elevation ⏎ Slope ⏎ Permanent shadow (PSR) ⏎ Long-term sunlight ⏎ Grid ⏎ Named sites ⏎ Saved locations ⏎ Coverage edge ⏎ SOURCE DATA ⏎ derived from LDEM_75S_240M ⏎ Sites ⏎ IAU Gazetteer feature centres, not official landing sites ⏎ Search sites ⏎ Lunar South Pole (reference point) ⏎ 90.00°S ⏎ Shackleton ⏎ DEMO ⏎ 8

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-16-00 | D Demo's field book Personal · Owner | header | button |  | Same control observed; not probed in this role/page |
| BTN-16-01 | Simple | header | button |  | Same control observed; not probed in this role/page |
| BTN-16-02 | Advanced | header | button |  | Same control observed; not probed in this role/page |
| BTN-16-03 | Search (Command K) | header | button |  | Same control observed; not probed in this role/page |
| BTN-16-04 | Light theme | header | button |  | Same control observed; not probed in this role/page |
| BTN-16-05 | Dark theme | header | button |  | Same control observed; not probed in this role/page |
| BTN-16-06 | Match system | header | button |  | Same control observed; not probed in this role/page |
| BTN-16-07 | DE Account menu for Demo Explorer | header | button |  | Same control observed; not probed in this role/page |
| BTN-16-08 | Collapse sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-16-09 | Zoom in | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-10 | Zoom out | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-11 | LOLA relief | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-12 | LROC WAC imagery | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-13 | Lunar South Pole (reference point) 90.00°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-14 | Shackleton DEMO 89.67°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-15 | de Gerlache DEMO 88.48°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-16 | Spudis 89.51°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-17 | Shoemaker 88.14°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-18 | Faustini 87.18°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-19 | Haworth 87.45°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-20 | Slater 88.08°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-21 | Henson 88.57°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-22 | Sverdrup 88.32°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-23 | Nobile 85.28°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-24 | Cabeus 85.33°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-25 | Amundsen 84.44°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-26 | Malapert 85.00°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-27 | Mons Malapert DEMO 85.98°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-28 | Mons Mouton DEMO 84.60°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-29 | Mons Kocher 85.46°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-30 | Go | main | submit |  | Same control observed; not probed in this role/page |
| BTN-16-31 | Save Mons Malapert as a location | header | button |  | Same control observed; not probed in this role/page |
| BTN-16-32 | de gerlache | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-33 | Delete de gerlache | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-34 | shackleton | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-35 | Delete shackleton | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-36 | mons mouton | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-37 | Delete mons mouton | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-38 | mons malapert | main | button |  | Same control observed; not probed in this role/page |
| BTN-16-39 | Delete mons malapert | main | button |  | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Create a free account | `/register` | no |
| Workspace | `/app` | no |
| Analyse this site | `/app/scenarios/new?site=mons-malapert` | no |
| Gazetteer entry | `https://planetarynames.wr.usgs.gov/Feature/16338` | yes |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Feasibility | input[checkbox] |  | no |  | false |  |
| Elevation | input[checkbox] |  | no |  | false |  |
| Slope | input[checkbox] |  | no |  | false |  |
| Permanent shadow (PSR) | input[checkbox] |  | no |  | false |  |
| Long-term sunlight | input[checkbox] |  | no |  | false |  |
| Grid | input[checkbox] |  | no |  | true |  |
| Named sites | input[checkbox] |  | no |  | true |  |
| Saved locations | input[checkbox] |  | no |  | true |  |
| Coverage edge | input[checkbox] |  | no |  | true |  |
| Search sites | input[text] | Search sites or feature type… | no |  |  |  |
| Latitude | input[text] | lat e.g. -89.45 | no |  |  |  |
| Longitude east | input[text] | lon °E e.g. 222.7 | no |  |  |  |
| Playback speed (multiple of real time) | select[select-one] |  | no |  | 3600 | 1× · 10× · 60× · 360× · 3,600× (1 h/s) · 21,600× (6 h/s) · 86,400× (24 h/s) |
| Step size | select[select-one] |  | no |  | 3600 | 1 sample · 1 h · 6 h · 1 day |
| Selected time sample | input[range] |  | no | min 0, max 1441 | 0 |  |
| (unlabelled) | input[datetime-local] |  | no | min 2026-11-15T00:00, max 2026-12-15T00:00 | 2026-11-15T00:00 |  |
| (unlabelled) | input[datetime-local] |  | no | min 2026-11-15T00:00, max 2026-12-15T00:00 | 2026-12-15T00:00 |  |

- **Mobile (390×844):** header controls: “Open navigation”, “DDemo's field bookPersonal · owner”, “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Search (Command K)”, “Light theme”, “Dark theme”, “Match system”, “DE
Account menu for Demo Explorer”, “Save Mons Malapert as a location”, “Panorama”, “Polar sky plot”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/demo-app_explorer-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/demo-app_explorer-desktop.png` (1440×900)

### PG-17 · South-pole explorer  `/app/explorer?site=shackleton&tab=region`

- **Document title:** Site Explorer · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/app/explorer/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “Sites” · “Go to coordinate” · “Shackleton” · “Shackleton” · “Sites on the cap SOURCE DATA”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected) · “LOLA relief” (selected) · “LROC WAC imagery” · “Sun & Power” · “Earth & DTE” · “Site 3D” · “Polar region 3D” (selected) · “Global Moon”
- **Graphics:** 2 canvas element(s) (3D/map)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `time-readout`
- **Visible text excerpt:**

  > Workspace ⏎ Site Explorer ⏎ South-pole explorer ⏎ Inspect the LOLA terrain, pick a named feature or click any point inside 75°S. Featured stations carry a precomputed Sun and Earth analysis for 2026-11-15 → 2026-12-15. ⏎ Analyse this site ⏎ + ⏎ – ⏎ 200 km ⏎ Polar stereographic · 0°E up ⏎ Move over the map for coordinates ⏎ Map layers ⏎ LOLA relief ⏎ LROC WAC imagery ⏎ Feasibility ⏎ Elevation ⏎ Slope ⏎ Permanent shadow (PSR) ⏎ Long-term sunlight ⏎ Grid ⏎ Named sites ⏎ Saved locations ⏎ Coverage edge ⏎ SOURCE DATA ⏎ derived from LDEM_75S_240M ⏎ Sites ⏎ IAU Gazetteer feature centres, not official landing sites ⏎ Search sites ⏎ Lunar South Pole (reference point) ⏎ 90.00°S ⏎ Shackleton ⏎ DEMO ⏎ 8

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-17-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-17-01 | Simple | header | button |  | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-17-02 | Advanced | header | button |  | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-17-03 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-17-04 | Search (Command K) | header | button |  | Clicked: opens “Esc PAGES Overview Projects New scenario Site Explorer Sun & Power Earth & DTE C” |
| BTN-17-05 | Light theme | header | button |  | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-17-06 | Dark theme | header | button |  | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-17-07 | Match system | header | button |  | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-17-08 | CU Account menu for Crawl user | header | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-17-09 | Expand sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-17-10 | Zoom in | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-11 | Zoom out | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-12 | LOLA relief | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-13 | LROC WAC imagery | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-14 | Lunar South Pole (reference point) 90.00°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-15 | Shackleton DEMO 89.67°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-16 | de Gerlache DEMO 88.48°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-17 | Spudis 89.51°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-18 | Shoemaker 88.14°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-19 | Faustini 87.18°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-20 | Haworth 87.45°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-21 | Slater 88.08°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-22 | Henson 88.57°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-23 | Sverdrup 88.32°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-24 | Nobile 85.28°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-25 | Cabeus 85.33°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-26 | Amundsen 84.44°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-27 | Malapert 85.00°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-28 | Mons Malapert DEMO 85.98°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-29 | Mons Mouton DEMO 84.60°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-30 | Mons Kocher 85.46°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-31 | Go | main | submit |  | Same control observed; not probed in this role/page |
| BTN-17-32 | Save Shackleton as a location | header | button |  | Same control observed; not probed in this role/page |
| BTN-17-33 | Sun & Power | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-34 | Earth & DTE | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-35 | Site 3D | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-36 | Polar region 3D | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-37 | Global Moon | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-38 | Reset to start | main | button |  | Same control observed; not probed in this role/page |
| BTN-17-39 | Step backward | main | button |  | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Workspace | `/app` | no |
| Analyse this site | `/app/scenarios/new?site=shackleton` | no |
| Gazetteer entry | `https://planetarynames.wr.usgs.gov/Feature/5450` | yes |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Feasibility | input[checkbox] |  | no |  | false |  |
| Elevation | input[checkbox] |  | no |  | false |  |
| Slope | input[checkbox] |  | no |  | false |  |
| Permanent shadow (PSR) | input[checkbox] |  | no |  | false |  |
| Long-term sunlight | input[checkbox] |  | no |  | false |  |
| Grid | input[checkbox] |  | no |  | true |  |
| Named sites | input[checkbox] |  | no |  | true |  |
| Saved locations | input[checkbox] |  | no |  | true |  |
| Coverage edge | input[checkbox] |  | no |  | true |  |
| Search sites | input[text] | Search sites or feature type… | no |  |  |  |
| Latitude | input[text] | lat e.g. -89.45 | no |  |  |  |
| Longitude east | input[text] | lon °E e.g. 222.7 | no |  |  |  |
| Playback speed (multiple of real time) | select[select-one] |  | no |  | 3600 | 1× · 10× · 60× · 360× · 3,600× (1 h/s) · 21,600× (6 h/s) · 86,400× (24 h/s) |
| Step size | select[select-one] |  | no |  | 3600 | 1 sample · 1 h · 6 h · 1 day |
| Selected time sample | input[range] |  | no | min 0, max 1441 | 0 |  |
| (unlabelled) | input[datetime-local] |  | no | min 2026-11-15T00:00, max 2026-12-15T00:00 | 2026-11-15T00:00 |  |
| (unlabelled) | input[datetime-local] |  | no | min 2026-11-15T00:00, max 2026-12-15T00:00 | 2026-12-15T00:00 |  |
| Vertical exaggeration 1× 3× 5× 10× | select[select-one] |  | no |  | 5 | 1× · 3× · 5× · 10× |


### PG-18 · Set up your workspace  `/app/onboarding`

- **Document title:** Welcome · MoonNav
- **Observed per viewer role:** user → 200
- **Source:** `src/app/app/onboarding/page.tsx` · access rule in code: signed in (any role)
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” · “Dark theme” · “Match system” (selected) · “Mission planning Projects, scenarios, analyses, comparisons and reports.” (selected) · “Learn The 12-step guided path with explanations and examples.” · “Public exploration Browse the map and precomputed demonstrations first.”
- **Notices / alerts shown:** “Before you start MoonNav is a research/education prototype. It uses the LOLA 240 m terrain product south of 75”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Set up your workspace ⏎ Tell us how you plan to use MoonNav. You can change this later in Settings. ⏎ Preferred mode for Crawl ⏎ Mission planning ⏎ Projects, scenarios, analyses, comparisons and reports. ⏎ Learn ⏎ The 12-step guided path with explanations and examples. ⏎ Public exploration ⏎ Browse the map and precomputed demonstrations first. ⏎ Before you start ⏎ MoonNav is a research/education prototype. It uses the LOLA 240 m terrain product south of 75°S and NAIF SPICE ephemerides. Results are geometric and idealized: no landing-hazard assessment and no RF link budget. All scientific timestamps are stored in UTC; you can choose a display time zone (Asia/Calcutta detected) in Settings. ⏎ 

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-18-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-18-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-18-02 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-18-03 | Search (Command K) | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-18-04 | Light theme | header | button |  | Clicked: opens “Esc PAGES Overview Projects New scenario Site Explorer Sun & Power Earth & DTE C” |
| BTN-18-05 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-18-06 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-18-07 | CU Account menu for Crawl user | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-18-08 | Expand sidebar | sidebar | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-18-09 | Mission planning Projects, scenarios, analyses, comparisons and reports. | main | button |  | Same control observed; not probed in this role/page |
| BTN-18-10 | Learn The 12-step guided path with explanations and examples. | main | button |  | Same control observed; not probed in this role/page |
| BTN-18-11 | Public exploration Browse the map and precomputed demonstrations first. | main | button |  | Same control observed; not probed in this role/page |
| BTN-18-12 | Continue to a guided example scenario | main | button, disabled |  | Same control observed; not probed in this role/page |
| BTN-18-13 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-18-14 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| I understand these prototype limitations. | input[checkbox] |  | no |  | false |  |


### PG-19 · Mission Planner  `/app/planner`

- **Document title:** Mission Planner · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/app/planner/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “Site and window” · “Landing suitability map CALCULATED”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected) · “Suitability map” (selected) · “Site × date matrix” · “Terrain hazards” · “Sensitivity”
- **Notices / alerts shown:** “Preliminary screening from NASA LOLA terrain and NAIF SPICE geometry — not a certified landing-safety assessme”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `planner-simple`, `coverage-box`, `fetch-highres`, `run-suitability`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Mission Planner ⏎ Choose any site inside 75°S–90°S and any UTC window: suitability maps, a site × date matrix, terrain hazard screening and location/date sensitivity — all computed live from NASA LOLA terrain and SPICE geometry. ⏎ Preliminary screening from NASA LOLA terrain and NAIF SPICE geometry — not a certified landing-safety assessment and not an official NASA rating. Missing data is shown as unknown (grey, hatched) and never counted as safe. Sunlight alone never establishes landing safety. ⏎ Site and window ⏎ Shared by all four tools ⏎ Landing site ⏎ Lunar South Pole (reference point) (90.00°S) ⏎ Shackleton (89.67°S) ⏎ de Gerlache (88.48°S) ⏎ Spudis (89.51°S) ⏎ Shoemaker (88.14°S) ⏎ F

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-19-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-19-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-19-02 | Advanced | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-19-03 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1196.8829999999725ms exceeded. |
| BTN-19-04 | Search (Command K) | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-19-05 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-19-06 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-19-07 | Match system | header | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-19-08 | CU Account menu for Crawl user | header | button |  | Clicked: toggles aria-expanded → false |
| BTN-19-09 | Collapse sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-19-10 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |
| BTN-19-11 | Suitability map | main | button |  | Same control observed; not probed in this role/page |
| BTN-19-12 | Site × date matrix | main | button |  | Same control observed; not probed in this role/page |
| BTN-19-13 | Terrain hazards | main | button |  | Same control observed; not probed in this role/page |
| BTN-19-14 | Sensitivity | main | button |  | Same control observed; not probed in this role/page |
| BTN-19-15 | Run suitability | main | button | run-suitability | Same control observed; not probed in this role/page |
| BTN-19-16 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-19-17 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Landing site | select[select-one] |  | no |  | mons-malapert | Lunar South Pole (reference point) (90.00°S) · Shackleton (89.67°S) · de Gerlache (88.48°S) · Spudis (89.51°S) · Shoemaker (88.14°S) · Faustini (87.18°S) · Haworth (87.45°S) · Slater (88.08°S) · Henson (88.57°S) · Sverdrup (88.32°S) · Nobile (85.28°S) · Cabeus (85.33°S) · Amundsen (84.44°S) · Malapert (85.00°S) · Mons Malapert (85.98°S) · Mons Mouton (84.60°S) · Mons Kocher (85.46°S) · Custom coordinates… |
| Download missing high-resolution tiles | input[checkbox] (fetch-highres) |  | no |  | true |  |
| Start date (UTC) | input[date] |  | no | min 2023-01-01, max 2049-12-31 | 2026-12-15 |  |
| Start time (UTC) | input[time] |  | no |  | 00:00 |  |
| Length (days) | input[text] |  | no |  | 7 |  |
| Sample step | select[select-one] |  | no |  | 3600 | 30 min · 1 h · 2 h · 6 h |
| (unlabelled) | input[text] | none | no |  | 30 |  |
| (unlabelled) | input[text] | none | no |  | 20 |  |
| (unlabelled) | input[text] | none | no |  | 15 |  |
| (unlabelled) | input[text] | none | no |  | 1.5 |  |
| (unlabelled) | input[text] | none | no |  | 5 |  |
| (unlabelled) | input[text] | none | no |  |  |  |
| (unlabelled) | input[text] | none | no |  |  |  |
| sun weight | input[range] |  | no | min 0, max 100 | 35 |  |
| dte weight | input[range] |  | no | min 0, max 100 | 30 |  |
| slope weight | input[range] |  | no | min 0, max 100 | 20 |  |
| roughness weight | input[range] |  | no | min 0, max 100 | 10 |  |
| solarElevation weight | input[range] |  | no | min 0, max 100 | 5 |  |
| Grid (cells per side) | select[select-one] |  | no |  | 7 | 1 · 3 · 5 · 7 · 9 · 11 · 15 |
| Half-width (km) | input[text] |  | no |  | 3 |  |

- **Mobile (390×844):** header controls: “Open navigation”, “CCrawl's field bookPersonal · owner”, “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Search (Command K)”, “Light theme”, “Dark theme”, “Match system”, “CU
Account menu for Crawl user”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/user-app_planner-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/user-app_planner-desktop.png` (1440×900)

### PG-20 · Projects  `/app/projects`

- **Document title:** Projects · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/app/projects/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “Your projects” · “New project”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Projects ⏎ Projects group the scenarios, analyses and comparisons for one study. ⏎ Your projects ⏎ Show archived ⏎ Crawl project ⏎ 1 scenarios ⏎ 2026-11-12 ⏎ New project ⏎ Name* ⏎ Description ⏎ Create project

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-20-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-20-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-20-02 | Advanced | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-20-03 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1196.5509999999776ms exceeded. |
| BTN-20-04 | Search (Command K) | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-20-05 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-20-06 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-20-07 | Match system | header | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-20-08 | CU Account menu for Crawl user | header | button |  | Clicked: toggles aria-expanded → false |
| BTN-20-09 | Collapse sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-20-10 | Create project | main | submit |  | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Crawl project | `/app/projects/prj_acf7409a-e367-4e90-85cc-5a89d7cd7efb` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Name* | input[text] |  | yes |  |  |  |
| Description | textarea[textarea] |  | no |  |  |  |


### PG-21 · Crawl project  `/app/projects/:id`

- **Document title:** Project · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/app/projects/[projectId]/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “Scenarios” · “Project notes” · “Comparison history”
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Projects ⏎ Crawl project ⏎ Crawl project ⏎ Rename ⏎ Duplicate ⏎ Archive ⏎ New scenario ⏎ Scenarios ⏎ Scenarios are immutable inputs. “New version” copies a scenario into the builder. ⏎ Crawl scenario v1 ⏎ 85.9800°S 358.3300°E (mons-malapert) · 2026-11-15 00:00 → 2026-11-18 00:00 UTC · 60 min ⏎ New version ⏎ Open / re-run ⏎ Completed ⏎ 2026-11-12 23:25 ⏎ · medium ⏎ Project notes ⏎ Project notes ⏎ Save notes ⏎ Comparison history ⏎ No comparisons yet. Compare analyses ⏎ Danger zone — delete this project

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-21-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-21-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-21-02 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-21-03 | Search (Command K) | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-21-04 | Light theme | header | button |  | Clicked: opens “Esc PAGES Overview Projects New scenario Site Explorer Sun & Power Earth & DTE C” |
| BTN-21-05 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-21-06 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-21-07 | CU Account menu for Crawl user | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-21-08 | Expand sidebar | sidebar | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-21-09 | Rename | main | button |  | Same control observed; not probed in this role/page |
| BTN-21-10 | Duplicate | main | button |  | Same control observed; not probed in this role/page |
| BTN-21-11 | Archive | main | button |  | Same control observed; not probed in this role/page |
| BTN-21-12 | Open / re-run | main | button |  | Same control observed; not probed in this role/page |
| BTN-21-13 | Save notes | main | button |  | Same control observed; not probed in this role/page |
| BTN-21-14 | (no label) | main | submit |  | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Projects | `/app/projects` | no |
| New scenario | `/app/scenarios/new?project=prj_acf7409a-e367-4e90-85cc-5a89d7cd7efb` | no |
| New version | `/app/scenarios/new?from=scn_6e4c4354-6f7c-4b84-b62d-36e2625315d9` | no |
| Completed 2026-11-12 23:25 · medium | `/app/analyses/ana_92ac2083-0218-4d26-9aa5-746d8ff84407` | no |
| Compare analyses | `/app/compare` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Project notes | textarea[textarea] | Assumptions, mission criteria, decisions… | no |  |  |  |
| (unlabelled) | input[text] |  | no |  |  |  |


### PG-22 · Reports & exports  `/app/reports`

- **Document title:** Reports · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/app/reports/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “Generated reports” · “Generate a report”
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Reports & exports ⏎ PDF mission briefs, CSV time series and machine-readable JSON — all generated from the same stored analysis, with inputs, versions, coverage flags and limitations. Downloads use short-lived signed links. ⏎ Generated reports ⏎ PDFCrawl scenario · v1 ⏎ 2026-11-12 23:25 UTC · 21.6 KB · sha256 28bbf148d77a… ⏎ Download ⏎ Manage share links ⏎ Generate a report ⏎ Analysis ⏎ Crawl scenario v1 · 2026-11-15 ⏎ Format ⏎ PDF mission brief ⏎ CSV time series ⏎ JSON (machine-readable) ⏎ Generate

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-22-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-22-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-22-02 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-22-03 | Search (Command K) | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-22-04 | Light theme | header | button |  | Clicked: opens “Esc PAGES Overview Projects New scenario Site Explorer Sun & Power Earth & DTE C” |
| BTN-22-05 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-22-06 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-22-07 | CU Account menu for Crawl user | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-22-08 | Expand sidebar | sidebar | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-22-09 | Download | main | button |  | Same control observed; not probed in this role/page |
| BTN-22-10 | Manage share links | main | button |  | Same control observed; not probed in this role/page |
| BTN-22-11 | Generate | main | submit |  | Same control observed; not probed in this role/page |
| BTN-22-12 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-22-13 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Analysis | select[select-one] |  | no |  | ana_92ac2083-0218-4d26-9aa5-746d8ff84407 | Crawl scenario v1 · 2026-11-15 |
| Format | select[select-one] |  | no |  | pdf | PDF mission brief · CSV time series · JSON (machine-readable) |


### PG-23 · Build a scenario  `/app/scenarios/new`

- **Document title:** Scenario Builder · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/app/scenarios/new/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “1 · Project and name” · “2 · Site” · “3 · Time window (UTC)” · “4 · Terrain product and visibility rules” · “5 · Communication and power assumptions (optional)” · “Validation & coverage”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected) · “Verified named site” (selected) · “Custom coordinates”
- **Notices / alerts shown:** “Name is required”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Workspace ⏎ Projects ⏎ Scenario Builder ⏎ Build a scenario ⏎ A scenario is an immutable set of inputs: site, time window, terrain product and assumptions. MoonNav validates it and shows the data coverage before it can run. ⏎ 1 · Project and name ⏎ Project* ⏎ + New project… ⏎ Crawl project ⏎ Scenario name* ⏎ Name is required ⏎ 2 · Site ⏎ Planetocentric latitude, east-positive longitude (west-positive input is converted). ⏎ Verified named site ⏎ Custom coordinates ⏎ Named site (IAU Gazetteer feature centre) ⏎ Lunar South Pole (reference point) — 90.000°S 0.000°E · 1295 m ⏎ Shackleton — 89.670°S 129.780°E · -2786 m ⏎ de Gerlache — 88.485°S 271.655°E · -1192 m ⏎ Spudis — 89.510°S 275.390°E · -13

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-23-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-23-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-23-02 | Advanced | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-23-03 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1196.4960000000428ms exceeded. |
| BTN-23-04 | Search (Command K) | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-23-05 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-23-06 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-23-07 | Match system | header | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-23-08 | CU Account menu for Crawl user | header | button |  | Clicked: toggles aria-expanded → true |
| BTN-23-09 | Expand sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-23-10 | Verified named site | main | button |  | Same control observed; not probed in this role/page |
| BTN-23-11 | Custom coordinates | main | button |  | Same control observed; not probed in this role/page |
| BTN-23-12 | 1 day | main | button |  | Same control observed; not probed in this role/page |
| BTN-23-13 | 1 week | main | button |  | Same control observed; not probed in this role/page |
| BTN-23-14 | Full lunar cycle (29.53 d) | main | button |  | Same control observed; not probed in this role/page |
| BTN-23-15 | 1 year | main | button |  | Same control observed; not probed in this role/page |
| BTN-23-16 | Save & run analysis | sidebar | button, disabled |  | Same control observed; not probed in this role/page |
| BTN-23-17 | Save scenario only | sidebar | button, disabled |  | Same control observed; not probed in this role/page |
| BTN-23-18 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-23-19 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Workspace | `/app` | no |
| Projects | `/app/projects` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Project* | select[select-one] |  | no |  | prj_acf7409a-e367-4e90-85cc-5a89d7cd7efb | + New project… · Crawl project |
| Scenario name* | input[text] | e.g. Malapert — Nov 2026 week | no |  |  |  |
| Named site (IAU Gazetteer feature centre) | select[select-one] |  | no |  | mons-malapert | Lunar South Pole (reference point) — 90.000°S 0.000°E · 1295 m · Shackleton — 89.670°S 129.780°E · -2786 m · de Gerlache — 88.485°S 271.655°E · -1192 m · Spudis — 89.510°S 275.390°E · -1383 m · Shoemaker — 88.137°S 45.911°E · -3938 m · Faustini — 87.183°S 84.310°E · -2756 m · Haworth — 87.450°S 354.830°E · -3303 m · Slater — 88.079°S 111.288°E · -1744 m · Henson — 88.570°S 229.370°E · -2485 m · Sverdrup — 88.321°S 206.613°E · -2883 m · Nobile — 85.275°S 53.273°E · 903 m · Cabeus — 85.330°S 317.867°E · -3732 m · Amundsen — 84.440°S 83.069°E · -3563 m · Malapert — 85.000°S 11.403°E · -2165 m · Mons Malapert — 85.980°S 358.330°E · 4915 m · Mons Mouton — 84.600°S 31.000°E · 5041 m · Mons Kocher — 85.460°S 241.940°E · 2459 m |
| Observer / panel height above terrain (m) | input[text] |  | no |  | 2 |  |
| Start (UTC)* | input[datetime-local] |  | no |  | 2026-11-15T00:00 |  |
| Stop (UTC)* | input[datetime-local] |  | no |  | 2026-11-22T00:00 |  |
| Time step | select[select-one] |  | no |  | 600 | 5 min · 10 min · 30 min · 1 h · 3 h · 6 h |
| Terrain product | select[select-one] |  | no |  | lola-ldem-75s-240m-v2 | LDEM_75S_240M · 240 m · PRODUCT_VERSION_ID V2.0 (created 2017-06-15) · LOLA multi-resolution · 5/20/40 m near field + 240 m far field (high-res where tiled) |
| Boundary refinement tolerance (s) | input[text] |  | no |  | 10 |  |
| Sun counts as visible when | select[select-one] |  | no |  | any_disk | any part of the disk is above terrain · the whole disk is above terrain · the disk centre is above terrain |
| Earth counts as visible when | select[select-one] |  | no |  | any_disk | any part of the disk is above terrain · the whole disk is above terrain · the disk centre is above terrain |
| Apply an antenna minimum-elevation mask | input[checkbox] |  | no |  | true |  |
| Antenna minimum elevation (°) | input[text] |  | no |  | 5 |  |
| Estimate idealized solar-panel energy | input[checkbox] |  | no |  | false |  |


### PG-24 · Build a scenario  `/app/scenarios/new?guided=1`

- **Document title:** Scenario Builder · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/app/scenarios/new/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “1 · Project and name” · “2 · Site” · “3 · Time window (UTC)” · “4 · Terrain product and visibility rules” · “5 · Communication and power assumptions (optional)” · “Validation & coverage”
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” · “Dark theme” · “Match system” (selected) · “Verified named site” (selected) · “Custom coordinates”
- **Notices / alerts shown:** “Guided example We pre-filled a one-week scenario at Mons Malapert with a 5° antenna mask and an illustrative 1”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Workspace ⏎ Projects ⏎ Scenario Builder ⏎ Build a scenario ⏎ A scenario is an immutable set of inputs: site, time window, terrain product and assumptions. MoonNav validates it and shows the data coverage before it can run. ⏎ Guided example ⏎ We pre-filled a one-week scenario at Mons Malapert with a 5° antenna mask and an illustrative 1 m² tracking panel (30% efficiency, 0.85 derating). Change anything, then press “Save & run analysis”. ⏎ 1 · Project and name ⏎ Project* ⏎ + New project… ⏎ Crawl project ⏎ Scenario name* ⏎ 2 · Site ⏎ Planetocentric latitude, east-positive longitude (west-positive input is converted). ⏎ Verified named site ⏎ Custom coordinates ⏎ Named site (IAU Gazetteer feature

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-24-00 | C Crawl's field book Personal · Owner | header | button |  | Same control observed; not probed in this role/page |
| BTN-24-01 | Simple | header | button |  | Same control observed; not probed in this role/page |
| BTN-24-02 | Advanced | header | button |  | Same control observed; not probed in this role/page |
| BTN-24-03 | Search (Command K) | header | button |  | Same control observed; not probed in this role/page |
| BTN-24-04 | Light theme | header | button |  | Same control observed; not probed in this role/page |
| BTN-24-05 | Dark theme | header | button |  | Same control observed; not probed in this role/page |
| BTN-24-06 | Match system | header | button |  | Same control observed; not probed in this role/page |
| BTN-24-07 | CU Account menu for Crawl user | header | button |  | Same control observed; not probed in this role/page |
| BTN-24-08 | Collapse sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-24-09 | Verified named site | main | button |  | Same control observed; not probed in this role/page |
| BTN-24-10 | Custom coordinates | main | button |  | Same control observed; not probed in this role/page |
| BTN-24-11 | 1 day | main | button |  | Same control observed; not probed in this role/page |
| BTN-24-12 | 1 week | main | button |  | Same control observed; not probed in this role/page |
| BTN-24-13 | Full lunar cycle (29.53 d) | main | button |  | Same control observed; not probed in this role/page |
| BTN-24-14 | 1 year | main | button |  | Same control observed; not probed in this role/page |
| BTN-24-15 | Save & run analysis | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-24-16 | Save scenario only | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-24-17 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-24-18 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Workspace | `/app` | no |
| Projects | `/app/projects` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Project* | select[select-one] |  | no |  | prj_acf7409a-e367-4e90-85cc-5a89d7cd7efb | + New project… · Crawl project |
| Scenario name* | input[text] | e.g. Malapert — Nov 2026 week | no |  | Guided example — Mons Malapert, one week |  |
| Named site (IAU Gazetteer feature centre) | select[select-one] |  | no |  | mons-malapert | Lunar South Pole (reference point) — 90.000°S 0.000°E · 1295 m · Shackleton — 89.670°S 129.780°E · -2786 m · de Gerlache — 88.485°S 271.655°E · -1192 m · Spudis — 89.510°S 275.390°E · -1383 m · Shoemaker — 88.137°S 45.911°E · -3938 m · Faustini — 87.183°S 84.310°E · -2756 m · Haworth — 87.450°S 354.830°E · -3303 m · Slater — 88.079°S 111.288°E · -1744 m · Henson — 88.570°S 229.370°E · -2485 m · Sverdrup — 88.321°S 206.613°E · -2883 m · Nobile — 85.275°S 53.273°E · 903 m · Cabeus — 85.330°S 317.867°E · -3732 m · Amundsen — 84.440°S 83.069°E · -3563 m · Malapert — 85.000°S 11.403°E · -2165 m · Mons Malapert — 85.980°S 358.330°E · 4915 m · Mons Mouton — 84.600°S 31.000°E · 5041 m · Mons Kocher — 85.460°S 241.940°E · 2459 m |
| Observer / panel height above terrain (m) | input[text] |  | no |  | 2 |  |
| Start (UTC)* | input[datetime-local] |  | no |  | 2026-11-15T00:00 |  |
| Stop (UTC)* | input[datetime-local] |  | no |  | 2026-11-22T00:00 |  |
| Time step | select[select-one] |  | no |  | 600 | 5 min · 10 min · 30 min · 1 h · 3 h · 6 h |
| Terrain product | select[select-one] |  | no |  | lola-ldem-75s-240m-v2 | LDEM_75S_240M · 240 m · PRODUCT_VERSION_ID V2.0 (created 2017-06-15) · LOLA multi-resolution · 5/20/40 m near field + 240 m far field (high-res where tiled) |
| Boundary refinement tolerance (s) | input[text] |  | no |  | 10 |  |
| Sun counts as visible when | select[select-one] |  | no |  | any_disk | any part of the disk is above terrain · the whole disk is above terrain · the disk centre is above terrain |
| Earth counts as visible when | select[select-one] |  | no |  | any_disk | any part of the disk is above terrain · the whole disk is above terrain · the disk centre is above terrain |
| Apply an antenna minimum-elevation mask | input[checkbox] |  | no |  | true |  |
| Antenna minimum elevation (°) | input[text] |  | no |  | 5 |  |
| Estimate idealized solar-panel energy | input[checkbox] |  | no |  | true |  |
| Area (m²) | input[text] |  | no |  | 1 |  |
| Efficiency (0–0.5) | input[text] |  | no |  | 0.3 |  |
| Derating (0–1) | input[text] |  | no |  | 0.85 |  |
| Orientation | select[select-one] |  | no |  | two_axis_tracking | Two-axis Sun tracking · Fixed normal · Flat on the ground (follows the local DEM slope) |
| Max output (W, optional) | input[text] |  | no |  |  |  |

- **Mobile (390×844):** header controls: “Open navigation”, “CCrawl's field bookPersonal · owner”, “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Search (Command K)”, “Light theme”, “Dark theme”, “Match system”, “CU
Account menu for Crawl user”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/user-app_scenarios_new_guided_1-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/user-app_scenarios_new_guided_1-desktop.png` (1440×900)

### PG-25 · Settings  `/app/settings`

- **Document title:** Settings · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/app/settings/page.tsx` · access rule in code: signed in (any role)
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Settings ⏎ Profile & preferences ⏎ Name, preferred mode, display time zone, data export and account deletion. ⏎ Security ⏎ Password, two-factor authentication (MFA) and active sessions.

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-25-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-25-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-25-02 | Advanced | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-25-03 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1196.3660000000382ms exceeded. |
| BTN-25-04 | Search (Command K) | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-25-05 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-25-06 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-25-07 | Match system | header | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-25-08 | CU Account menu for Crawl user | header | button |  | Clicked: toggles aria-expanded → false |
| BTN-25-09 | Collapse sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-25-10 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-25-11 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Profile & preferences Name, preferred mode, display time zone, data export and account deletion. | `/settings/profile` | no |
| Security Password, two-factor authentication (MFA) and active sessions. | `/settings/security` | no |

- **Mobile (390×844):** header controls: “Open navigation”, “CCrawl's field bookPersonal · owner”, “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Search (Command K)”, “Light theme”, “Dark theme”, “Match system”, “CU
Account menu for Crawl user”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/user-app_settings-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/user-app_settings-desktop.png` (1440×900)

### PG-26 · Mons Malapert  `/app/sites/mons-malapert`

- **Document title:** Site detail · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Section headings (h2), top to bottom:** “At selected time PRECOMPUTED” · “360° horizon profile PRECOMPUTED” · “Elevation profile SOURCE DATA” · “Site metadata SOURCE DATA”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Graphics:** 3 canvas element(s) (3D/map)
- **Notices / alerts shown:** “Precomputed demonstration Showing the precomputed 15 Nov – 15 Dec 2026 analysis. Run your own scenario for oth”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `time-readout`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Workspace ⏎ Site Explorer ⏎ Mons Malapert ⏎ Mons Malapert ⏎ Mons · 85.9800°S 358.3300°E · IAU WGPSN / USGS Gazetteer of Planetary Nomenclature (feature centre) ⏎ Site ⏎ Lunar South Pole (reference point) ⏎ Shackleton ⏎ de Gerlache ⏎ Spudis ⏎ Shoemaker ⏎ Faustini ⏎ Haworth ⏎ Slater ⏎ Henson ⏎ Sverdrup ⏎ Nobile ⏎ Cabeus ⏎ Amundsen ⏎ Malapert ⏎ Mons Malapert ⏎ Mons Mouton ⏎ Mons Kocher ⏎ Analysis ⏎ Precomputed demonstration ⏎ Crawl scenario v1 · 2026-11-15 ⏎ Download data manifest ⏎ New scenario here ⏎ Precomputed demonstration ⏎ Showing the precomputed 15 Nov – 15 Dec 2026 analysis. Run your own scenario for other dates or assumptions. ⏎ 2026-11-15 00:00:00 UTC ⏎ Speed ⏎ 1× ⏎ 10× ⏎ 60× ⏎ 360× 

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-26-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-26-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-26-02 | Advanced | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-26-03 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1196.753000000026ms exceeded. |
| BTN-26-04 | Search (Command K) | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-26-05 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-26-06 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-26-07 | Match system | header | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-26-08 | CU Account menu for Crawl user | header | button |  | Clicked: toggles aria-expanded → true |
| BTN-26-09 | Expand sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-26-10 | Download data manifest | main | button |  | Same control observed; not probed in this role/page |
| BTN-26-11 | Reset to start | main | button |  | Same control observed; not probed in this role/page |
| BTN-26-12 | Step backward | main | button |  | Same control observed; not probed in this role/page |
| BTN-26-13 | Play | main | button |  | Same control observed; not probed in this role/page |
| BTN-26-14 | Step forward | main | button |  | Same control observed; not probed in this role/page |
| BTN-26-15 | Reset camera | main | button |  | Same control observed; not probed in this role/page |
| BTN-26-16 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-26-17 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Workspace | `/app` | no |
| Site Explorer | `/app/explorer` | no |
| New scenario here | `/app/scenarios/new?site=mons-malapert` | no |
| Gazetteer ↗ | `https://planetarynames.wr.usgs.gov/Feature/16338` | yes |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Site Lunar South Pole (reference point) Shackleton de Gerlache Spudis Shoemaker Faustini Haworth Slater Henson Sverdrup  | select[select-one] |  | no |  | mons-malapert | Lunar South Pole (reference point) · Shackleton · de Gerlache · Spudis · Shoemaker · Faustini · Haworth · Slater · Henson · Sverdrup · Nobile · Cabeus · Amundsen · Malapert · Mons Malapert · Mons Mouton · Mons Kocher |
| Analysis Precomputed demonstration Crawl scenario v1 · 2026-11-15 | select[select-one] |  | no |  |  | Precomputed demonstration · Crawl scenario v1 · 2026-11-15 |
| Playback speed (multiple of real time) | select[select-one] |  | no |  | 3600 | 1× · 10× · 60× · 360× · 3,600× (1 h/s) · 21,600× (6 h/s) · 86,400× (24 h/s) |
| Step size | select[select-one] |  | no |  | 3600 | 1 sample · 1 h · 6 h · 1 day |
| Selected time sample | input[range] |  | no | min 0, max 1441 | 0 |  |
| (unlabelled) | input[datetime-local] |  | no | min 2026-11-15T00:00, max 2026-12-15T00:00 | 2026-11-15T00:00 |  |
| (unlabelled) | input[datetime-local] |  | no | min 2026-11-15T00:00, max 2026-12-15T00:00 | 2026-12-15T00:00 |  |
| Vertical exaggeration 1× 2× 3× 5× | select[select-one] |  | no |  | 1 | 1× · 2× · 3× · 5× |
| Horizon ring | input[checkbox] |  | no |  | true |  |


### PG-27 · Workspaces  `/app/workspaces`

- **Document title:** Workspaces · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/app/workspaces/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “Your workspaces” · “New shared workspace” · “Crawl's field book Active”
- **Card/sub-headings (h3):** “Members”
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Workspace ⏎ Workspaces ⏎ Workspaces ⏎ Your personal field book is private. Shared workspaces let collaborators work on the same projects, scenarios, saved locations and reports: owners manage members, editors create and run, viewers read. ⏎ Your workspaces ⏎ Crawl's field book ⏎ Personal · Owner ⏎ New shared workspace ⏎ Name ⏎ Create workspace ⏎ Crawl's field book ⏎ Active ⏎ Personal field book — private to you. ⏎ Rename ⏎ Save name ⏎ Members ⏎ Crawl user(you) ⏎ [test-account]@example.test ⏎ Owner ⏎ Personal field books cannot be shared. Create a shared workspace to collaborate.

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-27-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-27-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-27-02 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-27-03 | Search (Command K) | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-27-04 | Light theme | header | button |  | Clicked: opens “Esc PAGES Overview Projects New scenario Site Explorer Sun & Power Earth & DTE C” |
| BTN-27-05 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-27-06 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-27-07 | CU Account menu for Crawl user | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-27-08 | Collapse sidebar | sidebar | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-27-09 | Crawl's field book Personal · Owner | main | button |  | Same control observed; not probed in this role/page |
| BTN-27-10 | Create workspace | main | submit, disabled |  | Same control observed; not probed in this role/page |
| BTN-27-11 | Save name | main | submit |  | Same control observed; not probed in this role/page |
| BTN-27-12 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-27-13 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Workspace | `/app` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Name | input[text] | e.g. Artemis traverse study | no |  |  |  |
| Rename | input[text] |  | no |  | Crawl's field book |  |


### PG-28 · Development mailbox  `/dev/mail`

- **Document title:** Development mailbox · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/dev/mail/page.tsx` · access rule in code: public
- **Notices / alerts shown:** “Local development only MAIL_DRIVER=outbox writes messages to data/outbox/ instead of sending them. This page d”
- **Test ids on the page:** none
- **Visible text excerpt:**

  > MoonNav ⏎ Development mailbox ⏎ Local development only ⏎ MAIL_DRIVER=outbox writes messages to data/outbox/ instead of sending them. This page disappears in production. ⏎ Verify your MoonNav email ⏎ 2026-11-12 23:25:22 UTC ⏎ to [test-account]@example.test ⏎ Confirm your email address to activate your account: ⏎ http://localhost:3100/api/auth/verify-email?token=[REDACTED]&callbackURL=%2F ⏎ The link expires in 24 hours. ⏎ Verify your MoonNav email ⏎ 2026-11-12 23:25:21 UTC ⏎ to [test-account]@example.test ⏎ Confirm your email address to activate your account: ⏎ http://localhost:3100/api/auth/verify-email?token=[REDACTED]&callbackURL=%2F ⏎ The link expires in 24 hours.

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| MoonNav home | `/` | no |
| http://localhost:3100/api/auth/verify-email?token=[REDACTED] | `http://localhost:3100/api/auth/verify-email?token=[REDACTED]&callbackURL=%2F` | no |


### PG-29 · This page is outside our coverage.  `/does-not-exist`

- **Document title:** MoonNav — Lunar south-pole site navigator
- **Observed per viewer role:** anonymous → 404
- **Errors seen while loading:** console: Failed to load resource: the server responded with a status of 404 (Not Found)
- **Test ids on the page:** none
- **Visible text excerpt:**

  > 404 · off the traverse ⏎ This page is outside our coverage. ⏎ The link may be mistyped, or the object may have been deleted or belong to a workspace you are not in. ⏎ Back to MoonNav ⏎ Open the explorer ⏎ Looking for your work? Open the workspace.

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Back to MoonNav | `/` | no |
| Open the explorer | `/explore` | no |
| Open the workspace | `/app` | no |


### PG-30 · South-pole explorer  `/explore`

- **Document title:** Explore the lunar south pole · MoonNav
- **Observed per viewer role:** anonymous → redirected to `/explore`
- **Source:** `src/app/(public)/explore/page.tsx` · access rule in code: public
- **Section headings (h2), top to bottom:** “Sites” · “Go to coordinate” · “Mons Malapert” · “Mons Malapert PRECOMPUTED” · “Operations: sunlight CALCULATED” · “Sunlight timeline PRECOMPUTED” · “Horizon panorama PRECOMPUTED” · “Direct-sunlight intervals CALCULATED” · “Ground surface and irradiance PRECOMPUTED” · “Solar-panel energy UNAVAILABLE” · “Data quality: Medium” · “Provenance & reproducibility PRECOMPUTED”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” (selected) · “Match system” · “LOLA relief” (selected) · “LROC WAC imagery” · “Sun & Power” (selected) · “Earth & DTE” · “Site 3D” · “Polar region 3D” · “Global Moon” · “Panorama” (selected) · “Polar sky plot”
- **Tables:** “Sunlit intervals with UTC start, end and duration”: Type / Start (UTC) / End (UTC) / Duration (h) (3 rows)
- **Graphics:** 3 canvas element(s) (3D/map)
- **Notices / alerts shown:** “Precomputed demonstration · generated 2026-11-12 22:09:10 UTC 2026-11-15 00:00:00 UTC → 2026-12-15 00:00:00 UT” · “Not calculated — panel assumptions missing Provide panel area, efficiency, derating and orientation to estimat”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`, `time-readout`, `plain-sun`, `ops-sun`, `surface-panel`
- **Visible text excerpt:**

  > South-pole explorer ⏎ Inspect the LOLA terrain, pick a named feature or click any point inside 75°S. Featured stations carry a precomputed Sun and Earth analysis for 2026-11-15 → 2026-12-15. No account needed. ⏎ Save as scenario ⏎ + ⏎ – ⏎ 200 km ⏎ Polar stereographic · 0°E up ⏎ Move over the map for coordinates ⏎ Map layers ⏎ LOLA relief ⏎ LROC WAC imagery ⏎ Feasibility ⏎ Elevation ⏎ Slope ⏎ Permanent shadow (PSR) ⏎ Long-term sunlight ⏎ Grid ⏎ Named sites ⏎ Coverage edge ⏎ SOURCE DATA ⏎ derived from LDEM_75S_240M ⏎ Sites ⏎ IAU Gazetteer feature centres, not official landing sites ⏎ Search sites ⏎ Lunar South Pole (reference point) ⏎ 90.00°S ⏎ Shackleton ⏎ DEMO ⏎ 89.67°S ⏎ de Gerlache ⏎ DEMO 

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-30-00 | Simple | header | button |  | Same control observed; not probed in this role/page |
| BTN-30-01 | Advanced | header | button |  | Same control observed; not probed in this role/page |
| BTN-30-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Same control observed; not probed in this role/page |
| BTN-30-03 | Light theme | header | button |  | Same control observed; not probed in this role/page |
| BTN-30-04 | Dark theme | header | button |  | Same control observed; not probed in this role/page |
| BTN-30-05 | Match system | header | button |  | Same control observed; not probed in this role/page |
| BTN-30-06 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-30-07 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |
| BTN-30-08 | Zoom in | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-09 | Zoom out | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-10 | LOLA relief | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-11 | LROC WAC imagery | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-12 | Lunar South Pole (reference point) 90.00°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-13 | Shackleton DEMO 89.67°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-14 | de Gerlache DEMO 88.48°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-15 | Spudis 89.51°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-16 | Shoemaker 88.14°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-17 | Faustini 87.18°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-18 | Haworth 87.45°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-19 | Slater 88.08°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-20 | Henson 88.57°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-21 | Sverdrup 88.32°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-22 | Nobile 85.28°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-23 | Cabeus 85.33°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-24 | Amundsen 84.44°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-25 | Malapert 85.00°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-26 | Mons Malapert DEMO 85.98°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-27 | Mons Mouton DEMO 84.60°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-28 | Mons Kocher 85.46°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-29 | Go | main | submit |  | Same control observed; not probed in this role/page |
| BTN-30-30 | Sun & Power | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-31 | Earth & DTE | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-32 | Site 3D | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-33 | Polar region 3D | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-34 | Global Moon | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-35 | Reset to start | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-36 | Step backward | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-37 | Play | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-38 | Step forward | main | button |  | Same control observed; not probed in this role/page |
| BTN-30-39 | What does this mean? | main | button |  | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Save as scenario | `/login?next=%2Fapp%2Fscenarios%2Fnew%3Fsite%3Dmons-malapert` | no |
| Gazetteer entry | `https://planetarynames.wr.usgs.gov/Feature/16338` | yes |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Feasibility | input[checkbox] |  | no |  | false |  |
| Elevation | input[checkbox] |  | no |  | false |  |
| Slope | input[checkbox] |  | no |  | false |  |
| Permanent shadow (PSR) | input[checkbox] |  | no |  | false |  |
| Long-term sunlight | input[checkbox] |  | no |  | false |  |
| Grid | input[checkbox] |  | no |  | true |  |
| Named sites | input[checkbox] |  | no |  | true |  |
| Coverage edge | input[checkbox] |  | no |  | true |  |
| Search sites | input[text] | Search sites or feature type… | no |  |  |  |
| Latitude | input[text] | lat e.g. -89.45 | no |  |  |  |
| Longitude east | input[text] | lon °E e.g. 222.7 | no |  |  |  |
| Playback speed (multiple of real time) | select[select-one] |  | no |  | 3600 | 1× · 10× · 60× · 360× · 3,600× (1 h/s) · 21,600× (6 h/s) · 86,400× (24 h/s) |
| Step size | select[select-one] |  | no |  | 3600 | 1 sample · 1 h · 6 h · 1 day |
| Selected time sample | input[range] |  | no | min 0, max 1441 | 0 |  |
| (unlabelled) | input[datetime-local] |  | no | min 2026-11-15T00:00, max 2026-12-15T00:00 | 2026-11-15T00:00 |  |
| (unlabelled) | input[datetime-local] |  | no | min 2026-11-15T00:00, max 2026-12-15T00:00 | 2026-12-15T00:00 |  |

- **Mobile (390×844):** header controls: “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Light theme”, “Dark theme”, “Match system”, “Open menu”, “Panorama”, “Polar sky plot”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/anonymous-explore-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/anonymous-explore-desktop.png` (1440×900)

### PG-31 · South-pole explorer  `/explore?site=mons-malapert&tab=globe`

- **Document title:** Explore the lunar south pole · MoonNav
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/explore/page.tsx` · access rule in code: public
- **Section headings (h2), top to bottom:** “Sites” · “Go to coordinate” · “Mons Malapert” · “Mons Malapert”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” (selected) · “Match system” · “LOLA relief” (selected) · “LROC WAC imagery” · “Sun & Power” · “Earth & DTE” · “Site 3D” · “Polar region 3D” · “Global Moon” (selected)
- **Graphics:** 2 canvas element(s) (3D/map)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`, `globe`, `relief-status`, `globe-readout`
- **Visible text excerpt:**

  > South-pole explorer ⏎ Inspect the LOLA terrain, pick a named feature or click any point inside 75°S. Featured stations carry a precomputed Sun and Earth analysis for 2026-11-15 → 2026-12-15. No account needed. ⏎ Save as scenario ⏎ + ⏎ – ⏎ 200 km ⏎ Polar stereographic · 0°E up ⏎ Move over the map for coordinates ⏎ Map layers ⏎ LOLA relief ⏎ LROC WAC imagery ⏎ Feasibility ⏎ Elevation ⏎ Slope ⏎ Permanent shadow (PSR) ⏎ Long-term sunlight ⏎ Grid ⏎ Named sites ⏎ Coverage edge ⏎ SOURCE DATA ⏎ derived from LDEM_75S_240M ⏎ Sites ⏎ IAU Gazetteer feature centres, not official landing sites ⏎ Search sites ⏎ Lunar South Pole (reference point) ⏎ 90.00°S ⏎ Shackleton ⏎ DEMO ⏎ 89.67°S ⏎ de Gerlache ⏎ DEMO 

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-31-00 | Simple | header | button |  | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-31-01 | Advanced | header | button |  | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-31-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-31-03 | Light theme | header | button |  | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-31-04 | Dark theme | header | button |  | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-31-05 | Match system | header | button |  | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-31-06 | Close diagnostics | other | button |  | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-31-07 | Record 10 s | other | button | perf-record | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1200ms exceeded. |
| BTN-31-08 | Zoom in | main | button |  | Clicked: opens “Lunar South Pole (reference point) 90.00°S Shackleton DEMO 89.67°S de Gerlache D” |
| BTN-31-09 | Zoom out | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-10 | LOLA relief | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-11 | LROC WAC imagery | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-12 | Lunar South Pole (reference point) 90.00°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-13 | Shackleton DEMO 89.67°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-14 | de Gerlache DEMO 88.48°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-15 | Spudis 89.51°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-16 | Shoemaker 88.14°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-17 | Faustini 87.18°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-18 | Haworth 87.45°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-19 | Slater 88.08°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-20 | Henson 88.57°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-21 | Sverdrup 88.32°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-22 | Nobile 85.28°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-23 | Cabeus 85.33°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-24 | Amundsen 84.44°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-25 | Malapert 85.00°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-26 | Mons Malapert DEMO 85.98°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-27 | Mons Mouton DEMO 84.60°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-28 | Mons Kocher 85.46°S | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-29 | Go | main | submit |  | Same control observed; not probed in this role/page |
| BTN-31-30 | Sun & Power | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-31 | Earth & DTE | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-32 | Site 3D | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-33 | Polar region 3D | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-34 | Global Moon | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-35 | Reset view | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-36 | South-pole view | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-37 | Fly to selection | main | button |  | Same control observed; not probed in this role/page |
| BTN-31-38 | Open Mons Malapert (85.98°S) in polar region 3D | main | button |  | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Save as scenario | `/login?next=%2Fapp%2Fscenarios%2Fnew%3Fsite%3Dmons-malapert` | no |
| Gazetteer entry | `https://planetarynames.wr.usgs.gov/Feature/16338` | yes |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Feasibility | input[checkbox] |  | no |  | false |  |
| Elevation | input[checkbox] |  | no |  | false |  |
| Slope | input[checkbox] |  | no |  | false |  |
| Permanent shadow (PSR) | input[checkbox] |  | no |  | false |  |
| Long-term sunlight | input[checkbox] |  | no |  | false |  |
| Grid | input[checkbox] |  | no |  | true |  |
| Named sites | input[checkbox] |  | no |  | true |  |
| Coverage edge | input[checkbox] |  | no |  | true |  |
| Search sites | input[text] | Search sites or feature type… | no |  |  |  |
| Latitude | input[text] | lat e.g. -89.45 | no |  |  |  |
| Longitude east | input[text] | lon °E e.g. 222.7 | no |  |  |  |
| Globe lighting | select[select-one] |  | no |  | sun | SPICE Sun · Relief (camera) · Unlit mosaic |
| Vertical exaggeration | select[select-one] |  | no |  | 1 | 1.0× true · 2× (visual) · 5× (visual) · 10× (visual) · 20× (visual) |


### PG-32 · Reset your password  `/forgot-password`

- **Document title:** MoonNav — Lunar south-pole site navigator
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/forgot-password/page.tsx` · access rule in code: public
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Reset your password ⏎ We will email a reset link that is valid for 30 minutes. ⏎ Email* ⏎ Send reset link ⏎ Back to sign in ⏎ Every number in MoonNav says where it came from: source data, calculated, modelled — or unknown. ⏎ LOLA LDEM_75S_240M RELIEF · SOUTH POLAR STEREOGRAPHIC

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-32-00 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-32-01 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-32-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → true |
| BTN-32-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-32-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-32-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-32-06 | Send reset link | main | submit |  | Not executed: form submit: documented from the form, not clicked blindly |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Back to sign in | `/login` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Email* | input[email] |  | yes |  |  |  |


### PG-33 · Workspace invitation · MoonNav  `/invite/:id`

- **Document title:** Workspace invitation · MoonNav
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/invite/[token]/page.tsx` · access rule in code: public
- **Section headings (h2), top to bottom:** “Invitation not available”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected) · “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Errors seen while loading:** console: Failed to load resource: the server responded with a status of 404 (Not Found); 404 /api/v1/invitations/sample-invalid-token
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > MoonNav ⏎ Explore ⏎ Learn ⏎ Methodology ⏎ Data sources ⏎ Validation ⏎ About ⏎ Simple ⏎ Advanced ⏎ Toggle rendering diagnostics ⏎ Open workspace ⏎ Invitation not available ⏎ The link may have expired, been revoked, or already used. ⏎ If you believe this is an error, ask the workspace owner to send a new invitation. ⏎ Return home ⏎ MoonNav ⏎ An independent research and education prototype. Not NASA-owned, endorsed or flight-certified; it does not select approved landing sites. Built for the 2026 NASA Space Apps Challenge “Lunar Landing Site Navigator”. ⏎ Product ⏎ Explorer ⏎ Learn ⏎ Create an account ⏎ About ⏎ Science ⏎ Methodology ⏎ Data sources ⏎ Known limitations ⏎ Legal ⏎ Privacy ⏎ Terms o

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-33-00 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-33-01 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-33-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → true |
| BTN-33-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-33-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-33-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-33-06 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-33-07 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-33-08 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → true |
| BTN-33-09 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-33-10 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-33-11 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Return home | `/` | no |


### PG-34 · From the problem to the blueprint in 12 steps  `/learn`

- **Document title:** Learn · MoonNav
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/learn/page.tsx` · access rule in code: public
- **Section headings (h2), top to bottom:** “Guided example: mountain top or crater floor? PRECOMPUTED” · “The 12 steps” · “Glossary”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected) · “Mons Malapert” · “Shackleton”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > From the problem to the blueprint in 12 steps ⏎ The original MoonNav learning sequence, written for students, educators and curious visitors. Interactive parts use the same calculations as the planning workspace — Learn mode never invents easier numbers. ⏎ Guided example: mountain top or crater floor? ⏎ PRECOMPUTED ⏎ Same 30-day window, same method, same assumptions. ⏎ Mons Malapert is a mons at 85.98°S, 4915 m above the reference sphere. Shackleton is a crater whose centre is at 89.67°S, -2786 m. Which one gets more direct sunlight between 15 November and 15 December 2026? ⏎ Mons Malapert ⏎ Shackleton ⏎ The 12 steps ⏎ 01 ⏎ Understand the actual problem ⏎ A lander at the lunar south pole nee

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-34-00 | Simple | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-34-01 | Advanced | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-34-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → true |
| BTN-34-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-34-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-34-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-34-06 | Mons Malapert | main | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-34-07 | Shackleton | main | button |  | Clicked: changes on-page state only (no navigation, no API call) |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Open the explorer | `/explore` | no |
| methodology | `/methodology` | no |


### PG-35 · Known limitations  `/limitations`

- **Document title:** Known limitations · MoonNav
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/limitations/page.tsx` · access rule in code: public
- **Section headings (h2), top to bottom:** “Terrain resolution” · “Coverage” · “Named sites” · “Power” · “Communication” · “Imagery” · “Ephemeris horizon” · “Earth disk” · “Prototype status”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Known limitations ⏎ What the current build cannot claim. These limits are also printed in every exported report. ⏎ Terrain resolution ⏎ The analysis DEM is LOLA LDEM_75S_240M (240 m pixels). Near-field terrain within about a kilometre is smoothed, so small rocks, boulders and local slopes are not represented. Results are not a landing-hazard assessment. ⏎ Coverage ⏎ Terrain covers 75°S to the pole. Horizon rays that reach the coverage edge are flagged; if unseen terrain could change a decision, the state is reported as unknown. ⏎ Named sites ⏎ Featured sites are IAU feature centres from the USGS Gazetteer. They are not NASA candidate landing regions or approved sites. ⏎ Power ⏎ Energy is an 

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-35-00 | Simple | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-35-01 | Advanced | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-35-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → true |
| BTN-35-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-35-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-35-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |


### PG-36 · Sign in to MoonNav  `/login`

- **Document title:** Sign in · MoonNav
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/login/page.tsx` · access rule in code: public
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`, `demo-button`
- **Visible text excerpt:**

  > Sign in to MoonNav ⏎ One account for planners, analysts, curators and administrators — your role decides what you can open. ⏎ Email* ⏎ Password* ⏎ Remember this device (7 days) ⏎ Forgot password? ⏎ Sign in ⏎ Continue with demo ⏎ Private sample workspace with real analyses · expires after 24 h ⏎ New here? Create an account · Explore without an account ⏎ Every number in MoonNav says where it came from: source data, calculated, modelled — or unknown. ⏎ LOLA LDEM_75S_240M RELIEF · SOUTH POLAR STEREOGRAPHIC

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-36-00 | Simple | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-36-01 | Advanced | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-36-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → false |
| BTN-36-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-36-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-36-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-36-06 | Close diagnostics | other | button |  | Clicked: toggles aria-pressed → true |
| BTN-36-07 | Record 10 s | other | button | perf-record | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1200ms exceeded. |
| BTN-36-08 | Show password | main | button |  | Clicked: navigates to `/app` |
| BTN-36-09 | Sign in | main | submit |  | Same control observed; not probed in this role/page |
| BTN-36-10 | Continue with demo | main | submit | demo-button | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Forgot password? | `/forgot-password` | no |
| Create an account | `/register` | no |
| Explore without an account | `/explore` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Email* | input[email] |  | yes |  |  |  |
| Password* | input[password] |  | yes |  |  |  |
| Remember this device (7 days) | input[checkbox] |  | no |  | true |  |

- **Mobile (390×844):** header controls: “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Light theme”, “Dark theme”, “Match system”, “Open menu”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/anonymous-login-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/anonymous-login-desktop.png` (1440×900)

### PG-37 · Two-factor verification  `/login/two-factor`

- **Document title:** MoonNav — Lunar south-pole site navigator
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/login/two-factor/page.tsx` · access rule in code: public
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Two-factor verification ⏎ Enter the code from your authenticator app. ⏎ 6-digit authenticator code* ⏎ Trust this device for 30 days ⏎ VerifyUse a backup code instead ⏎ Every number in MoonNav says where it came from: source data, calculated, modelled — or unknown. ⏎ LOLA LDEM_75S_240M RELIEF · SOUTH POLAR STEREOGRAPHIC

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-37-00 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-37-01 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-37-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → true |
| BTN-37-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-37-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-37-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-37-06 | Verify | main | submit |  | Not executed: form submit: documented from the form, not clicked blindly |
| BTN-37-07 | Use a backup code instead | main | button |  | Clicked: changes on-page state only (no navigation, no API call) |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| 6-digit authenticator code* | input[text] |  | yes |  |  |  |
| Trust this device for 30 days | input[checkbox] |  | no |  | false |  |


### PG-38 · Scientific methods and limitations  `/methodology`

- **Document title:** Methodology · MoonNav
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/methodology/page.tsx` · access rule in code: public
- **Section headings (h2), top to bottom:** “1. Coordinates, frames and time” · “2. Sun and Earth geometry” · “3. Terrain and horizon” · “4. Visibility states and intervals” · “5. Optional solar-panel energy (modelled)” · “6. Geometric direct-to-Earth visibility” · “7. Comparison and quality” · “8. Out of scope”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Scientific methods and limitations ⏎ Method version moonnav-method-1.0.0. How MoonNav turns ephemerides and terrain into visibility states, intervals and optional energy estimates. Full equations and validation evidence are in docs/SCIENTIFIC_METHODS.md in the repository. ⏎ 1. Coordinates, frames and time ⏎ Sites use planetocentric latitude (north positive) and east-positive longitude in [0°, 360°). West-positive input is converted explicitly. The body-fixed frame is MOON_ME, which the NAIF kernel moon_de440_250416.tf defines as MOON_ME_DE440_ME421 — aligned with the DE421 mean-Earth/polar-axis frame that the LOLA gridded products use, so terrain and ephemeris share one frame. ⏎ Heights are 

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-38-00 | Simple | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-38-01 | Advanced | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-38-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → true |
| BTN-38-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-38-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-38-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |


### PG-39 · Privacy  `/privacy`

- **Document title:** Privacy · MoonNav
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/privacy/page.tsx` · access rule in code: public
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Privacy ⏎ What MoonNav stores and why. ⏎ Account data. Your name, email address, a salted password hash (scrypt), session records (with IP address and browser user agent, for security), your role and display preferences. Passwords are never stored in plain text. ⏎ Workspace data. Projects, scenarios, analysis results and reports you create. Scenarios and results are immutable so they stay reproducible. ⏎ Security records. Audit events for sign-in-related administration, role changes, data approvals and report sharing. These are append-only. ⏎ Cookies. One HttpOnly, SameSite session cookie. No advertising or analytics cookies are set. ⏎ Your controls. Settings → Profile lets you export your d

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-39-00 | Simple | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-39-01 | Advanced | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-39-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → false |
| BTN-39-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-39-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-39-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-39-06 | Close diagnostics | other | button |  | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1200ms exceeded. |
| BTN-39-07 | Record 10 s | other | button | perf-record | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1200ms exceeded. |


### PG-40 · Create your MoonNav account  `/register`

- **Document title:** Create account · MoonNav
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/register/page.tsx` · access rule in code: public
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Create your MoonNav account ⏎ Save scenarios, run analyses, compare sites and export reports. We only ask for what we need. ⏎ Name* ⏎ Email* ⏎ Password* ⏎ 12+ characters with letters and a number or symbol. ⏎ Confirm password* ⏎ I accept the terms of use and the privacy notice, and understand MoonNav is a research/education prototype. ⏎ Create account ⏎ Already registered? Sign in ⏎ Every number in MoonNav says where it came from: source data, calculated, modelled — or unknown. ⏎ LOLA LDEM_75S_240M RELIEF · SOUTH POLAR STEREOGRAPHIC

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-40-00 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-40-01 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-40-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → false |
| BTN-40-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-40-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-40-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-40-06 | Close diagnostics | other | button |  | Clicked: toggles aria-pressed → true |
| BTN-40-07 | Record 10 s | other | button | perf-record | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1200ms exceeded. |
| BTN-40-08 | Show password | main | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-40-09 | Show password | main | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-40-10 | Create account | main | submit |  | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| terms of use | `/terms` | no |
| privacy notice | `/privacy` | no |
| Sign in | `/login` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Name* | input[text] |  | yes |  |  |  |
| Email* | input[email] |  | yes |  |  |  |
| Password* | input[password] |  | yes |  |  |  |
| Confirm password* | input[password] |  | yes |  |  |  |
| I accept the terms of use and the privacy notice, and understand MoonNav is a research/education prototype. | input[checkbox] |  | no |  | false |  |

- **Mobile (390×844):** header controls: “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Light theme”, “Dark theme”, “Match system”, “Open menu”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/anonymous-register-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/anonymous-register-desktop.png` (1440×900)

### PG-41 · Choose a new password  `/reset-password`

- **Document title:** MoonNav — Lunar south-pole site navigator
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/reset-password/page.tsx` · access rule in code: public
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Notices / alerts shown:** “This reset link is invalid or has expired Request a new link.”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Choose a new password ⏎ This reset link is invalid or has expired ⏎ Request a new link. ⏎ Every number in MoonNav says where it came from: source data, calculated, modelled — or unknown. ⏎ LOLA LDEM_75S_240M RELIEF · SOUTH POLAR STEREOGRAPHIC

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-41-00 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-41-01 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-41-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → false |
| BTN-41-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-41-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-41-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-41-06 | Close diagnostics | other | button |  | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1200ms exceeded. |
| BTN-41-07 | Record 10 s | other | button | perf-record | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1200ms exceeded. |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Request a new link | `/forgot-password` | no |


### PG-42 · Profile & preferences  `/settings/profile`

- **Document title:** Profile · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/settings/profile/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “Profile” · “Your data” · “Delete account”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Profile & preferences ⏎ Display preferences never change scientific timestamps, which are stored and computed in UTC. ⏎ Profile ⏎ [test-account]@example.test · role user ⏎ Name ⏎ Preferred mode ⏎ Mission planning ⏎ Learn ⏎ Public exploration ⏎ Display time zone ⏎ UTC ⏎ Africa/Abidjan ⏎ Africa/Accra ⏎ Africa/Addis_Ababa ⏎ Africa/Algiers ⏎ Africa/Asmera ⏎ Africa/Bamako ⏎ Africa/Bangui ⏎ Africa/Banjul ⏎ Africa/Bissau ⏎ Africa/Blantyre ⏎ Africa/Brazzaville ⏎ Africa/Bujumbura ⏎ Africa/Cairo ⏎ Africa/Casablanca ⏎ Africa/Ceuta ⏎ Africa/Conakry ⏎ Africa/Dakar ⏎ Africa/Dar_es_Salaam ⏎ Africa/Djibouti ⏎ Africa/Douala ⏎ Africa/El_Aaiun ⏎ Africa/Freetown ⏎ Africa/Gaborone ⏎ Africa/Harare ⏎ Africa/Joh

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-42-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-42-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-42-02 | Advanced | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-42-03 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1195.869000000006ms exceeded. |
| BTN-42-04 | Search (Command K) | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-42-05 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-42-06 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-42-07 | Match system | header | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-42-08 | CU Account menu for Crawl user | header | button |  | Clicked: toggles aria-expanded → true |
| BTN-42-09 | Expand sidebar | sidebar | button |  | Same control observed; not probed in this role/page |
| BTN-42-10 | Save | main | submit |  | Same control observed; not probed in this role/page |
| BTN-42-11 | Delete my account | main | button, disabled |  | Same control observed; not probed in this role/page |
| BTN-42-12 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-42-13 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Export my data (JSON) | `/api/v1/me/export` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Name | input[text] |  | no |  | Crawl user |  |
| Preferred mode | select[select-one] |  | no |  | planning | Mission planning · Learn · Public exploration |
| Display time zone | select[select-one] |  | no |  | UTC | UTC · Africa/Abidjan · Africa/Accra · Africa/Addis_Ababa · Africa/Algiers · Africa/Asmera · Africa/Bamako · Africa/Bangui · Africa/Banjul · Africa/Bissau · Africa/Blantyre · Africa/Brazzaville · Africa/Bujumbura · Africa/Cairo · Africa/Casablanca · Africa/Ceuta · Africa/Conakry · Africa/Dakar · Africa/Dar_es_Salaam · Africa/Djibouti · Africa/Douala · Africa/El_Aaiun · Africa/Freetown · Africa/Gaborone · Africa/Harare · Africa/Johannesburg · Africa/Juba · Africa/Kampala · Africa/Khartoum · Africa/Kigali · Africa/Kinshasa · Africa/Lagos · Africa/Libreville · Africa/Lome · Africa/Luanda · Africa/Lubumbashi · Africa/Lusaka · Africa/Malabo · Africa/Maputo · Africa/Maseru · Africa/Mbabane · Africa/Mogadishu · Africa/Monrovia · Africa/Nairobi · Africa/Ndjamena · Africa/Niamey · Africa/Nouakchott · Africa/Ouagadougou · Africa/Porto-Novo · Africa/Sao_Tome · Africa/Tripoli · Africa/Tunis · Africa/Windhoek · America/Adak · America/Anchorage · America/Anguilla · America/Antigua · America/Araguaina · America/Argentina/La_Rioja · America/Argentina/Rio_Gallegos |
| Type "DELETE" to confirm | input[text] |  | no |  |  |  |


### PG-43 · Security  `/settings/security`

- **Document title:** Security · MoonNav
- **Observed per viewer role:** demo → 200; user → 200
- **Source:** `src/app/settings/security/page.tsx` · access rule in code: signed in (any role)
- **Section headings (h2), top to bottom:** “Change password” · “Two-factor authentication: off” · “Active sessions”
- **Tabs / radio groups:** “Simple” (selected) · “Advanced” · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Security ⏎ Password, two-factor authentication and sessions. ⏎ Change password ⏎ Other sessions are signed out. ⏎ Current password ⏎ New password ⏎ 12+ characters ⏎ Update password ⏎ Two-factor authentication: off ⏎ Time-based one-time codes (TOTP) from an authenticator app. ⏎ Confirm your password to start ⏎ Set up 2FA ⏎ Active sessions ⏎ Sign out other sessions ⏎ Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like · 10.176.149.158 · since 2026-11-12 23:25 ⏎ this device

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-43-00 | C Crawl's field book Personal · Owner | header | button |  | Clicked: opens “Crawl's field book Personal · Owner” |
| BTN-43-01 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-43-02 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-43-03 | Search (Command K) | header | button |  | Not executed: not clickable in this state: locator.click: Timeout 1800ms exceeded. |
| BTN-43-04 | Light theme | header | button |  | Clicked: opens “Esc PAGES Overview Projects New scenario Site Explorer Sun & Power Earth & DTE C” |
| BTN-43-05 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-43-06 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-43-07 | CU Account menu for Crawl user | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-43-08 | Collapse sidebar | sidebar | button |  | Clicked: opens “Crawl user [test-account]@example.test USER Profile & preferences Security & MFA” |
| BTN-43-09 | Show password | main | button |  | Same control observed; not probed in this role/page |
| BTN-43-10 | Show password | main | button |  | Same control observed; not probed in this role/page |
| BTN-43-11 | Update password | main | submit |  | Same control observed; not probed in this role/page |
| BTN-43-12 | Show password | main | button |  | Same control observed; not probed in this role/page |
| BTN-43-13 | Set up 2FA | main | submit |  | Same control observed; not probed in this role/page |
| BTN-43-14 | Sign out other sessions | header | button |  | Same control observed; not probed in this role/page |
| BTN-43-15 | Close diagnostics | other | button |  | Same control observed; not probed in this role/page |
| BTN-43-16 | Record 10 s | other | button | perf-record | Same control observed; not probed in this role/page |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Current password | input[password] |  | yes |  |  |  |
| New password | input[password] |  | yes |  |  |  |
| Confirm your password to start | input[password] |  | yes |  |  |  |


### PG-44 · Crawl scenario (v1)  `/share/:id`

- **Document title:** Shared report · MoonNav
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/share/[token]/page.tsx` · access rule in code: public
- **Section headings (h2), top to bottom:** “Summary STORED RESULT”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Errors seen while loading:** console: Failed to load resource: the server responded with a status of 403 (Forbidden); 403 /api/v1/storage/local
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Crawl scenario (v1) ⏎ PDF report version 1 · link expires 2026-11-15 23:25 UTC ⏎ Download PDF ⏎ Summary ⏎ STORED RESULT ⏎ Analysis ana_92ac2083-0218-4d26-9aa5-746d8ff84407 · moonnav-method-1.1.0 ⏎ Site ⏎ 85.9800°S 358.3300°E, 4915 m ⏎ Interval (UTC) ⏎ 2026-11-15T00:00:00Z → 2026-11-18T00:00:00Z ⏎ Direct sunlight ⏎ 52.7 h (73.2%) ⏎ Geometric DTE ⏎ 72.0 h (100.0%) ⏎ Quality ⏎ Medium ⏎ Report SHA-256 ⏎ 28bbf148d77a675dc5928a416efed575a5f5df32f3adfb7dd492595f2eaa3343 ⏎ MoonNav is an independent research/education prototype; geometric DTE is line of sight only, not RF link availability.

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-44-00 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-44-01 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-44-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → false |
| BTN-44-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-44-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-44-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-44-06 | Close diagnostics | other | button |  | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1200ms exceeded. |
| BTN-44-07 | Record 10 s | other | button | perf-record | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1200ms exceeded. |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Download PDF | `/api/v1/storage/local?key=reports%2Fws_a34d906a-e003-4488-a1cf-bc1c9d3b23bb%2Frep_d08400f6-afb2-4b44-a13f-775535148e00%2Fv1%2Freport.pdf&exp=1794526383&fn=moonnav-d08400f6-v1.pdf&sig=ac37a4e6d34cc0e3308c43b0f848740b8304e54e3c6f5cf5ad3090431a7e3bea` | no |


### PG-45 · Data sources  `/sources`

- **Document title:** Data sources · MoonNav
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/sources/page.tsx` · access rule in code: public
- **Section headings (h2), top to bottom:** “LDEM_75S_240M Approved SOURCE DATA” · “LDEM_875S_5M Superseded SOURCE DATA” · “LOLA multi-resolution composite Approved SOURCE DATA” · “LDEM_16 Approved SOURCE DATA” · “LDEM_85S_20M Approved SOURCE DATA” · “LDEM_80S_40M Approved SOURCE DATA” · “LDEM_875S_5M Approved SOURCE DATA” · “naif-generic-kernels Approved SOURCE DATA” · “LPSR_75S_120M_201608 Approved SOURCE DATA” · “AVGVISIB_75S_120M_201608 Approved SOURCE DATA” · “AVGVISIB_75S_120M_201608_EARTH Approved SOURCE DATA” · “MOON_nomenclature_center_pts Approved SOURCE DATA” · “SPICE kernel manifest” · “Map layers (visual only) SOURCE DATA” · “Not connected in this build UNAVAILABLE”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Tables:** File / Type / Purpose / SHA-256 (6 rows)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`, `perf-panel`, `perf-live`, `perf-record`
- **Visible text excerpt:**

  > Data sources ⏎ Every product MoonNav uses, with provider, release, licence, frame, units, resolution and processing state. Analyses record the exact product and kernel versions they used. ⏎ LDEM_75S_240M ⏎ Approved ⏎ SOURCE DATA ⏎ NASA PDS Geosciences Node ⏎ Official source ↗ ⏎ Role ⏎ Analysis terrain (horizon, heights) ⏎ Mission / instrument ⏎ Lunar Reconnaissance Orbiter / LOLA ⏎ Release ⏎ PRODUCT_VERSION_ID V2.0 (created 2017-06-15) ⏎ Format ⏎ PDS3 IMG, 16-bit LSB integer, 3812 x 3812 ⏎ Frame / CRS ⏎ MEAN EARTH/POLAR AXIS OF DE421 ⏎ Projection ⏎ Polar stereographic (spherical), centre -90 lat, 0 lon ⏎ Resolution ⏎ 240 m/pixel ⏎ Units / datum ⏎ metre · sphere radius 1737.4 km (heights are 

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-45-00 | Simple | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-45-01 | Advanced | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-45-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → false |
| BTN-45-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-45-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-45-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-45-06 | Close diagnostics | other | button |  | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1200ms exceeded. |
| BTN-45-07 | Record 10 s | other | button | perf-record | Not executed: not clickable in this state: locator.scrollIntoViewIfNeeded: Timeout 1200ms exceeded. |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| naif0012.tls | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls` | yes |
| pck00011.tpc | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc` | yes |
| moon_pa_de440_200625.bpc | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de440_200625.bpc` | yes |
| moon_de440_250416.tf | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf` | yes |
| moon_de440_220930.tf | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_220930.tf` | yes |
| de440s.bsp | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp` | yes |


### PG-46 · Terms of use  `/terms`

- **Document title:** Terms of use · MoonNav
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/terms/page.tsx` · access rule in code: public
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Terms of use ⏎ MoonNav is an independent research and educational prototype created for the 2026 NASA Space Apps Challenge. It is not NASA-owned, NASA-endorsed or flight-certified, and its outputs must not be used as the sole basis for operational mission decisions. ⏎ Results are calculated from public NASA/JPL data products under stated assumptions and limitations. MoonNav provides them “as is”, without warranty. Always check the methodology, data sources and known limitations. ⏎ Do not attempt to access other users’ workspaces, bypass rate limits or abuse shared links. Share links are read-only, expire and can be revoked by their creator. ⏎ Source data: NASA PDS (LOLA), NASA/JPL NAIF (SPIC

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-46-00 | Simple | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-46-01 | Advanced | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-46-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → true |
| BTN-46-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-46-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-46-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |


### PG-47 · Scientific validation  `/validation`

- **Document title:** Scientific validation · MoonNav
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/validation/page.tsx` · access rule in code: public
- **Section headings (h2), top to bottom:** “SPICE” · “LOLA” · “SPICE+LOLA” · “LOLA illumination” · “SVS” · “JPL Horizons”
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Tables:** “SPICE validation results”: Check / Reference / Epoch (UTC) / Location / frame / Difference / Tolerance / Result (6 rows); “LOLA validation results”: Check / Reference / Epoch (UTC) / Location / frame / Difference / Tolerance / Result (6 rows); “SPICE+LOLA validation results”: Check / Reference / Epoch (UTC) / Location / frame / Difference / Tolerance / Result (1 rows); “LOLA illumination validation results”: Check / Reference / Epoch (UTC) / Location / frame / Difference / Tolerance / Result (8 rows); “SVS validation results”: Check / Reference / Epoch (UTC) / Location / frame / Difference / Tolerance / Result (12 rows); “JPL Horizons validation results”: Check / Reference / Epoch (UTC) / Location / frame / Difference / Tolerance / Result (20 rows)
- **Notices / alerts shown:** “52 pass · 0 fail · 1 reference unavailable Generated 2026-11-12 22:12:00 UTC with live NASA/JPL services. Inde”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Scientific validation ⏎ Reproducible comparisons of MoonNav's engine against NASA and JPL references: the SVS Dial-a-Moon / SVS 4930 values, the JPL Horizons API, NAIF SPICE time and frame identities, independent NASA PDS LOLA products, and the LOLA teamthe JPL Horizons API, NAIF SPICE time and frame identities, and independent NASA PDS LOLA products.apos;s permanent-shadow and long-term sunlight maps (Mazarico et al. 2011). Re-run with npm run science:validate. ⏎ 52 pass · 0 fail · 1 reference unavailable ⏎ Generated 2026-11-12 22:12:00 UTC with live NASA/JPL services. Independent comparisons against published NASA/JPL references. Passing these checks does not mean NASA has certified or end

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-47-00 | Simple | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-47-01 | Advanced | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-47-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → true |
| BTN-47-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-47-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-47-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |

- **Mobile (390×844):** header controls: “Simple”, “Advanced”, “Toggle rendering diagnostics”, “Light theme”, “Dark theme”, “Match system”, “Open menu”; horizontal scroll: none; screenshot `docs/website-crawl/screenshots/anonymous-validation-mobile.png`
- **Desktop screenshot:** `docs/website-crawl/screenshots/anonymous-validation-desktop.png` (1440×900)

### PG-48 · Verify your email  `/verify-email`

- **Document title:** MoonNav — Lunar south-pole site navigator
- **Observed per viewer role:** anonymous → 200
- **Source:** `src/app/(public)/verify-email/page.tsx` · access rule in code: public
- **Tabs / radio groups:** “Simple” · “Advanced” (selected) · “Light theme” · “Dark theme” · “Match system” (selected)
- **Notices / alerts shown:** “Open the link we emailed you to verify your address. You can request a new link here.”
- **Test ids on the page:** `mode-toggle`, `perf-toggle`
- **Visible text excerpt:**

  > Verify your email ⏎ Open the link we emailed you to verify your address. You can request a new link here. ⏎ Email* ⏎ Send verification link ⏎ Back to sign in ⏎ Every number in MoonNav says where it came from: source data, calculated, modelled — or unknown. ⏎ LOLA LDEM_75S_240M RELIEF · SOUTH POLAR STEREOGRAPHIC

**Buttons observed (live DOM)**

| ID | Visible label / accessible name | Region | Type | Test id | Result of clicking it (executed in the isolated stack) |
|---|---|---|---|---|---|
| BTN-48-00 | Simple | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-48-01 | Advanced | header | button |  | Clicked: calls PUT /api/v1/me/preferences |
| BTN-48-02 | Rendering diagnostics (FPS, frame time, long tasks) | header | button | perf-toggle | Clicked: toggles aria-pressed → true |
| BTN-48-03 | Light theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-48-04 | Dark theme | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-48-05 | Match system | header | button |  | Clicked: changes on-page state only (no navigation, no API call) |
| BTN-48-06 | Send verification link | main | submit |  | Not executed: form submit: documented from the form, not clicked blindly |

**Links in the page body**

| Label | Destination | External |
|---|---|---|
| Back to sign in | `/login` | no |

**Form fields**

| Label | Element | Placeholder | Required | Constraints | Default | Options |
|---|---|---|---|---|---|---|
| Email* | input[email] |  | yes |  |  |  |



## 20. Complete form and input inventory

The form-field tables inside each page record above are the exhaustive list (label, element type, placeholder, required, constraints, default, options) as rendered. Validation messages and error strings implemented in the code:

| Validation / error message in code | File |
|---|---|
| Too many attempts. Wait a minute and try again. | `src/components/auth/LoginForm.tsx` |
| MoonNav could not reach its server or database. If you are running locally, start everything with `npm run dev`, then try again. | `src/components/auth/LoginForm.tsx` |
| Email or password is incorrect. | `src/components/auth/LoginForm.tsx` |
| name: Enter your name | `src/components/auth/RegisterForm.tsx` |
| email: Enter a valid email address | `src/components/auth/RegisterForm.tsx` |
| confirm: Passwords do not match | `src/components/auth/RegisterForm.tsx` |
| terms: Please accept the terms and privacy notice | `src/components/auth/RegisterForm.tsx` |


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

| URL | Methods | Who may call it (from code) | Rate limit | Science endpoints called | Source |
|---|---|---|---|---|---|
| `/api/auth/[...all]` | GET, POST | Better Auth endpoints | — | — | `src/app/api/auth/[...all]/route.ts` |
| `/api/internal/cron/drain` | GET | cron secret (Vercel Cron) | — | — | `src/app/api/internal/cron/drain/route.ts` |
| `/api/internal/jobs/[jobId]/complete` | POST | service token (internal) | — | — | `src/app/api/internal/jobs/[jobId]/complete/route.ts` |
| `/api/internal/jobs/[jobId]/fail` | POST | service token (internal) | — | — | `src/app/api/internal/jobs/[jobId]/fail/route.ts` |
| `/api/internal/jobs/[jobId]/heartbeat` | POST | service token (internal) | — | — | `src/app/api/internal/jobs/[jobId]/heartbeat/route.ts` |
| `/api/internal/jobs/claim` | POST | service token (internal) | — | — | `src/app/api/internal/jobs/claim/route.ts` |
| `/api/v1/admin/ingestion` | GET | role ≥ curator | — | — | `src/app/api/v1/admin/ingestion/route.ts` |
| `/api/v1/admin/ingestion/[runId]` | GET | role ≥ curator | — | — | `src/app/api/v1/admin/ingestion/[runId]/route.ts` |
| `/api/v1/admin/jobs/[jobId]/retry` | POST | role ≥ admin | — | — | `src/app/api/v1/admin/jobs/[jobId]/retry/route.ts` |
| `/api/v1/admin/products/[productId]/ingest` | POST | role ≥ curator | — | — | `src/app/api/v1/admin/products/[productId]/ingest/route.ts` |
| `/api/v1/admin/products/[productId]/status` | PATCH | role ≥ curator | — | — | `src/app/api/v1/admin/products/[productId]/status/route.ts` |
| `/api/v1/admin/users/[userId]/role` | PATCH | role ≥ admin | — | — | `src/app/api/v1/admin/users/[userId]/role/route.ts` |
| `/api/v1/analyses` | POST | signed in | 20/60s | — | `src/app/api/v1/analyses/route.ts` |
| `/api/v1/analyses/[analysisId]` | GET | signed in | — | — | `src/app/api/v1/analyses/[analysisId]/route.ts` |
| `/api/v1/analyses/[analysisId]/annotations` | GET, POST | signed in | — | — | `src/app/api/v1/analyses/[analysisId]/annotations/route.ts` |
| `/api/v1/analyses/[analysisId]/rerun` | POST | signed in | — | — | `src/app/api/v1/analyses/[analysisId]/rerun/route.ts` |
| `/api/v1/analyses/[analysisId]/timeseries` | GET | signed in | — | — | `src/app/api/v1/analyses/[analysisId]/timeseries/route.ts` |
| `/api/v1/analyses/[analysisId]/validate` | POST | signed in | 6/60s | /v1/validate/horizons | `src/app/api/v1/analyses/[analysisId]/validate/route.ts` |
| `/api/v1/analyze` | POST | public | 20/60s | — | `src/app/api/v1/analyze/route.ts` |
| `/api/v1/annotations/[annotationId]` | DELETE | signed in | — | — | `src/app/api/v1/annotations/[annotationId]/route.ts` |
| `/api/v1/comparisons` | POST | signed in | — | — | `src/app/api/v1/comparisons/route.ts` |
| `/api/v1/comparisons/[comparisonId]` | GET | signed in | — | — | `src/app/api/v1/comparisons/[comparisonId]/route.ts` |
| `/api/v1/data-products` | GET | public | — | — | `src/app/api/v1/data-products/route.ts` |
| `/api/v1/demo` | POST | public | 20/600s | — | `src/app/api/v1/demo/route.ts` |
| `/api/v1/ephemeris/[body]` | GET | public | 120/60s | /v1/ephemeris | `src/app/api/v1/ephemeris/[body]/route.ts` |
| `/api/v1/health` | GET | public | — | — | `src/app/api/v1/health/route.ts` |
| `/api/v1/illumination/point` | GET | public | 120/60s | /v1/illumination/point | `src/app/api/v1/illumination/point/route.ts` |
| `/api/v1/invitations/[token]` | GET | public | — | — | `src/app/api/v1/invitations/[token]/route.ts` |
| `/api/v1/invitations/accept` | POST | signed in | — | — | `src/app/api/v1/invitations/accept/route.ts` |
| `/api/v1/jobs/[jobId]` | GET, DELETE | signed in | — | — | `src/app/api/v1/jobs/[jobId]/route.ts` |
| `/api/v1/link-budget` | POST | signed in | 30/60s | /v1/link-budget | `src/app/api/v1/link-budget/route.ts` |
| `/api/v1/locations` | GET, POST | signed in | — | — | `src/app/api/v1/locations/route.ts` |
| `/api/v1/locations/[locationId]` | PATCH, DELETE | signed in | — | — | `src/app/api/v1/locations/[locationId]/route.ts` |
| `/api/v1/me` | GET, PATCH, DELETE | signed in | — | — | `src/app/api/v1/me/route.ts` |
| `/api/v1/me/export` | GET | signed in | — | — | `src/app/api/v1/me/export/route.ts` |
| `/api/v1/me/preferences` | GET, PUT | signed in | — | — | `src/app/api/v1/me/preferences/route.ts` |
| `/api/v1/projects` | GET, POST | signed in | — | — | `src/app/api/v1/projects/route.ts` |
| `/api/v1/projects/[projectId]` | GET, PATCH, DELETE | signed in | — | — | `src/app/api/v1/projects/[projectId]/route.ts` |
| `/api/v1/projects/[projectId]/duplicate` | POST | signed in | — | — | `src/app/api/v1/projects/[projectId]/duplicate/route.ts` |
| `/api/v1/reports` | GET, POST | signed in | 20/60s | — | `src/app/api/v1/reports/route.ts` |
| `/api/v1/reports/[reportId]` | GET | signed in | — | — | `src/app/api/v1/reports/[reportId]/route.ts` |
| `/api/v1/reports/[reportId]/share-links` | GET, POST | signed in | 20/60s | — | `src/app/api/v1/reports/[reportId]/share-links/route.ts` |
| `/api/v1/scenarios` | GET, POST | signed in | 60/60s | — | `src/app/api/v1/scenarios/route.ts` |
| `/api/v1/scenarios/[scenarioId]` | GET, PATCH, DELETE | signed in | — | — | `src/app/api/v1/scenarios/[scenarioId]/route.ts` |
| `/api/v1/search` | GET | signed in | 120/60s | — | `src/app/api/v1/search/route.ts` |
| `/api/v1/sensitivity` | POST | public | — | — | `src/app/api/v1/sensitivity/route.ts` |
| `/api/v1/share-links/[shareId]` | DELETE | signed in | — | — | `src/app/api/v1/share-links/[shareId]/route.ts` |
| `/api/v1/sites` | GET | public | — | — | `src/app/api/v1/sites/route.ts` |
| `/api/v1/sites/[siteId]` | GET | public | — | — | `src/app/api/v1/sites/[siteId]/route.ts` |
| `/api/v1/storage/local` | GET | public | — | — | `src/app/api/v1/storage/local/route.ts` |
| `/api/v1/storage/presign-download` | POST | signed in | 60/60s | — | `src/app/api/v1/storage/presign-download/route.ts` |
| `/api/v1/storage/presign-upload` | POST | role ≥ curator | 20/60s | — | `src/app/api/v1/storage/presign-upload/route.ts` |
| `/api/v1/suitability/grid` | POST | public | — | — | `src/app/api/v1/suitability/grid/route.ts` |
| `/api/v1/suitability/matrix` | POST | public | — | — | `src/app/api/v1/suitability/matrix/route.ts` |
| `/api/v1/terrain/coverage` | GET | public | 120/60s | /v1/terrain/coverage | `src/app/api/v1/terrain/coverage/route.ts` |
| `/api/v1/terrain/hazards` | POST | public | — | — | `src/app/api/v1/terrain/hazards/route.ts` |
| `/api/v1/terrain/horizon` | POST | signed in | 30/60s | /v1/horizon | `src/app/api/v1/terrain/horizon/route.ts` |
| `/api/v1/terrain/patch` | GET | signed in | 30/60s | /v1/terrain/patch | `src/app/api/v1/terrain/patch/route.ts` |
| `/api/v1/terrain/point` | GET | public | 120/60s | /v1/terrain/point | `src/app/api/v1/terrain/point/route.ts` |
| `/api/v1/terrain/profile` | GET | public | 60/60s | /v1/terrain/profile | `src/app/api/v1/terrain/profile/route.ts` |
| `/api/v1/timeline` | GET | public | 20/60s | — | `src/app/api/v1/timeline/route.ts` |
| `/api/v1/workspaces` | GET, POST | signed in | — | — | `src/app/api/v1/workspaces/route.ts` |
| `/api/v1/workspaces/[workspaceId]` | PATCH, DELETE | signed in | — | — | `src/app/api/v1/workspaces/[workspaceId]/route.ts` |
| `/api/v1/workspaces/[workspaceId]/invitations` | GET, POST | signed in | 20/60s | — | `src/app/api/v1/workspaces/[workspaceId]/invitations/route.ts` |
| `/api/v1/workspaces/[workspaceId]/invitations/[invitationId]` | DELETE | signed in | — | — | `src/app/api/v1/workspaces/[workspaceId]/invitations/[invitationId]/route.ts` |
| `/api/v1/workspaces/[workspaceId]/members` | GET, POST | signed in | 20/60s | — | `src/app/api/v1/workspaces/[workspaceId]/members/route.ts` |
| `/api/v1/workspaces/[workspaceId]/members/[userId]` | PATCH, DELETE | signed in | — | — | `src/app/api/v1/workspaces/[workspaceId]/members/[userId]/route.ts` |
| `/api/v1/workspaces/[workspaceId]/switch` | POST | signed in | — | — | `src/app/api/v1/workspaces/[workspaceId]/switch/route.ts` |


Internal science service (FastAPI, not publicly routable; every route except `/health` needs `SCIENCE_SERVICE_TOKEN`):

| Method | Science path (internal only) | Auth | Function | Purpose (docstring) |
|---|---|---|---|---|
| GET | `/health` | none (health only) | `health` |  |
| POST | `/v1/link-budget` | bearer token | `link_budget` | Illustrative free-space link margin at the supplied Earth-Moon distances (see link_budget.py for what is NOT modelled). |
| GET | `/v1/products` | bearer token | `products` |  |
| POST | `/v1/horizon` | bearer token | `horizon` |  |
| POST | `/v1/analyze` | bearer token | `analyze` |  |
| POST | `/v1/jobs/compute` | bearer token | `compute_job` | Compute a queued job's analysis (serverless mode: the web app holds the lease and stores the result). |
| POST | `/v1/validate/horizons` | bearer token | `validate_horizons` | Live cross-check of SPICE Sun/Earth az/el against JPL Horizons for one site. |
| POST | `/v1/ephemeris` | bearer token | `ephemeris_at` | Sun and Earth topocentric geometry at one UTC epoch, with the terrain horizon at each azimuth. |
| POST | `/v1/terrain/hazards` | bearer token | `terrain_hazards` |  |
| POST | `/v1/suitability/grid` | bearer token | `suitability` |  |
| POST | `/v1/suitability/matrix` | bearer token | `suitability_matrix` |  |
| POST | `/v1/sensitivity` | bearer token | `sensitivity_ep` |  |


## 24. Database and storage mapping
Supabase PostgreSQL tables (Drizzle schema `src/db/schema.ts`, migrations `drizzle/0000…0009`, RLS enabled): `user`, `session`, `account`, `verification`, `two_factor`, `rate_limit`, `workspaces`, `workspace_members`, `projects`, `sites`, `data_products`, `data_ingestion_runs`, `scenarios`, `analyses`, `analysis_jobs`, `worker_heartbeats`, `comparisons`, `reports`, `share_links`, `audit_events`, `saved_locations`, `mission_plans`, `workspace_invitations`, `analysis_annotations`, `user_preferences`. Identity tables (`user`, `session`, `account`, `verification`, `two_factor`, `rate_limit`) belong to Better Auth; `user` has a unique index on `lower(email)` and a check that emails are trimmed and lower-case. Object storage: Supabase Storage private bucket `moonnav-objects` (analysis results and reports; server-side access only, signed URLs expire after 5 minutes) and `moonnav-build-assets` (packed LOLA sunlight rasters for the science build). Environment variable names the app reads (`src/lib/env.ts`): `NODE_ENV`, `APP_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `SCIENCE_API_URL`, `SCIENCE_SERVICE_TOKEN`, `STORAGE_DRIVER`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `LOCAL_STORAGE_DIR`, `STORAGE_SIGNING_SECRET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `MAIL_DRIVER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `RESEND_API_KEY`, `MAIL_FROM`.

## 25. Scientific data sources and assets
See `SCIENTIFIC_METHODOLOGY.md` §1 for the table (NAIF SPICE kernels, LOLA GDR 240/40/20/5 m and global LDEM_16, LOLA illumination products, Horizons, SVS, Moon Trek, IAU Gazetteer), checksums in `science/catalog/*.json`, licences in `docs/DATA_CATALOG.md`. Static web assets generated by `science/scripts/build_assets.py` and `build_illumination_layers.py`: map layers (`public/data/lola_*`), terrain patches, the feasibility grid, the four demo analyses (`public/data/demo`), relief grids, `validation.json`.

## 26. Loading, empty, error and success states

Empty states implemented:

| Empty-state title | File |
|---|---|
| No completed analyses yet | `src/app/app/analysis/earth/page.tsx` |
| No completed analyses yet | `src/app/app/analysis/sun/page.tsx` |
| No analyses yet | `src/app/app/page.tsx` |
| No scenarios yet | `src/components/workspace/ProjectDetailClient.tsx` |
| No projects | `src/components/workspace/ProjectsClient.tsx` |
| No reports yet | `src/components/workspace/ReportsClient.tsx` |


Notices and alerts implemented (titles):

| Notice / alert title | File |
|---|---|
| Check your inbox | `src/app/(public)/forgot-password/page.tsx` |
| This reset link is invalid or has expired | `src/app/(public)/reset-password/page.tsx` |
| This link is invalid, expired or revoked | `src/app/(public)/share/[token]/page.tsx` |
| This verification link is invalid or has expired | `src/app/(public)/verify-email/page.tsx` |
| Access denied | `src/app/app/page.tsx` |
| Local development only | `src/app/dev/mail/page.tsx` |
| Geometric Direct-to-Earth visibility — not RF link availability | `src/components/analysis/AnalysisViews.tsx` |
| Visibility unknown | `src/components/analysis/PlainLanguage.tsx` |
| Not in this analysis | `src/components/analysis/SolarSurfacePanel.tsx` |
| Ground slope unavailable | `src/components/analysis/SolarSurfacePanel.tsx` |
| Line of sight is not a link | `src/components/analysis/SolarSurfacePanel.tsx` |
| Not calculated — panel assumptions missing | `src/components/analysis/panels.tsx` |
| Email verified | `src/components/auth/LoginForm.tsx` |
| Password updated | `src/components/auth/LoginForm.tsx` |
| Demo temporarily unavailable | `src/components/auth/LoginForm.tsx` |
| Demo could not be started | `src/components/auth/LoginForm.tsx` |
| Verify your email first | `src/components/auth/LoginForm.tsx` |
| You already have an account | `src/components/auth/RegisterForm.tsx` |
| Check your inbox | `src/components/auth/RegisterForm.tsx` |
| No precomputed analysis for this site | `src/components/explore/ExploreClient.tsx` |
| Calculation failed | `src/components/planner/PlannerClient.tsx` |
| Waiting for a worker | `src/components/workspace/AnalysisStatusClient.tsx` |
| Analysis failed | `src/components/workspace/AnalysisStatusClient.tsx` |
| At least two completed analyses are needed | `src/components/workspace/CompareClient.tsx` |
| Which scenarios deserve further investigation | `src/components/workspace/CompareClient.tsx` |
| These analyses are not directly comparable | `src/components/workspace/CompareClient.tsx` |
| Before you start | `src/components/workspace/OnboardingForm.tsx` |
| Guided example | `src/components/workspace/ScenarioBuilder.tsx` |
| Two-factor authentication required | `src/components/workspace/SecurityClient.tsx` |
| Precomputed demonstration | `src/components/workspace/SiteDetailClient.tsx` |
| Terrain only | `src/components/workspace/SiteDetailClient.tsx` |
| Version check unavailable | `src/components/workspace/StaleBanner.tsx` |
| Stale result — computed with older scientific inputs | `src/components/workspace/StaleBanner.tsx` |


General patterns: forms show per-field errors and disable their submit button while busy; analysis jobs show real stages and a log; data tags say whether a number is calculated, precomputed, modelled, cached or unavailable; unknown or missing scientific data is shown as “unknown/unavailable”, never as zero or safe; service outages show the banner “MoonNav could not reach its server…” or the status chip; 404 shows a branded page; unexpected render errors show “Something went wrong on this page” with **Try again** and **Back to MoonNav** (the error message name is logged to the console for diagnosis).

## 27. Responsive design and browser behavior
- **Desktop/laptop (≥1280 px):** full header with status chip, sidebar visible, two-column result layouts.
- **Tablet and phone:** the public navigation collapses into a menu button; the workspace sidebar becomes a drawer; result grids stack; charts resize with their container; tables scroll horizontally inside their card; the demo tour and dashboard fit a 375 px viewport with no sideways page scroll (tested). The service status chip is hidden below the `xl` breakpoint. The 3D scenes use pointer/touch orbit and pinch zoom; keyboard focus styles and reduced-motion are respected.
- **Browsers:** the full E2E suite (88 tests) passes on **Chromium, Firefox and WebKit**; WebKit/Firefox-specific bugs fixed in this pass include a time-zone hydration mismatch and a cancelled-fetch crash. Mobile *layout* was tested in an emulated 390×844 Chromium viewport; no physical phone or Safari-on-iOS testing was done (stated as a limitation).

## 28. Component inventory and source file mapping

| Component file | Exports | Client | Props (signature excerpt) | Purpose (source comment) | API paths it references | Pages that include it |
|---|---|---|---|---|---|---|
| `src/components/admin/DataProductsClient.tsx` | DataProductsClient | yes | { products: P[]; runs: { id: string; dataProductId: string; status: string; steps: { step: string; detail: string; at: string }[]; createdAt: string }[] } |  | /api/v1/admin/products/{id}/status | /admin/data |
| `src/components/admin/IngestionClient.tsx` | IngestionClient, IngestButton | yes | { runs: IngestionRun[] } | Compact trigger used inside the data-products page. | /api/v1/admin/products/{id}/ingest | /admin/data, /admin/ingestion |
| `src/components/admin/JobsClient.tsx` | JobsClient | yes | { jobs: J[]; canRetry: boolean; status: string } |  | /api/v1/admin/jobs/{id}/retry, /api/v1/jobs/{id} | /admin/jobs |
| `src/components/admin/UsersClient.tsx` | UsersClient | yes | { users: U[]; meId: string } |  | /api/v1/admin/users/{id}/role | /admin/users |
| `src/components/analysis/AnalysisViews.tsx` | SunView, EarthView | yes | { r: AnalysisResult; precomputed?: boolean } |  | — | /explore, /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun, /app/explorer, /app/sites/[siteId] |
| `src/components/analysis/OperationsPanel.tsx` | OperationsPanel | yes | { r: AnalysisResult; index: number; body: "sun" \| "earth" } | Next sunset / sunrise or Earthset / next DTE window at the time selected in the time controller. | — | /explore, /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun, /app/explorer, /app/sites/[siteId] |
| `src/components/analysis/PlainLanguage.tsx` | PlainSummary, BlockExplanation | yes | { r: AnalysisResult; body: "sun" \| "earth"; index: number } | Terrain horizon in a given azimuth: elevation, distance to the blocking terrain, ray status. | — | /explore, /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun, /app/explorer, /app/sites/[siteId] |
| `src/components/analysis/SolarSurfacePanel.tsx` | SolarSurfacePanel, LinkBudgetPanel | yes | { r: AnalysisResult; row: TimeRow \| undefined; kind: "calculated" \| "precomputed" } | Ground surface and irradiance (method 1.1.0): the DEM surface normal at the site, the angle between that normal and the Sun, and the direct-beam irradiance on the real (s | /api/v1/link-budget | /explore, /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun, /app/explorer, /app/sites/[siteId] |
| `src/components/analysis/panels.tsx` | IntervalTable, ProvenancePanel, QualityPanel, PowerPanel | no | { intervals: Interval[]; title: string; emptyText: string; caption: string } |  | — | /explore, /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun, /app/explorer, /app/sites/[siteId] |
| `src/components/auth/AuthCard.tsx` | AuthCard | no | { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode } | Authentication frame: form sheet on the left, a LOLA relief plate on wide screens. | — | /forgot-password, /login, /login/two-factor, /register, /reset-password, /verify-email |
| `src/components/auth/DemoButton.tsx` | DemoButton | yes | { variant?: "link" \| "cta"; testId?: string } | One-click demo: a same-origin form POST to /api/v1/demo, which creates an isolated, pre-seeded 24-hour account (see lib/demo.ts) and signs it in. `link` is the quiet logi | /api/v1/demo | /login, / |
| `src/components/auth/LoginForm.tsx` | LoginForm | yes | { localMail?: boolean } |  | — | /login |
| `src/components/auth/PasswordInput.tsx` | PasswordInput | yes |  |  | — | /login, /register, /reset-password, /settings/security |
| `src/components/auth/RegisterForm.tsx` | RegisterForm | yes | { localMail?: boolean } | Shown when the address already has an account. It says so plainly and offers the three next steps; it does not reveal whether the address was ever verified (the resend bu | — | /register, /reset-password, /settings/security |
| `src/components/auth/SubmitButton.tsx` | SubmitButton | yes | ComponentProps<typeof Button> | False during server render and hydration, true once React event handlers are attached. | — | /forgot-password, /login, /login/two-factor, /register, /reset-password, /verify-email |
| `src/components/explore/ExploreClient.tsx` | ExploreClient | yes | { sites: Site[]; featured: string[]; window: [string, string, number]; initialSite: string; initialTab: string; signedIn: boolean; variant?: "public" \| "app" } |  | /api/v1/illumination/point, /api/v1/locations, /api/v1/locations/{id}, /api/v1/terrain/point | /explore, /app/explorer |
| `src/components/explore/FeasibilityPanel.tsx` | FeasibilityPanel, CellExplanation | yes | { f: ReturnType<typeof useFeasibility> } | Loads the precomputed grid and turns the user's hard constraints into a map overlay. | — | /explore, /app/explorer |
| `src/components/explore/GuidedExample.tsx` | GuidedExample | yes | { items: Item[] } | Guided example: a question, a prediction, then the computed answer (with the technical view showing the same numbers). | — | /learn |
| `src/components/explore/RegionView.tsx` | RegionView | yes | { regional: RegionalGrid \| null; sites: RegionalSite[]; selectedKey: string \| null; onSelect: (k: string | Polar-cap 3D with the Sun direction from a real SPICE analysis (Mons Malapert demo) driven by the time control. | — | /explore, /app/explorer |
| `src/components/explore/SiteScene.tsx` | SiteScene | yes | { r: AnalysisResult; patch: TerrainPatch \| null; precomputed?: boolean } | 3D terrain + time control, driven by the analysis time series (never by independent animation). | — | /explore, /app/explorer, /app/sites/[siteId] |
| `src/components/home/HeroChart.tsx` | HeroChart | yes | { stations: Station[] } | The hero plate: LOLA south-polar relief with the copper traverse through the featured stations (real positions, real readings). | — | / |
| `src/components/home/HomeGlobe.tsx` | HomeGlobe | yes | { sites: GlobeSite[] } | Rotating 3D Moon on the home page; clicking a feature opens it in the Site Explorer. | — | / |
| `src/components/home/HorizonPlate.tsx` | HorizonPlate | no | { r: AnalysisResult; title: string } | Server-rendered horizon plate from a real analysis: terrain horizon (0–360°) with the Sun and Earth tracks. | — | / |
| `src/components/planner/GridCanvas.tsx` | GridCanvas, SCORE_RAMP, SLOPE_RAMP, FAIL_RGB | yes | { n: number; color: (row: number, col: number | Colour for one cell; null = unknown (drawn grey with hatching — never as "good"). | — | /app/planner |
| `src/components/planner/PlannerClient.tsx` | PlannerClient | yes | { sites: Site[] } | Which terrain resolution a result actually used, including any fallback to coarser data. | /api/v1/sensitivity, /api/v1/suitability/grid, /api/v1/suitability/matrix, /api/v1/terrain/coverage, /api/v1/terrain/hazards | /app/planner |
| `src/components/shell/AppNav.tsx` | AppSidebar, MobileAppNav | yes | { role: string } |  | — | /admin, /app, /settings |
| `src/components/shell/AppShell.tsx` | AppShell | no |  |  | — | /admin, /app, /settings |
| `src/components/shell/CommandPalette.tsx` | CommandPalette | yes |  | ⌘K / Ctrl+K command palette: pages, catalogue sites, and the current workspace's projects, scenarios and saved locations. | /api/v1/search | /admin, /app, /settings |
| `src/components/shell/DataStatus.tsx` | DataStatus | yes |  | Pure status logic (unit-tested). On Vercel there is no polling worker: the app drains queued jobs on demand, reported as "on_demand". | /api/v1/health | /admin, /app, /settings |
| `src/components/shell/Mark.tsx` | MoonNavGlyph, MoonNavMark | no | { size?: number } | MoonNav mark: a lunar disk with its terminator, crossed by the copper traverse. | — | /invite/[token], /dev/mail, /, /admin, /app, /settings |
| `src/components/shell/ModeToggle.tsx` | ModeToggle, AdvancedOnly, SimpleOnly | yes | { signedIn?: boolean; className?: string; compact?: boolean } | Global Simple / Advanced display mode. The value lives on <html data-mode> (set before first paint by the boot script in the root layout) and in localStorage. CSS hides ` | /api/v1/me/preferences | /explore, /invite/[token], /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun, /app/compare |
| `src/components/shell/MotionRoot.tsx` | MotionRoot | yes | { children: ReactNode } | Global motion policy: honour prefers-reduced-motion everywhere. | — | / |
| `src/components/shell/PerfPanel.tsx` | PerfPanel, PerfToggle | yes |  | Lightweight rendering diagnostics (opt-in: Advanced mode "Perf" button or ?perf=1). A single requestAnimationFrame loop records frame intervals into a ring buffer; text i | — | /explore, /invite/[token], /, /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun |
| `src/components/shell/ProfileMenu.tsx` | ProfileMenu | yes | { name: string; email: string; role: string } |  | — | /admin, /app, /settings |
| `src/components/shell/Providers.tsx` | Providers | yes | { children: ReactNode } |  | — | /invite/[token], /admin, /app, /settings |
| `src/components/shell/PublicMobileNav.tsx` | PublicNavLinks, PublicMobileNav | yes | { items: { href: string; label: string }[] } |  | — | /invite/[token], / |
| `src/components/shell/PublicShell.tsx` | PUBLIC_NAV, PublicShell | no |  |  | — | /invite/[token], / |
| `src/components/shell/ServiceBanner.tsx` | ServiceBanner | no |  | Shown on public pages when the database is down: sign-in, accounts and the demo need it. | — | /invite/[token], / |
| `src/components/shell/ThemeToggle.tsx` | ThemeToggle | yes | { className?: string } | Segmented light / dark / system control. Preference persists per browser. | — | /explore, /invite/[token], /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun, /app/compare |
| `src/components/shell/WorkspaceSwitcher.tsx` | WorkspaceSwitcher | yes | { workspaces: W[]; currentId: string } |  | /api/v1/workspaces, /api/v1/workspaces/{id}/switch | /admin, /app, /settings |
| `src/components/ui.tsx` | Button, LinkButton, AButton, Card, CardHeader, Breadcrumbs, PageHeader, DataTag, StatePill, StatusBadge, InfoTip, Stat, Notice, EmptyState, Field, Input, Select, Textarea, Kbd, Swatch | no | ComponentProps<"button"> & { variant?: Variant; s?: keyof typeof size } | Plain anchor styled as a button (downloads, API URLs, external links). | — | /about, /explore, /forgot-password, /invite/[token], /learn, /limitations |
| `src/components/viz/EChart.tsx` | EChart | yes | { option: EChartsCoreOption; height?: number; ariaLabel: string; onClick?: (p: { dataIndex: number; value: unknown } | Chart colours from the active theme's CSS tokens; recomputed when the theme changes. | — | /explore, /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun, /app/compare, /app/explorer |
| `src/components/viz/GlobeScene.tsx` | GlobeScene | yes | { /** Slowly spin the globe until the user interacts (home preview | Global textured Moon. Texture = NASA Moon Trek LRO WAC global mosaic (equirectangular, 8×4 tiles at matrix 2) with the LRO WAC South Pole v2 mosaic reprojected into the c | — | /explore, /, /app/explorer |
| `src/components/viz/LunarMap.tsx` | TREK_SP_WAC, LunarMap | yes | { overlay?: RasterOverlay \| null; onImageryStatus?: (s: ImageryStatus | Client-rendered raster overlay in map metres (used by the feasibility layer). | — | /explore, /app/explorer |
| `src/components/viz/PolarSkyPlot.tsx` | PolarSkyPlot | yes | { horizon: HorizonData; rows: TimeRow[]; selectedIndex?: number; maskDeg?: number \| null } | Radial 0–360° sky plot: azimuth clockwise from local north (N up, E right, as on GNSS sky plots), elevation mapped linearly from the outer ring (lowest) to the centre (hi | — | /explore, /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun, /app/explorer, /app/sites/[siteId] |
| `src/components/viz/RegionalScene.tsx` | RegionalScene | yes | { data: RegionalGrid \| null; sites: RegionalSite[]; selectedKey?: string \| null; sun?: THREE.Vector3 \| null; onSelect?: (key: string | Body-fixed MOON_ME position (km) for lat/lon/height, rotated so the south pole points up (scene +Z) and sits near the origin. | — | /explore, /app/explorer |
| `src/components/viz/TerrainScene.tsx` | TerrainScene | yes |  |  | — | /explore, /app/explorer, /app/sites/[siteId] |
| `src/components/viz/TimeControl.tsx` | SPEEDS, TimeControl | yes | { rows: TimeRow[]; t: Timeline } | Playback speeds as multiples of real time (1× = one simulated second per wall-clock second). | — | /explore, /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun, /app/explorer, /app/sites/[siteId] |
| `src/components/viz/charts.tsx` | ElevationTimeline, HorizonPanorama, PowerChart, CompareBars, TradeoffScatter, MultiDateLines | yes | { rows: TimeRow[]; body: "sun" \| "earth"; intervals: Interval[]; selectedIndex?: number; onSelect?: (i: number | Sunlight vs geometric DTE hours, one point per scenario; Pareto-optimal points are highlighted. | — | /explore, /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun, /app/compare, /app/explorer |
| `src/components/workspace/AnalysisPicker.tsx` | AnalysisPicker | yes | { items: PickItem[]; value: string \| null; basePath: string } |  | — | /app/analysis/earth, /app/analysis/sun |
| `src/components/workspace/AnalysisStatusClient.tsx` | AnalysisStatusClient, JOB_STAGES | yes |  | Processing stages reported by the worker (science/moonnav_science/analysis.py STAGES + worker). | /api/v1/analyses/{id}, /api/v1/jobs/{id} | /app/analyses/[analysisId] |
| `src/components/workspace/AnnotationsPanel.tsx` | AnnotationsPanel | yes | { analysisId: string; canAnnotate: boolean; me: string } |  | /api/v1/analyses/{id}/annotations, /api/v1/annotations/{id} | /app/analyses/[analysisId] |
| `src/components/workspace/CompareClient.tsx` | CompareClient | yes | { analyses: A[]; initialIds: string[]; initialWeights?: { sun: number; dte: number; energy: number }; initialThresholds?: Record<string, number \| null> } |  | /api/v1/comparisons, /api/v1/comparisons/{id}, /api/v1/me/preferences | /app/compare |
| `src/components/workspace/HorizonsValidation.tsx` | ValidationSummary, HorizonsValidationCard | yes | { v: HorizonsCheck \| null } | Validation status line, reused in the mission report. | /api/v1/analyses/{id}/validate | /app/analyses/[analysisId], /app/analyses/[analysisId]/report |
| `src/components/workspace/InvitationAcceptClient.tsx` | InvitationAcceptClient | yes | { signedIn: boolean; signedInEmail: string \| null; verified: boolean } |  | /api/v1/invitations/accept, /api/v1/invitations/{id} | /invite/[token] |
| `src/components/workspace/MissionReport.tsx` | MissionReport | yes | Props | Complete mission report for one stored analysis. Every value is read from the stored result. | /api/v1/illumination/point, /api/v1/terrain/point | /app/analyses/[analysisId]/report |
| `src/components/workspace/OnboardingForm.tsx` | OnboardingForm | yes | { name: string } |  | /api/v1/me | /app/onboarding |
| `src/components/workspace/ProfileForm.tsx` | ProfileForm | yes | { user: { name: string; email: string; preferredMode: string; displayTimezone: string; role: string } } |  | /api/v1/me, /api/v1/me/export | /settings/profile |
| `src/components/workspace/ProjectDetailClient.tsx` | ProjectDetailClient | yes |  |  | /api/v1/analyses, /api/v1/projects/{id}, /api/v1/projects/{id}/duplicate | /app/projects/[projectId] |
| `src/components/workspace/ProjectsClient.tsx` | ProjectsClient | yes | { initial: P[] } |  | /api/v1/projects | /app/projects |
| `src/components/workspace/ReportsClient.tsx` | ReportsClient | yes | { analyses: { id: string; label: string }[]; reports: R[]; initialAnalysis: string \| null } |  | /api/v1/reports, /api/v1/reports/{id}/share-links, /api/v1/share-links/{id}, /api/v1/storage/presign-download | /app/reports |
| `src/components/workspace/ResultLoader.tsx` | ExportBar, ResultView | yes | { analysisId: string } |  | /api/v1/analyses/{id}/timeseries, /api/v1/reports, /api/v1/storage/presign-download | /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun, /app/sites/[siteId] |
| `src/components/workspace/ScenarioBuilder.tsx` | ScenarioBuilder | yes | { projects: { id: string; name: string }[]; sites: Site[]; products: Product[]; initial: Initial; locations?: { id: string; name: string; lat: number; lon: number }[] } |  | /api/v1/analyses, /api/v1/projects, /api/v1/scenarios | /app/scenarios/new |
| `src/components/workspace/SecurityClient.tsx` | SecurityClient | yes | { mfaEnabled: boolean; mfaRequired: boolean; role: string } |  | — | /settings/security |
| `src/components/workspace/SiteDetailClient.tsx` | SiteDetailClient | yes | { site: Site; analysis: { id: string; label: string } \| null; analyses: { id: string; label: string }[]; featured: boolean; sites: { key: string; name: string }[] } |  | /api/v1/terrain/horizon, /api/v1/terrain/patch, /api/v1/terrain/profile | /app/sites/[siteId] |
| `src/components/workspace/StaleBanner.tsx` | StaleBanner | yes | { analysisId: string; canRerun?: boolean } | Shows whether a stored result was computed with the versions the science service runs now. A stale result stays readable (historical provenance); re-running creates a new | /api/v1/analyses/{id}, /api/v1/analyses/{id}/rerun | /app/analyses/[analysisId], /app/analyses/[analysisId]/report, /app/analysis/earth, /app/analysis/sun, /app/sites/[siteId] |
| `src/components/workspace/WorkspacesClient.tsx` | WorkspacesClient | yes | { workspaces: W[]; currentId: string; me: string } |  | /api/v1/workspaces, /api/v1/workspaces/{id}, /api/v1/workspaces/{id}/invitations, /api/v1/workspaces/{id}/invitations/{id}, /api/v1/workspaces/{id}/members, /api/v1/workspaces/{id}/members/{id}, /api/v1/workspaces/{id}/switch | /app/workspaces |


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
| Crawl behind this document | 72 page visits (51 distinct URLs) as roles anonymous, demo, user, admin; 1117 button observations, 299 buttons actually clicked, 344 form-field observations. Crawl generated 2026-11-12T23:25:24.299Z against the isolated local stack. |

Automated tests (titles as written):

| E2E spec (Playwright) | Tests in the file |
|---|---|
| `tests/e2e/auth-fixes.spec.ts` | • auth submit buttons stay disabled until the page is interactive, then work<br>• create account -> local mailbox -> verification link activates the account<br>• Simple and Advanced show different content on public and workspace pages<br>• tampered or garbage session cookies are rejected |
| `tests/e2e/demo.spec.ts` | • home page -> demo -> guided tour: every step opens a working page with real data<br>• the 3D explorer works inside the demo<br>• a demo user can run a real new analysis through the job pipeline<br>• demo failures show an actionable message instead of a dead end<br>• mobile: the demo button and tour fit a phone screen with no sideways scroll |
| `tests/e2e/features.spec.ts` | • Simple / Advanced mode switches without reload and persists<br>• checklist endpoints: ephemeris, timeline, sites and terrain with validation<br>• two sites x two dates: compare, trade-offs, Pareto, matrix, export and preferences<br>• Sun view explains blocking in plain language; mission report has every section<br>• live JPL Horizons cross-check is stored on the analysis (or reports the outage honestly)<br>• scenario science fields stay immutable in the database; only the name can change |
| `tests/e2e/planner.spec.ts` | • Continue with demo opens an isolated, pre-seeded, restricted workspace<br>• a second demo session cannot see the first demo's data<br>• operational windows are derived from the stored analysis<br>• Mission Planner: suitability grid with explanations; invalid coordinates rejected<br>• Mission Planner: terrain hazards, sensitivity and site x date matrix<br>• global Moon carries LOLA relief at true scale by default; exaggeration is labelled<br>• validation page shows reproducible NASA/JPL comparisons<br>• high-resolution terrain is reported with its real resolution |
| `tests/e2e/public.spec.ts` | • anonymous visitor opens home, clicks Explore and uses the public map<br>• visitor completes the Learn guided example; technical details show the same numbers<br>• saving a scenario from the public explorer requires sign-in and preserves a safe return URL<br>• methodology, sources and limitations contain substantive content<br>• accessibility audit ${p}<br>• health endpoint distinguishes web, database, science and worker<br>• API errors use the consistent contract without stack traces<br>• theme switch persists and both themes render with their own tokens<br>• public navigation: every primary link resolves and the 404 page is branded<br>• NASA Moon Trek imagery basemap loads real tiles with attribution; LOLA layers remain<br>• feasibility layer screens real grid cells against user constraints and explains a point<br>• global Moon globe renders NASA imagery and hands off to the regional 3D view<br>• polar sky plot draws the stored horizon and tracks, with a zoom/full-sky toggle<br>• PSR source layer: toggles with legend; point lookup reports PSR and unknown outside coverage<br>• rendering diagnostics: ?perf=1 shows live frame stats and records a sample<br>• an invitation link opens without crashing (invalid token shows a clear message) |
| `tests/e2e/reliability.spec.ts` | • every public route renders cleanly and every internal link resolves<br>• unknown routes give a friendly 404, not an error page<br>• every demo-workspace route renders cleanly with real content<br>• malformed API input is rejected with the standard contract: 4xx, requestId, no stack trace, never 500 |
| `tests/e2e/security.spec.ts` | • IDOR: another user cannot read, run or export someone else's objects<br>• regular user cannot open admin routes or invoke admin APIs<br>• data curator needs MFA, can validate a new dataset version, but cannot grant roles<br>• admin with MFA manages roles; changes and approvals are audited and the audit log is immutable<br>• worker lease protocol: wrong lease token is rejected<br>• cross-origin state-changing requests are rejected (CSRF)<br>• MFA recovery: regenerated backup codes sign in once when the authenticator is unavailable |
| `tests/e2e/signup-duplicates.spec.ts` | • same email is refused with one controlled answer: same case, other case, padded with spaces<br>• verified and unverified existing accounts get the identical response (no status leak)<br>• concurrent duplicate sign-ups create exactly one user, one credential account and one verification email<br>• the database itself refuses duplicates and non-normalized addresses<br>• Gmail dots and plus tags are distinct addresses (documented policy), only case and spaces are folded<br>• sign-in and password reset treat padded or upper-case emails as the same account<br>• the register page tells an existing user clearly and offers Sign in, Forgot password and a safe resend<br>• the sign-in page is pre-filled when arriving from the existing-account screen |
| `tests/e2e/solar-surface.spec.ts` | • Sun view shows the ground slope, incidence, irradiance and darkness from the real analysis<br>• a terrain-aligned panel analysis runs end to end and is reported against the ground, not a fixed normal<br>• link-margin estimate: labelled illustrative, needs the user's own values, and gives a result<br>• link-budget API: sign-in required, input validated, labelled result |
| `tests/e2e/verification.spec.ts` | • a new account starts unverified, the email carries this deployment's URL, and the link verifies and signs in<br>• an already-used link is harmless: the account stays verified and the user is not shown an error page<br>• an invalid token is rejected with an error redirect and verifies nothing<br>• an expired token is rejected as expired and verifies nothing<br>• resending sends a new link and does NOT invalidate the earlier, still-valid one<br>• resending for a verified or unknown address sends nothing and reveals nothing<br>• resend is rate limited per client (3 per minute) without affecting other clients |
| `tests/e2e/visual.spec.ts` | • public pages: five widths, light theme; key pages in dark<br>• workspace pages with real analyses: five widths, both themes<br>• admin pages (admin with MFA) |
| `tests/e2e/workspace.spec.ts` | • user registers, verifies email and completes onboarding<br>• user creates a project + guided scenario and the job runs queued -> completed<br>• custom-coordinate scenario validates coverage, then runs<br>• Sun & Power and Earth & DTE pages show computed geometry, intervals and RF limitation<br>• stale results are flagged with reasons and re-run as a new analysis, keeping the original<br>• user compares two analyses and sees compatibility warnings and trade-offs<br>• user exports PDF, CSV and JSON with provenance; creates and revokes a share link<br>• scenarios are immutable at the database level and analysis submission is idempotent<br>• workspace features: search, saved locations, shared workspace with members, project deletion<br>• forgot password: non-enumerating request, emailed link, reset, old sessions revoked, sign in with new password |

| Unit spec (Vitest) | Tests |
|---|---|
| `tests/unit/compare.test.ts` | 11 |
| `tests/unit/core.test.ts` | 13 |
| `tests/unit/feasibility.test.ts` | 4 |
| `tests/unit/features.test.ts` | 14 |
| `tests/unit/operations.test.ts` | 5 |
| `tests/unit/planner.test.ts` | 4 |
| `tests/unit/staleness.test.ts` | 5 |


## 32. Screenshot inventory

| File (docs/website-crawl/screenshots/) | Route | Role | Viewport | State shown |
|---|---|---|---|---|
| anonymous-home-desktop.png | / | anonymous | 1440×900 | loaded, default state |
| anonymous-home-mobile.png | / | anonymous | 390×844 | loaded, default state, mobile layout |
| anonymous-explore-desktop.png | /explore | anonymous | 1440×900 | loaded, default state |
| anonymous-explore-mobile.png | /explore | anonymous | 390×844 | loaded, default state, mobile layout |
| anonymous-validation-desktop.png | /validation | anonymous | 1440×900 | loaded, default state |
| anonymous-validation-mobile.png | /validation | anonymous | 390×844 | loaded, default state, mobile layout |
| anonymous-login-desktop.png | /login | anonymous | 1440×900 | loaded, default state |
| anonymous-login-mobile.png | /login | anonymous | 390×844 | loaded, default state, mobile layout |
| anonymous-register-desktop.png | /register | anonymous | 1440×900 | loaded, default state |
| anonymous-register-mobile.png | /register | anonymous | 390×844 | loaded, default state, mobile layout |
| demo-app-desktop.png | /app | demo | 1440×900 | loaded, default state |
| demo-app-mobile.png | /app | demo | 390×844 | loaded, default state, mobile layout |
| demo-app_explorer-desktop.png | /app/explorer | demo | 1440×900 | loaded, default state |
| demo-app_explorer-mobile.png | /app/explorer | demo | 390×844 | loaded, default state, mobile layout |
| demo-app_analysis_sun_analysisId_ana_92ac2083_0218_4d26_9aa5_746d8ff84407-desktop.png | /app/analysis/sun?analysisId=ana_92ac2083-0218-4d26-9aa5-746 | demo | 1440×900 | loaded, default state |
| demo-app_analysis_sun_analysisId_ana_92ac2083_0218_4d26_9aa5_746d8ff84407-mobile.png | /app/analysis/sun?analysisId=ana_92ac2083-0218-4d26-9aa5-746 | demo | 390×844 | loaded, default state, mobile layout |
| demo-app_analysis_earth_analysisId_ana_92ac2083_0218_4d26_9aa5_746d8ff84407-desktop.png | /app/analysis/earth?analysisId=ana_92ac2083-0218-4d26-9aa5-7 | demo | 1440×900 | loaded, default state |
| demo-app_analysis_earth_analysisId_ana_92ac2083_0218_4d26_9aa5_746d8ff84407-mobile.png | /app/analysis/earth?analysisId=ana_92ac2083-0218-4d26-9aa5-7 | demo | 390×844 | loaded, default state, mobile layout |
| demo-app_compare_ids_ana_cf964f14_25b6_4032_9e54_bf792c3a5756_ana_2d041a4d_498d_-desktop.png | /app/compare?ids=ana_cf964f14-25b6-4032-9e54-bf792c3a5756,an | demo | 1440×900 | loaded, default state |
| demo-app_compare_ids_ana_cf964f14_25b6_4032_9e54_bf792c3a5756_ana_2d041a4d_498d_-mobile.png | /app/compare?ids=ana_cf964f14-25b6-4032-9e54-bf792c3a5756,an | demo | 390×844 | loaded, default state, mobile layout |
| demo-app_planner-desktop.png | /app/planner | demo | 1440×900 | loaded, default state |
| demo-app_planner-mobile.png | /app/planner | demo | 390×844 | loaded, default state, mobile layout |
| demo-app_scenarios_new_guided_1-desktop.png | /app/scenarios/new?guided=1 | demo | 1440×900 | loaded, default state |
| demo-app_scenarios_new_guided_1-mobile.png | /app/scenarios/new?guided=1 | demo | 390×844 | loaded, default state, mobile layout |
| demo-app_settings-desktop.png | /app/settings | demo | 1440×900 | loaded, default state |
| demo-app_settings-mobile.png | /app/settings | demo | 390×844 | loaded, default state, mobile layout |
| demo-app_compare_ids_ana_cf964f14_25b6_4032_9e54_bf792c3a5756_ana_2d041a4d_498d_-desktop.png | /app/compare?ids=ana_cf964f14-25b6-4032-9e54-bf792c3a5756,an | demo | 1440×900 | loaded, default state |
| demo-app_compare_ids_ana_cf964f14_25b6_4032_9e54_bf792c3a5756_ana_2d041a4d_498d_-mobile.png | /app/compare?ids=ana_cf964f14-25b6-4032-9e54-bf792c3a5756,an | demo | 390×844 | loaded, default state, mobile layout |
| demo-admin-desktop.png | /admin | demo | 1440×900 | loaded, default state |
| demo-admin-mobile.png | /admin | demo | 390×844 | loaded, default state, mobile layout |
| user-app-desktop.png | /app | user | 1440×900 | loaded, default state |
| user-app-mobile.png | /app | user | 390×844 | loaded, default state, mobile layout |
| user-app_explorer-desktop.png | /app/explorer | user | 1440×900 | loaded, default state |
| user-app_explorer-mobile.png | /app/explorer | user | 390×844 | loaded, default state, mobile layout |
| user-app_analysis_sun_analysisId_ana_92ac2083_0218_4d26_9aa5_746d8ff84407-desktop.png | /app/analysis/sun?analysisId=ana_92ac2083-0218-4d26-9aa5-746 | user | 1440×900 | loaded, default state |
| user-app_analysis_sun_analysisId_ana_92ac2083_0218_4d26_9aa5_746d8ff84407-mobile.png | /app/analysis/sun?analysisId=ana_92ac2083-0218-4d26-9aa5-746 | user | 390×844 | loaded, default state, mobile layout |
| user-app_analysis_earth_analysisId_ana_92ac2083_0218_4d26_9aa5_746d8ff84407-desktop.png | /app/analysis/earth?analysisId=ana_92ac2083-0218-4d26-9aa5-7 | user | 1440×900 | loaded, default state |
| user-app_analysis_earth_analysisId_ana_92ac2083_0218_4d26_9aa5_746d8ff84407-mobile.png | /app/analysis/earth?analysisId=ana_92ac2083-0218-4d26-9aa5-7 | user | 390×844 | loaded, default state, mobile layout |
| user-app_compare_ids_ana_cf964f14_25b6_4032_9e54_bf792c3a5756_ana_2d041a4d_498d_-desktop.png | /app/compare?ids=ana_cf964f14-25b6-4032-9e54-bf792c3a5756,an | user | 1440×900 | loaded, default state |
| user-app_compare_ids_ana_cf964f14_25b6_4032_9e54_bf792c3a5756_ana_2d041a4d_498d_-mobile.png | /app/compare?ids=ana_cf964f14-25b6-4032-9e54-bf792c3a5756,an | user | 390×844 | loaded, default state, mobile layout |
| user-app_planner-desktop.png | /app/planner | user | 1440×900 | loaded, default state |
| user-app_planner-mobile.png | /app/planner | user | 390×844 | loaded, default state, mobile layout |
| user-app_scenarios_new_guided_1-desktop.png | /app/scenarios/new?guided=1 | user | 1440×900 | loaded, default state |
| user-app_scenarios_new_guided_1-mobile.png | /app/scenarios/new?guided=1 | user | 390×844 | loaded, default state, mobile layout |
| user-app_settings-desktop.png | /app/settings | user | 1440×900 | loaded, default state |
| user-app_settings-mobile.png | /app/settings | user | 390×844 | loaded, default state, mobile layout |
| user-admin-desktop.png | /admin | user | 1440×900 | loaded, default state |
| user-admin-mobile.png | /admin | user | 390×844 | loaded, default state, mobile layout |
| admin-admin-desktop.png | /admin | admin | 1440×900 | loaded, default state |
| admin-admin-mobile.png | /admin | admin | 390×844 | loaded, default state, mobile layout |

In addition the visual regression spec stores 197 screenshots in `docs/screenshots/` (public pages at five widths, key pages in dark theme).


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
- [x] Routes compared with the Next.js router (section 4 is generated from `page.tsx` files; 43 pages, 68 web API route files, 12 internal science endpoints, 25 database tables, 67 component files.)
- [x] Navigation compared with the live DOM (5.5) and the source (`PUBLIC_NAV`, `AppNav`)
- [x] Buttons, links, fields, tabs, tables per page from the live DOM (section 19)
- [x] Components scanned from `src/components` (section 28)
- [x] API routes and science endpoints scanned from source (section 23)
- [x] Status labels follow test evidence (section 31)
- [ ] Not covered by an executed click: every form submit and destructive action (listed as “Not executed” with reasons in section 19)
- [ ] Physical-device and Safari-on-iOS testing not performed (section 27)
