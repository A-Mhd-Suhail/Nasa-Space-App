"use client";
import { CircleCheck, CircleX, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DEM_MAX_LATITUDE, MAX_SAMPLES, normalizeLonEast, scenarioInput } from "@/lib/contracts";
import { Button, Card, CardHeader, cx, Field, Input, Notice, Select } from "../ui";
import { api, fieldErrorMap } from "./api";

type Site = { key: string; name: string; featureType: string; latitudeDeg: number; longitudeEastDeg: number; heightM: number | null };
type Product = { id: string; label: string; status: string; coverage: string };
type Initial = { projectId: string | null; siteKey: string | null; lat: number | null; lon: number | null; from: { id: string; name: string; definition: Record<string, unknown> } | null; guided: boolean };

const STEPS = [[300, "5 min"], [600, "10 min"], [1800, "30 min"], [3600, "1 h"], [10800, "3 h"], [21600, "6 h"]] as const;
const SYNODIC_DAYS = 29.530589;

const toLocal = (iso: string) => iso.slice(0, 16);
const toIso = (local: string) => (local.length === 16 ? `${local}:00Z` : local.endsWith("Z") ? local : `${local}Z`);
const addDays = (local: string, d: number) => new Date(Date.parse(toIso(local)) + d * 86400_000).toISOString().slice(0, 16);

export function ScenarioBuilder({ projects, sites, products, initial, locations = [] }: { projects: { id: string; name: string }[]; sites: Site[]; products: Product[]; initial: Initial; locations?: { id: string; name: string; lat: number; lon: number }[] }) {
  const router = useRouter();
  const def = initial.from?.definition as { site?: { observerHeightM?: number }; timeRange?: { startUtc: string; endUtc: string; sampleStepSeconds: number }; assumptions?: { antennaMinimumElevationDeg: number | null; solarPanel: Record<string, number | string | null> | null }; options?: { sunVisibilityRule: string; earthVisibilityRule: string; refineToleranceSeconds: number }; products?: { terrainProductId: string } } | undefined;
  const guided = initial.guided && !initial.from;
  const [projectId, setProjectId] = useState(initial.projectId ?? "");
  const [newProject, setNewProject] = useState(projects.length === 0 ? "My first study" : "");
  const [mode, setMode] = useState<"catalog" | "custom">(initial.lat != null ? "custom" : "catalog");
  const [siteKey, setSiteKey] = useState(initial.siteKey ?? (guided ? "mons-malapert" : "mons-malapert"));
  const [lat, setLat] = useState(initial.lat != null ? String(initial.lat) : "-89.45");
  const [lon, setLon] = useState(initial.lon != null ? String(initial.lon) : "222.69");
  const [lonConv, setLonConv] = useState<"east" | "west">("east");
  const [name, setName] = useState(initial.from ? initial.from.name : guided ? "Guided example — Mons Malapert, one week" : "");
  const [start, setStart] = useState(toLocal(def?.timeRange?.startUtc ?? "2026-11-15T00:00:00Z"));
  const [end, setEnd] = useState(toLocal(def?.timeRange?.endUtc ?? "2026-11-22T00:00:00Z"));
  const [step, setStep] = useState(def?.timeRange?.sampleStepSeconds ?? 600);
  const [product, setProduct] = useState(def?.products?.terrainProductId ?? products.find((p) => p.status === "approved")?.id ?? "");
  const [obsH, setObsH] = useState(String(def?.site?.observerHeightM ?? 2));
  const [sunRule, setSunRule] = useState(def?.options?.sunVisibilityRule ?? "any_disk");
  const [earthRule, setEarthRule] = useState(def?.options?.earthVisibilityRule ?? "any_disk");
  const [tol, setTol] = useState(String(def?.options?.refineToleranceSeconds ?? 10));
  const [maskOn, setMaskOn] = useState(def ? def.assumptions?.antennaMinimumElevationDeg != null : true);
  const [mask, setMask] = useState(String(def?.assumptions?.antennaMinimumElevationDeg ?? 5));
  const sp0 = def?.assumptions?.solarPanel;
  const [panelOn, setPanelOn] = useState(!!sp0 || guided);
  const [panel, setPanel] = useState({
    areaM2: String(sp0?.areaM2 ?? 1), efficiency: String(sp0?.efficiency ?? 0.3), derating: String(sp0?.derating ?? 0.85),
    orientation: String(sp0?.orientation ?? "two_axis_tracking"), normalAzimuthDeg: String(sp0?.normalAzimuthDeg ?? 0), normalElevationDeg: String(sp0?.normalElevationDeg ?? 0), maxOutputW: sp0?.maxOutputW != null ? String(sp0.maxOutputW) : "",
  });
  const [serverErrs, setServerErrs] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "run" | null>(null);

  const site = sites.find((s) => s.key === siteKey);
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
  const candidate = useMemo(() => ({
    projectId: projectId || "pending",
    name: name.trim(),
    site: mode === "catalog" ? { mode: "catalog" as const, siteId: siteKey } : { mode: "custom" as const, latitudeDeg: num(lat), longitudeDeg: num(lon), longitudeConvention: lonConv },
    observerHeightM: num(obsH),
    startUtc: toIso(start),
    endUtc: toIso(end),
    stepSeconds: step,
    terrainProductId: product,
    antennaMinimumElevationDeg: maskOn ? num(mask) : null,
    solarPanel: panelOn
      ? {
          areaM2: num(panel.areaM2), efficiency: num(panel.efficiency), derating: num(panel.derating), orientation: panel.orientation as "fixed" | "two_axis_tracking" | "terrain_aligned",
          normalAzimuthDeg: panel.orientation === "fixed" ? num(panel.normalAzimuthDeg) : null, normalElevationDeg: panel.orientation === "fixed" ? num(panel.normalElevationDeg) : null,
          maxOutputW: panel.maxOutputW ? num(panel.maxOutputW) : null,
        }
      : null,
    sunVisibilityRule: sunRule as "any_disk",
    earthVisibilityRule: earthRule as "any_disk",
    refineToleranceSeconds: num(tol),
    parentScenarioId: initial.from?.id,
  }), [projectId, name, mode, siteKey, lat, lon, lonConv, obsH, start, end, step, product, maskOn, mask, panelOn, panel, sunRule, earthRule, tol, initial.from]);

  const parsed = scenarioInput.safeParse(candidate);
  const clientErrs: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) clientErrs[i.path.join(".")] = clientErrs[i.path.join(".")] ?? i.message;
  if (!projectId && !newProject.trim()) clientErrs.projectId = "Choose or name a project";
  const errs = { ...clientErrs, ...serverErrs };
  const span = (Date.parse(toIso(end)) - Date.parse(toIso(start))) / 1000;
  const samples = Number.isFinite(span) && span > 0 ? Math.floor(span / step) + 1 : 0;
  const effLat = mode === "catalog" ? site?.latitudeDeg ?? NaN : num(lat);
  const effLon = mode === "catalog" ? site?.longitudeEastDeg ?? NaN : Number.isFinite(num(lon)) ? normalizeLonEast(num(lon), lonConv) : NaN;
  const covered = Number.isFinite(effLat) && effLat <= DEM_MAX_LATITUDE;
  const ok = Object.keys(clientErrs).length === 0;

  async function submit(run: boolean) {
    setBusy(run ? "run" : "save");
    setServerErrs({});
    setGeneral(null);
    try {
      let pid = projectId;
      if (!pid) {
        const r = await api<{ project: { id: string } }>("/api/v1/projects", { method: "POST", body: { name: newProject.trim() } });
        pid = r.project.id;
        setProjectId(pid);
      }
      const { scenario } = await api<{ scenario: { id: string; projectId: string } }>("/api/v1/scenarios", { method: "POST", body: { ...candidate, projectId: pid } });
      if (run) {
        const r = await api<{ analysisId: string }>("/api/v1/analyses", { method: "POST", body: { scenarioId: scenario.id } });
        router.push(`/app/analyses/${r.analysisId}`);
      } else router.push(`/app/projects/${scenario.projectId}`);
    } catch (e) {
      setServerErrs(fieldErrorMap(e));
      setGeneral((e as Error).message);
      setBusy(null);
    }
  }

  const E = (k: string) => errs[k] ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {guided && <Notice title="Guided example">We pre-filled a one-week scenario at Mons Malapert with a 5° antenna mask and an illustrative 1 m² tracking panel (30% efficiency, 0.85 derating). Change anything, then press “Save & run analysis”.</Notice>}
        <Card>
          <CardHeader title="1 · Project and name" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Project" htmlFor="project" required error={E("projectId")}>
              <Select id="project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">+ New project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            {!projectId ? (
              <Field label="New project name" htmlFor="newproj" required><Input id="newproj" value={newProject} onChange={(e) => setNewProject(e.target.value)} maxLength={120} /></Field>
            ) : <div />}
            <div className="sm:col-span-2">
              <Field label="Scenario name" htmlFor="sname" required error={E("name")}><Input id="sname" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Malapert — Nov 2026 week" aria-invalid={!!E("name")} /></Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="2 · Site" subtitle="Planetocentric latitude, east-positive longitude (west-positive input is converted)." />
          <div className="space-y-4 p-4">
            <div role="radiogroup" aria-label="Site type" className="flex gap-2">
              {(["catalog", "custom"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cx("rounded-md border px-3 py-1.5 text-sm", mode === m ? "border-accent bg-accent-soft text-accent" : "border-line-2 text-text-2")}>{m === "catalog" ? "Verified named site" : "Custom coordinates"}</button>
              ))}
            </div>
            {mode === "catalog" ? (
              <Field label="Named site (IAU Gazetteer feature centre)" htmlFor="site" error={E("site.siteId")}>
                <Select id="site" value={siteKey} onChange={(e) => setSiteKey(e.target.value)}>
                  {sites.map((s) => <option key={s.key} value={s.key}>{s.name} — {Math.abs(s.latitudeDeg).toFixed(3)}°S {s.longitudeEastDeg.toFixed(3)}°E{s.heightM != null ? ` · ${s.heightM.toFixed(0)} m` : ""}</option>)}
                </Select>
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                {locations.length > 0 && (
                  <div className="sm:col-span-3">
                    <Field label="Use a saved location" htmlFor="savedloc" hint="Saved from the Site Explorer in this workspace.">
                      <Select id="savedloc" defaultValue="" onChange={(e) => { const l = locations.find((x) => x.id === e.target.value); if (l) { setLat(String(l.lat)); setLon(String(l.lon)); setLonConv("east"); } }}>
                        <option value="">Choose…</option>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.name} — {Math.abs(l.lat).toFixed(3)}°S {l.lon.toFixed(3)}°E</option>)}
                      </Select>
                    </Field>
                  </div>
                )}
                <Field label="Latitude (°)" htmlFor="lat" required error={E("site.latitudeDeg")} hint="−90 to −75"><Input id="lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} aria-invalid={!!E("site.latitudeDeg")} /></Field>
                <Field label="Longitude (°)" htmlFor="lon" required error={E("site.longitudeDeg")}><Input id="lon" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} /></Field>
                <Field label="Longitude convention" htmlFor="lonconv"><Select id="lonconv" value={lonConv} onChange={(e) => setLonConv(e.target.value as "east")}><option value="east">East-positive</option><option value="west">West-positive (convert)</option></Select></Field>
              </div>
            )}
            <Field label="Observer / panel height above terrain (m)" htmlFor="obsh" error={E("observerHeightM")} hint="Height of the instrument above the LOLA surface; also used for the horizon."><Input id="obsh" inputMode="decimal" value={obsH} onChange={(e) => setObsH(e.target.value)} className="max-w-40" /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="3 · Time window (UTC)" subtitle="Scientific timestamps are always UTC." />
          <div className="grid gap-4 p-4 sm:grid-cols-3">
            <Field label="Start (UTC)" htmlFor="start" required error={E("startUtc")}><Input id="start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Stop (UTC)" htmlFor="end" required error={E("endUtc")}><Input id="end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
            <Field label="Time step" htmlFor="step" error={E("stepSeconds")}><Select id="step" value={step} onChange={(e) => setStep(Number(e.target.value))}>{STEPS.map(([s, l]) => <option key={s} value={s}>{l}</option>)}</Select></Field>
            <div className="flex flex-wrap gap-2 sm:col-span-3">
              <span className="self-center text-xs text-muted">Presets from start:</span>
              {[[1, "1 day"], [7, "1 week"], [SYNODIC_DAYS, "Full lunar cycle (29.53 d)"], [365.25, "1 year"]].map(([d, l]) => (
                <Button key={String(l)} type="button" s="sm" onClick={() => { setEnd(addDays(start, Number(d))); if (Number(d) > 60 && step < 3600) setStep(3600); }}>{l}</Button>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="4 · Terrain product and visibility rules" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Terrain product" htmlFor="product" error={E("terrainProductId")}><Select id="product" value={product} onChange={(e) => setProduct(e.target.value)}>{products.map((p) => <option key={p.id} value={p.id} disabled={p.status !== "approved"}>{p.label}{p.status !== "approved" ? ` (${p.status})` : ""}</option>)}</Select></Field>
            <Field label="Boundary refinement tolerance (s)" htmlFor="tol" error={E("refineToleranceSeconds")}><Input id="tol" inputMode="numeric" value={tol} onChange={(e) => setTol(e.target.value)} /></Field>
            <Field label="Sun counts as visible when" htmlFor="sunrule"><Select id="sunrule" value={sunRule} onChange={(e) => setSunRule(e.target.value)}><option value="any_disk">any part of the disk is above terrain</option><option value="full_disk">the whole disk is above terrain</option><option value="center">the disk centre is above terrain</option></Select></Field>
            <Field label="Earth counts as visible when" htmlFor="earthrule"><Select id="earthrule" value={earthRule} onChange={(e) => setEarthRule(e.target.value)}><option value="any_disk">any part of the disk is above terrain</option><option value="full_disk">the whole disk is above terrain</option><option value="center">the disk centre is above terrain</option></Select></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="5 · Communication and power assumptions (optional)" />
          <div className="space-y-4 p-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={maskOn} onChange={(e) => setMaskOn(e.target.checked)} /> Apply an antenna minimum-elevation mask</label>
            {maskOn && <Field label="Antenna minimum elevation (°)" htmlFor="mask" error={E("antennaMinimumElevationDeg")} hint="Geometric DTE windows require Earth's centre at or above this elevation."><Input id="mask" inputMode="decimal" value={mask} onChange={(e) => setMask(e.target.value)} className="max-w-40" /></Field>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={panelOn} onChange={(e) => setPanelOn(e.target.checked)} /> Estimate idealized solar-panel energy</label>
            {panelOn ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Area (m²)" htmlFor="parea" error={E("solarPanel.areaM2")}><Input id="parea" inputMode="decimal" value={panel.areaM2} onChange={(e) => setPanel({ ...panel, areaM2: e.target.value })} /></Field>
                <Field label="Efficiency (0–0.5)" htmlFor="peff" error={E("solarPanel.efficiency")}><Input id="peff" inputMode="decimal" value={panel.efficiency} onChange={(e) => setPanel({ ...panel, efficiency: e.target.value })} /></Field>
                <Field label="Derating (0–1)" htmlFor="pder" error={E("solarPanel.derating")}><Input id="pder" inputMode="decimal" value={panel.derating} onChange={(e) => setPanel({ ...panel, derating: e.target.value })} /></Field>
                <Field label="Orientation" htmlFor="porient"><Select id="porient" value={panel.orientation} onChange={(e) => setPanel({ ...panel, orientation: e.target.value })}><option value="two_axis_tracking">Two-axis Sun tracking</option><option value="fixed">Fixed normal</option><option value="terrain_aligned">Flat on the ground (follows the local DEM slope)</option></Select></Field>
                {panel.orientation === "fixed" && (
                  <>
                    <Field label="Normal azimuth (°)" htmlFor="paz" error={E("solarPanel.normalAzimuthDeg")}><Input id="paz" inputMode="decimal" value={panel.normalAzimuthDeg} onChange={(e) => setPanel({ ...panel, normalAzimuthDeg: e.target.value })} /></Field>
                    <Field label="Normal elevation (°)" htmlFor="pel" error={E("solarPanel.normalElevationDeg")} hint="0 = vertical panel facing the horizon"><Input id="pel" inputMode="decimal" value={panel.normalElevationDeg} onChange={(e) => setPanel({ ...panel, normalElevationDeg: e.target.value })} /></Field>
                  </>
                )}
                <Field label="Max output (W, optional)" htmlFor="pmax" error={E("solarPanel.maxOutputW")}><Input id="pmax" inputMode="decimal" value={panel.maxOutputW} onChange={(e) => setPanel({ ...panel, maxOutputW: e.target.value })} /></Field>
              </div>
            ) : <p className="text-xs text-muted">Without panel assumptions MoonNav reports sunlight hours only — never watt-hours.</p>}
          </div>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader title="Validation & coverage" />
          <ul className="space-y-2 px-4 py-3 text-sm">
            <li className={cx("flex gap-2", covered ? "text-ok" : "text-bad")}>{covered ? <CircleCheck size={16} className="mt-0.5 shrink-0" /> : <CircleX size={16} className="mt-0.5 shrink-0" />}<span>Terrain coverage: {Number.isFinite(effLat) ? `${Math.abs(effLat).toFixed(4)}°S, ${Number.isFinite(effLon) ? effLon.toFixed(4) : "—"}°E` : "enter a latitude"} {covered ? "is inside LOLA 75°S–90°S" : "is outside the terrain product"}</span></li>
            <li className={cx("flex gap-2", samples > 0 && samples <= MAX_SAMPLES ? "text-ok" : "text-bad")}>{samples > 0 && samples <= MAX_SAMPLES ? <CircleCheck size={16} className="mt-0.5 shrink-0" /> : <CircleX size={16} className="mt-0.5 shrink-0" />}<span><span className="num">{samples.toLocaleString()}</span> time samples (max {MAX_SAMPLES.toLocaleString()}) over <span className="num">{span > 0 ? (span / 86400).toFixed(2) : "—"}</span> days</span></li>
            <li className="flex gap-2 text-ok"><CircleCheck size={16} className="mt-0.5 shrink-0" /><span>Ephemeris: NAIF SPICE DE440 (coverage 1849–2150)</span></li>
            <li className="flex gap-2 text-text-2"><Info size={16} className="mt-0.5 shrink-0" /><span>Horizon: 0.5° bins, 300 km, curvature-aware</span></li>
          </ul>
          {!ok && (
            <div className="border-t border-line px-4 py-3">
              <div className="mb-1 text-xs font-medium text-bad">Fix before running:</div>
              <ul className="space-y-1 text-xs text-bad">{Object.entries(clientErrs).slice(0, 6).map(([k, v]) => <li key={k}>{v}</li>)}</ul>
            </div>
          )}
          {general && <div className="px-4 pb-3"><Notice tone="bad">{general}</Notice></div>}
          <div className="flex flex-col gap-2 border-t border-line p-4">
            <Button variant="primary" disabled={!ok || !!busy} onClick={() => submit(true)}>{busy === "run" ? "Submitting…" : "Save & run analysis"}</Button>
            <Button disabled={!ok || !!busy} onClick={() => submit(false)}>{busy === "save" ? "Saving…" : "Save scenario only"}</Button>
          </div>
        </Card>
        <p className="text-xs leading-relaxed text-muted">Saved scenarios are immutable. Editing one creates a new version, so earlier analyses stay reproducible.</p>
      </aside>
    </div>
  );
}
