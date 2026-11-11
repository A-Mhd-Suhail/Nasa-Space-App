/**
 * Data-access contracts. UI and route handlers depend on these interfaces, never on a specific
 * database client, so the backing store (local PostgreSQL today, Supabase later) is a
 * configuration choice (DATA_BACKEND). Authorization stays in src/lib/dal.ts.
 */
export type LandingSite = {
  id: string; name: string; featureType: string; latitudeDeg: number; longitudeEastDeg: number; diameterKm: number | null; heightM: number | null;
  source: string; sourceUrl: string | null; note: string | null;
};
export type SavedLocation = { id: string; workspaceId: string; name: string; latitudeDeg: number; longitudeEastDeg: number; siteId: string | null; note: string | null; createdBy: string; createdAt: Date };
export type ScenarioSummary = {
  id: string; workspaceId: string; projectId: string; name: string; version: number; siteId: string | null; latitudeDeg: number; longitudeEastDeg: number;
  startUtc: Date; endUtc: Date; stepSeconds: number; definitionHash: string; createdAt: Date;
};
export type UserPreferences = {
  userId: string; preferredMode: "simple" | "advanced"; units: string; timeZone: string;
  scoringWeights: { sun: number; dte: number; energy: number }; missionThresholds: Record<string, number | null>; display: Record<string, unknown>; updatedAt: Date;
};
export type AnalysisValidation = Record<string, unknown>;

export interface LandingSiteRepository {
  listCatalog(): Promise<LandingSite[]>;
  getCatalog(id: string): Promise<LandingSite | null>;
  listSaved(workspaceId: string): Promise<SavedLocation[]>;
  getSaved(id: string): Promise<SavedLocation | null>;
  createSaved(l: Omit<SavedLocation, "createdAt">): Promise<SavedLocation>;
  updateSaved(id: string, patch: { name?: string; note?: string | null }): Promise<SavedLocation | null>;
  deleteSaved(id: string): Promise<void>;
}
export interface MissionScenarioRepository {
  listByWorkspace(workspaceId: string, limit?: number): Promise<ScenarioSummary[]>;
  get(id: string): Promise<ScenarioSummary | null>;
  rename(id: string, name: string): Promise<void>;
  delete(id: string): Promise<void>;
}
export interface AnalysisResultRepository {
  getValidation(analysisId: string): Promise<AnalysisValidation | null>;
  setValidation(analysisId: string, v: AnalysisValidation): Promise<void>;
}
export interface UserPreferenceRepository {
  get(userId: string): Promise<UserPreferences | null>;
  upsert(userId: string, patch: Partial<Omit<UserPreferences, "userId" | "updatedAt">>): Promise<UserPreferences>;
}
export type Repositories = {
  backend: "postgres" | "supabase";
  sites: LandingSiteRepository;
  scenarios: MissionScenarioRepository;
  analyses: AnalysisResultRepository;
  preferences: UserPreferenceRepository;
};

export const DEFAULT_PREFERENCES: Omit<UserPreferences, "userId" | "updatedAt"> = {
  preferredMode: "simple", units: "metric", timeZone: "UTC", scoringWeights: { sun: 50, dte: 50, energy: 0 }, missionThresholds: {}, display: {},
};
