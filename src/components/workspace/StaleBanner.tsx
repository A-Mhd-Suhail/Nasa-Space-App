"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Staleness } from "@/lib/staleness-core";
import { Button, Notice } from "../ui";
import { api } from "./api";

/**
 * Shows whether a stored result was computed with the versions the science service runs now.
 * A stale result stays readable (historical provenance); re-running creates a new analysis.
 */
export function StaleBanner({ analysisId, canRerun = true }: { analysisId: string; canRerun?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery<{ staleness: Staleness | null }>({ queryKey: ["staleness", analysisId], queryFn: () => api(`/api/v1/analyses/${analysisId}`), staleTime: 60_000 });
  const st = q.data?.staleness;
  if (!st || st.state === "current") return null;
  if (st.state === "unverified") {
    return <Notice title="Version check unavailable">{st.message} The stored result and its provenance are shown unchanged.</Notice>;
  }
  const rerun = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ analysisId: string }>(`/api/v1/analyses/${analysisId}/rerun`, { method: "POST" });
      router.push(`/app/analyses/${r.analysisId}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Notice tone="warn" title="Stale result — computed with older scientific inputs">
      <div className="space-y-2">
        <p>This analysis is kept as a historical record. Values may differ if it is computed again with the current versions:</p>
        <ul className="num space-y-0.5 text-xs" data-testid="stale-reasons">
          {st.reasons.map((r) => (
            <li key={r.field}>
              <span className="font-sans font-medium">{r.label}</span>: {r.stored ?? "—"} → {r.current ?? "—"}
            </li>
          ))}
        </ul>
        {canRerun && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button s="sm" variant="primary" onClick={rerun} disabled={busy}>{busy ? "Queuing…" : "Re-run with current versions"}</Button>
            <span className="text-xs text-muted">Creates a new analysis; this one is not changed.</span>
          </div>
        )}
        {err && <p role="alert" className="text-xs text-bad">{err}</p>}
      </div>
    </Notice>
  );
}
