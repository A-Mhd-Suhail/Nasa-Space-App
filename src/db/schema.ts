import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();

/* ------------------------------------------------------------------ */
/* Identity (Better Auth core + two-factor plugin + rate limit)        */
/* ------------------------------------------------------------------ */
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("user"), // user | analyst | curator | admin
    twoFactorEnabled: boolean("two_factor_enabled").default(false),
    preferredMode: text("preferred_mode"), // planning | learn | explore
    displayTimezone: text("display_timezone").default("UTC"),
    onboardedAt: ts("onboarded_at"),
    termsAcceptedAt: ts("terms_accepted_at"),
    status: text("status").notNull().default("active"), // active | suspended | deleted
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("user_email_lower_unique").on(sql`lower(${t.email})`),
    check("user_email_normalized_chk", sql`${t.email} = lower(btrim(${t.email}))`),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: ts("locked_until"),
  },
  (t) => [index("two_factor_user_idx").on(t.userId), index("two_factor_secret_idx").on(t.secret)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ------------------------------------------------------------------ */
/* Workspaces & projects                                              */
/* ------------------------------------------------------------------ */
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  personal: boolean("personal").notNull().default(false),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id),
  createdAt: created(),
  updatedAt: updated(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("owner"), // owner | editor | viewer
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("wm_user_idx").on(t.userId)],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    notes: text("notes"),
    status: text("status").notNull().default("active"), // active | archived
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("projects_ws_idx").on(t.workspaceId, t.status)],
);

/* ------------------------------------------------------------------ */
/* Catalogue                                                          */
/* ------------------------------------------------------------------ */
export const sites = pgTable("sites", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  featureType: text("feature_type").notNull(),
  latitudeDeg: doublePrecision("latitude_deg").notNull(),
  longitudeEastDeg: doublePrecision("longitude_east_deg").notNull(),
  diameterKm: doublePrecision("diameter_km"),
  heightM: doublePrecision("height_m"),
  heightProductId: text("height_product_id"),
  source: text("source").notNull(),
  sourceUrl: text("source_url"),
  note: text("note"),
  verified: boolean("verified").notNull().default(true),
  createdAt: created(),
});

export const dataProducts = pgTable(
  "data_products",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(), // dem | ephemeris_kernel_set | nomenclature | imagery
    provider: text("provider").notNull(),
    mission: text("mission"),
    instrument: text("instrument"),
    productId: text("product_id").notNull(),
    release: text("release").notNull(),
    version: integer("version").notNull().default(1),
    sourceUrl: text("source_url"),
    licenceStatus: text("licence_status"),
    attribution: text("attribution"),
    retrievedAt: ts("retrieved_at"),
    sha256: text("sha256"),
    fileFormat: text("file_format"),
    projection: text("projection"),
    crsOrFrame: text("crs_or_frame"),
    latitudeType: text("latitude_type"),
    longitudeConvention: text("longitude_convention"),
    verticalDatum: text("vertical_datum"),
    units: text("units"),
    pixelSpacingM: doublePrecision("pixel_spacing_m"),
    scaleFactor: doublePrecision("scale_factor"),
    offset: doublePrecision("offset"),
    noDataValue: text("no_data_value"),
    coverage: text("coverage"),
    qualityFlags: jsonb("quality_flags").$type<string[]>(),
    processingVersion: text("processing_version"),
    status: text("status").notNull().default("discovered"), // discovered|downloaded|validated|processing|approved|deprecated|failed|blocked
    statusReason: text("status_reason"),
    storageKey: text("storage_key"),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: ts("approved_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("data_products_pid_release_uq").on(t.productId, t.release, t.version)],
);

export const dataIngestionRuns = pgTable("data_ingestion_runs", {
  id: text("id").primaryKey(),
  dataProductId: text("data_product_id")
    .notNull()
    .references(() => dataProducts.id),
  status: text("status").notNull(), // queued | running | succeeded | failed
  steps: jsonb("steps").$type<{ step: string; ok: boolean; detail: string; at: string }[]>().notNull().default([]),
  error: text("error"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: created(),
  finishedAt: ts("finished_at"),
});

/* ------------------------------------------------------------------ */
/* Scenarios, jobs, analyses                                           */
/* ------------------------------------------------------------------ */
export const scenarios = pgTable(
  "scenarios",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    parentScenarioId: text("parent_scenario_id"),
    siteId: text("site_id").references(() => sites.id),
    latitudeDeg: doublePrecision("latitude_deg").notNull(),
    longitudeEastDeg: doublePrecision("longitude_east_deg").notNull(),
    observerHeightM: doublePrecision("observer_height_m").notNull(),
    startUtc: ts("start_utc").notNull(),
    endUtc: ts("end_utc").notNull(),
    stepSeconds: integer("step_seconds").notNull(),
    terrainProductId: text("terrain_product_id").notNull(),
    ephemerisProvider: text("ephemeris_provider").notNull().default("spice"),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    definitionHash: text("definition_hash").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: created(),
  },
  (t) => [index("scenarios_project_idx").on(t.projectId), index("scenarios_ws_idx").on(t.workspaceId)],
);

export const analyses = pgTable(
  "analyses",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"), // queued|running|completed|failed|cancelled
    methodVersion: text("method_version"),
    softwareVersion: text("software_version"),
    kernelManifestId: text("kernel_manifest_id"),
    terrainProductId: text("terrain_product_id"),
    quality: text("quality"),
    summary: jsonb("summary").$type<Record<string, unknown>>(),
    resultStorageKey: text("result_storage_key"),
    resultSha256: text("result_sha256"),
    resultBytes: integer("result_bytes"),
    error: jsonb("error").$type<Record<string, unknown>>(),
    /** Latest live JPL Horizons cross-check of this analysis' SPICE geometry (see science/moonnav_science/horizons_live.py). */
    validation: jsonb("validation").$type<Record<string, unknown>>(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: created(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("analyses_scenario_idx").on(t.scenarioId), index("analyses_ws_idx").on(t.workspaceId, t.createdAt)],
);

export const analysisJobs = pgTable(
  "analysis_jobs",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: ts("run_after").notNull().defaultNow(),
    leaseToken: text("lease_token"),
    leaseExpiresAt: ts("lease_expires_at"),
    workerId: text("worker_id"),
    progress: real("progress"),
    stage: text("stage"),
    error: jsonb("error").$type<Record<string, unknown>>(),
    log: jsonb("log").$type<{ at: string; msg: string }[]>().notNull().default([]),
    createdBy: text("created_by").notNull(),
    createdAt: created(),
    updatedAt: updated(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    uniqueIndex("jobs_idem_uq").on(t.workspaceId, t.idempotencyKey),
    index("jobs_claim_idx").on(t.status, t.runAfter),
  ],
);

export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerId: text("worker_id").primaryKey(),
  lastSeenAt: ts("last_seen_at").notNull(),
  info: jsonb("info").$type<Record<string, unknown>>(),
});

export const comparisons = pgTable("comparisons", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  analysisIds: jsonb("analysis_ids").$type<string[]>().notNull(),
  criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: created(),
});

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    format: text("format").notNull(), // pdf | csv | json
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    bytes: integer("bytes").notNull(),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: created(),
  },
  (t) => [index("reports_ws_idx").on(t.workspaceId, t.createdAt)],
);

export const shareLinks = pgTable("share_links", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  reportId: text("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull(),
  scope: text("scope").notNull().default("report:read"),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
  accessCount: integer("access_count").notNull().default(0),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: created(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: text("ip"),
    requestId: text("request_id"),
    createdAt: created(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_object_idx").on(t.objectType, t.objectId)],
);

/* ------------------------------------------------------------------ */
/* Saved locations (per workspace)                                      */
/* ------------------------------------------------------------------ */
export const savedLocations = pgTable(
  "saved_locations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    latitudeDeg: doublePrecision("latitude_deg").notNull(),
    longitudeEastDeg: doublePrecision("longitude_east_deg").notNull(),
    siteId: text("site_id").references(() => sites.id),
    note: text("note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: created(),
  },
  (t) => [index("saved_locations_ws_idx").on(t.workspaceId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Mission planner                                                     */
/* ------------------------------------------------------------------ */
export const missionPlans = pgTable(
  "mission_plans",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Requirements as submitted (window, assumptions, constraints, weights). */
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    /** One entry per candidate: label, source and the scenario/analysis it produced. */
    candidates: jsonb("candidates").$type<{ label: string; source: Record<string, unknown>; scenarioId: string; analysisId: string }[]>().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("mission_plans_ws_idx").on(t.workspaceId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Workspace invitations (email-based, expiry + revoke)                 */
/* ------------------------------------------------------------------ */
export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("editor"), // editor | viewer
    /** SHA-256 of the bearer token; the raw token is shown once at creation. */
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id),
    acceptedBy: text("accepted_by").references(() => user.id),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: created(),
  },
  (t) => [index("workspace_invitations_ws_idx").on(t.workspaceId, t.createdAt), index("workspace_invitations_email_idx").on(t.email)],
);

/* ------------------------------------------------------------------ */
/* Analyst annotations on analyses (role-gated review surface)          */
/* ------------------------------------------------------------------ */
export const analysisAnnotations = pgTable(
  "analysis_annotations",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Free-text comment by the analyst. */
    body: text("body").notNull(),
    /** Optional structured tag: note | concern | approval | correction. */
    kind: text("kind").notNull().default("note"),
    /** Optional pointer into the result payload, e.g. "sun.intervals[3]". */
    anchor: text("anchor"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("analysis_annotations_analysis_idx").on(t.analysisId, t.createdAt), index("analysis_annotations_ws_idx").on(t.workspaceId, t.createdAt)],
);

/**
 * Per-user preferences (Simple/Advanced mode, units, time zone, comparison weights and mission
 * thresholds). Anonymous visitors keep the same values in localStorage only.
 */
export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  preferredMode: text("preferred_mode").notNull().default("simple"), // simple | advanced
  units: text("units").notNull().default("metric"),
  timeZone: text("time_zone").notNull().default("UTC"),
  scoringWeights: jsonb("scoring_weights").$type<{ sun: number; dte: number; energy: number }>().notNull().default({ sun: 50, dte: 50, energy: 0 }),
  missionThresholds: jsonb("mission_thresholds").$type<Record<string, number | null>>().notNull().default({}),
  display: jsonb("display").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
