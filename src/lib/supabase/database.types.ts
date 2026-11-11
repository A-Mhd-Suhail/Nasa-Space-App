/**
 * Typed Supabase definitions for the tables the Supabase repository uses. Column names are the
 * snake_case PostgreSQL names from drizzle/ migrations (source of truth: src/db/schema.ts).
 * Regenerate with `supabase gen types typescript` once a project is linked.
 */
type Json = string | number | boolean | null | { [k: string]: Json | undefined } | Json[];
type Table<Row, Insert = Partial<Row>> = { Row: Row; Insert: Insert; Update: Partial<Row>; Relationships: [] };

export type SiteRow = {
  id: string; name: string; feature_type: string; latitude_deg: number; longitude_east_deg: number; diameter_km: number | null; height_m: number | null;
  height_product_id: string | null; source: string; source_url: string | null; note: string | null; verified: boolean; created_at: string;
};
export type SavedLocationRow = { id: string; workspace_id: string; name: string; latitude_deg: number; longitude_east_deg: number; site_id: string | null; note: string | null; created_by: string; created_at: string };
export type ScenarioRow = {
  id: string; workspace_id: string; project_id: string; name: string; version: number; parent_scenario_id: string | null; site_id: string | null;
  latitude_deg: number; longitude_east_deg: number; observer_height_m: number; start_utc: string; end_utc: string; step_seconds: number;
  terrain_product_id: string; ephemeris_provider: string; definition: Json; definition_hash: string; created_by: string; created_at: string;
};
export type AnalysisRow = {
  id: string; workspace_id: string; scenario_id: string; status: string; method_version: string | null; software_version: string | null; kernel_manifest_id: string | null;
  terrain_product_id: string | null; quality: string | null; summary: Json | null; result_storage_key: string | null; result_sha256: string | null; result_bytes: number | null;
  error: Json | null; validation: Json | null; created_by: string; created_at: string; completed_at: string | null;
};
export type UserPreferencesRow = { user_id: string; preferred_mode: string; units: string; time_zone: string; scoring_weights: Json; mission_thresholds: Json; display: Json; updated_at: string };

export type Database = {
  public: {
    Tables: {
      sites: Table<SiteRow>;
      saved_locations: Table<SavedLocationRow>;
      scenarios: Table<ScenarioRow>;
      analyses: Table<AnalysisRow>;
      user_preferences: Table<UserPreferencesRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
