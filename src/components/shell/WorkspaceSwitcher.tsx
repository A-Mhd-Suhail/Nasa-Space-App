"use client";
import { Check, ChevronsUpDown, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx } from "../ui";

type W = { id: string; name: string; role: string; personal: boolean };

export function WorkspaceSwitcher({ workspaces, currentId }: { workspaces: W[]; currentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const current = workspaces.find((w) => w.id === currentId) ?? workspaces[0];
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const switchTo = async (id: string) => {
    await fetch(`/api/v1/workspaces/${id}/switch`, { method: "POST" });
    setOpen(false);
    router.refresh();
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} className="flex max-w-[260px] items-center gap-2 rounded-[5px] px-2 py-1.5 text-left hover:bg-panel-3/60">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[4px] bg-accent-soft font-display text-[13px] text-accent">{current?.name.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium leading-tight text-text">{current?.name}</span>
          <span className="block text-[11px] capitalize leading-tight text-muted">{current?.personal ? "Personal" : "Shared"} · {current?.role}</span>
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-2 w-72 overflow-hidden rounded-[6px] border border-line bg-panel shadow-[var(--shadow-float)]">
          <div className="px-3 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Workspaces</div>
          <ul role="listbox" aria-label="Workspaces" className="max-h-64 overflow-auto px-1.5 pb-1.5">
            {workspaces.map((w) => (
              <li key={w.id} role="option" aria-selected={w.id === currentId}>
                <button type="button" onClick={() => switchTo(w.id)} className={cx("flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-left text-sm hover:bg-panel-3/70", w.id === currentId && "bg-panel-2")}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{w.name}</span>
                    <span className="block text-[11px] capitalize text-muted">{w.personal ? "Personal" : "Shared"} · {w.role}</span>
                  </span>
                  {w.id === currentId && <Check size={15} className="text-accent" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line p-1.5">
            {creating ? (
              <form
                className="flex gap-1.5 p-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setErr(null);
                  const r = await fetch("/api/v1/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
                  const d = await r.json();
                  if (!r.ok) return setErr(d?.error?.message ?? "Could not create workspace");
                  setName("");
                  setCreating(false);
                  await switchTo(d.workspace.id);
                }}
              >
                <label htmlFor="ws-new" className="sr-only">New workspace name</label>
                <input id="ws-new" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Workspace name" className="h-8 min-w-0 flex-1 rounded-[4px] border border-line-2 bg-panel px-2 text-sm" />
                <button type="submit" disabled={!name.trim()} className="h-8 rounded-[4px] bg-accent px-3 text-[13px] text-accent-ink disabled:opacity-45">Create</button>
              </form>
            ) : (
              <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-sm text-text-2 hover:bg-panel-3/70 hover:text-text">
                <Plus size={15} /> New shared workspace
              </button>
            )}
            {err && <p className="px-2 pb-1 text-xs text-bad" role="alert">{err}</p>}
            <Link href="/app/workspaces" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-[4px] px-2 py-2 text-sm text-text-2 hover:bg-panel-3/70 hover:text-text">
              <Settings2 size={15} /> Manage workspaces & members
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
