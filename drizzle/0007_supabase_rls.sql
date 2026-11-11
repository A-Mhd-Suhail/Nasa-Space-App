-- Row Level Security, written to run unchanged on plain PostgreSQL (local development) and on
-- Supabase. See docs/DATABASE_SETUP.md.
--
-- 1. RLS is enabled on every public table. With no policy, any role that is not the table owner
--    (and lacks BYPASSRLS) sees nothing. The MoonNav server connects as the owner role and keeps
--    enforcing authorization in its data-access layer (src/lib/dal.ts), so local behaviour is
--    unchanged.
-- 2. When Supabase's API roles exist (anon, authenticated), browser-reachable access through the
--    Supabase Data API is restricted to:
--      - public read of the curated, verified landing-site catalogue and approved data products;
--      - read access for workspace members to their own workspace objects;
--      - read/write of a user's own preferences row.
--    Every other write goes through the MoonNav server. Credentials, sessions, MFA secrets,
--    rate limits, audit events, share/invitation tokens and job leases are never exposed.
-- 3. Identity: policies compare workspace membership with the JWT `sub` claim, so they work with
--    Supabase Auth or with Better Auth user ids issued as Supabase-compatible JWTs.

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')) THEN
    RAISE NOTICE 'Supabase API roles not present: RLS enabled, no API-role policies created (plain PostgreSQL)';
    RETURN;
  END IF;

  -- Secrets and operational tables: no Data API access at all.
  FOREACH t IN ARRAY ARRAY['session', 'account', 'verification', 'two_factor', 'rate_limit', 'audit_events', 'share_links',
                           'workspace_invitations', 'analysis_jobs', 'worker_heartbeats', 'data_ingestion_runs']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;

  -- Curated public catalogues (read-only).
  EXECUTE 'DROP POLICY IF EXISTS sites_public_read ON public.sites';
  EXECUTE 'CREATE POLICY sites_public_read ON public.sites FOR SELECT TO anon, authenticated USING (verified)';
  EXECUTE 'DROP POLICY IF EXISTS data_products_public_read ON public.data_products';
  EXECUTE $p$CREATE POLICY data_products_public_read ON public.data_products FOR SELECT TO anon, authenticated USING (status = 'approved')$p$;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'auth' AND p.proname = 'jwt') THEN
    RAISE NOTICE 'auth.jwt() not present: member policies skipped';
    RETURN;
  END IF;

  -- Membership helper (SECURITY DEFINER so it can read workspace_members under RLS).
  EXECUTE $f$
    CREATE OR REPLACE FUNCTION public.moonnav_is_member(ws text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $body$
      SELECT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = ws AND m.user_id = (auth.jwt() ->> 'sub'))
    $body$
  $f$;
  EXECUTE 'REVOKE ALL ON FUNCTION public.moonnav_is_member(text) FROM public';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.moonnav_is_member(text) TO authenticated';

  -- Workspace-scoped objects: members may read; writes stay server-side.
  FOREACH t IN ARRAY ARRAY['projects', 'scenarios', 'analyses', 'comparisons', 'reports', 'saved_locations', 'mission_plans', 'analysis_annotations']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_member_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.moonnav_is_member(workspace_id))', t || '_member_read', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', t);
  END LOOP;
  EXECUTE 'DROP POLICY IF EXISTS workspaces_member_read ON public.workspaces';
  EXECUTE 'CREATE POLICY workspaces_member_read ON public.workspaces FOR SELECT TO authenticated USING (public.moonnav_is_member(id))';
  EXECUTE 'DROP POLICY IF EXISTS workspace_members_member_read ON public.workspace_members';
  EXECUTE 'CREATE POLICY workspace_members_member_read ON public.workspace_members FOR SELECT TO authenticated USING (public.moonnav_is_member(workspace_id))';
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.workspaces, public.workspace_members FROM anon, authenticated';

  -- A user's own profile row (read) and preferences (read/write).
  EXECUTE 'DROP POLICY IF EXISTS user_self_read ON public."user"';
  EXECUTE $p$CREATE POLICY user_self_read ON public."user" FOR SELECT TO authenticated USING (id = (auth.jwt() ->> 'sub'))$p$;
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public."user" FROM anon, authenticated';
  EXECUTE 'DROP POLICY IF EXISTS user_preferences_self ON public.user_preferences';
  EXECUTE $p$CREATE POLICY user_preferences_self ON public.user_preferences FOR ALL TO authenticated
            USING (user_id = (auth.jwt() ->> 'sub')) WITH CHECK (user_id = (auth.jwt() ->> 'sub'))$p$;
  EXECUTE 'REVOKE ALL ON public.user_preferences FROM anon';
END $$;
