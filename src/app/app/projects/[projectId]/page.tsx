import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ProjectDetailClient } from "@/components/workspace/ProjectDetailClient";
import { requirePageUser } from "@/lib/dal";
import { getProject, listScenarios } from "@/lib/services";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const u = await requirePageUser(`/app/projects/${projectId}`);
  const p = await getProject(u, projectId).catch(() => null);
  if (!p) return <div className="mx-auto max-w-3xl py-10 text-sm text-text-2">Project not found or you do not have access.</div>;
  const scs = await listScenarios(u, projectId);
  const cmps = await db().select().from(schema.comparisons).where(eq(schema.comparisons.workspaceId, p.workspaceId)).orderBy(desc(schema.comparisons.createdAt)).limit(20);
  const ids = new Set(scs.flatMap((s) => s.analyses.map((a) => a.id)));
  const related = cmps.filter((c) => c.analysisIds.some((id) => ids.has(id)));
  return (
    <ProjectDetailClient
      project={{ id: p.id, name: p.name, description: p.description, notes: p.notes, status: p.status, createdAt: p.createdAt.toISOString() }}
      scenarios={scs.map((s) => ({
        id: s.id, name: s.name, version: s.version, lat: s.latitudeDeg, lon: s.longitudeEastDeg, siteId: s.siteId, start: s.startUtc.toISOString(), end: s.endUtc.toISOString(), step: s.stepSeconds,
        analyses: s.analyses.map((a) => ({ id: a.id, status: a.status, quality: a.quality, createdAt: a.createdAt.toISOString() })),
      }))}
      comparisons={related.map((c) => ({ id: c.id, n: c.analysisIds.length, createdAt: c.createdAt.toISOString(), ids: c.analysisIds }))}
    />
  );
}
