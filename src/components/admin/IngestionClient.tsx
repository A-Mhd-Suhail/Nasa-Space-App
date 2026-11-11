"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../workspace/api";
import { Button, Card, CardHeader, StatusBadge } from "../ui";

export type IngestionRun = {
  id: string;
  dataProductId: string;
  status: string;
  steps: { step: string; ok: boolean; detail: string; at: string }[];
  error: string | null;
  productId: string;
  release: string;
  kind: string;
  coverage: string | null;
  sha256: string | null;
  createdAt: string;
  finishedAt: string | null;
};

const STAGE_LABELS: Record<string, string> = {
  discovered: "Discovered in registry",
  fetching_label: "Fetching PDS label",
  label_parsed: "Label parsed",
  downloading: "Downloading product",
  downloaded: "Downloaded",
  checksum_verified: "Checksum verified",
  validated: "Validated",
  failed: "Failed",
};

export function IngestionClient({ runs }: { runs: IngestionRun[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(runs[0]?.id ?? null);

  return (
    <div className="space-y-4">
      {runs.length === 0 && (
        <Card>
          <CardHeader title="No ingestion runs yet" subtitle="Trigger a run from Administration → Data products, or by POSTing to /api/v1/admin/products/[id]/ingest." />
        </Card>
      )}
      {runs.map((r) => {
        const isOpen = open === r.id;
        const okSteps = r.steps.filter((s) => s.ok).length;
        return (
          <Card key={r.id}>
            <CardHeader
              title={<button type="button" className="text-left" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
                <span className="num">{r.productId}</span> <span className="text-muted">· {r.release}</span>
              </button>}
              subtitle={`${r.kind} · ${r.coverage ?? "no coverage"} · ${okSteps}/${r.steps.length} stages ok`}
              tag={<StatusBadge status={r.status === "succeeded" ? "completed" : r.status} />}
              actions={<span className="num text-xs text-muted">{r.createdAt.slice(0, 19).replace("T", " ")}</span>}
            />
            {isOpen && (
              <ol className="divide-y divide-line text-sm">
                {r.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <span aria-hidden className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${s.ok ? "bg-ok" : "bg-bad"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{STAGE_LABELS[s.step] ?? s.step}</span>
                        <span className="num text-xs text-muted">{s.at.slice(0, 19).replace("T", " ")}</span>
                      </div>
                      <p className="text-text-2">{s.detail}</p>
                    </div>
                  </li>
                ))}
                {r.error && <li className="px-4 py-2.5 text-bad">Error: {r.error}</li>}
                {r.sha256 && <li className="num px-4 py-2 text-xs text-muted">Product SHA-256 {r.sha256}</li>}
              </ol>
            )}
          </Card>
        );
      })}
      <Button s="sm" variant="ghost" onClick={() => router.refresh()}>Refresh</Button>
    </div>
  );
}

/** Compact trigger used inside the data-products page. */
export function IngestButton({ productId, label }: { productId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      {err && <span className="text-xs text-bad">{err}</span>}
      <Button
        s="sm"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setErr(null);
          setBusy(true);
          try {
            await api<{ run: { id: string; status: string } }>(`/api/v1/admin/products/${productId}/ingest`, { method: "POST" });
            router.refresh();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Running…" : label}
      </Button>
    </>
  );
}
