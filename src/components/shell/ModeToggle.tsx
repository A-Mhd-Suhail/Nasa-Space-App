"use client";
import { GraduationCap, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cx } from "../ui";

/**
 * Global Simple / Advanced display mode.
 * The value lives on <html data-mode> (set before first paint by the boot script in the root
 * layout) and in localStorage. CSS hides `.adv-only` in Simple mode and `.simple-only` in Advanced
 * mode, so switching never reloads the page or loses scenario state.
 */
export type Mode = "simple" | "advanced";
const KEY = "moonnav-mode";
const EVT = "moonnav-mode-change";

function read(): Mode {
  if (typeof document === "undefined") return "simple";
  return document.documentElement.dataset.mode === "advanced" ? "advanced" : "simple";
}
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function setMode(m: Mode, syncProfile = false) {
  document.documentElement.dataset.mode = m;
  try {
    localStorage.setItem(KEY, m);
  } catch {}
  window.dispatchEvent(new Event(EVT));
  if (syncProfile) {
    // Best effort: remember the preference on the account too (learn = Simple, planning = Advanced).
    fetch("/api/v1/me/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferredMode: m }) }).catch(() => {});
  }
}

export function useMode(): Mode {
  return useSyncExternalStore(subscribe, read, () => "simple");
}

export function ModeToggle({ signedIn = false, className, compact = false }: { signedIn?: boolean; className?: string; compact?: boolean }) {
  const mode = useMode();
  const [toast, setToast] = useState<Mode | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);
  const opts: [Mode, string, typeof GraduationCap, string][] = [
    ["simple", "Simple", GraduationCap, "Plain-language results for students and the public"],
    ["advanced", "Advanced", SlidersHorizontal, "Full numeric detail, frames, provenance and uncertainty"],
  ];
  return (
    <div role="radiogroup" aria-label="Display mode" className={cx("flex rounded-[6px] border border-line-2 bg-panel p-0.5 text-[12px]", className)} data-testid="mode-toggle">
      {opts.map(([m, label, Icon, title]) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          title={title}
          aria-label={label}
          onClick={() => {
            if (m !== mode) setToast(m);
            setMode(m, signedIn);
          }}
          className={cx("flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 transition-colors", mode === m ? "bg-accent text-accent-ink" : "text-text-2 hover:bg-panel-3/60 hover:text-text")}
        >
          <Icon size={13} aria-hidden />
          <span className={compact ? "hidden xl:inline" : undefined}>{label}</span>
        </button>
      ))}
      {toast && (
        <div role="status" className="fixed bottom-4 left-1/2 z-[60] w-[min(92vw,30rem)] -translate-x-1/2 rounded-[6px] border border-line-2 bg-panel px-4 py-2.5 text-center text-[13px] text-text shadow-[var(--shadow-sheet)]" data-testid="mode-toast">
          {toast === "simple" ? "Simple mode: plain-language explanations; technical details are hidden." : "Advanced mode: full numbers, reference frames, data provenance and method details are shown."}
        </div>
      )}
    </div>
  );
}

/** Content shown only in one mode (CSS-driven, so it is present in the DOM for printing/search). */
export function AdvancedOnly({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("adv-only", className)}>{children}</div>;
}
export function SimpleOnly({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("simple-only", className)}>{children}</div>;
}
