/**
 * Supabase configuration (prepared, not connected). MoonNav runs on any PostgreSQL through
 * DATABASE_URL; Supabase is optional and only activated when DATA_BACKEND=supabase and the
 * variables below are set. Nothing here throws when they are absent.
 */
export type SupabasePublicConfig = { url: string; anonKey: string };

export function supabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export type DataBackend = "postgres" | "supabase";

/** Which repository implementation serves data. Defaults to direct PostgreSQL (local or Supabase-hosted). */
export function dataBackend(): DataBackend {
  return process.env.DATA_BACKEND === "supabase" ? "supabase" : "postgres";
}
