"use client";
import {
  BookOpen, ChartSpline, Crosshair, Database, FileText, FolderKanban, Gauge, GitCompareArrows, Globe2, LayoutDashboard, ListChecks, Map, Menu,
  Mountain, PanelLeftClose, PanelLeftOpen, Plus, ScrollText, ShieldCheck, Sun, Users, UsersRound, X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "../ui";
import { ModeToggle } from "./ModeToggle";
import { ThemeToggle } from "./ThemeToggle";

type Item = { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; match?: string };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "Plan",
    items: [
      { href: "/app", label: "Overview", icon: LayoutDashboard, match: "^/app$" },
      { href: "/app/projects", label: "Projects", icon: FolderKanban },
      { href: "/app/scenarios/new", label: "Scenario Builder", icon: Plus },
      { href: "/app/workspaces", label: "Workspaces", icon: UsersRound },
    ],
  },
  {
    title: "Analyse",
    items: [
      { href: "/app/explorer", label: "Site Explorer", icon: Map },
      { href: "/app/sites/mons-malapert", label: "Site Detail & 3D", icon: Mountain, match: "^/app/sites" },
      { href: "/app/analysis/sun", label: "Sun & Power", icon: Sun },
      { href: "/app/analysis/earth", label: "Earth & DTE", icon: Globe2 },
      { href: "/app/planner", label: "Mission Planner", icon: Crosshair },
      { href: "/app/compare", label: "Compare", icon: GitCompareArrows },
      { href: "/app/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    title: "Reference",
    items: [
      { href: "/learn", label: "Learn", icon: BookOpen },
      { href: "/methodology", label: "Methodology", icon: ChartSpline },
      { href: "/sources", label: "Data sources", icon: ScrollText },
    ],
  },
];
const ADMIN: Item[] = [
  { href: "/admin", label: "Operations", icon: Gauge, match: "^/admin$" },
  { href: "/admin/data", label: "Data products", icon: Database },
  { href: "/admin/ingestion", label: "Ingestion", icon: ListChecks, match: "^/admin/ingestion" },
  { href: "/admin/jobs", label: "Jobs", icon: ListChecks },
  { href: "/admin/users", label: "Users & roles", icon: Users },
  { href: "/admin/workspaces", label: "Workspaces", icon: UsersRound },
  { href: "/admin/audit", label: "Audit log", icon: ShieldCheck },
];

function groupsFor(role: string): Group[] {
  const admin = role === "admin" ? ADMIN : role === "curator" ? ADMIN.filter((a) => ["/admin", "/admin/data", "/admin/ingestion", "/admin/jobs"].includes(a.href)) : [];
  return admin.length ? [...GROUPS, { title: "Administration", items: admin }] : GROUPS;
}

function NavGroups({ role, collapsed, onNav }: { role: string; collapsed?: boolean; onNav?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Workspace" className="space-y-5 px-2.5 py-4">
      {groupsFor(role).map((g) => (
        <div key={g.title}>
          {collapsed ? <div aria-hidden className="mx-2 mb-2 h-px bg-line" /> : <div className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{g.title}</div>}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = it.match ? new RegExp(it.match).test(path) : path === it.href || path.startsWith(`${it.href}/`);
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNav}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? it.label : undefined}
                    title={collapsed ? it.label : undefined}
                    className={cx(
                      "group relative flex items-center gap-2.5 rounded-[5px] px-2.5 py-[7px] text-[14px] transition-colors",
                      collapsed && "justify-center px-0",
                      active ? "bg-panel text-text shadow-[var(--shadow-sheet)]" : "text-text-2 hover:bg-panel-3/60 hover:text-text",
                    )}
                  >
                    {active && <span aria-hidden className="absolute -left-2.5 top-1.5 bottom-1.5 w-[2px] rounded-full bg-accent" />}
                    <Icon size={16} strokeWidth={1.75} className={cx("shrink-0", active ? "text-accent" : "text-muted group-hover:text-text-2")} />
                    {!collapsed && it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppSidebar({ role }: { role: string }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("moonnav-rail") === "collapsed") setCollapsed(true); // eslint-disable-line react-hooks/set-state-in-effect -- read persisted preference after hydration
    } catch {}
  }, []);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("moonnav-rail", next ? "collapsed" : "open");
    } catch {}
  };
  return (
    <aside className={cx("sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-line bg-bg-2/70 transition-[width] duration-200 lg:flex", collapsed ? "w-[64px]" : "w-[232px]")}>
      <div className="flex-1 overflow-y-auto">
        <NavGroups role={role} collapsed={collapsed} />
      </div>
      <div className="border-t border-line p-2.5">
        <button type="button" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} className={cx("flex w-full items-center gap-2 rounded-[5px] px-2.5 py-2 text-[13px] text-muted hover:bg-panel-3/60 hover:text-text", collapsed && "justify-center px-0")}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}

export function MobileAppNav({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="lg:hidden">
      <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open} className="grid h-10 w-10 place-items-center rounded-md border border-line-2 bg-panel text-text">
        <Menu size={18} />
      </button>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} type="button" aria-label="Close navigation" className="absolute inset-0 bg-[rgb(28_26_23/0.45)]" onClick={() => setOpen(false)} />
            <motion.div initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }} transition={{ duration: 0.25 }} className="absolute inset-y-0 left-0 flex w-[290px] max-w-[86vw] flex-col overflow-y-auto border-r border-line bg-bg">
              <div className="flex h-14 items-center justify-between border-b border-line px-4">
                <span className="font-display text-lg">Navigation</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="grid h-10 w-10 place-items-center rounded-md text-text-2 hover:bg-panel-3">
                  <X size={18} />
                </button>
              </div>
              <NavGroups role={role} onNav={() => setOpen(false)} />
              <div className="mt-auto flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">Mode <ModeToggle signedIn /></div>
              <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">Theme <ThemeToggle /></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
