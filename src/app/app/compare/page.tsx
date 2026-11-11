import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { CompareClient } from "@/components/workspace/CompareClient";
import { requirePageUser } from "@/lib/dal";
import { recentAnalyses } from "@/lib/services";
import { repos } from "@/repositories";

export const metadata: Metadata = { title: "Compare" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const u = await requirePageUser("/app/compare");
  const { ids } = await searchParams;
  const [done, prefs] = await Promise.all([recentAnalyses(u, 200, "completed"), repos().preferences.get(u.id)]);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Compare scenarios" description="Compare two to eight completed analyses — several sites, one site on several dates, or both. MoonNav checks that they are comparable, applies your hard gates, and only then uses weighted preferences. There is no universal best site — only the best match for stated criteria." />
      <CompareClient
        analyses={done.map(({ a, s, p }) => ({ id: a.id, label: `${s.name} v${s.version}`, project: p.name, start: s.startUtc.toISOString(), end: s.endUtc.toISOString(), step: s.stepSeconds, site: s.siteId ?? `${Math.abs(s.latitudeDeg).toFixed(2)}°S ${s.longitudeEastDeg.toFixed(2)}°E` }))}
        initialIds={(ids ?? "").split(",").filter(Boolean)}
        initialWeights={prefs?.scoringWeights}
        initialThresholds={prefs?.missionThresholds}
      />
    </div>
  );
}
