"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog";
import { api } from "../workspace/api";
import { Button, Card, Notice } from "../ui";

type R = { id: string; name: string; personal: boolean; createdAt: string; ownerEmail: string; members: number; projects: number; scenarios: number; analyses: number; activeJobs: number };

export function WorkspacesAdminClient({ rows }: { rows: R[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<R | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {msg && <Notice tone="ok">{msg}</Notice>}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs text-muted"><tr>{["Workspace", "Owner", "Members", "Projects", "Scenarios", "Analyses", "Created", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="border-t border-line" data-testid={`admin-ws-${w.id}`}>
                  <td className="px-3 py-2"><div className="font-medium">{w.name}</div><div className="text-xs text-muted">{w.personal ? "Personal field book" : "Shared workspace"}</div></td>
                  <td className="px-3 py-2 text-xs">{w.ownerEmail}</td>
                  <td className="num px-3 py-2">{w.members}</td>
                  <td className="num px-3 py-2">{w.projects}</td>
                  <td className="num px-3 py-2">{w.scenarios}</td>
                  <td className="num px-3 py-2">{w.analyses}{w.activeJobs > 0 && <span className="ml-1 text-xs text-warn">({w.activeJobs} running)</span>}</td>
                  <td className="px-3 py-2 text-xs text-muted">{w.createdAt.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-right">
                    {w.personal ? <span className="text-xs text-muted">Not deletable here</span> : <Button s="sm" variant="danger" aria-label={`Delete workspace ${w.name}`} data-testid={`admin-ws-delete-${w.id}`} disabled={w.activeJobs > 0} title={w.activeJobs > 0 ? "Analyses are still running" : undefined} onClick={() => { setErr(null); setTarget(w); }}><Trash2 size={14} /> Delete</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <ConfirmDialog open={!!target} title="Delete this workspace as administrator?" confirmLabel="Delete workspace" requireText={target?.name} askReason busy={busy} error={err} onClose={() => !busy && setTarget(null)}
        onConfirm={async ({ reason }) => {
          if (!target) return;
          setBusy(true); setErr(null);
          try {
            await api(`/api/v1/admin/workspaces/${target.id}`, { method: "DELETE", body: { confirmName: target.name, reason } });
            setMsg(`Workspace “${target.name}” deleted.`);
            setTarget(null);
            router.refresh();
          } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
        }}>
        <p><strong className="text-text">{target?.name}</strong> (owner {target?.ownerEmail}) has {target?.members} member{target?.members === 1 ? "" : "s"}, {target?.projects} project{target?.projects === 1 ? "" : "s"} and {target?.analyses} analys{target?.analyses === 1 ? "is" : "es"}. All of it will be permanently deleted.</p>
        <p>This cannot be undone. The action and your reason are written to the audit log.</p>
      </ConfirmDialog>
    </div>
  );
}
