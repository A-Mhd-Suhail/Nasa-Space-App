import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_PREFERENCES, type Repositories, type ScenarioSummary, type UserPreferences } from "./types";

/** PostgreSQL implementation (Drizzle). Works against local PostgreSQL and a Supabase-hosted database via DATABASE_URL. */
const scenarioSummary = (s: typeof schema.scenarios.$inferSelect): ScenarioSummary => ({
  id: s.id, workspaceId: s.workspaceId, projectId: s.projectId, name: s.name, version: s.version, siteId: s.siteId, latitudeDeg: s.latitudeDeg,
  longitudeEastDeg: s.longitudeEastDeg, startUtc: s.startUtc, endUtc: s.endUtc, stepSeconds: s.stepSeconds, definitionHash: s.definitionHash, createdAt: s.createdAt,
});
const prefs = (r: typeof schema.userPreferences.$inferSelect): UserPreferences => ({ ...r, preferredMode: r.preferredMode === "advanced" ? "advanced" : "simple" });

export function postgresRepositories(): Repositories {
  return {
    backend: "postgres",
    sites: {
      listCatalog: () => db().select().from(schema.sites).orderBy(asc(schema.sites.latitudeDeg)),
      getCatalog: async (id) => (await db().select().from(schema.sites).where(eq(schema.sites.id, id)).limit(1))[0] ?? null,
      listSaved: (ws) => db().select().from(schema.savedLocations).where(eq(schema.savedLocations.workspaceId, ws)).orderBy(desc(schema.savedLocations.createdAt)).limit(200),
      getSaved: async (id) => (await db().select().from(schema.savedLocations).where(eq(schema.savedLocations.id, id)).limit(1))[0] ?? null,
      createSaved: async (l) => (await db().insert(schema.savedLocations).values(l).returning())[0],
      updateSaved: async (id, patch) => {
        const set = { ...(patch.name ? { name: patch.name } : {}), ...(patch.note !== undefined ? { note: patch.note } : {}) };
        if (Object.keys(set).length) await db().update(schema.savedLocations).set(set).where(eq(schema.savedLocations.id, id));
        return (await db().select().from(schema.savedLocations).where(eq(schema.savedLocations.id, id)).limit(1))[0] ?? null;
      },
      deleteSaved: async (id) => void (await db().delete(schema.savedLocations).where(eq(schema.savedLocations.id, id))),
    },
    scenarios: {
      listByWorkspace: async (ws, limit = 200) => (await db().select().from(schema.scenarios).where(eq(schema.scenarios.workspaceId, ws)).orderBy(desc(schema.scenarios.createdAt)).limit(limit)).map(scenarioSummary),
      get: async (id) => {
        const [s] = await db().select().from(schema.scenarios).where(eq(schema.scenarios.id, id)).limit(1);
        return s ? scenarioSummary(s) : null;
      },
      rename: async (id, name) => void (await db().update(schema.scenarios).set({ name }).where(eq(schema.scenarios.id, id))),
      delete: async (id) => void (await db().delete(schema.scenarios).where(eq(schema.scenarios.id, id))),
    },
    analyses: {
      getValidation: async (id) => (await db().select({ v: schema.analyses.validation }).from(schema.analyses).where(eq(schema.analyses.id, id)).limit(1))[0]?.v ?? null,
      setValidation: async (id, v) => void (await db().update(schema.analyses).set({ validation: v }).where(eq(schema.analyses.id, id))),
    },
    preferences: {
      get: async (userId) => {
        const [r] = await db().select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, userId)).limit(1);
        return r ? prefs(r) : null;
      },
      upsert: async (userId, patch) => {
        const values = { ...DEFAULT_PREFERENCES, ...patch, userId, updatedAt: new Date() };
        const [r] = await db().insert(schema.userPreferences).values(values).onConflictDoUpdate({ target: schema.userPreferences.userId, set: { ...patch, updatedAt: new Date() } }).returning();
        return prefs(r);
      },
    },
  };
}
