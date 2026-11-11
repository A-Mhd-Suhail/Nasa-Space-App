"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../workspace/api";
import { Button, Card, Notice, Select, StatusBadge } from "../ui";

type J = { id: string; scenario: string; status: string; attempts: number; maxAttempts: number; workerId: string | null; error: Record<string, unknown> | null; createdAt: string; finishedAt: string | null; log: { at: string; msg: string }[] };

export function JobsClient({ jobs, canRetry, status }: { jobs: J[]; canRetry: boolean; status: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-text-2">Filter
        <Select value={status} onChange={(e) => router.push(`/admin/jobs${e.target.value ? `?status=${e.target.value}` : ""}`)} className="w-48"><option value="">All</option>{["queued", "running", "completed", "failed", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}</Select>
      </label>
      {msg && <Notice tone="bad">{msg}</Notice>}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted"><tr>{["Job", "Scenario", "Status", "Attempts", "Worker", "Created", "Actions"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-line align-top">
                  <td className="num px-3 py-2 text-xs">{j.id.slice(0, 16)}…<details><summary className="cursor-pointer text-muted">log</summary><ul className="mt-1 space-y-0.5 text-[11px] text-text-2">{j.log.map((l, i) => <li key={i}>{l.at.slice(11, 19)} {l.msg}</li>)}</ul></details></td>
                  <td className="px-3 py-2">{j.scenario}</td>
                  <td className="px-3 py-2"><StatusBadge status={j.status} />{j.error ? <div className="mt-1 text-xs text-bad">{String(j.error.code)}: {String(j.error.message ?? "")}</div> : null}</td>
                  <td className="num px-3 py-2">{j.attempts}/{j.maxAttempts}</td>
                  <td className="px-3 py-2 text-xs text-muted">{j.workerId ?? "—"}</td>
                  <td className="num px-3 py-2 text-xs">{j.createdAt.slice(0, 19).replace("T", " ")}</td>
                  <td className="px-3 py-2">
                    {["failed", "cancelled"].includes(j.status) && canRetry && <Button s="sm" onClick={async () => { try { await api(`/api/v1/admin/jobs/${j.id}/retry`, { method: "POST" }); router.refresh(); } catch (e) { setMsg((e as Error).message); } }}>Retry</Button>}
                    {["queued", "running"].includes(j.status) && <Button s="sm" variant="danger" onClick={async () => { try { await api(`/api/v1/jobs/${j.id}`, { method: "DELETE" }); router.refresh(); } catch (e) { setMsg((e as Error).message); } }}>Cancel</Button>}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">No jobs.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
