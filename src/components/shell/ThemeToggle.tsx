"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cx } from "../ui";

type Pref = "light" | "dark" | "system";
const OPTIONS: { v: Pref; label: string; Icon: typeof Sun }[] = [
  { v: "light", label: "Light theme", Icon: Sun },
  { v: "dark", label: "Dark theme", Icon: Moon },
  { v: "system", label: "Match system", Icon: Monitor },
];

function apply(p: Pref) {
  const t = p === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : p;
  document.documentElement.dataset.theme = t;
  document.documentElement.dataset.themePref = p;
  window.dispatchEvent(new Event("moonnav-theme"));
}

/** Segmented light / dark / system control. Preference persists per browser. */
export function ThemeToggle({ className }: { className?: string }) {
  // Server renders "light"; after hydration the stored preference is read from <html data-theme-pref>.
  const pref = useSyncExternalStore(
    (cb) => {
      window.addEventListener("moonnav-theme", cb);
      return () => window.removeEventListener("moonnav-theme", cb);
    },
    () => ((document.documentElement.dataset.themePref as Pref) ?? "light"),
    () => "light" as Pref,
  );
  useEffect(() => {
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);
  return (
    <div role="radiogroup" aria-label="Colour theme" className={cx("inline-flex items-center rounded-md border border-line bg-panel p-0.5", className)}>
      {OPTIONS.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={pref === v}
          aria-label={label}
          title={label}
          suppressHydrationWarning
          onClick={() => {
            try {
              localStorage.setItem("moonnav-theme", v);
            } catch {}
            apply(v);
          }}
          className={cx("grid h-7 w-7 place-items-center rounded transition-colors", pref === v ? "bg-panel-3 text-text" : "text-muted hover:text-text")}
        >
          <Icon size={14} strokeWidth={1.75} />
        </button>
      ))}
    </div>
  );
}

/** Subscribe to theme changes (for canvas renderers that read CSS variables). */
export function useThemeVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const on = () => setV((x) => x + 1);
    window.addEventListener("moonnav-theme", on);
    const mo = new MutationObserver(on);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      window.removeEventListener("moonnav-theme", on);
      mo.disconnect();
    };
  }, []);
  return v;
}
