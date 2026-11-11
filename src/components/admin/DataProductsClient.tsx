"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../workspace/api";
import { Button, Card, CardHeader, Input, Notice, StatusBadge } from "../ui";
import { IngestButton } from "./IngestionClient";

type P = { id: string; kind: string; productId: string; release: string; status: string; statusReason: string | null; sha256: string | null; coverage: string | null; provider: string; approvedAt: string | null; sourceUrl: string | null };
const NEXT: Record<string, string[]> = { discovered: ["validated", "blocked", "failed"], downloaded: ["validated", "blocked", "failed"], validated: ["approved", "blocked", "failed"], approved: ["deprecated"], failed: ["validated"], blocked: ["validated"], deprecated: [], processing: ["failed"] };

export function DataProductsClient({ products, runs }: { products: P[]; runs: { id: string; dataProductId: string; status: string; steps: { step: string; detail: string; at: string }[]; createdAt: string }[] }) {
  const router = useRouter();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; t: string } | null>(null);
  return (
    <div className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.t}</Notice>}
      {products.map((p) => (
        <Card key={p.id}>
          <CardHeader title={<>{p.productId} <span className="text-muted">· {p.release}</span></>} subtitle={`${p.kind} · ${p.provider} · ${p.coverage ?? ""}`} tag={<StatusBadge status={p.status} />} />
          <div className="space-y-2 px-4 py-3 text-sm">
            <p className="text-text-2">{p.statusReason}</p>
            {p.sha256 && <p className="num text-xs text-muted">sha256 {p.sha256}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <IngestButton productId={p.id} label="Trigger ingestion run" />
              <a href={`/admin/ingestion`} className="text-xs text-accent hover:underline">View all runs →</a>
            </div>
            {(NEXT[p.status] ?? []).length > 0 && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 text-xs text-muted">Reason (required, audited)
                  <Input value={reason[p.id] ?? ""} onChange={(e) => setReason({ ...reason, [p.id]: e.target.value })} placeholder="e.g. label + checksum verified" />
                </label>
                {NEXT[p.status].map((s) => (
                  <Button key={s} s="sm" variant={s === "approved" ? "primary" : s === "deprecated" || s === "blocked" || s === "failed" ? "danger" : "secondary"} onClick={async () => {
                    try {
                      await api(`/api/v1/admin/products/${p.id}/status`, { method: "PATCH", body: { status: s, reason: reason[p.id] ?? "" } });
                      setMsg({ tone: "ok", t: `${p.productId}: ${p.status} → ${s}` });
                      router.refresh();
                    } catch (e) {
                      setMsg({ tone: "bad", t: (e as Error).message });
                    }
                  }}>Mark {s}</Button>
                ))}
              </div>
            )}
          </div>
        </Card>
      ))}
      <Card>
        <CardHeader title="Ingestion / validation runs" subtitle={<a href="/admin/ingestion" className="text-accent hover:underline">Open full ingestion dashboard →</a>} />
        <ul className="divide-y divide-line text-sm">{runs.length === 0 ? <li className="px-4 py-3 text-muted">No runs recorded yet. Trigger one with the “Trigger ingestion run” button above, or from /admin/ingestion.</li> : runs.map((r) => <li key={r.id} className="num px-4 py-2"><StatusBadge status={r.status === "succeeded" ? "completed" : r.status} /> {r.dataProductId} · {r.steps.map((s) => s.step).join(", ")} <span className="text-xs text-muted">{r.createdAt.slice(0, 19).replace("T", " ")}</span></li>)}</ul>
      </Card>
    </div>
  );
}
