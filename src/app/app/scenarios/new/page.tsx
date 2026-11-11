import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import sitesData from "@/data/sites.json";
import { db, schema } from "@/db";
import { PageHeader } from "@/components/ui";
import { ScenarioBuilder } from "@/components/workspace/ScenarioBuilder";
import { currentWorkspaceId, requirePageUser } from "@/lib/dal";
import { getScenario, listProjects } from "@/lib/services";

export const metadata: Metadata = { title: "Scenario Builder" };

export default async function NewScenarioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const u = await requirePageUser("/app/scenarios/new");
  const projects = await listProjects(u);
  const products = await db().select().from(schema.dataProducts).where(eq(schema.dataProducts.kind, "dem"));
  const locations = await db().select().from(schema.savedLocations).where(eq(schema.savedLocations.workspaceId, await currentWorkspaceId(u))).limit(200);
  const from = sp.from ? await getScenario(u, sp.from).catch(() => null) : null;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader crumbs={[{ label: "Workspace", href: "/app" }, { label: "Projects", href: "/app/projects" }, { label: "Scenario Builder" }]} title={from ? `New version of “${from.name}”` : "Build a scenario"} description="A scenario is an immutable set of inputs: site, time window, terrain product and assumptions. MoonNav validates it and shows the data coverage before it can run." />
      <ScenarioBuilder
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        sites={sitesData.sites}
        locations={locations.map((l) => ({ id: l.id, name: l.name, lat: l.latitudeDeg, lon: l.longitudeEastDeg }))}
        products={products.filter((p) => p.status !== "superseded").map((p) => ({ id: p.id, label: p.id === "lola-multires-v1" ? "LOLA multi-resolution · 5/20/40 m near field + 240 m far field (high-res where tiled)" : `${p.productId} · ${p.pixelSpacingM} m · ${p.release}`, status: p.status, coverage: p.coverage ?? "" }))}
        initial={{ projectId: sp.project ?? from?.projectId ?? projects[0]?.id ?? null, siteKey: sp.site ?? (from?.siteId ?? null), lat: sp.lat ? Number(sp.lat) : from && !from.siteId ? from.latitudeDeg : null, lon: sp.lon ? Number(sp.lon) : from && !from.siteId ? from.longitudeEastDeg : null, from: from ? { id: from.id, name: from.name, definition: from.definition } : null, guided: sp.guided === "1" }}
      />
    </div>
  );
}
