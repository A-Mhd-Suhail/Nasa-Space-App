"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, CardHeader, Field, Notice, Select, Textarea } from "../ui";
import { api } from "./api";

export type Annotation = {
  id: string;
  analysisId: string;
  body: string;
  kind: string;
  anchor: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorRole: string;
};

const KIND_LABELS: Record<string, string> = {
  note: "Note",
  concern: "Concern",
  approval: "Approval",
  correction: "Correction",
};

const KIND_TONE: Record<string, string> = {
  note: "text-text-2 border-line-2",
  concern: "text-warn border-warn/45",
  approval: "text-ok border-ok/45",
  correction: "text-bad border-bad/45",
};

export function AnnotationsPanel({ analysisId, canAnnotate, me }: { analysisId: string; canAnnotate: boolean; me: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("note");
  const [anchor, setAnchor] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const list = useQuery<{ annotations: Annotation[] }>({
    queryKey: ["annotations", analysisId],
    queryFn: () => api(`/api/v1/analyses/${analysisId}/annotations`),
  });

  const create = useMutation({
    mutationFn: () => api(`/api/v1/analyses/${analysisId}/annotations`, { method: "POST", body: { body, kind, anchor: anchor || undefined } }),
    onSuccess: () => {
      setBody(""); setAnchor(""); setErr(null);
      qc.invalidateQueries({ queryKey: ["annotations", analysisId] });
    },
    onError: (e) => setErr((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/annotations/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["annotations", analysisId] }),
    onError: (e) => setErr((e as Error).message),
  });

  const annotations = list.data?.annotations ?? [];

  return (
    <Card>
      <CardHeader title="Analyst annotations" subtitle={canAnnotate ? "Add notes, concerns, approvals or corrections. Visible to all workspace members." : "Visible to all workspace members. The analyst role is required to annotate."} />
      {err && <div className="px-5 pt-3"><Notice tone="bad">{err}</Notice></div>}
      {canAnnotate && (
        <form className="space-y-3 border-b border-line p-5" onSubmit={(e) => { e.preventDefault(); if (body.trim()) create.mutate(); }}>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Kind" htmlFor="annkind"><Select id="annkind" value={kind} onChange={(e) => setKind(e.target.value)} className="w-40"><option value="note">Note</option><option value="concern">Concern</option><option value="approval">Approval</option><option value="correction">Correction</option></Select></Field>
            <Field label="Anchor (optional)" htmlFor="annanchor" hint="e.g. sun.intervals[3]"><input id="annanchor" value={anchor} onChange={(e) => setAnchor(e.target.value)} maxLength={200} className="h-9 w-48 rounded-[5px] border border-line-2 bg-panel px-3 text-sm" placeholder="sun.intervals[3]" /></Field>
          </div>
          <Field label="Annotation" htmlFor="annbody"><Textarea id="annbody" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={4000} placeholder="Document a finding, flag a concern, or record a review decision…" /></Field>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{body.length}/4000</span>
            <Button type="submit" variant="primary" s="sm" disabled={!body.trim() || create.isPending}>{create.isPending ? "Saving…" : "Add annotation"}</Button>
          </div>
        </form>
      )}
      <ul className="divide-y divide-line">
        {annotations.length === 0 ? (
          <li className="px-5 py-6 text-sm text-muted">No annotations yet.</li>
        ) : annotations.map((a) => (
          <li key={a.id} className="px-5 py-4 text-sm">
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`rounded-[3px] border px-1.5 py-0.5 text-[11px] font-medium ${KIND_TONE[a.kind] ?? KIND_TONE.note}`}>{KIND_LABELS[a.kind] ?? a.kind}</span>
                {a.anchor && <span className="num text-xs text-muted">{a.anchor}</span>}
              </div>
              <span className="text-xs text-muted">{a.authorName} · {a.authorRole} · {new Date(a.createdAt).toLocaleString()}{a.updatedAt !== a.createdAt ? " (edited)" : ""}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-text-2">{a.body}</p>
            {(a.createdBy === me || canAnnotate) && (
              <div className="mt-2">
                <Button s="sm" variant="ghost" onClick={() => { if (confirm("Delete this annotation?")) remove.mutate(a.id); }}>Delete</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
