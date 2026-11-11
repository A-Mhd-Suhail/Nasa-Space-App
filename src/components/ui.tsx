import {
  ArrowDownToLine, ChevronRight, CircleAlert, CircleCheck, CircleHelp, CircleX, Contrast, Info, Mountain, SignalLow, TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { STATE_LABEL, type BodyState } from "@/lib/analysis-types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ buttons */
type Variant = "primary" | "secondary" | "ghost" | "danger";
const btn: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink font-medium shadow-[0_1px_0_rgb(0_0_0/0.08)] hover:brightness-[1.06] active:brightness-95",
  secondary: "bg-panel text-text border border-line-2 hover:bg-panel-2 hover:border-text-2/40 active:bg-panel-3",
  ghost: "text-text-2 hover:text-text hover:bg-panel-3/70",
  danger: "bg-panel text-bad border border-bad/45 hover:bg-bad-soft",
};
const size = { sm: "h-8 px-3 text-[13px]", md: "h-9 px-4 text-sm", lg: "h-11 px-5 text-[15px]" };
const btnBase =
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-[5px] transition-[background-color,border-color,filter,color] duration-150 disabled:pointer-events-none disabled:opacity-45";

export function Button({ variant = "secondary", s = "md", className, ...p }: ComponentProps<"button"> & { variant?: Variant; s?: keyof typeof size }) {
  return <button className={cx(btnBase, btn[variant], size[s], className)} {...p} />;
}

export function LinkButton({ variant = "secondary", s = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; s?: keyof typeof size }) {
  return <Link className={cx(btnBase, btn[variant], size[s], className)} {...p} />;
}

/** Plain anchor styled as a button (downloads, API URLs, external links). */
export function AButton({ variant = "secondary", s = "md", className, ...p }: ComponentProps<"a"> & { variant?: Variant; s?: keyof typeof size }) {
  return <a className={cx(btnBase, btn[variant], size[s], className)} {...p} />;
}

/* ------------------------------------------------------------------- sheets */
export function Card({ className, ...p }: ComponentProps<"section">) {
  return <section className={cx("min-w-0 rounded-[6px] border border-line bg-panel shadow-[var(--shadow-sheet)]", className)} {...p} />;
}

export function CardHeader({ title, subtitle, actions, tag }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; tag?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 pb-3 pt-4">
      <div className="min-w-0 break-words">
        <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold leading-snug text-text">
          {title}
          {tag}
        </h2>
        {subtitle ? <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export type Crumb = { label: string; href?: string };
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-[13px] text-muted">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={13} aria-hidden className="text-line-2" />}
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="rounded px-0.5 hover:text-text hover:underline hover:underline-offset-4">{c.label}</Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined} className={i === items.length - 1 ? "text-text-2" : undefined}>{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, description, actions, crumbs }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: Crumb[] }) {
  return (
    <div className="mb-7">
      {crumbs ? <Breadcrumbs items={crumbs} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="font-display text-[clamp(1.75rem,1.2rem+1.6vw,2.5rem)] font-medium leading-[1.1] text-text">{title}</h1>
          {description ? <p className="mt-2.5 max-w-[68ch] text-[15px] leading-relaxed text-text-2">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------- provenance "sample tags" */
export type DataKind = "measured" | "calculated" | "modelled" | "illustrative" | "cached" | "precomputed" | "unavailable";
const KIND: Record<DataKind, { label: string; cls: string; title: string }> = {
  measured: { label: "Source data", cls: "text-earth border-earth/40", title: "Value read from a cited source product" },
  calculated: { label: "Calculated", cls: "text-accent border-accent/45", title: "Computed by the MoonNav engine from source data" },
  modelled: { label: "Modelled", cls: "text-sun border-sun/45", title: "Idealized model that depends on stated assumptions" },
  illustrative: { label: "Illustrative", cls: "text-muted border-line-2", title: "Explanatory graphic, not an analysis result" },
  cached: { label: "Stored result", cls: "text-text-2 border-line-2", title: "Stored, checksummed result; see its timestamp" },
  precomputed: { label: "Precomputed", cls: "text-text-2 border-line-2", title: "Precomputed demonstration with recorded generation time" },
  unavailable: { label: "Unavailable", cls: "text-unknown border-unknown/45", title: "Not available; see reason" },
};
/** A field-book sample tag: punched hole, mono caps label. Every number shows what kind of value it is. */
export function DataTag({ kind, className }: { kind: DataKind; className?: string }) {
  const k = KIND[kind];
  return (
    <span title={k.title} className={cx("inline-flex items-center gap-1.5 rounded-[3px] border bg-panel px-1.5 py-[1px] font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.06em]", k.cls, className)}>
      <span aria-hidden className="h-[5px] w-[5px] rounded-full border border-current opacity-80" />
      {k.label}
    </span>
  );
}

const STATE_CLS: Record<BodyState, string> = {
  visible: "text-ok border-ok/45 bg-ok-soft",
  partial: "text-warn border-warn/45 bg-sun-soft",
  terrain_blocked: "text-bad border-bad/40 bg-bad-soft",
  below_horizon: "text-bad border-bad/40 bg-bad-soft",
  below_antenna_mask: "text-warn border-warn/45 bg-sun-soft",
  unknown: "text-unknown border-unknown/45 bg-unknown-soft",
};
const STATE_ICON: Record<BodyState, typeof CircleCheck> = {
  visible: CircleCheck,
  partial: Contrast,
  terrain_blocked: Mountain,
  below_horizon: ArrowDownToLine,
  below_antenna_mask: SignalLow,
  unknown: CircleHelp,
};

export function StatePill({ state, className }: { state: BodyState; className?: string }) {
  const Icon = STATE_ICON[state];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-xs font-medium", STATE_CLS[state], className)}>
      <Icon size={13} strokeWidth={2} aria-hidden />
      {STATE_LABEL[state]}
    </span>
  );
}

const STATUS_CLS: Record<string, string> = {
  completed: "text-ok border-ok/45",
  approved: "text-ok border-ok/45",
  ok: "text-ok border-ok/45",
  running: "text-accent border-accent/45",
  queued: "text-text-2 border-line-2",
  failed: "text-bad border-bad/45",
  cancelled: "text-unknown border-unknown/45",
  deprecated: "text-unknown border-unknown/45",
  blocked: "text-bad border-bad/45",
  degraded: "text-warn border-warn/45",
  unavailable: "text-unknown border-unknown/45",
  active: "text-ok border-ok/45",
  archived: "text-unknown border-unknown/45",
};
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-[4px] border bg-panel px-2 py-0.5 text-xs font-medium capitalize", STATUS_CLS[status] ?? "text-text-2 border-line-2", className)}>
      <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full bg-current", status === "running" && "animate-pulse")} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* -------------------------------------------------------------- readings */
/** Small accessible info tip: a focusable button whose explanation shows on hover or focus. */
export function InfoTip({ text, label = "What does this mean?" }: { text: ReactNode; label?: string }) {
  return (
    <span className="infotip inline-flex align-middle">
      <button type="button" aria-label={label} className="grid h-4 w-4 place-items-center rounded-full text-muted hover:text-text focus-visible:text-text">
        <CircleHelp size={13} aria-hidden />
      </button>
      <span role="tooltip" className="absolute inset-x-0 top-full z-30 mt-1 rounded-[5px] border border-line-2 bg-panel p-2.5 text-[12px] font-normal normal-case leading-snug tracking-normal text-text-2 shadow-[var(--shadow-sheet)]">
        {text}
      </span>
    </span>
  );
}

export function Stat({ label, value, unit, kind, hint, accent, info }: { label: ReactNode; value: ReactNode; unit?: string; kind?: DataKind; hint?: ReactNode; accent?: "sun" | "earth" | "accent"; info?: ReactNode }) {
  const color = accent === "sun" ? "text-sun" : accent === "earth" ? "text-earth" : accent === "accent" ? "text-accent" : "text-text";
  return (
    <div className="relative min-w-0 rounded-[6px] border border-line bg-panel px-4 py-3">
      <div className="flex items-start justify-between gap-2 text-[12px] leading-tight text-muted">
        <span className="flex min-w-0 items-center gap-1"><span>{label}</span>{info ? <InfoTip text={info} /> : null}</span>
        {kind ? <DataTag kind={kind} className="shrink-0" /> : null}
      </div>
      <div className={cx("num mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.01em]", color)}>
        {value}
        {unit ? <span className="ml-1 text-[13px] font-normal text-muted">{unit}</span> : null}
      </div>
      {/* Technical hints are Advanced-mode detail; the info tip keeps the plain explanation in Simple mode. */}
      {hint ? <div className="adv-only mt-1 text-[12px] leading-snug text-muted">{hint}</div> : null}
    </div>
  );
}

const NOTICE_ICON = { info: Info, warn: TriangleAlert, bad: CircleX, ok: CircleCheck } as const;
export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "bad" | "ok"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const t = { info: "border-line bg-panel-2 text-text-2", warn: "border-warn/40 bg-sun-soft text-text", bad: "border-bad/40 bg-bad-soft text-text", ok: "border-ok/40 bg-ok-soft text-text" }[tone];
  const ic = { info: "text-muted", warn: "text-warn", bad: "text-bad", ok: "text-ok" }[tone];
  const Icon = NOTICE_ICON[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("flex gap-3 rounded-[6px] border px-4 py-3 text-sm", t, className)}>
      <Icon size={17} strokeWidth={1.9} aria-hidden className={cx("mt-0.5 shrink-0", ic)} />
      <div className="min-w-0">
        {title ? <div className="font-medium text-text">{title}</div> : null}
        {children ? <div className={cx(title ? "mt-0.5" : null, "leading-relaxed")}>{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action, icon }: { title: ReactNode; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-[6px] border border-dashed border-line-2 bg-panel-2/60 px-6 py-10 text-center">
      {icon ? <div className="mx-auto mb-3 grid h-10 w-10 place-items-center text-muted">{icon}</div> : null}
      <div className="font-display text-lg text-text">{title}</div>
      {children ? <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{children}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children, required }: { label: ReactNode; htmlFor: string; hint?: ReactNode; error?: string | null; children: ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-text">
        {label}
        {required ? <span className="ml-0.5 text-accent" aria-hidden>*</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="flex items-center gap-1.5 text-xs text-bad" role="alert">
          <CircleAlert size={13} aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs leading-relaxed text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputCls =
  "h-9 w-full rounded-[5px] border border-line-2 bg-panel px-3 text-sm text-text placeholder:text-muted transition-[border-color,box-shadow] duration-150 hover:border-text-2/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 aria-[invalid=true]:border-bad disabled:opacity-50";

export function Input(p: ComponentProps<"input">) {
  return <input {...p} className={cx(inputCls, "num", p.className)} />;
}

export function Select(p: ComponentProps<"select">) {
  return <select {...p} className={cx(inputCls, "cursor-pointer pr-8", p.className)} />;
}

export function Textarea(p: ComponentProps<"textarea">) {
  return <textarea {...p} className={cx(inputCls, "h-auto py-2 leading-relaxed", p.className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[3px] border border-line-2 bg-panel-2 px-1.5 font-mono text-[11px] text-text-2">{children}</kbd>;
}

/** Inline legend swatch for charts and 3D views (drawn, not a text glyph). */
export function Swatch({ color, shape = "dot" }: { color: string; shape?: "dot" | "line" | "dash" | "tri" }) {
  if (shape === "line") return <svg width="16" height="8" aria-hidden className="shrink-0"><line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth="2" /></svg>;
  if (shape === "dash") return <svg width="16" height="8" aria-hidden className="shrink-0"><line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth="2" strokeDasharray="4 3" /></svg>;
  if (shape === "tri") return <svg width="10" height="10" aria-hidden className="shrink-0"><path d="M5 1 9 9H1z" fill={color} /></svg>;
  return <svg width="10" height="10" aria-hidden className="shrink-0"><circle cx="5" cy="5" r="4" fill={color} /></svg>;
}

export function fmtNum(v: number | null | undefined, digits = 2, fallback = "—") {
  return v == null || !Number.isFinite(v) ? fallback : v.toFixed(digits);
}

export function fmtHours(sec: number | null | undefined) {
  if (sec == null) return "—";
  return (sec / 3600).toFixed(1);
}

export function fmtUtc(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}
