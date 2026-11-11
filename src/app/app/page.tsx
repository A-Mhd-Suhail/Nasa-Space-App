import { ArrowRight, MapPin, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, CardHeader, EmptyState, LinkButton, Notice, PageHeader, StatusBadge } from "@/components/ui";
import type { AnalysisSummary } from "@/lib/analysis-types";
import { currentWorkspace, requirePageUser } from "@/lib/dal";
import { workerStatus } from "@/lib/jobs";
import { scienceHealth } from "@/lib/science";
import { listProjects, recentAnalyses } from "@/lib/services";

export const metadata: Metadata = { title: "Overview" };

const pct = (v: number | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const u = await requirePageUser("/app");
  if (!u.onboardedAt) redirect("/app/onboarding");
  const sp = await searchParams;
  const ws = await currentWorkspace(u);
  const [projects, analyses, worker, sci, locations] = await Promise.all([
    listProjects(u),
    recentAnalyses(u, 10),
    workerStatus(),
    scienceHealth(),
    db().select().from(schema.savedLocations).where(eq(schema.savedLocations.workspaceId, ws.id)).orderBy(desc(schema.savedLocations.createdAt)).limit(5),
  ]);
  const sciOk = sci.status === "ok";
  const canWrite = ws.role !== "viewer";
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        title={ws.name}
        description={`${ws.personal ? "Your personal field book" : `Shared workspace · you are ${ws.role}`}. Resume a project, start a scenario or check on running analyses.`}
        actions={canWrite ? <><LinkButton href="/app/projects">Projects</LinkButton><LinkButton href="/app/scenarios/new" variant="primary"><Plus size={16} /> New scenario</LinkButton></> : null}
      />
      {sp.denied && <Notice tone="warn" className="mb-5" title="Access denied">Your role does not include that area.</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Recent analyses" subtitle="Latest results in this workspace, newest first" actions={<Link href="/app/compare" className="text-[13px] text-accent hover:underline hover:underline-offset-4">Compare</Link>} />
          {analyses.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No analyses yet" action={canWrite ? <LinkButton href="/app/scenarios/new?guided=1" variant="primary">Run the guided example</LinkButton> : undefined}>
                Choose a site and a UTC window; MoonNav traces the Sun and Earth against the LOLA terrain and reports sunlit intervals and geometric DTE windows.
              </EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">Recent analyses with status and results</caption>
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-muted">
                    <th scope="col" className="px-5 py-2.5 font-medium">Scenario</th>
                    <th scope="col" className="adv-only-cell px-3 py-2.5 font-medium">Window (UTC)</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Sunlit</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">Geometric DTE</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {analyses.map(({ a, s, p }) => {
                    const sum = a.summary as unknown as AnalysisSummary | null;
                    return (
                      <tr key={a.id} className="border-b border-line last:border-0 hover:bg-panel-2">
                        <td className="px-5 py-3">
                          <Link href={`/app/analyses/${a.id}`} className="font-medium text-text hover:text-accent">{s.name} <span className="font-normal text-muted">v{s.version}</span></Link>
                          <div className="text-[12px] text-muted">{p.name} · {Math.abs(s.latitudeDeg).toFixed(2)}°S {s.longitudeEastDeg.toFixed(2)}°E</div>
                        </td>
                        <td className="adv-only-cell whitespace-nowrap px-3 py-3 text-[13px] text-text-2">{s.startUtc.toISOString().slice(0, 10)} → {s.endUtc.toISOString().slice(0, 10)}</td>
                        <td className="px-3 py-3"><StatusBadge status={a.status} /></td>
                        <td className="px-3 py-3 text-right font-medium text-sun">{pct(sum?.sun.fractionVisible)}</td>
                        <td className="px-5 py-3 text-right font-medium text-earth">{pct(sum?.earth.dte.fractionVisible)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="simple-only" data-testid="overview-simple">
            <CardHeader title="Getting started" subtitle="Four steps from a site to a report" />
            <ol className="space-y-2.5 px-5 py-4 text-sm text-text-2">
              <li><Link href="/app/explorer" className="font-medium text-accent hover:underline">1. Choose a site</Link> — a named south-pole feature or any point you click.</li>
              <li><Link href="/app/scenarios/new?guided=1" className="font-medium text-accent hover:underline">2. Pick dates and run</Link> — MoonNav works out sunlight and Earth visibility.</li>
              <li><Link href="/app/analysis/sun" className="font-medium text-accent hover:underline">3. Read the results</Link> — plain-language summaries explain what blocks the Sun or Earth.</li>
              <li><Link href="/app/compare" className="font-medium text-accent hover:underline">4. Compare and report</Link> — see trade-offs and download a mission report.</li>
            </ol>
          </Card>
          <Card className="adv-only">
            <CardHeader title="Engine & data" subtitle="Checked as this page loaded" />
            <dl className="divide-y divide-line text-sm">
              {[
                ["Science engine", <StatusBadge key="s" status={sciOk ? "ok" : String(sci.status)} />],
                ["Analysis worker", worker.liveWorkers > 0 || worker.onDemand ? <StatusBadge key="w" status="ok" /> : <StatusBadge key="w" status="unavailable" />],
                ["Jobs in progress", <span key="j" className="num">{worker.activeJobs}</span>],
                ["Worker last seen", <span key="l" className="num text-[12px]">{worker.lastSeenAt ? worker.lastSeenAt.replace("T", " ").slice(0, 19) : "never"}</span>],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-center justify-between px-5 py-2.5"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {worker.liveWorkers === 0 && !worker.onDemand && <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-warn">No worker is polling. Submitted analyses wait in the queue until one starts (<code className="font-mono">npm run worker:dev</code>).</p>}
          </Card>
          <Card>
            <CardHeader title="Projects" actions={<Link href="/app/projects" className="text-[13px] text-accent hover:underline hover:underline-offset-4">All</Link>} />
            {projects.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No projects yet.</p> : (
              <ul className="divide-y divide-line">
                {projects.slice(0, 5).map((p) => (
                  <li key={p.id}><Link href={`/app/projects/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-panel-2"><span className="truncate">{p.name}</span><span className="num shrink-0 text-xs text-muted">{p.scenarioCount} scenarios</span></Link></li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Saved locations" actions={<Link href="/app/explorer" className="text-[13px] text-accent hover:underline hover:underline-offset-4">Explorer</Link>} />
            {locations.length === 0 ? <p className="px-5 py-4 text-sm text-muted">Save points from the Site Explorer to reuse them in scenarios.</p> : (
              <ul className="divide-y divide-line">
                {locations.map((l) => (
                  <li key={l.id}>
                    <Link href={`/app/scenarios/new?lat=${l.latitudeDeg}&lon=${l.longitudeEastDeg}`} className="flex items-center gap-2.5 px-5 py-2.5 text-sm hover:bg-panel-2">
                      <MapPin size={14} className="shrink-0 text-earth" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{l.name}</span>
                      <ArrowRight size={14} className="text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
