import "server-only";
import { dataBackend } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import { postgresRepositories } from "./postgres";
import { supabaseRepositories } from "./supabase";
import type { Repositories } from "./types";

let cached: Repositories | null = null;

/**
 * Repository factory. DATA_BACKEND=supabase uses the Supabase client when it is fully configured;
 * otherwise (the default, and whenever Supabase variables are missing) direct PostgreSQL is used,
 * so the app never crashes for lack of Supabase credentials.
 */
export function repos(): Repositories {
  if (cached) return cached;
  const sb = dataBackend() === "supabase" ? supabaseAdmin() : null;
  if (dataBackend() === "supabase" && !sb) console.warn("DATA_BACKEND=supabase but Supabase variables are missing; using PostgreSQL via DATABASE_URL");
  cached = sb ? supabaseRepositories(sb) : postgresRepositories();
  return cached;
}
export type * from "./types";
export { DEFAULT_PREFERENCES } from "./types";
