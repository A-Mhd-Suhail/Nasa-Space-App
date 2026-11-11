# Database setup (PostgreSQL today, Supabase-ready)

MoonNav stores data in PostgreSQL through Drizzle ORM. Locally it runs on a project-local PostgreSQL 17 cluster (`npm run db:up`, port 54329). **Supabase is prepared but not connected**: no Supabase project, credentials or remote migrations were used in this pass.

## Layers
- `src/db/schema.ts` — typed schema (source of truth); `drizzle/0000…0008*.sql` — versioned migrations applied by `npm run db:migrate` (also seeds the site catalogue and data-product registry).
- `src/repositories/` — data-access interfaces (`types.ts`) for **landing sites / saved locations, mission scenarios, analysis results, user preferences**, with two implementations behind one factory (`repos()`):
  - `postgres.ts` (default, active) — Drizzle over `DATABASE_URL`; works with local PostgreSQL *and* with a Supabase-hosted database.
  - `supabase.ts` (prepared) — the same contracts over the Supabase client.
- `src/lib/supabase/` — `config.ts` (flags, never throws when unset), `server.ts` (service-role client, `server-only`), `browser.ts` (anon client), `database.types.ts` (typed rows).
- Authorization is enforced server-side in `src/lib/dal.ts` for every request regardless of backend.

## Tables
Core planning tables: `sites`, `saved_locations`, `projects`, `scenarios` (immutable scientific definition + SHA-256; only `name` may change — trigger in 0001/0008), `analyses` (summary, result checksum, `validation` = latest JPL Horizons check), `analysis_jobs`, `comparisons`, `reports`, `share_links`, `mission_plans`, `analysis_annotations`, `user_preferences` (mode, units, time zone, scoring weights, mission thresholds). Identity and operations: Better Auth tables (`user`, `session`, `account`, `verification`, `two_factor`), `workspaces`, `workspace_members`, `workspace_invitations`, `audit_events` (append-only trigger), `rate_limit`, `data_products`, `data_ingestion_runs`, `worker_heartbeats`. Foreign keys and indexes are in the migrations.

## Row Level Security (`drizzle/0007_supabase_rls.sql`)
- RLS is **enabled on every public table**. The MoonNav server connects as the table-owner role, so local behaviour is unchanged.
- When Supabase's `anon`/`authenticated` roles exist, the migration additionally:
  - revokes all Data-API access to secrets and operations tables (sessions, accounts, verification, MFA, rate limits, audit log, share/invitation tokens, jobs, heartbeats, ingestion runs);
  - allows public **read** of verified `sites` and approved `data_products` only;
  - allows workspace **members** to read their own workspace objects via `moonnav_is_member()` (membership checked against the JWT `sub`), with insert/update/delete revoked (writes go through the server);
  - lets a user read their own `user` row and read/write only their own `user_preferences`.
- Verified locally by simulating Supabase's roles and `auth.jwt()` in a scratch database: anonymous users saw 17 sites and 0 projects; user A saw only workspace A; direct inserts and session reads were denied; a user could not modify another user's preferences.

## Connecting Supabase later (configuration only)
1. Create the project; copy the **direct** connection string to `DATABASE_URL_DIRECT` and the **pooled** one to `DATABASE_URL`.
2. `npm run db:migrate` — applies 0000–0008 (RLS policies are created because the Supabase roles now exist) and seeds the catalogue.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only — never `NEXT_PUBLIC_`).
4. Keep `DATA_BACKEND=postgres` (recommended: same code path as local) or set `DATA_BACKEND=supabase` to route the repositories through the Supabase client. Missing variables make the app fall back to PostgreSQL with a warning — it does not crash.
5. Optional: regenerate `database.types.ts` with `supabase gen types typescript`.
6. Authentication stays on Better Auth. To use the member RLS policies from a browser client, issue Supabase-compatible JWTs whose `sub` is the MoonNav user id (Supabase third-party/custom JWT), or migrate to Supabase Auth with a user-id mapping.

## Local commands
`npm run db:up` (start cluster) · `npm run db:migrate` · `npm run db:generate -- --name <x>` (new migration from schema changes) · `npm run db:seed-dev` (demo accounts; passwords only in `.env.local`).
