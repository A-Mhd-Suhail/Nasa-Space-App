import type { Metadata } from "next";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { AnalysisPicker } from "@/components/workspace/AnalysisPicker";
import { ResultView } from "@/components/workspace/ResultLoader";
import { requirePageUser } from "@/lib/dal";
import { recentAnalyses } from "@/lib/services";

export const metadata: Metadata = { title: "Sun & Power" };

export default async function Page({ searchParams }: { searchParams: Promise<{ analysisId?: string }> }) {
  const u = await requirePageUser("/app/analysis/sun");
  const { analysisId } = await searchParams;
  const done = await recentAnalyses(u, 100, "completed");
  const items = done.map(({ a, s }) => ({ id: a.id, label: `${s.name} v${s.version} · ${s.startUtc.toISOString().slice(0, 10)} · ${a.id.slice(4, 12)}` }));
  const selected = analysisId ?? items[0]?.id ?? null;
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Sun & Power" description="Sun azimuth and elevation against the terrain horizon, direct-sunlight intervals and optional idealized panel energy." actions={items.length ? <AnalysisPicker items={items} value={selected} basePath="/app/analysis/sun" /> : null} />
      {selected ? <ResultView analysisId={selected} view="sun" /> : <EmptyState title="No completed analyses yet" action={<LinkButton href="/app/scenarios/new" variant="primary" s="sm">Build a scenario</LinkButton>}>Run an analysis to see its results here, or browse the precomputed demonstrations in the public explorer.</EmptyState>}
    </div>
  );
}
