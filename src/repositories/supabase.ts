import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SavedLocationRow, ScenarioRow, SiteRow, UserPreferencesRow } from "@/lib/supabase/database.types";
import { DEFAULT_PREFERENCES, type LandingSite, type Repositories, type SavedLocation, type ScenarioSummary, type UserPreferences } from "./types";

/**
 * Supabase (PostgREST) implementation of the same contracts, using the server-only service-role
 * client. Prepared for a later integration step; selected with DATA_BACKEND=supabase.
 */
function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`Supabase: ${r.error.message}`);
  if (r.data == null) throw new Error("Supabase: empty response");
  return r.data;
}
/** For maybeSingle() lookups where "not found" is a valid answer. */
function maybe<T>(r: { data: T | null; error: { message: string } | null }): T | null {
  if (r.error) throw new Error(`Supabase: ${r.error.message}`);
  return r.data;
}
const site = (r: SiteRow): LandingSite => ({ id: r.id, name: r.name, featureType: r.feature_type, latitudeDeg: r.latitude_deg, longitudeEastDeg: r.longitude_east_deg, diameterKm: r.diameter_km, heightM: r.height_m, source: r.source, sourceUrl: r.source_url, note: r.note });
const saved = (r: SavedLocationRow): SavedLocation => ({ id: r.id, workspaceId: r.workspace_id, name: r.name, latitudeDeg: r.latitude_deg, longitudeEastDeg: r.longitude_east_deg, siteId: r.site_id, note: r.note, createdBy: r.created_by, createdAt: new Date(r.created_at) });
const scenario = (r: ScenarioRow): ScenarioSummary => ({ id: r.id, workspaceId: r.workspace_id, projectId: r.project_id, name: r.name, version: r.version, siteId: r.site_id, latitudeDeg: r.latitude_deg, longitudeEastDeg: r.longitude_east_deg, startUtc: new Date(r.start_utc), endUtc: new Date(r.end_utc), stepSeconds: r.step_seconds, definitionHash: r.definition_hash, createdAt: new Date(r.created_at) });
const prefs = (r: UserPreferencesRow): UserPreferences => ({ userId: r.user_id, preferredMode: r.preferred_mode === "advanced" ? "advanced" : "simple", units: r.units, timeZone: r.time_zone, scoringWeights: r.scoring_weights as UserPreferences["scoringWeights"], missionThresholds: r.mission_thresholds as UserPreferences["missionThresholds"], display: r.display as Record<string, unknown>, updatedAt: new Date(r.updated_at) });

export function supabaseRepositories(sb: SupabaseClient<Database>): Repositories {
  return {
    backend: "supabase",
    sites: {
      listCatalog: async () => check(await sb.from("sites").select("*").order("latitude_deg")).map(site),
      getCatalog: async (id) => {
        const r = maybe(await sb.from("sites").select("*").eq("id", id).maybeSingle());
        return r ? site(r) : null;
      },
      listSaved: async (ws) => check(await sb.from("saved_locations").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(200)).map(saved),
      getSaved: async (id) => {
        const r = maybe(await sb.from("saved_locations").select("*").eq("id", id).maybeSingle());
        return r ? saved(r) : null;
      },
      createSaved: async (l) => saved(check(await sb.from("saved_locations").insert({ id: l.id, workspace_id: l.workspaceId, name: l.name, latitude_deg: l.latitudeDeg, longitude_east_deg: l.longitudeEastDeg, site_id: l.siteId, note: l.note, created_by: l.createdBy }).select("*").single())),
      updateSaved: async (id, patch) => {
        const r = maybe(await sb.from("saved_locations").update({ ...(patch.name ? { name: patch.name } : {}), ...(patch.note !== undefined ? { note: patch.note } : {}) }).eq("id", id).select("*").maybeSingle());
        return r ? saved(r) : null;
      },
      deleteSaved: async (id) => void maybe(await sb.from("saved_locations").delete().eq("id", id)),
    },
    scenarios: {
      listByWorkspace: async (ws, limit = 200) => check(await sb.from("scenarios").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(limit)).map(scenario),
      get: async (id) => {
        const r = maybe(await sb.from("scenarios").select("*").eq("id", id).maybeSingle());
        return r ? scenario(r) : null;
      },
      rename: async (id, name) => void maybe(await sb.from("scenarios").update({ name }).eq("id", id)),
      delete: async (id) => void maybe(await sb.from("scenarios").delete().eq("id", id)),
    },
    analyses: {
      getValidation: async (id) => {
        const r = maybe(await sb.from("analyses").select("*").eq("id", id).maybeSingle()) as { validation: unknown } | null;
        return (r?.validation as Record<string, unknown> | null) ?? null;
      },
      setValidation: async (id, v) => void maybe(await sb.from("analyses").update({ validation: v as never }).eq("id", id)),
    },
    preferences: {
      get: async (userId) => {
        const r = maybe(await sb.from("user_preferences").select("*").eq("user_id", userId).maybeSingle());
        return r ? prefs(r) : null;
      },
      upsert: async (userId, patch) => {
        const cur = maybe(await sb.from("user_preferences").select("*").eq("user_id", userId).maybeSingle());
        const base = cur ? prefs(cur) : { ...DEFAULT_PREFERENCES };
        const m = { ...base, ...patch };
        const row = { user_id: userId, preferred_mode: m.preferredMode, units: m.units, time_zone: m.timeZone, scoring_weights: m.scoringWeights, mission_thresholds: m.missionThresholds, display: m.display as never, updated_at: new Date().toISOString() };
        return prefs(check(await sb.from("user_preferences").upsert(row).select("*").single()));
      },
    },
  };
}
