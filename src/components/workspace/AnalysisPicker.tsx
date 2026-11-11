"use client";
import { useRouter } from "next/navigation";
import { Select } from "../ui";

export type PickItem = { id: string; label: string };

export function AnalysisPicker({ items, value, basePath }: { items: PickItem[]; value: string | null; basePath: string }) {
  const router = useRouter();
  return (
    <label className="flex w-full min-w-0 flex-wrap items-center gap-2 text-sm text-text-2 sm:w-auto">
      <span className="shrink-0">Analysis</span>
      <Select value={value ?? ""} onChange={(e) => router.push(`${basePath}?analysisId=${e.target.value}`)} className="min-w-0 flex-1 sm:w-auto sm:min-w-72">
        {!value && <option value="">Select a completed analysis…</option>}
        {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
      </Select>
    </label>
  );
}
