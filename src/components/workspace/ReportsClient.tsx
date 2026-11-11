"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardHeader, EmptyState, Field, Notice, Select } from "../ui";
import { api } from "./api";

type R = { id: string; format: string; version: number; bytes: number; sha256: string; createdAt: string; analysisId: string; scenario: string };
type Share = { id: string; expiresAt: string; revokedAt: string | null; accessCount: number; createdAt: string };

function ShareManager({ reportId }: { reportId: string }) {
  const [links, setLinks] = useState<Share[] | null>(null);
  const [now, setNow] = useState(0);
  const [fresh, setFresh] = useState<string | null>(null);
  const [hours, setHours] = useState(72);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    setLinks((await api<{ shareLinks: Share[] }>(`/api/v1/reports/${reportId}/share-links`)).shareLinks);
    setNow(Date.now());
  };
  return (
    <div className="space-y-2 rounded-md border border-line bg-panel-2 p-3 text-sm">
      {links === null ? <Button s="sm" onClick={load}>Manage share links</Button> : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted">Expires in
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="ml-2 h-8 rounded border border-line-2 bg-panel px-2 text-xs text-text">{[[24, "1 day"], [72, "3 days"], [168, "7 days"], [720, "30 days"]].map(([h, l]) => <option key={h} value={h}>{l}</option>)}</select>
            </label>
            <Button s="sm" variant="primary" onClick={async () => { try { const r = await api<{ url: string }>(`/api/v1/reports/${reportId}/share-links`, { method: "POST", body: { expiresInHours: hours } }); setFresh(r.url); await load(); } catch (e) { setErr((e as Error).message); } }}>Create read-only link</Button>
          </div>
          {fresh && (
            <div className="rounded border border-ok/40 bg-ok-soft p-2 text-xs">
              <div className="mb-1 font-medium">Copy this link now — it is shown once.</div>
              <div className="flex gap-2"><input readOnly value={fresh} aria-label="Share link" className="num h-8 flex-1 rounded-[4px] border border-line-2 bg-panel px-2" onFocus={(e) => e.currentTarget.select()} /><Button s="sm" onClick={() => navigator.clipboard?.writeText(fresh)}>Copy</Button></div>
            </div>
          )}
          {err && <Notice tone="bad">{err}</Notice>}
          <ul className="divide-y divide-line text-xs">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="num text-text-2">created {l.createdAt.slice(0, 16).replace("T", " ")} · expires {l.expiresAt.slice(0, 16).replace("T", " ")} · {l.accessCount} views</span>
                {l.revokedAt ? <span className="text-muted">revoked</span> : Date.parse(l.expiresAt) < now ? <span className="text-muted">expired</span> : <Button s="sm" variant="danger" onClick={async () => { await api(`/api/v1/share-links/${l.id}`, { method: "DELETE" }); await load(); }}>Revoke</Button>}
              </li>
            ))}
            {links.length === 0 && <li className="py-1.5 text-muted">No share links.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

export function ReportsClient({ analyses, reports, initialAnalysis }: { analyses: { id: string; label: string }[]; reports: R[]; initialAnalysis: string | null }) {
  const router = useRouter();
  const [analysisId, setAnalysisId] = useState(initialAnalysis ?? analyses[0]?.id ?? "");
  const [format, setFormat] = useState<"pdf" | "csv" | "json">("pdf");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const download = async (id: string) => {
    const { url } = await api<{ url: string }>("/api/v1/storage/presign-download", { method: "POST", body: { reportId: id } });
    window.location.assign(url);
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader title="Generated reports" />
        {reports.length === 0 ? <div className="p-4"><EmptyState title="No reports yet">Generate one from a completed analysis.</EmptyState></div> : (
          <ul className="divide-y divide-line">
            {reports.map((r) => (
              <li key={r.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium"><span className="mr-2 rounded bg-panel-3 px-1.5 py-0.5 text-xs uppercase">{r.format}</span>{r.scenario} <span className="text-muted">· v{r.version}</span></div>
                    <div className="num text-xs text-muted">{r.createdAt.slice(0, 16).replace("T", " ")} UTC · {(r.bytes / 1024).toFixed(1)} KB · sha256 {r.sha256.slice(0, 12)}…</div>
                  </div>
                  <Button s="sm" variant="primary" onClick={() => download(r.id)}>Download</Button>
                </div>
                <ShareManager reportId={r.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Generate a report" />
        {analyses.length === 0 ? <p className="p-4 text-sm text-muted">No completed analyses yet.</p> : (
          <form className="space-y-3 p-4" onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              await api("/api/v1/reports", { method: "POST", body: { analysisId, format } });
              router.refresh();
            } catch (e2) {
              setErr((e2 as Error).message);
            }
            setBusy(false);
          }}>
            <Field label="Analysis" htmlFor="ra"><Select id="ra" value={analysisId} onChange={(e) => setAnalysisId(e.target.value)}>{analyses.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></Field>
            <Field label="Format" htmlFor="rf"><Select id="rf" value={format} onChange={(e) => setFormat(e.target.value as "pdf")}><option value="pdf">PDF mission brief</option><option value="csv">CSV time series</option><option value="json">JSON (machine-readable)</option></Select></Field>
            {err && <Notice tone="bad">{err}</Notice>}
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>{busy ? "Generating…" : "Generate"}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
