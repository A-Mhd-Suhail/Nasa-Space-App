"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardHeader, EmptyState, Field, Input, LinkButton, Notice, PageHeader, StatusBadge, Textarea } from "../ui";
import { ConfirmDialog } from "../ConfirmDialog";
import { api } from "./api";

type A = { id: string; status: string; quality: string | null; createdAt: string };
type S = { id: string; name: string; version: number; lat: number; lon: number; siteId: string | null; start: string; end: string; step: number; analyses: A[]; canDelete: boolean };

export function ProjectDetailClient({ project, scenarios, comparisons, canDeleteProject }: { canDeleteProject: boolean; project: { id: string; name: string; description: string | null; notes: string | null; status: string; createdAt: string }; scenarios: S[]; comparisons: { id: string; n: number; createdAt: string; ids: string[] }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(project.notes ?? "");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [delScenario, setDelScenario] = useState<S | null>(null);
  const [delProject, setDelProject] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>, ok: string) => {
    try {
      await api(`/api/v1/projects/${project.id}`, { method: "PATCH", body });
      setMsg({ tone: "ok", text: ok });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        crumbs={[{ label: "Projects", href: "/app/projects" }, { label: project.name }]}
        title={<span className="flex items-center gap-3">{project.name}{project.status !== "active" && <StatusBadge status={project.status} />}</span>}
        description={project.description ?? undefined}
        actions={
          <>
            <Button s="sm" onClick={() => setEditing(!editing)}>Rename</Button>
            <Button s="sm" onClick={async () => { const r = await api<{ project: { id: string } }>(`/api/v1/projects/${project.id}/duplicate`, { method: "POST" }); router.push(`/app/projects/${r.project.id}`); }}>Duplicate</Button>
            <Button s="sm" onClick={() => patch({ status: project.status === "active" ? "archived" : "active" }, project.status === "active" ? "Project archived" : "Project restored")}>{project.status === "active" ? "Archive" : "Restore"}</Button>
            {canDeleteProject && <Button s="sm" variant="danger" data-testid="project-delete" onClick={() => { setDelErr(null); setDelProject(true); }}>Delete</Button>}
            <LinkButton s="sm" variant="primary" href={`/app/scenarios/new?project=${project.id}`}>New scenario</LinkButton>
          </>
        }
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {editing && (
        <Card>
          <form className="flex flex-wrap items-end gap-3 p-4" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await patch({ name: String(f.get("name")), description: String(f.get("description") ?? "") || null }, "Project updated"); setEditing(false); }}>
            <div className="min-w-60 flex-1"><Field label="Name" htmlFor="rn"><Input id="rn" name="name" defaultValue={project.name} required maxLength={120} /></Field></div>
            <div className="min-w-60 flex-[2]"><Field label="Description" htmlFor="rd"><Input id="rd" name="description" defaultValue={project.description ?? ""} maxLength={2000} /></Field></div>
            <Button type="submit" variant="primary">Save</Button>
          </form>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Scenarios" subtitle="Scenarios are immutable inputs. “New version” copies a scenario into the builder." />
          {scenarios.length === 0 ? (
            <div className="p-4"><EmptyState title="No scenarios yet" action={<LinkButton href={`/app/scenarios/new?project=${project.id}`} variant="primary" s="sm">Build a scenario</LinkButton>} /></div>
          ) : (
            <ul className="divide-y divide-line">
              {scenarios.map((s) => {
                const latest = s.analyses[0];
                return (
                  <li key={s.id} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{s.name} <span className="text-muted">v{s.version}</span></div>
                        <div className="num text-xs text-muted">{Math.abs(s.lat).toFixed(4)}°S {s.lon.toFixed(4)}°E {s.siteId ? `(${s.siteId})` : "(custom)"} · {s.start.slice(0, 16).replace("T", " ")} → {s.end.slice(0, 16).replace("T", " ")} UTC · {s.step / 60} min</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <LinkButton s="sm" href={`/app/scenarios/new?from=${s.id}`}>New version</LinkButton>
                        {s.canDelete && <Button s="sm" variant="danger" aria-label={`Delete scenario ${s.name}`} data-testid={`scenario-delete-${s.id}`} onClick={() => { setDelErr(null); setDelScenario(s); }}>Delete</Button>}
                        <Button s="sm" variant="primary" disabled={busyId === s.id} onClick={async () => {
                          setBusyId(s.id);
                          try {
                            const r = await api<{ analysisId: string }>("/api/v1/analyses", { method: "POST", body: { scenarioId: s.id } });
                            router.push(`/app/analyses/${r.analysisId}`);
                          } catch (e) {
                            setMsg({ tone: "bad", text: (e as Error).message });
                            setBusyId(null);
                          }
                        }}>{latest?.status === "completed" ? "Open / re-run" : "Run analysis"}</Button>
                      </div>
                    </div>
                    {s.analyses.length > 0 && (
                      <ul className="flex flex-wrap gap-2">
                        {s.analyses.slice(0, 5).map((a) => (
                          <li key={a.id}><Link href={`/app/analyses/${a.id}`} className="inline-flex items-center gap-2 rounded-md border border-line px-2 py-1 text-xs hover:border-accent/50"><StatusBadge status={a.status} /><span className="num text-muted">{a.createdAt.slice(0, 16).replace("T", " ")}</span>{a.quality && <span className="text-muted">· {a.quality}</span>}</Link></li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Project notes" />
            <div className="space-y-2 p-4">
              <label htmlFor="notes" className="sr-only">Project notes</label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={8} maxLength={20000} placeholder="Assumptions, mission criteria, decisions…" />
              <Button s="sm" onClick={() => patch({ notes }, "Notes saved")}>Save notes</Button>
            </div>
          </Card>
          <Card>
            <CardHeader title="Comparison history" />
            {comparisons.length === 0 ? <p className="px-4 py-3 text-sm text-muted">No comparisons yet. <Link href="/app/compare" className="text-accent hover:underline">Compare analyses</Link></p> : (
              <ul className="divide-y divide-line text-sm">
                {comparisons.map((c) => <li key={c.id} className="px-4 py-2"><Link className="hover:text-accent" href={`/app/compare?ids=${c.ids.join(",")}`}>{c.n} analyses</Link> <span className="num text-xs text-muted">{c.createdAt.slice(0, 16).replace("T", " ")}</span></li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <ConfirmDialog open={!!delScenario} title="Delete this scenario?" confirmLabel="Delete scenario" busy={delBusy} error={delErr} onClose={() => !delBusy && setDelScenario(null)}
        onConfirm={async () => {
          if (!delScenario) return;
          setDelBusy(true); setDelErr(null);
          try {
            await api(`/api/v1/scenarios/${delScenario.id}`, { method: "DELETE" });
            setMsg({ tone: "ok", text: `Scenario “${delScenario.name}” deleted.` });
            setDelScenario(null);
            router.refresh();
          } catch (e) { setDelErr((e as Error).message); } finally { setDelBusy(false); }
        }}>
        <p><strong className="text-text">{delScenario?.name}</strong> v{delScenario?.version} will be permanently deleted together with its {delScenario?.analyses.length ?? 0} analys{delScenario?.analyses.length === 1 ? "is" : "es"}, and any reports and share links made from them.</p>
        <p>This cannot be undone. The audit record of the deletion is kept. Use “New version” instead if you only want to change the inputs.</p>
      </ConfirmDialog>
      <ConfirmDialog open={delProject} title="Delete this project?" confirmLabel="Delete project" requireText={project.name} busy={delBusy} error={delErr} onClose={() => !delBusy && setDelProject(false)}
        onConfirm={async () => {
          setDelBusy(true); setDelErr(null);
          try {
            await api(`/api/v1/projects/${project.id}`, { method: "DELETE", body: { confirmName: project.name } });
            router.push("/app/projects");
            router.refresh();
          } catch (e) { setDelErr((e as Error).message); setDelBusy(false); }
        }}>
        <p><strong className="text-text">{project.name}</strong> and its {scenarios.length} scenario{scenarios.length === 1 ? "" : "s"}, all their analyses, reports and share links will be permanently deleted.</p>
        <p>This cannot be undone. Prefer <strong>Archive</strong> if you may need it again. The audit record is kept.</p>
      </ConfirmDialog>
    </div>
  );
}
