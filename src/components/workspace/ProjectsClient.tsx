"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardHeader, EmptyState, Field, Input, Notice, StatusBadge, Textarea } from "../ui";
import { api, fieldErrorMap } from "./api";

type P = { id: string; name: string; description: string | null; status: string; scenarioCount: number; updatedAt: string };

export function ProjectsClient({ initial }: { initial: P[] }) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const list = initial.filter((p) => showArchived || p.status === "active");
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader title="Your projects" actions={<label className="flex items-center gap-2 text-xs text-text-2"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>} />
        {list.length === 0 ? <div className="p-4"><EmptyState title="No projects">Create a project to hold your scenarios.</EmptyState></div> : (
          <ul className="divide-y divide-line">
            {list.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/app/projects/${p.id}`} className="font-medium hover:text-accent">{p.name}</Link>
                  {p.description && <p className="truncate text-xs text-muted">{p.description}</p>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span>{p.scenarioCount} scenarios</span>
                  <span className="num">{p.updatedAt.slice(0, 10)}</span>
                  {p.status !== "active" && <StatusBadge status={p.status} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="New project" />
        <form className="space-y-3 p-4" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setErrs({});
          setErr(null);
          try {
            const r = await api<{ project: { id: string } }>("/api/v1/projects", { method: "POST", body: { name: String(f.get("name") ?? ""), description: String(f.get("description") ?? "") || undefined } });
            router.push(`/app/projects/${r.project.id}`);
          } catch (e2) {
            setErrs(fieldErrorMap(e2));
            setErr((e2 as Error).message);
          }
        }}>
          <Field label="Name" htmlFor="pname" required error={errs.name}><Input id="pname" name="name" maxLength={120} required /></Field>
          <Field label="Description" htmlFor="pdesc" error={errs.description}><Textarea id="pdesc" name="description" rows={3} maxLength={2000} /></Field>
          {err && !Object.keys(errs).length && <Notice tone="bad">{err}</Notice>}
          <Button type="submit" variant="primary" className="w-full">Create project</Button>
        </form>
      </Card>
    </div>
  );
}
