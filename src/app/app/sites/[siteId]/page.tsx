import type { Metadata } from "next";
import Link from "next/link";
import sitesData from "@/data/sites.json";
import demoIndex from "../../../../../public/data/demo/index.json";
import { PageHeader } from "@/components/ui";
import { SiteDetailClient } from "@/components/workspace/SiteDetailClient";
import { requirePageUser } from "@/lib/dal";
import { getAnalysis, recentAnalyses } from "@/lib/services";

export const metadata: Metadata = { title: "Site detail" };

export default async function SiteDetailPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ analysisId?: string }> }) {
  const { siteId } = await params;
  const { analysisId } = await searchParams;
  const u = await requirePageUser(`/app/sites/${siteId}`);
  type SiteRec = { key: string; name: string; featureType: string; latitudeDeg: number; longitudeEastDeg: number; diameterKm: number | null; heightM: number | null; source: string; sourceUrl: string | null; note: string };
  let site: SiteRec | null = (sitesData.sites as SiteRec[]).find((s) => s.key === siteId) ?? null;
  let analysis: { id: string; label: string } | null = null;
  if (analysisId) {
    const r = await getAnalysis(u, analysisId).catch(() => null);
    if (r && r.analysis.status === "completed") {
      analysis = { id: r.analysis.id, label: `${r.scenario.name} v${r.scenario.version}` };
      if (!site || r.scenario.siteId !== site.key) {
        site = (sitesData.sites as SiteRec[]).find((s) => s.key === r.scenario.siteId) ?? {
          key: "custom", name: `Custom site (${r.scenario.name})`, featureType: "Custom coordinate", latitudeDeg: r.scenario.latitudeDeg, longitudeEastDeg: r.scenario.longitudeEastDeg,
          diameterKm: null, heightM: null, source: "User-entered coordinate", sourceUrl: null, note: "Custom coordinate entered by the user.",
        };
      }
    }
  }
  if (!site) {
    return <div className="mx-auto max-w-3xl py-10 text-sm text-text-2">Unknown site. <Link className="text-accent hover:underline" href="/app/explorer">Pick a site in the explorer</Link>.</div>;
  }
  const others = (await recentAnalyses(u, 100, "completed")).filter(({ s }) => (site!.key === "custom" ? false : s.siteId === site!.key)).map(({ a, s }) => ({ id: a.id, label: `${s.name} v${s.version} · ${s.startUtc.toISOString().slice(0, 10)}` }));
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader crumbs={[{ label: "Workspace", href: "/app" }, { label: "Site Explorer", href: "/app/explorer" }, { label: site.name }]} title={site.name} description={`${site.featureType} · ${Math.abs(site.latitudeDeg).toFixed(4)}°S ${site.longitudeEastDeg.toFixed(4)}°E · ${site.source}`} />
      <SiteDetailClient site={site} analysis={analysis} analyses={others} featured={demoIndex.items.map((i) => i.siteKey).includes(site.key)} sites={sitesData.sites.map((s) => ({ key: s.key, name: s.name }))} />
    </div>
  );
}
