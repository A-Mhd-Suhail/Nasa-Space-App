import { and, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { currentUser, currentWorkspaceId, rateLimit } from "@/lib/dal";
import { clientIp, json, route } from "@/lib/http";

const q = z.object({ q: z.string().trim().max(80).default("") });

/** Command-palette search: catalogue sites (public) + the current workspace's projects, scenarios and saved locations. */
export const GET = route(async (req) => {
  const { q: term } = q.parse(Object.fromEntries(new URL(req.url).searchParams));
  await rateLimit(`search:${clientIp(req) ?? "anon"}`, 120, 60);
  const like = `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const d = db();
  const sites = await d.select({ id: schema.sites.id, name: schema.sites.name, featureType: schema.sites.featureType, latitudeDeg: schema.sites.latitudeDeg, longitudeEastDeg: schema.sites.longitudeEastDeg }).from(schema.sites).where(term ? ilike(schema.sites.name, like) : undefined).limit(8);
  const u = await currentUser();
  if (!u) return json({ sites, projects: [], scenarios: [], locations: [] });
  const ws = await currentWorkspaceId(u);
  const [projects, scenarios, locations] = await Promise.all([
    d.select({ id: schema.projects.id, name: schema.projects.name, status: schema.projects.status }).from(schema.projects).where(and(eq(schema.projects.workspaceId, ws), term ? or(ilike(schema.projects.name, like), ilike(schema.projects.description, like)) : undefined)).orderBy(desc(schema.projects.updatedAt)).limit(6),
    d.select({ id: schema.scenarios.id, name: schema.scenarios.name, version: schema.scenarios.version, projectId: schema.scenarios.projectId }).from(schema.scenarios).where(and(eq(schema.scenarios.workspaceId, ws), term ? ilike(schema.scenarios.name, like) : undefined)).orderBy(desc(schema.scenarios.createdAt)).limit(6),
    d.select({ id: schema.savedLocations.id, name: schema.savedLocations.name, latitudeDeg: schema.savedLocations.latitudeDeg, longitudeEastDeg: schema.savedLocations.longitudeEastDeg }).from(schema.savedLocations).where(and(eq(schema.savedLocations.workspaceId, ws), term ? ilike(schema.savedLocations.name, like) : undefined)).limit(6),
  ]);
  return json({ sites, projects, scenarios, locations });
});
