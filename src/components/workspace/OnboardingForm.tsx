"use client";
import { BookOpen, Compass, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, cx, Notice } from "../ui";
import { api } from "./api";

const MODES = [
  { k: "planning", icon: Rocket, t: "Mission planning", d: "Projects, scenarios, analyses, comparisons and reports." },
  { k: "learn", icon: BookOpen, t: "Learn", d: "The 12-step guided path with explanations and examples." },
  { k: "explore", icon: Compass, t: "Public exploration", d: "Browse the map and precomputed demonstrations first." },
] as const;

export function OnboardingForm({ name }: { name: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<(typeof MODES)[number]["k"]>("planning");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Preferred mode for {name.split(" ")[0]}</legend>
        <div className="divide-y divide-line rounded-[6px] border border-line bg-panel" role="radiogroup">
          {MODES.map(({ k, icon: I, t, d }) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={cx("flex w-full items-center gap-4 px-5 py-4 text-left transition-colors", mode === k ? "bg-accent-soft" : "hover:bg-panel-2")}>
              <span aria-hidden className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.75px]", mode === k ? "border-accent" : "border-line-2")}>
                {mode === k && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-display text-[19px]"><I size={17} strokeWidth={1.75} className={mode === k ? "text-accent" : "text-muted"} />{t}</span>
                <span className="mt-0.5 block text-sm text-text-2">{d}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <Notice title="Before you start">
        MoonNav is a research/education prototype. It uses the LOLA 240 m terrain product south of 75°S and NAIF SPICE ephemerides. Results are geometric and idealized: no landing-hazard assessment and no RF link budget. All scientific timestamps are stored in UTC; you can choose a display time zone ({tz} detected) in Settings.
      </Notice>
      <label className="flex items-start gap-2 text-sm text-text-2"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" /> I understand these prototype limitations.</label>
      {err && <Notice tone="bad">{err}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" disabled={!ack || busy} onClick={async () => {
          setBusy(true);
          try {
            await api("/api/v1/me", { method: "PATCH", body: { preferredMode: mode, completeOnboarding: true } });
            router.push(mode === "learn" ? "/learn" : mode === "explore" ? "/app/explorer" : "/app/scenarios/new?guided=1");
            router.refresh();
          } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
          }
        }}>{mode === "planning" ? "Continue to a guided example scenario" : "Continue"}</Button>
      </div>
    </div>
  );
}
