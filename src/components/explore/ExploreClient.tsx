"use client";
import { Bookmark, MapPin, Search, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalysisResult } from "@/lib/analysis-types";
import { cellAt } from "@/lib/feasibility";
import { COVERAGE_LAT, fmtLat, fmtLon, toXY } from "@/lib/lunar";
import { Breadcrumbs, Button, Card, CardHeader, cx, DataTag, fmtUtc, LinkButton, Notice } from "../ui";
import type { ImageryStatus, MapLayers, SavedPoint } from "../viz/LunarMap";
import { directionLatLon } from "../viz/globe-math";
import { CellExplanation, FeasibilityPanel, useFeasibility } from "./FeasibilityPanel";
import type { RegionalGrid } from "../viz/RegionalScene";
import type { TerrainPatch } from "../viz/TerrainScene";

const LunarMap = dynamic(() => import("../viz/LunarMap").then((m) => m.LunarMap), { ssr: false, loading: () => <div className="h-[560px] animate-pulse rounded-[6px] border border-line bg-viewport" /> });
const SunView = dynamic(() => import("../analysis/AnalysisViews").then((m) => m.SunView), { ssr: false });
const EarthView = dynamic(() => import("../analysis/AnalysisViews").then((m) => m.EarthView), { ssr: false });
const SiteScene = dynamic(() => import("./SiteScene").then((m) => m.SiteScene), { ssr: false });
const RegionView = dynamic(() => import("./RegionView").then((m) => m.RegionView), { ssr: false });
const GlobeScene = dynamic(() => import("../viz/GlobeScene").then((m) => m.GlobeScene), { ssr: false, loading: () => <div className="h-[520px] animate-pulse rounded-[6px] border border-line bg-viewport" /> });

type Site = { key: string; name: string; featureType: string; latitudeDeg: number; longitudeEastDeg: number; diameterKm: number | null; heightM: number | null; source: string; sourceUrl: string | null; note: string };
type Point = { latitudeDeg: number; longitudeEastDeg: number; heightM: number | null; slopeDeg: number | null; covered: boolean; message: string | null };
type Tab = "sun" | "earth" | "3d" | "region" | "globe";
const TABS: [Tab, string][] = [["sun", "Sun & Power"], ["earth", "Earth & DTE"], ["3d", "Site 3D"], ["region", "Polar region 3D"], ["globe", "Global Moon"]];

export function ExploreClient({ sites, featured, window: win, initialSite, initialTab, signedIn, variant = "public" }: { sites: Site[]; featured: string[]; window: [string, string, number]; initialSite: string; initialTab: string; signedIn: boolean; variant?: "public" | "app" }) {
  const [selected, setSelected] = useState<string | null>(sites.some((s) => s.key === initialSite) ? initialSite : "mons-malapert");
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const [pointState, setPointState] = useState<{ key: string; data: Point | null; err: string | null } | null>(null);
  const [tab, setTab] = useState<Tab>((TABS.some(([k]) => k === initialTab) ? initialTab : "sun") as Tab);
  const [imagery, setImagery] = useState<ImageryStatus>("idle");
  const [layers, setLayers] = useState<MapLayers>({ hillshade: true, imagery: false, feasibility: false, elevation: false, slope: false, graticule: true, sites: true, coverage: true, saved: true });
  const [demoState, setDemoState] = useState<{ key: string; demo?: AnalysisResult; patch?: TerrainPatch } | null>(null);
  const [regional, setRegional] = useState<RegionalGrid | null>(null);
  const [saved, setSaved] = useState<SavedPoint[]>([]);
  const [saveMsg, setSaveMsg] = useState<{ tone: "ok" | "bad"; t: string } | null>(null);
  const [q, setQ] = useState("");
  const feas = useFeasibility(!!layers.feasibility);
  const site = sites.find((s) => s.key === selected) ?? null;
  const isFeatured = !!site && featured.includes(site.key);
  const demo = demoState && site && demoState.key === site.key ? demoState.demo ?? null : null;
  const patch = demoState && site && demoState.key === site.key ? demoState.patch ?? null : null;
  const pickedKey = picked ? `${picked.lat},${picked.lon}` : "";
  const outside = !!picked && picked.lat > COVERAGE_LAT;
  const point = pointState?.key === pickedKey ? pointState.data : null;
  const pointErr = outside ? "Outside terrain coverage (the LOLA product covers 75°S to the pole). No elevation is reported." : pointState?.key === pickedKey ? pointState.err : null;

  const loadSaved = useCallback(async () => {
    if (!signedIn) return;
    const r = await fetch("/api/v1/locations");
    if (r.ok) setSaved((await r.json()).locations);
  }, [signedIn]);

  useEffect(() => {
    loadSaved(); // eslint-disable-line react-hooks/set-state-in-effect -- async load; state is set after the fetch resolves
  }, [loadSaved]);

  useEffect(() => {
    if (!site || !featured.includes(site.key)) return;
    let live = true;
    const key = site.key;
    Promise.all([fetch(`/data/demo/${key}.json`).then((r) => r.json()), fetch(`/data/terrain/${key}.json`).then((r) => r.json())]).then(([d, p]) => live && setDemoState({ key, demo: d, patch: p }));
    const url = new URL(window.location.href);
    url.searchParams.set("site", site.key);
    window.history.replaceState(null, "", url);
    return () => {
      live = false;
    };
  }, [site, featured]);

  useEffect(() => {
    if (tab !== "region" || regional) return;
    let live = true;
    fetch("/data/terrain/regional_75s.json").then((r) => r.json()).then((d) => live && setRegional(d));
    return () => {
      live = false;
    };
  }, [tab, regional]);

  useEffect(() => {
    if (!picked || picked.lat > COVERAGE_LAT) return;
    const key = `${picked.lat},${picked.lon}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/v1/terrain/point?lat=${picked.lat.toFixed(6)}&lon=${picked.lon.toFixed(6)}`, { signal: ctrl.signal })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d?.error?.message ?? "Unavailable");
          setPointState({ key, data: d, err: null });
        })
        .catch((e) => e.name !== "AbortError" && setPointState({ key, data: null, err: e.message }));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [picked]);

  // Sun direction for globe lighting, from the selected featured site's SPICE analysis (first sample).
  const globeSun = useMemo(() => {
    const row = demo?.timeseries[0];
    if (!demo || !row || row.sunAzDeg == null || row.sunElDeg == null) return null;
    return { ...directionLatLon(demo.site.latitudeDeg, demo.site.longitudeEastDeg, row.sunAzDeg, row.sunElDeg), label: fmtUtc(row.utc) };
  }, [demo]);
  const list = useMemo(() => sites.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || s.featureType.toLowerCase().includes(q.toLowerCase())), [sites, q]);
  const analyseHref = (path: string) => (signedIn ? path : `/login?next=${encodeURIComponent(path)}`);
  const saveHref = analyseHref(`/app/scenarios/new?site=${site?.key ?? ""}`);

  const saveLocation = async (name: string, lat: number, lon: number, siteId?: string) => {
    setSaveMsg(null);
    const r = await fetch("/api/v1/locations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, latitudeDeg: lat, longitudeEastDeg: lon, siteId: siteId ?? null }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setSaveMsg({ tone: "bad", t: d?.error?.message ?? "Could not save" });
    setSaveMsg({ tone: "ok", t: `Saved “${name}” to this workspace.` });
    loadSaved();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[64ch]">
          {variant === "app" && <Breadcrumbs items={[{ label: "Workspace", href: "/app" }, { label: "Site Explorer" }]} />}
          <h1 className="font-display text-[clamp(1.75rem,1.2rem+1.6vw,2.5rem)] font-medium leading-[1.1]">South-pole explorer</h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-text-2">
            Inspect the LOLA terrain, pick a named feature or click any point inside 75°S. Featured stations carry a precomputed Sun and Earth analysis for {fmtUtc(win[0]).slice(0, 10)} → {fmtUtc(win[1]).slice(0, 10)}.{variant === "public" ? " No account needed." : ""}
          </p>
        </div>
        <LinkButton href={saveHref} variant="primary">{signedIn ? "Analyse this site" : "Save as scenario"}</LinkButton>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-3">
          <LunarMap overlay={layers.feasibility ? feas.overlay : null} onImageryStatus={setImagery} sites={sites} saved={saved} selectedKey={selected} picked={picked} onPick={(p) => setPicked(p)} onSelectSite={(k) => { setSelected(k); setPicked(null); }} layers={layers} height="clamp(360px, 92vw, 560px)" />
          <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[6px] border border-line bg-panel px-4 py-2.5 text-[13px]">
            <legend className="sr-only">Map layers</legend>
            <span role="radiogroup" aria-label="Basemap" className="flex rounded-[5px] border border-line p-0.5 text-[12px]">
              {([
                ["relief", "LOLA relief"],
                ["imagery", "LROC WAC imagery"],
              ] as const).map(([k, l]) => {
                const on = k === "imagery" ? !!layers.imagery : !layers.imagery;
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setLayers({ ...layers, imagery: k === "imagery", hillshade: k === "relief" })} className={cx("rounded-[3px] px-2.5 py-1", on ? "bg-accent text-accent-ink" : "text-text-2 hover:bg-panel-3/60")}>
                    {l}
                  </button>
                );
              })}
            </span>
            {([
              ["feasibility", "Feasibility"],
              ["elevation", "Elevation"],
              ["slope", "Slope"],
              ["graticule", "Grid"],
              ["sites", "Named sites"],
              ...(signedIn ? ([["saved", "Saved locations"]] as const) : []),
              ["coverage", "Coverage edge"],
            ] as [keyof MapLayers, string][]).map(([k, l]) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 text-text-2">
                <input type="checkbox" checked={!!layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} /> {l}
              </label>
            ))}
            <span className="ml-auto flex items-center gap-2 text-xs text-muted"><DataTag kind="measured" /> derived from LDEM_75S_240M</span>
          </fieldset>
          {layers.imagery && (
            <p className="text-xs text-muted" data-testid="imagery-status" aria-live="polite">
              {imagery === "error" ? <span className="text-bad">Some NASA Moon Trek tiles failed to load; the LOLA layers are unaffected. </span> : imagery === "loading" ? "Loading NASA Moon Trek tiles… " : null}
              Imagery: LRO WAC Mosaic, S Pole v2 (100 m/px) — NASA/GSFC/Arizona State University, served by <a className="text-accent" href="https://trek.nasa.gov/moon/" target="_blank" rel="noopener noreferrer">NASA Moon Trek</a>. Optical context only; illumination in the mosaic is not the analysis window.
            </p>
          )}
          {layers.feasibility && <FeasibilityPanel f={feas} />}
          {(layers.elevation || layers.slope) && (
            <div className="flex flex-wrap gap-6 text-xs text-muted">
              {layers.elevation && <Legend label="Elevation" from="−6 km" to="+6 km" stops={["#2a2620", "#4e5448", "#7e8876", "#a99d84", "#d8c08a", "#faf5eb"]} />}
              {layers.slope && <Legend label="Slope (480 m)" from="0°" to="30°+" stops={["#f4f0e7", "#ddc496", "#c59664", "#a65e45", "#5f3428", "#292722"]} />}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Sites" subtitle="IAU Gazetteer feature centres, not official landing sites" />
            <div className="p-3">
              <label htmlFor="site-search" className="sr-only">Search sites</label>
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <input id="site-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sites or feature type…" className="h-9 w-full rounded-[5px] border border-line-2 bg-panel pl-8 pr-3 text-sm" />
              </div>
              <ul className="mt-2 max-h-64 overflow-auto" role="listbox" aria-label="Named sites">
                {list.length === 0 && <li role="none" className="px-2 py-3 text-sm text-muted">No sites match “{q}”.</li>}
                {list.map((s) => (
                  <li key={s.key} role="none">
                    <button type="button" role="option" aria-selected={s.key === selected} onClick={() => { setSelected(s.key); setPicked(null); }} className={cx("flex w-full items-center justify-between rounded-[4px] px-2.5 py-1.5 text-left text-sm", s.key === selected ? "bg-accent-soft text-text" : "text-text-2 hover:bg-panel-3/60")}>
                      <span className="flex items-center gap-2">{s.key === selected && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />}{s.name}</span>
                      <span className="num flex items-center gap-1.5 text-[11px] text-muted">{featured.includes(s.key) && <span className="rounded-[3px] border border-line-2 px-1 font-mono text-[11px] uppercase">demo</span>}{Math.abs(s.latitudeDeg).toFixed(2)}°S</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
          <Card>
            <CardHeader title="Go to coordinate" subtitle={<><span className="simple-only">Type a latitude (−75 to −90 for the south pole) and a longitude.</span><span className="adv-only">Planetocentric degrees, east-positive longitude [0, 360), MOON_ME</span></>} />
            <form className="grid grid-cols-[1fr_1fr_auto] gap-2 p-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const la = Number(f.get("lat")); const lo = Number(f.get("lon")); if (Number.isFinite(la) && Number.isFinite(lo) && la >= -90 && la <= 90) setPicked({ lat: la, lon: ((lo % 360) + 360) % 360 }); }}>
              <label className="sr-only" htmlFor="go-lat">Latitude</label>
              <input id="go-lat" name="lat" inputMode="decimal" placeholder="lat e.g. -89.45" className="num h-9 min-w-0 rounded-[5px] border border-line-2 bg-panel px-2 text-sm" />
              <label className="sr-only" htmlFor="go-lon">Longitude east</label>
              <input id="go-lon" name="lon" inputMode="decimal" placeholder="lon °E e.g. 222.7" className="num h-9 min-w-0 rounded-[5px] border border-line-2 bg-panel px-2 text-sm" />
              <Button type="submit" s="md">Go</Button>
            </form>
          </Card>
          {picked && (
            <Card>
              <CardHeader title="Clicked coordinate" tag={<DataTag kind={point?.covered ? "measured" : "unavailable"} />} />
              <dl className="num grid grid-cols-2 gap-x-3 gap-y-1.5 px-5 py-3 text-sm">
                <dt className="text-muted">Latitude</dt><dd>{fmtLat(picked.lat)}</dd>
                <dt className="text-muted">Longitude</dt><dd>{fmtLon(picked.lon)}</dd>
                <dt className="text-muted">Height</dt><dd>{point?.heightM != null ? `${point.heightM.toFixed(1)} m` : "—"}</dd>
                <dt className="text-muted">Slope (480 m)</dt><dd>{point?.slopeDeg != null ? `${point.slopeDeg.toFixed(1)}°` : "—"}</dd>
              </dl>
              {pointErr && <p className="px-5 pb-3 text-xs text-warn">{pointErr}</p>}
              {layers.feasibility && feas.grid && (() => {
                const [x, y] = toXY(picked.lat, picked.lon);
                const c = cellAt(feas.grid, feas.list, x, y);
                return c ? <CellExplanation cell={c} k={feas.k} /> : <p className="border-t border-line px-5 py-3 text-xs text-muted">Outside the feasibility grid.</p>;
              })()}
              {point?.covered && (
                <div className="space-y-2 border-t border-line px-5 py-3">
                  <p className="text-xs text-muted">Height relative to the 1737.4 km sphere (LOLA).</p>
                  <div className="flex flex-wrap gap-2">
                    <LinkButton s="sm" variant="primary" href={analyseHref(`/app/scenarios/new?lat=${picked.lat.toFixed(5)}&lon=${picked.lon.toFixed(5)}`)}>Analyse here</LinkButton>
                    {signedIn && <Button s="sm" onClick={() => saveLocation(`Point ${Math.abs(picked.lat).toFixed(3)}°S ${picked.lon.toFixed(2)}°E`, picked.lat, picked.lon)}><Bookmark size={14} /> Save location</Button>}
                  </div>
                </div>
              )}
            </Card>
          )}
          {site && (
            <Card>
              <CardHeader title={site.name} subtitle={site.featureType} actions={signedIn ? <Button s="sm" variant="ghost" onClick={() => saveLocation(site.name, site.latitudeDeg, site.longitudeEastDeg, site.key)} aria-label={`Save ${site.name} as a location`}><Bookmark size={14} /> Save</Button> : null} />
              <dl className="num grid grid-cols-2 gap-x-3 gap-y-1.5 px-5 py-3 text-sm">
                <dt className="text-muted">Latitude</dt><dd>{fmtLat(site.latitudeDeg)}</dd>
                <dt className="text-muted">Longitude</dt><dd>{fmtLon(site.longitudeEastDeg)}</dd>
                <dt className="text-muted">LOLA height</dt><dd>{site.heightM != null ? `${site.heightM.toFixed(0)} m` : "—"}</dd>
                <dt className="text-muted">Diameter</dt><dd>{site.diameterKm != null ? `${site.diameterKm.toFixed(1)} km` : "—"}</dd>
              </dl>
              <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">{site.note} {site.sourceUrl && <a className="text-accent" href={site.sourceUrl} target="_blank" rel="noopener noreferrer">Gazetteer entry</a>}</p>
            </Card>
          )}
          {saveMsg && <Notice tone={saveMsg.tone}>{saveMsg.t}</Notice>}
          {signedIn && saved.length > 0 && (
            <Card>
              <CardHeader title="Saved locations" subtitle="Shared with everyone in this workspace" />
              <ul className="divide-y divide-line">
                {saved.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <MapPin size={14} className="shrink-0 text-earth" aria-hidden />
                    <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-accent" onClick={() => setPicked({ lat: l.latitudeDeg, lon: l.longitudeEastDeg })}>{l.name}</button>
                    <button type="button" aria-label={`Delete ${l.name}`} className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-bad-soft hover:text-bad" onClick={async () => { await fetch(`/api/v1/locations/${l.id}`, { method: "DELETE" }); loadSaved(); }}><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {site && (
        <section aria-labelledby="analysis-h" className="pt-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <h2 id="analysis-h" className="flex flex-wrap items-center gap-2.5 font-display text-2xl">{site.name} {isFeatured && tab !== "region" && tab !== "globe" && <DataTag kind="precomputed" />}</h2>
            <div role="tablist" aria-label="Analysis views" className="flex flex-wrap gap-1 rounded-[6px] border border-line bg-panel p-1">
              {TABS.map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={cx("rounded-[4px] px-3 py-1.5 text-[13px] transition-colors", tab === k ? "bg-accent text-accent-ink" : "text-text-2 hover:bg-panel-3/60 hover:text-text")}>{l}</button>
              ))}
            </div>
          </div>
          {tab === "globe" ? (
            <div className="space-y-2">
              <GlobeScene sites={sites} selectedKey={selected} onSelect={(k) => { setSelected(k); setPicked(null); }} onOpenRegional={() => setTab("region")} picked={picked} onPick={(p) => setPicked(p)} sun={globeSun} />
              <p className="text-xs text-muted">Whole-Moon context on the 1737.4 km reference sphere. Click a marker to select a site or click anywhere to pick a coordinate (terrain values are reported inside 75°S). The camera flies to the selection. The dashed copper ring is the 75°S limit of terrain coverage.{globeSun ? " Lighting uses the SPICE Sun direction from the selected site's analysis." : ""}</p>
            </div>
          ) : tab === "region" ? (
            <RegionView regional={regional} sites={sites} selectedKey={selected} onSelect={(k) => setSelected(k)} />
          ) : !isFeatured ? (
            <Notice title="No precomputed analysis for this site">
              Featured stations (Mons Malapert, Mons Mouton, Shackleton, de Gerlache) carry precomputed analyses; the polar region view works for every site. <Link href={saveHref}>{signedIn ? "Run an analysis" : "Sign in"}</Link> to compute {site.name} for any window.
            </Notice>
          ) : !demo ? (
            <div className="h-64 animate-pulse rounded-[6px] border border-line bg-panel-2" />
          ) : (
            <>
              <Notice className="mb-5" title={`Precomputed demonstration · generated ${fmtUtc(demo.demo?.generatedAtUtc)}`}>
                {fmtUtc(demo.timeRange.startUtc)} → {fmtUtc(demo.timeRange.endUtc)}, {demo.timeRange.sampleStepSeconds / 60}-minute sampling, observer 2 m above LOLA terrain, 5° antenna mask, {demo.provenance.methodVersion}. No panel assumptions, so no energy is reported.
              </Notice>
              {tab === "sun" && <SunView r={demo} precomputed />}
              {tab === "earth" && <EarthView r={demo} precomputed />}
              {tab === "3d" && <SiteScene r={demo} patch={patch} precomputed />}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Legend({ label, from, to, stops }: { label: string; from: string; to: string; stops: string[] }) {
  return (
    <div className="flex items-center gap-2">
      <span>{label}</span>
      <span className="num">{from}</span>
      <span aria-hidden className="h-2.5 w-36 rounded-[2px] border border-line" style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }} />
      <span className="num">{to}</span>
    </div>
  );
}
