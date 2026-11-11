import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "./config";
import type { Database } from "./database.types";

/**
 * Server-only Supabase client using the service-role key (bypasses RLS; never import from client
 * components — `server-only` makes that a build error). Returns null when Supabase is not configured.
 */
let admin: SupabaseClient<Database> | null | undefined;

export function supabaseAdmin(): SupabaseClient<Database> | null {
  if (admin !== undefined) return admin;
  const pub = supabasePublicConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  admin = pub && serviceKey ? createClient<Database>(pub.url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return admin;
}
