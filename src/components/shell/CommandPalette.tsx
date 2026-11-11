"use client";
import { FileText, FolderKanban, MapPin, Mountain, Search, Workflow } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx, Kbd } from "../ui";

type Hit = { key: string; group: string; label: string; detail?: string; href: string; icon: typeof Search };

const PAGES: Hit[] = [
  ["Overview", "/app"], ["Projects", "/app/projects"], ["New scenario", "/app/scenarios/new"], ["Site Explorer", "/app/explorer"], ["Sun & Power", "/app/analysis/sun"],
  ["Earth & DTE", "/app/analysis/earth"], ["Compare analyses", "/app/compare"], ["Reports & exports", "/app/reports"], ["Workspaces & members", "/app/workspaces"],
  ["Profile & preferences", "/settings/profile"], ["Security & MFA", "/settings/security"], ["Learn", "/learn"], ["Methodology", "/methodology"], ["Data sources", "/sources"],
].map(([label, href]) => ({ key: `p:${href}`, group: "Pages", label, href, icon: FileText }));

/** ⌘K / Ctrl+K command palette: pages, catalogue sites, and the current workspace's projects, scenarios and saved locations. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    returnFocus.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        returnFocus.current = document.activeElement as HTMLElement;
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const d = await r.json();
        setRemote([
          ...(d.sites ?? []).map((s: { id: string; name: string; featureType: string; latitudeDeg: number }) => ({ key: `s:${s.id}`, group: "Sites", label: s.name, detail: `${s.featureType} · ${Math.abs(s.latitudeDeg).toFixed(2)}°S`, href: `/app/sites/${s.id}`, icon: Mountain })),
          ...(d.projects ?? []).map((p: { id: string; name: string; status: string }) => ({ key: `pr:${p.id}`, group: "Projects", label: p.name, detail: p.status, href: `/app/projects/${p.id}`, icon: FolderKanban })),
          ...(d.scenarios ?? []).map((s: { id: string; name: string; version: number; projectId: string }) => ({ key: `sc:${s.id}`, group: "Scenarios", label: `${s.name} v${s.version}`, href: `/app/projects/${s.projectId}`, icon: Workflow })),
          ...(d.locations ?? []).map((l: { id: string; name: string; latitudeDeg: number; longitudeEastDeg: number }) => ({ key: `l:${l.id}`, group: "Saved locations", label: l.name, detail: `${Math.abs(l.latitudeDeg).toFixed(3)}°S ${l.longitudeEastDeg.toFixed(3)}°E`, href: `/app/scenarios/new?lat=${l.latitudeDeg}&lon=${l.longitudeEastDeg}`, icon: MapPin })),
        ]);
      } catch {}
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const hits = useMemo(() => {
    const t = q.toLowerCase();
    return [...PAGES.filter((p) => !t || p.label.toLowerCase().includes(t)), ...remote];
  }, [q, remote]);
  const idx = Math.min(active, Math.max(0, hits.length - 1));

  const go = (h: Hit) => {
    setOpen(false);
    setQ("");
    router.push(h.href);
  };

  return (
    <>
      <button type="button" onClick={() => { returnFocus.current = document.activeElement as HTMLElement; setOpen(true); }} className="flex h-9 items-center gap-2 rounded-[5px] border border-line-2 bg-panel px-2.5 text-[13px] text-muted hover:text-text sm:w-56" aria-label="Search (Command K)">
        <Search size={15} />
        <span className="hidden sm:inline">Search MoonNav…</span>
        <span className="ml-auto hidden sm:inline"><Kbd>⌘K</Kbd></span>
      </button>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
            <motion.button type="button" aria-label="Close search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[rgb(28_26_23/0.4)]" onClick={close} />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.99 }}
              transition={{ duration: 0.2 }}
              onAnimationComplete={() => input.current?.focus()}
              className="relative w-full max-w-xl overflow-hidden rounded-[8px] border border-line bg-panel shadow-[var(--shadow-float)]"
            >
              <div className="flex items-center gap-2.5 border-b border-line px-4">
                <Search size={17} className="text-muted" aria-hidden />
                <input
                  ref={input}
                  autoFocus
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setActive(0); }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") close();
                    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                    else if (e.key === "Enter" && hits[idx]) go(hits[idx]);
                    else if (e.key === "Tab") e.preventDefault();
                  }}
                  role="combobox"
                  aria-expanded
                  aria-controls="cmd-results"
                  aria-activedescendant={hits[idx] ? `cmd-${idx}` : undefined}
                  aria-label="Search pages, sites, projects, scenarios and locations"
                  placeholder="Search pages, sites, projects, scenarios…"
                  className="h-12 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted focus-visible:outline-none"
                />
                <Kbd>Esc</Kbd>
              </div>
              <ul id="cmd-results" role="listbox" className="max-h-[52vh] overflow-y-auto p-1.5">
                {hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches for “{q}”.</li>}
                {hits.map((h, i) => {
                  const Icon = h.icon;
                  const head = i === 0 || hits[i - 1].group !== h.group;
                  return (
                    <li key={h.key} role="none">
                      {head && <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{h.group}</div>}
                      <div id={`cmd-${i}`} role="option" aria-selected={i === idx} onMouseEnter={() => setActive(i)} onClick={() => go(h)} className={cx("flex cursor-pointer items-center gap-3 rounded-[5px] px-2.5 py-2 text-sm", i === idx ? "bg-accent-soft text-text" : "text-text-2")}>
                        <Icon size={15} className={i === idx ? "text-accent" : "text-muted"} aria-hidden />
                        <span className="flex-1 truncate">{h.label}</span>
                        {h.detail && <span className="truncate text-xs text-muted">{h.detail}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
