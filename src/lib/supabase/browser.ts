"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "./config";
import type { Database } from "./database.types";

/**
 * Browser Supabase client with the public anon key. Every table it can reach is protected by the
 * RLS policies in drizzle/0007_supabase_rls.sql (public catalogue reads, member-only workspace reads).
 * Returns null when Supabase is not configured; the app does not depend on it today.
 */
let client: SupabaseClient<Database> | null | undefined;

export function supabaseBrowser(): SupabaseClient<Database> | null {
  if (client !== undefined) return client;
  const pub = supabasePublicConfig();
  client = pub ? createClient<Database>(pub.url, pub.anonKey) : null;
  return client;
}
