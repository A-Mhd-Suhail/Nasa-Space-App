"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commAt, DEFAULT_CONFIG, runSimulation, sampleAt, type SimConfig } from "@/lib/contingency/engine";
import { illustrativeEnvironment, parseEnvironment, type Environment } from "@/lib/contingency/environment";
import type { Vec3 } from "@/lib/contingency/geometry";
import { stateAt } from "@/lib/contingency/machine";
import { ballisticTouchdown, type Sample } from "@/lib/contingency/physics";
import { linkMarginDb, orbitPeriodS, RELAY_PRESETS } from "@/lib/contingency/relay";
import type { SiteCandidate } from "@/lib/contingency/sites";
import { Button, Card, CardHeader, DataTag, Field, Input, Notice, Select } from "../ui";
import { api } from "../workspace/api";
import { CommTimeline, HistoryPanel, Led, RecoveryCard, Row, SitesPanel, SourcesPanel, StateMachine } from "./panels";
import { BASE_UI, DEV_LABELS, deviationFrom, PRESETS, type DevKind, type UiConfig } from "./presets";
import dynamic from "next/dynamic";
import type { FocusKey, TerrainGrid } from "./scene";

const ContingencyScene = dynamic(() => import("./scene").then((m) => m.ContingencyScene), {
  ssr: false,
  loading: () => <div className="grid h-[440px] place-items-center rounded-[6px] border border-line bg-viewport text-sm text-[#a69f91] sm:h-[560px]">Loading the 3D scene…</div>,
});

type SiteOpt = { key: string; name: string; latitudeDeg: number; longitudeEastDeg: number };
type EnvStatus = { state: "idle" | "loading" | "ok" | "error"; message?: string };
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function ContingencyClient({ sites }: { sites: SiteOpt[] }) {
  const [ui, setUi] = useState<UiConfig>(BASE_UI);
  const [env, setEnv] = useState<Environment>(() => illustrativeEnvironment({ latDeg: BASE_UI.latDeg, lonEastDeg: BASE_UI.lonEastDeg }, BASE_UI.fallbackEarth, BASE_UI.fallbackEarth.flatHorizonDeg));
  const [envStatus, setEnvStatus] = useState<EnvStatus>({ state: "idle" });
  const [terrain, setTerrain] = useState<TerrainGrid | null>(null);
  const [candidates, setCandidates] = useState<SiteCandidate[]>([]);
  const [candNote, setCandNote] = useState("");
  const [view, setView] = useState<"descent" | "orbit">("descent");
  const [focus, setFocus] = useState<{ key: FocusKey; token: number }>({ key: "overview", token: 0 });
  const [exag, setExag] = useState(1);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<string>("normal");
  const [toast, setToast] = useState<string | null>(null);

  const cfg: SimConfig = useMemo(() => {
    const base = DEFAULT_CONFIG(env);
    return { ...base, init: ui.init, vehicle: ui.vehicle, deviation: deviationFrom(ui.devKinds, ui.onsetS, ui.devExtra), blackout: ui.blackout, relay: ui.relay, maskDeg: ui.maskDeg, mode: ui.mode, candidates, alwaysEvaluateSites: ui.alwaysEvaluateSites };
  }, [env, ui, candidates]);
  const sim = useMemo(() => runSimulation(cfg), [cfg]);

  // The path the lander follows after the decision point (only if a recovery is feasible)
  const follow = useMemo(() => {
    if (!ui.followRecovery) return null;
    if (sim.outcome.status === "RECOVERED_ALTERNATIVE" && sim.siteEval?.recommended) return sim.siteEval.recommended.recovery;
    if (sim.recoveryChosen?.feasible) return sim.recoveryChosen;
    return null;
  }, [sim, ui.followRecovery]);
  const tDec = sim.decisionAtS;
  const tEnd = useMemo(() => {
    const base = sim.actualTouchdown?.t ?? sim.actual[sim.actual.length - 1]?.t ?? 0;
    return follow && tDec != null ? Math.max(base, tDec + (follow.T ?? 0)) : base;
  }, [sim, follow, tDec]);

  const landerAt = useCallback((tt: number): { r: Vec3; v: Vec3; massKg: number; recovering: boolean } => {
    if (follow && tDec != null && tt >= tDec && follow.path.length) {
      const s = sampleAt(follow.path, Math.min(tt - tDec, follow.path[follow.path.length - 1].t));
      return { r: s.r, v: s.v, massKg: s.massKg, recovering: true };
    }
    const s = sampleAt(sim.actual.length ? sim.actual : [{ t: 0, r: [0, 0, 0], v: [0, 0, 0], massKg: 0, thrustN: 0 }], Math.min(tt, sim.actual[sim.actual.length - 1]?.t ?? 0));
    return { r: s.r, v: s.v, massKg: s.massKg, recovering: false };
  }, [follow, tDec, sim.actual]);
  const L = landerAt(t);
  const comm = useMemo(() => commAt(cfg, L.r, t), [cfg, L.r, t]);
  const stateNow = stateAt(sim.history, t);
  const deviatedNow = sim.detectedAtS != null && t >= sim.detectedAtS;
  const tint = L.recovering ? "recovering" : deviatedNow ? "deviated" : "nominal";
  const predicted = useMemo(() => {
    if (follow && tDec != null && t >= tDec) return follow.touchdown;
    const bt = ballisticTouchdown({ r: L.r, v: L.v, massKg: Math.max(L.massKg, cfg.vehicle.dryMassKg + 1) }, cfg.vehicle);
    return sim.actualTouchdown && !L.recovering ? sim.actualTouchdown.r : bt ? bt.r : null;
  }, [follow, tDec, t, L.r, L.v, L.massKg, cfg.vehicle, sim.actualTouchdown, L.recovering]);

  // playback loop
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) { last.current = null; return; }
    let raf = 0;
    const tick = (now: number) => {
      if (last.current != null) setT((p) => { const n = Math.min(tEnd, p + ((now - last.current!) / 1000) * speed); if (n >= tEnd) queueMicrotask(() => setPlaying(false)); return n; });
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, tEnd]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 6000); return () => clearTimeout(id); }, [toast]);

  const patch = (p: Partial<UiConfig>) => setUi((u) => ({ ...u, ...p }));
  const restart = (autoplay = true) => { setT(0); setPlaying(autoplay); };

  async function loadEnv(next?: UiConfig) {
    const u = next ?? ui;
    setEnvStatus({ state: "loading" });
    try {
      const d = await api<Record<string, unknown>>("/api/v1/contingency/environment", { method: "POST", body: { latitudeDeg: u.latDeg, longitudeEastDeg: u.lonEastDeg, utc: u.utc } });
      const p = parseEnvironment(d);
      if (!p.ok) throw new Error(p.error);
      setEnv({ ...p.env, notes: [...p.env.notes] });
      setTerrain((d.terrain as TerrainGrid | undefined) ?? null);
      setCandidates((d.candidates as SiteCandidate[] | undefined) ?? []);
      setCandNote(String(d.candidateNote ?? ""));
      setEnvStatus({ state: "ok" });
    } catch (e) {
      const msg = (e as Error).message || "unavailable";
      setEnv(illustrativeEnvironment({ latDeg: u.latDeg, lonEastDeg: u.lonEastDeg }, u.fallbackEarth, u.fallbackEarth.flatHorizonDeg));
      setTerrain(null);
      setCandidates([]);
      setCandNote("");
      setEnvStatus({ state: "error", message: msg });
    }
  }
  useEffect(() => { const id = setTimeout(() => void loadEnv(), 0); return () => clearTimeout(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyPreset(id: string) {
    const pr = PRESETS.find((x) => x.id === id)!;
    const next: UiConfig = { ...BASE_UI, utc: ui.utc, fallbackEarth: ui.fallbackEarth, rf: ui.rf, ...pr.patch };
    // every preset is deterministic: it starts from the Mons Malapert summit unless it names a site. The environment reloads when the site changed.
    const siteChanged = next.latDeg !== ui.latDeg || next.lonEastDeg !== ui.lonEastDeg;
    setUi(next);
    if (siteChanged) void loadEnv(next);
    setPresetId(id);
    setView(pr.view);
    setSelectedSite(null);
    setFocus((f) => ({ key: "overview", token: f.token + 1 }));
    restart(true);
  }
  function setSite(key: string) {
    const s = sites.find((x) => x.key === key);
    if (!s) return patch({ siteKey: "custom" });
    const next = { ...ui, siteKey: key, latDeg: s.latitudeDeg, lonEastDeg: s.longitudeEastDeg };
    setUi(next);
    void loadEnv(next);
  }
  const ensureDeviation = (kind: DevKind, label: string) => {
    const at = Math.max(1, Math.ceil(t) || 20);
    setUi((u) => ({ ...u, devKinds: u.devKinds.length ? u.devKinds : [kind], onsetS: u.devKinds.length ? u.onsetS : at }));
    if (!ui.devKinds.length) setToast(`${label} injected at t = ${at} s so there is something to correct.`);
  };
  const triggerBlackout = () => { const at = Math.max(1, Math.ceil(t)); patch({ blackout: { enabled: true, atS: at } }); setToast(`Simulated blackout injected at t = ${at} s (antenna/pointing anomaly).`); setPlaying(true); };
  const triggerKind = (k: DevKind) => { const at = Math.max(1, Math.ceil(t) || 20); setUi((u) => ({ ...u, devKinds: Array.from(new Set([...u.devKinds, k])), devExtra: {}, onsetS: at })); setToast(`${DEV_LABELS[k].label} injected at t = ${at} s.`); setPlaying(true); };
  const brake = () => { ensureDeviation("overshoot", "Horizontal overshoot"); patch({ mode: "retrograde", followRecovery: true }); setPlaying(true); setToast("Emergency (retrograde) braking evaluated from the decision point."); };
  const lateral = () => { ensureDeviation("overshoot", "Horizontal overshoot"); patch({ mode: "divert", followRecovery: true, alwaysEvaluateSites: true }); setPlaying(true); setToast("Lateral divert evaluated toward the best candidate landing zone."); };
  const evalSites = () => { patch({ alwaysEvaluateSites: true }); setToast("Alternative landing zones evaluated."); document.getElementById("alt-sites")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); };
  const reset = () => { setT(0); setPlaying(false); setUi((u) => ({ ...u, devKinds: [], devExtra: {}, blackout: { ...u.blackout, enabled: false }, mode: "target", alwaysEvaluateSites: false })); setSelectedSite(null); setToast("Simulation reset to a nominal descent."); };

  const direct = comm.direct.effective;
  const rf = useMemo(() => {
    if (!ui.rf.enabled) return null;
    const a = { frequencyHz: num(ui.rf.frequencyGHz) * 1e9, eirpDbw: num(ui.rf.eirpDbw), gOverTdbK: num(ui.rf.gOverTdbK), dataRateBps: num(ui.rf.dataRateBps), requiredEbN0Db: num(ui.rf.requiredEbN0Db), otherLossesDb: num(ui.rf.otherLossesDb) };
    if (Object.values(a).some((v) => !Number.isFinite(v)) || a.dataRateBps <= 0 || a.frequencyHz <= 0) return { error: "Fill in every RF assumption to see a margin; nothing is assumed for you.", relayToEarthDb: null, landerToRelayDb: null };
    const dEarth = env.earth?.distanceKm ?? 384_400;
    return { error: null as string | null, relayToEarthDb: linkMarginDb({ ...a, distanceKm: dEarth }) as number | null, landerToRelayDb: linkMarginDb({ ...a, distanceKm: Math.max(1, comm.relayRangeKm) }) as number | null };
  }, [ui.rf, env.earth, comm.relayRangeKm]);

  const windowInput = useMemo(() => ({ siteLatDeg: env.site.latDeg, siteLonEastDeg: env.site.lonEastDeg, siteHeightM: env.site.heightM, landerEnuM: (sim.actualTouchdown?.r ?? [0, 0, 0]) as Vec3, earth: env.earth, horizon: env.horizon, relay: ui.relay, maskDeg: ui.maskDeg }), [env, sim.actualTouchdown, ui.relay, ui.maskDeg]);
  const span = Math.round(orbitPeriodS(ui.relay.altitudeKm) * 1.5);
  const markers = [...(sim.blackoutStartS != null ? [{ tS: sim.blackoutStartS, label: "blackout" }] : []), ...(sim.detectedAtS != null ? [{ tS: sim.detectedAtS, label: "deviation" }] : [])];
  const statusTone = sim.outcome.status === "NOMINAL_TOUCHDOWN" || sim.outcome.status.startsWith("RECOVERED") ? "ok" : "bad";
  const sceneSites = sim.siteEval?.assessments ?? [];
  const recoveryPath: Sample[] | null = follow ? follow.path.map((s) => ({ ...s, t: s.t + (tDec ?? 0) })) : sim.recoveryChosen && !sim.recoveryChosen.feasible ? null : null;
  const refPath = ui.devKinds.length ? sim.recoveryChosen?.path.map((s) => ({ ...s, t: s.t + (tDec ?? 0) })) ?? null : null;

  return (
    <div className="space-y-4">
      <div role="status" className="rounded-[5px] border border-warn/60 bg-warn/10 px-4 py-2 text-center text-sm font-semibold tracking-wide text-warn" data-testid="sim-banner">SIMULATED MISSION — NOT LIVE SPACECRAFT CONTROL</div>
      {toast && <Notice tone="info"><span data-testid="toast">{toast}</span></Notice>}
      {envStatus.state === "error" && <Notice tone="warn" title="Ephemeris and terrain unavailable"><span data-testid="env-error">{envStatus.message}. Showing ILLUSTRATIVE geometry from the Earth angles you set below (no SPICE, no Horizons, no LOLA). Nothing on this page is then a measurement; set the angles or press “Load site data” to retry.</span></Notice>}
      {env.source === "illustrative" && envStatus.state !== "error" && envStatus.state !== "loading" && <Notice tone="warn"><span data-testid="illustrative-note">Illustrative geometry in use. Press “Load site data” for SPICE ephemeris and LOLA terrain.</span></Notice>}

      <Card>
        <CardHeader title="Demonstration scenarios" subtitle="Each preset changes the scene immediately; you can then adjust anything." />
        <div className="flex flex-wrap gap-2 px-4 py-3" role="group" aria-label="Preset scenarios">
          {PRESETS.map((p) => <Button key={p.id} s="sm" variant={presetId === p.id ? "primary" : "secondary"} data-testid={`preset-${p.id}`} aria-pressed={presetId === p.id} onClick={() => applyPreset(p.id)}>{p.label}</Button>)}
        </div>
        <p className="px-4 pb-3 text-sm text-text-2" data-testid="preset-summary">{PRESETS.find((p) => p.id === presetId)?.summary}</p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Camera and view">
            <div role="radiogroup" aria-label="Scene view" className="flex overflow-hidden rounded-[5px] border border-line">
              {(["descent", "orbit"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={view === v} data-testid={`view-${v}`} onClick={() => setView(v)} className={`px-3 py-1.5 text-sm ${view === v ? "bg-accent text-white" : "bg-panel text-text-2 hover:text-text"}`}>{v === "descent" ? "Descent (terrain)" : "Orbit (relay)"}</button>)}
            </div>
            {([["overview", "Mission overview"], ["lander", "Focus lander"], ["relay", "Focus relay"], ["target", "Focus landing zone"]] as [FocusKey, string][]).map(([k, label]) => <Button key={k} s="sm" data-testid={`focus-${k}`} onClick={() => { if (k === "relay") setView("orbit"); setFocus((f) => ({ key: k, token: f.token + 1 })); }}>{label}</Button>)}
            {view === "descent" && <label className="flex items-center gap-1.5 text-sm text-text-2">Vertical exaggeration<Select value={exag} onChange={(e) => setExag(Number(e.target.value))} className="w-20" aria-label="Vertical exaggeration">{[1, 2, 4].map((v) => <option key={v} value={v}>{v}×</option>)}</Select></label>}
          </div>

          <div className="relative">
            <ContingencyScene view={view} env={env} terrain={terrain} planned={sim.planned} actual={sim.actual} recovery={recoveryPath ?? refPath} lander={L.r} comm={comm} relay={ui.relay} tS={t} sites={sceneSites} selectedSite={selectedSite} predictedTouchdown={predicted} exaggeration={exag} focus={focus} direct={direct} tint={tint} />
            <div className="pointer-events-none absolute left-2 top-2 space-y-1 text-[12px]" aria-live="polite">
              <div className={`rounded-[3px] px-2 py-1 font-semibold ${direct === "available" ? "bg-[rgb(20_18_16/0.85)] text-[#6fbf73]" : "bg-[rgb(40_14_12/0.9)] text-[#ff8a80]"}`} data-testid="hud-direct">{direct === "available" ? "DIRECT COMMUNICATION: AVAILABLE" : direct === "lost" ? "DIRECT COMMUNICATION: LOST" : "DIRECT COMMUNICATION: UNKNOWN"}</div>
              {direct !== "available" && <>
                <div className="rounded-[3px] bg-[rgb(20_18_16/0.85)] px-2 py-1 text-[#efe9dd]" data-testid="hud-l2r">LANDER → RELAY: {comm.landerToRelay.state === "visible" ? "VISIBLE" : comm.landerToRelay.state === "unknown" ? "UNKNOWN" : "BLOCKED"}</div>
                <div className="rounded-[3px] bg-[rgb(20_18_16/0.85)] px-2 py-1 text-[#efe9dd]" data-testid="hud-r2e">RELAY → EARTH: {comm.relayToEarth.state === "visible" ? "VISIBLE" : comm.relayToEarth.state === "unknown" ? "UNKNOWN" : "BLOCKED"}</div>
                <div className={`rounded-[3px] px-2 py-1 font-semibold ${comm.relay.available === "AVAILABLE" ? "bg-[rgb(14_30_44/0.9)] text-[#8cc4ff]" : "bg-[rgb(20_18_16/0.85)] text-[#efe9dd]"}`} data-testid="hud-relay">RELAY COMMUNICATION: {comm.relay.available}</div>
              </>}
              <div className="rounded-[3px] bg-[rgb(20_18_16/0.85)] px-2 py-1 text-[#efe9dd]" data-testid="hud-state">{stateAt(sim.history, t).state.replaceAll("_", " ")}</div>
            </div>
            <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-[3px] bg-[rgb(20_18_16/0.82)] px-2.5 py-1.5 text-[12px] leading-snug text-[#cfc7b8]">
              Green: planned · red dashed: deviated · blue: simulated recovery. Earth, Sun and relay sight lines are directions, not to scale. Terrain: {terrain ? `LOLA ${terrain.resolutionM.toFixed(0)} m posting, resampled to ${terrain.spacingM.toFixed(0)} m cells` : "not loaded (flat reference only)"}. Relay: SIMULATED, circular orbit.
            </div>
          </div>

          <Card>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3" role="toolbar" aria-label="Simulation controls">
              {!playing && t <= 0 && <Button variant="primary" data-testid="sim-start" onClick={() => restart(true)}>Start simulation</Button>}
              {playing && <Button data-testid="sim-pause" onClick={() => setPlaying(false)}>Pause</Button>}
              {!playing && t > 0 && <Button variant="primary" data-testid="sim-resume" onClick={() => { if (t >= tEnd) setT(0); setPlaying(true); }}>{t >= tEnd ? "Replay" : "Resume"}</Button>}
              <Button data-testid="sim-reset" onClick={reset}>Reset</Button>
              <label className="flex items-center gap-1.5 text-sm text-text-2">Speed<Select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-20" aria-label="Playback speed" data-testid="sim-speed">{[1, 2, 4, 10, 30].map((s) => <option key={s} value={s}>{s}×</option>)}</Select></label>
              <span className="num ml-auto text-sm" data-testid="sim-time">t = {t.toFixed(0)} s / {tEnd.toFixed(0)} s</span>
            </div>
            <div className="px-4 pb-3">
              <input type="range" min={0} max={Math.max(1, tEnd)} step={0.5} value={Math.min(t, tEnd)} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} className="w-full" aria-label="Simulation timeline" data-testid="sim-slider" />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3" role="group" aria-label="Emergency triggers">
              <Button s="sm" data-testid="trigger-blackout" onClick={triggerBlackout}>Trigger communication blackout</Button>
              <Button s="sm" data-testid="trigger-overshoot" onClick={() => triggerKind("overshoot")}>Trigger overshoot</Button>
              <Button s="sm" data-testid="trigger-undershoot" onClick={() => triggerKind("undershoot")}>Trigger undershoot</Button>
              <Button s="sm" data-testid="trigger-vertical" onClick={() => triggerKind("vertical")}>Trigger excessive descent velocity</Button>
              <Button s="sm" variant="secondary" data-testid="action-brake" onClick={brake}>Simulate emergency braking</Button>
              <Button s="sm" variant="secondary" data-testid="action-lateral" onClick={lateral}>Simulate lateral correction</Button>
              <Button s="sm" variant="secondary" data-testid="action-sites" onClick={evalSites}>Evaluate alternative landing sites</Button>
            </div>
          </Card>

          <Card data-testid="outcome">
            <CardHeader title="Mission outcome" tag={<DataTag kind="modelled" />} />
            <div className="space-y-2 px-4 py-3">
              {sim.error ? <Notice tone="bad">{sim.error}</Notice> : (
                <>
                  <div className={`text-base font-semibold ${statusTone === "ok" ? "text-ok" : "text-bad"}`} data-testid="outcome-headline" data-status={sim.outcome.status}>{sim.outcome.headline}</div>
                  <dl>
                    <Row k="Original target reachable" v={sim.outcome.originalReachable == null ? "not needed (no deviation)" : sim.outcome.originalReachable ? "yes" : "no"} tone={sim.outcome.originalReachable === false ? "bad" : undefined} />
                    <Row k="Alternative target reachable" v={sim.outcome.alternativeReachable == null ? "not evaluated" : sim.outcome.alternativeReachable ? "yes" : "no"} tone={sim.outcome.alternativeReachable === false ? "bad" : undefined} />
                    <Row k="Recovered within the simulation" v={sim.outcome.recovered ? "yes" : sim.detectedAtS == null ? "n/a" : "no"} tone={sim.outcome.recovered ? "ok" : sim.detectedAtS == null ? undefined : "bad"} />
                  </dl>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-text-2" data-testid="explanations">{[...sim.explanations, ...sim.outcome.reasons].map((x, i) => <li key={i}>{x}</li>)}</ul>
                </>
              )}
            </div>
          </Card>
          <div id="alt-sites"><SitesPanel ev={sim.siteEval} selected={selectedSite} onSelect={setSelectedSite} /></div>
          <CommTimeline input={windowInput} t={t} spanS={span} markers={markers} />
          <StateMachine history={sim.history} t={t} />
        </div>

        <div className="min-w-0 space-y-3">
          <Card data-testid="status-panel">
            <CardHeader title="Spacecraft status" tag={<DataTag kind="modelled" />} />
            <dl className="px-4 py-3">
              <Row k="Altitude" v={`${L.r[2].toFixed(0)} m`} />
              <Row k="Horizontal velocity" v={`${Math.hypot(L.v[0], L.v[1]).toFixed(1)} m/s`} />
              <Row k="Vertical velocity" v={`${L.v[2].toFixed(1)} m/s`} />
              <Row k="Distance to target" v={`${Math.hypot(L.r[0], L.r[1]).toFixed(0)} m`} />
              <Row k="Propellant remaining" v={`${Math.max(0, L.massKg - cfg.vehicle.dryMassKg).toFixed(0)} kg`} />
              <Row k="Predicted landing point" v={predicted ? `${(predicted[0] || 0).toFixed(0)} E, ${(predicted[1] || 0).toFixed(0)} N m` : "—"} />
              <Row k="Mission state" v={stateNow.state.replaceAll("_", " ").toLowerCase()} />
            </dl>
          </Card>
          <Card data-testid="comm-panel">
            <CardHeader title="Communication status" tag={<DataTag kind="calculated" />} subtitle="Geometric line of sight only. Not RF link availability." />
            <dl className="px-4 py-3">
              <Row k="Direct Earth" v={<Led state={direct === "available" ? "ok" : direct === "lost" ? "bad" : "warn"} label={direct === "available" ? "visible" : direct === "lost" ? "lost" : "unknown"} />} />
              <Row k="Lander → relay" v={comm.landerToRelay.state} />
              <Row k="Relay → Earth" v={comm.relayToEarth.state} />
              <Row k="Relay path" v={comm.relay.available} tone={comm.relay.available === "AVAILABLE" ? "ok" : undefined} />
              <Row k="Link state" v={direct === "available" ? "direct geometry available" : comm.relay.available === "AVAILABLE" ? "relay geometry available" : "no geometric path"} />
            </dl>
            <p className="px-4 pb-3 text-xs text-text-2" data-testid="comm-reason">{comm.direct.reason}. {comm.relay.reason}.</p>
          </Card>
          <Card>
            <CardHeader title="Recovery status" tag={<DataTag kind="modelled" />} />
            <div className="space-y-2 px-4 py-3">
              <Row k="Trajectory deviation" v={sim.detectedAtS == null ? "none" : `detected at t = ${sim.detectedAtS.toFixed(0)} s`} tone={sim.detectedAtS == null ? undefined : "bad"} />
              {sim.recoveryChosen ? <RecoveryCard rec={sim.recoveryChosen} label={`${ui.mode === "retrograde" ? "retrograde braking" : ui.mode === "vertical" ? "vertical braking" : ui.mode === "divert" ? "lateral divert" : "return to the original target"}`} /> : <p className="text-sm text-text-2">No deviation to correct. Trigger one (overshoot, undershoot, excessive descent velocity, insufficient braking) to evaluate a maneuver.</p>}
              {sim.recoveryToTarget && ui.mode !== "target" && <p className="text-xs text-muted">For reference, returning to the original target: {sim.recoveryToTarget.feasible ? "feasible" : "not feasible"}.</p>}
            </div>
          </Card>
          <ConfigPanel ui={ui} patch={patch} setSite={setSite} sites={sites} envStatus={envStatus} onLoad={() => loadEnv()} env={env} candNote={candNote} />
          <Card>
            <CardHeader title="Optional RF link margin" tag={<DataTag kind="illustrative" />} subtitle="Separate from geometry. Off by default; every value is yours." />
            <div className="space-y-2 px-4 py-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ui.rf.enabled} onChange={(e) => patch({ rf: { ...ui.rf, enabled: e.target.checked } })} data-testid="rf-toggle" /> Estimate a free-space link margin</label>
              {ui.rf.enabled && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {([["frequencyGHz", "Frequency (GHz)"], ["eirpDbw", "EIRP (dBW)"], ["gOverTdbK", "Receiver G/T (dB/K)"], ["dataRateBps", "Data rate (bit/s)"], ["requiredEbN0Db", "Required Eb/N0 (dB)"], ["otherLossesDb", "Other losses (dB)"]] as const).map(([k, label]) => (
                      <Field key={k} label={label} htmlFor={`rf-${k}`}><Input id={`rf-${k}`} inputMode="decimal" value={ui.rf[k]} onChange={(e) => patch({ rf: { ...ui.rf, [k]: e.target.value } })} /></Field>
                    ))}
                  </div>
                  {rf && "error" in rf && rf.error && <p className="text-xs text-text-2">{rf.error}</p>}
                  {rf && rf.relayToEarthDb != null && rf.landerToRelayDb != null && <dl data-testid="rf-result"><Row k="Relay → Earth margin" v={`${rf.relayToEarthDb.toFixed(1)} dB`} tone={rf.relayToEarthDb >= 0 ? "ok" : "bad"} /><Row k="Lander → relay margin" v={`${rf.landerToRelayDb.toFixed(1)} dB`} tone={rf.landerToRelayDb >= 0 ? "ok" : "bad"} /></dl>}
                  <p className="text-xs text-muted">Illustrative free-space arithmetic from your numbers. No antenna patterns, pointing, weather or DSN availability. A geometric window does not prove a working link.</p>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
      <HistoryPanel />
      <Card>
        <CardHeader title="Why future orbital infrastructure matters" subtitle="Reference: Canadian Space Agency Moon exploration portal" />
        <p className="px-4 py-3 text-sm text-text-2" data-testid="csa-note">The Canadian Space Agency describes Gateway as the next major international collaboration in human space exploration and Canadarm3 as Gateway&rsquo;s robotic system. Persistent orbital infrastructure is what could make a relay like the one simulated here a real option for surface missions. This is a reference for the concept only: the CSA portal provides no telemetry, ephemeris or relay availability, and Gateway is future infrastructure. The relay in this simulator is hypothetical, circular and explicitly simulated; no Lunar Reconnaissance Orbiter relay capability is assumed.</p>
      </Card>
      <SourcesPanel />
    </div>
  );
}

function ConfigPanel({ ui, patch, setSite, sites, envStatus, onLoad, env, candNote }: { ui: UiConfig; patch: (p: Partial<UiConfig>) => void; setSite: (k: string) => void; sites: SiteOpt[]; envStatus: EnvStatus; onLoad: () => void; env: Environment; candNote: string }) {
  const setInit = (k: keyof UiConfig["init"], v: string) => patch({ init: { ...ui.init, [k]: Number(v) } });
  const setVeh = (k: keyof UiConfig["vehicle"], v: string) => patch({ vehicle: { ...ui.vehicle, [k]: Number(v) } });
  const setRelay = (k: keyof UiConfig["relay"], v: string) => patch({ relay: { ...ui.relay, [k]: Number(v) } });
  const toggle = (k: DevKind) => patch({ devKinds: ui.devKinds.includes(k) ? ui.devKinds.filter((x) => x !== k) : [...ui.devKinds, k], devExtra: {} });
  const f = (label: string, id: string, value: number, on: (v: string) => void, step = "any") => <Field label={label} htmlFor={id}><Input id={id} type="number" step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => on(e.target.value)} /></Field>;
  return (
    <Card data-testid="config-panel">
      <CardHeader title="Scenario configuration" subtitle="Vehicle and relay values are illustrative assumptions, not a real spacecraft." />
      <div className="space-y-4 px-4 py-3">
        <fieldset className="space-y-2"><legend className="text-xs font-semibold uppercase tracking-wide text-muted">Landing target</legend>
          <Field label="Site" htmlFor="c-site"><Select id="c-site" value={ui.siteKey} onChange={(e) => setSite(e.target.value)}>{sites.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}{ui.siteKey === "custom" && <option value="custom">Custom</option>}</Select></Field>
          <div className="grid grid-cols-2 gap-2">{f("Latitude (°)", "c-lat", ui.latDeg, (v) => patch({ latDeg: Number(v), siteKey: "custom" }))}{f("Longitude (°E)", "c-lon", ui.lonEastDeg, (v) => patch({ lonEastDeg: Number(v), siteKey: "custom" }))}</div>
          <Field label="Epoch (UTC)" htmlFor="c-utc"><Input id="c-utc" value={ui.utc} onChange={(e) => patch({ utc: e.target.value })} placeholder="2026-12-01T06:00:00Z" /></Field>
          <Button s="sm" data-testid="load-env" onClick={onLoad} disabled={envStatus.state === "loading"}>{envStatus.state === "loading" ? "Loading…" : "Load site data (SPICE, LOLA, Horizons)"}</Button>
          <p className="text-xs text-muted" data-testid="env-meta">{env.source === "spice" ? `SPICE ephemeris at ${env.utc ?? ui.utc}: Earth az ${env.earth?.azDeg.toFixed(1)}°, el ${env.earth?.elDeg.toFixed(2)}°. Horizons check: ${env.horizonsCheck ? `${env.horizonsCheck.status}${env.horizonsCheck.maxSeparationDeg != null ? ` (max ${env.horizonsCheck.maxSeparationDeg.toExponential(1)}°)` : ""}` : "n/a"}. ${candNote}` : env.notes[0]}</p>
          {env.source === "illustrative" && (
            <div className="grid grid-cols-3 gap-2">{f("Earth az (°)", "c-eaz", ui.fallbackEarth.azDeg, (v) => patch({ fallbackEarth: { ...ui.fallbackEarth, azDeg: Number(v) } }))}{f("Earth el (°)", "c-eel", ui.fallbackEarth.elDeg, (v) => patch({ fallbackEarth: { ...ui.fallbackEarth, elDeg: Number(v) } }))}{f("Horizon (°)", "c-hz", ui.fallbackEarth.flatHorizonDeg, (v) => patch({ fallbackEarth: { ...ui.fallbackEarth, flatHorizonDeg: Number(v) } }))}</div>
          )}
        </fieldset>
        <fieldset className="space-y-2"><legend className="text-xs font-semibold uppercase tracking-wide text-muted">Deviation (starts at the onset time)</legend>
          {(Object.keys(DEV_LABELS) as DevKind[]).map((k) => <label key={k} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ui.devKinds.includes(k)} onChange={() => toggle(k)} className="mt-1" data-testid={`dev-${k}`} /><span>{DEV_LABELS[k].label}<span className="block text-xs text-muted">{DEV_LABELS[k].hint}</span></span></label>)}
          <button type="button" className="text-xs text-accent hover:underline" onClick={() => patch({ devKinds: [], devExtra: {} })} data-testid="dev-normal">Normal descent (clear all)</button>
          {f("Onset (s)", "c-onset", ui.onsetS, (v) => patch({ onsetS: Number(v) }))}
          <Field label="Maneuver to evaluate" htmlFor="c-mode"><Select id="c-mode" value={ui.mode} onChange={(e) => patch({ mode: e.target.value as UiConfig["mode"] })} data-testid="mode-select"><option value="target">Recover onto the original target</option><option value="retrograde">Retrograde braking (stop horizontally)</option><option value="vertical">Vertical braking only</option><option value="divert">Lateral divert to an alternative zone</option></Select></Field>
        </fieldset>
        <fieldset className="space-y-2"><legend className="text-xs font-semibold uppercase tracking-wide text-muted">Communication</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ui.blackout.enabled} onChange={(e) => patch({ blackout: { ...ui.blackout, enabled: e.target.checked } })} data-testid="blackout-toggle" /> Inject a direct-link blackout</label>
          {f("Blackout at (s)", "c-bt", ui.blackout.atS, (v) => patch({ blackout: { ...ui.blackout, atS: Number(v) } }))}
          {f("Antenna elevation mask (°)", "c-mask", ui.maskDeg, (v) => patch({ maskDeg: Number(v) }))}
          <Field label="Relay orbit preset" htmlFor="c-rp"><Select id="c-rp" value="" onChange={(e) => e.target.value && patch({ relay: { ...RELAY_PRESETS[e.target.value].orbit, phaseDeg: ui.relay.phaseDeg, raanDeg: ui.relay.raanDeg } })}><option value="">Choose…</option>{Object.entries(RELAY_PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-2">{f("Relay altitude (km)", "c-ra", ui.relay.altitudeKm, (v) => setRelay("altitudeKm", v))}{f("Inclination (°)", "c-ri", ui.relay.inclinationDeg, (v) => setRelay("inclinationDeg", v))}{f("RAAN (°)", "c-rr", ui.relay.raanDeg, (v) => setRelay("raanDeg", v))}{f("Phase (°)", "c-rp2", ui.relay.phaseDeg, (v) => setRelay("phaseDeg", v))}</div>
          <input type="range" min={0} max={359} value={ui.relay.phaseDeg} onChange={(e) => setRelay("phaseDeg", e.target.value)} aria-label="Relay orbital phase" className="w-full" data-testid="relay-phase" />
          <p className="text-xs text-muted">Simulated circular orbit; period {(orbitPeriodS(ui.relay.altitudeKm) / 60).toFixed(0)} min. Gateway-style halo orbits are not modelled.</p>
        </fieldset>
        <fieldset className="space-y-2"><legend className="text-xs font-semibold uppercase tracking-wide text-muted">Descent (illustrative)</legend>
          <div className="grid grid-cols-2 gap-2">{f("Start altitude (m)", "c-alt", ui.init.altitudeM, (v) => setInit("altitudeM", v))}{f("Range to target (m)", "c-rng", ui.init.rangeM, (v) => setInit("rangeM", v))}{f("Horizontal speed (m/s)", "c-hs", ui.init.horizontalSpeedMs, (v) => setInit("horizontalSpeedMs", v))}{f("Vertical speed (m/s)", "c-vs", ui.init.verticalSpeedMs, (v) => setInit("verticalSpeedMs", v))}</div>
        </fieldset>
        <fieldset className="space-y-2"><legend className="text-xs font-semibold uppercase tracking-wide text-muted">Vehicle (simplified, configurable)</legend>
          <div className="grid grid-cols-2 gap-2">{f("Dry mass (kg)", "c-dm", ui.vehicle.dryMassKg, (v) => setVeh("dryMassKg", v))}{f("Propellant (kg)", "c-pr", ui.vehicle.propellantKg, (v) => setVeh("propellantKg", v))}{f("Max thrust (N)", "c-th", ui.vehicle.maxThrustN, (v) => setVeh("maxThrustN", v))}{f("Specific impulse (s)", "c-isp", ui.vehicle.ispS, (v) => setVeh("ispS", v))}{f("Max burn (s)", "c-mb", ui.vehicle.maxBurnS, (v) => setVeh("maxBurnS", v))}{f("Lateral thrust share", "c-lt", ui.vehicle.lateralThrustFraction, (v) => setVeh("lateralThrustFraction", v), "0.05")}{f("Reserve propellant (kg)", "c-rs", ui.vehicle.reservePropellantKg, (v) => setVeh("reservePropellantKg", v))}</div>
          <p className="text-xs text-muted">Point-mass model, uniform lunar gravity, rocket-equation propellant. A teaching model, not a flight-dynamics tool.</p>
        </fieldset>
      </div>
    </Card>
  );
}
