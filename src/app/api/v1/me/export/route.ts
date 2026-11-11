import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { listWorkspaces, requireApiUser } from "@/lib/dal";
import { route } from "@/lib/http";

/** Personal data export (JSON). */
export const GET = route(async () => {
  const u = await requireApiUser();
  const owned = (await listWorkspaces(u)).filter((w) => w.role === "owner").map((w) => w.id);
  const d = db();
  const projects = await d.select().from(schema.projects).where(inArray(schema.projects.workspaceId, owned));
  const scenarios = await d.select().from(schema.scenarios).where(inArray(schema.scenarios.workspaceId, owned));
  const analyses = await d.select().from(schema.analyses).where(inArray(schema.analyses.workspaceId, owned));
  const reports = await d.select().from(schema.reports).where(inArray(schema.reports.workspaceId, owned));
  const locations = await d.select().from(schema.savedLocations).where(inArray(schema.savedLocations.workspaceId, owned));
  const shares = reports.length ? await d.select().from(schema.shareLinks).where(inArray(schema.shareLinks.reportId, reports.map((r) => r.id))) : [];
  const body = JSON.stringify({ exportedAtUtc: new Date().toISOString(), user: u, workspaces: owned, projects, scenarios, locations, analyses, reports: reports.map(({ storageKey: _k, ...r }) => r), shareLinks: shares.map(({ tokenHash: _t, ...s }) => s) }, null, 2);
  return new Response(body, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="moonnav-account-export.json"`, "Cache-Control": "no-store" } });
});
