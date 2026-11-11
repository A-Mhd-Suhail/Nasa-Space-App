"use client";
import { Download, FileDown, Printer, Star } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { CompareResult } from "@/lib/compare";
import { EXPLAIN } from "@/lib/explain";
import { AdvancedOnly } from "../shell/ModeToggle";
import { AButton, Button, Card, CardHeader, cx, DataTag, Field, InfoTip, Input, Notice, StatusBadge } from "../ui";
import { api } from "./api";

const CompareBars = dynamic(() => import("../viz/charts").then((m) => m.CompareBars), { ssr: false });
const TradeoffScatter = dynamic(() => import("../viz/charts").then((m) => m.TradeoffScatter), { ssr: false });
const MultiDateLines = dynamic(() => import("../viz/charts").then((m) => m.MultiDateLines), { ssr: false });

type A = { id: string; label: string; project: string; start: string; end: string; step: number; site: string };
type Result = CompareResult & { comparisonId: string };

const MAX = 8;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const LEVEL = { investigate: "text-ok border-ok/40 bg-ok-soft", consider: "text-text-2 border-line-2 bg-panel-2", excluded: "text-bad border-bad/40 bg-bad-soft" } as const;

export function CompareClient({ analyses, initialIds, initialWeights, initialThresholds }: { analyses: A[]; initialIds: string[]; initialWeights?: { sun: number; dte: number; energy: number }; initialThresholds?: Record<string, number | null> }) {
  const [sel, setSel] = useState<string[]>(initialIds.filter((i) => analyses.some((a) => a.id === i)).slice(0, MAX));
  const th = (k: string, d = "") => (initialThresholds?.[k] == null ? d : String(initialThresholds[k]));
  const [req, setReq] = useState({ maxSlopeDeg: th("maxSlopeDeg"), minSunHours: th("minSunHours"), minDteHours: th("minDteHours"), minSunFraction: th("minSunFraction"), minDteFraction: th("minDteFraction"), maxUnknownFraction: th("maxUnknownFraction", "0.05") });
  const [w, setW] = useState(initialWeights ?? { sun: 50, dte: 50, energy: 0 });
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX ? s : [...s, id]));
  const n = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      setRes(
        await api<Result>("/api/v1/comparisons", {
          method: "POST",
          body: {
            analysisIds: sel,
            gates: { minSunFraction: n(req.minSunFraction), minDteFraction: n(req.minDteFraction), maxUnknownFraction: n(req.maxUnknownFraction), minSunHours: n(req.minSunHours), minDteHours: n(req.minDteHours), maxSlopeDeg: n(req.maxSlopeDeg) },
            weights: { sun: w.sun / 10, dte: w.dte / 10, energy: w.energy / 10 },
          },
        }),
      );
      // Remember the mission profile for next time (best effort).
      api("/api/v1/me/preferences", { method: "PUT", body: { scoringWeights: w, missionThresholds: Object.fromEntries(Object.entries(req).map(([k, v]) => [k, n(v)])) } }).catch(() => {});
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  const multiDate = useMemo(() => (res ? res.matrix.windows.length > 1 && res.matrix.sites.some((_, i) => res.matrix.cells[i].filter(Boolean).length > 1) : false), [res]);

  if (analyses.length < 2) return <Notice title="At least two completed analyses are needed">Run analyses for two sites, or for the same site on different dates, then come back.</Notice>;
  return (
    <div className="space-y-4">
      <div className="no-print grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title={`Select scenarios (${sel.length}/${MAX})`} subtitle="Several sites on the same dates, one site on several dates, or any mix — the site × date matrix is built automatically." />
          <ul className="max-h-[28rem] divide-y divide-line overflow-auto">
            {analyses.map((a) => (
              <li key={a.id}>
                <label className={cx("flex cursor-pointer items-start gap-3 px-4 py-2.5 text-sm", sel.includes(a.id) && "bg-accent-soft")}>
                  <input type="checkbox" checked={sel.includes(a.id)} onChange={() => toggle(a.id)} disabled={!sel.includes(a.id) && sel.length >= MAX} className="mt-1" />
                  <span className="min-w-0">
                    <span className="font-medium">{a.label}</span> <span className="text-muted">· {a.project}</span>
                    <span className="num block text-xs text-muted">{a.site} · {a.start.slice(0, 16).replace("T", " ")} → {a.end.slice(0, 16).replace("T", " ")} UTC · {a.step / 60} min</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {sel.length > 0 && <div className="border-t border-line px-4 py-2 text-right"><button type="button" className="text-xs text-muted underline" onClick={() => setSel([])}>Clear selection</button></div>}
        </Card>
        <Card>
          <CardHeader title="Mission requirements" subtitle="Hard constraints are applied first and are never averaged into the score." />
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Min. sunlight (h)" htmlFor="g4"><Input id="g4" inputMode="decimal" value={req.minSunHours} onChange={(e) => setReq({ ...req, minSunHours: e.target.value })} placeholder="e.g. 12" /></Field>
              <Field label="Min. direct-to-Earth (h)" htmlFor="g5"><Input id="g5" inputMode="decimal" value={req.minDteHours} onChange={(e) => setReq({ ...req, minDteHours: e.target.value })} placeholder="e.g. 8" /></Field>
              <Field label="Max. local slope (°)" htmlFor="g6"><Input id="g6" inputMode="decimal" value={req.maxSlopeDeg} onChange={(e) => setReq({ ...req, maxSlopeDeg: e.target.value })} placeholder="e.g. 15" /></Field>
            </div>
            <AdvancedOnly className="grid grid-cols-2 gap-2">
              <Field label="Min. sunlit fraction (0–1)" htmlFor="g1"><Input id="g1" inputMode="decimal" value={req.minSunFraction} onChange={(e) => setReq({ ...req, minSunFraction: e.target.value })} placeholder="e.g. 0.5" /></Field>
              <Field label="Min. DTE fraction (0–1)" htmlFor="g2"><Input id="g2" inputMode="decimal" value={req.minDteFraction} onChange={(e) => setReq({ ...req, minDteFraction: e.target.value })} placeholder="e.g. 0.6" /></Field>
              <Field label="Max. unknown fraction (0–1)" htmlFor="g3"><Input id="g3" inputMode="decimal" value={req.maxUnknownFraction} onChange={(e) => setReq({ ...req, maxUnknownFraction: e.target.value })} /></Field>
            </AdvancedOnly>
            <fieldset className="relative space-y-2 rounded-md border border-line p-3">
              <legend className="flex items-center gap-1 px-1 text-xs text-muted">Importance weights <InfoTip text={EXPLAIN.feasibility} /></legend>
              {([["sun", "Sunlight (power)"], ["dte", "Direct-to-Earth (communication)"], ["energy", "Panel energy (if modelled)"]] as const).map(([k, l]) => (
                <label key={k} className={cx("block text-xs text-text-2", k === "energy" && "adv-only")}>
                  <span className="flex justify-between"><span>{l}</span><span className="num">{w[k]}%</span></span>
                  <input type="range" min={0} max={100} step={5} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} className="w-full accent-[var(--accent)]" aria-label={`${l} weight`} />
                </label>
              ))}
            </fieldset>
            {err && <Notice tone="bad">{err}</Notice>}
            <Button variant="primary" className="w-full" disabled={sel.length < 2 || busy} onClick={run} data-testid="run-compare">{busy ? "Comparing…" : sel.length < 2 ? "Select at least two" : `Compare ${sel.length} scenarios`}</Button>
          </div>
        </Card>
      </div>

      {res && (
        <div className="space-y-4" data-testid="compare-results">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-2xl">Comparison report</h2>
            <div className="no-print flex flex-wrap gap-2">
              <AButton s="sm" href={`/api/v1/comparisons/${res.comparisonId}?format=pdf`}><FileDown size={14} /> PDF</AButton>
              <AButton s="sm" href={`/api/v1/comparisons/${res.comparisonId}?format=json`}><Download size={14} /> JSON</AButton>
              <Button s="sm" onClick={() => window.print()}><Printer size={14} /> Print</Button>
            </div>
          </div>
          <Notice tone="info" title="Which scenarios deserve further investigation">
            <span data-testid="compare-summary">{res.summary}</span>
            <span className="mt-1 block text-xs text-muted">{res.method.disclaimer}</span>
          </Notice>
          {!res.compatibility.compatible && <Notice tone="warn" title="These analyses are not directly comparable">{res.compatibility.issues.map((i) => <div key={i}>• {i}</div>)}</Notice>}
          {res.rankingWithheld && <Notice>{res.rankingWithheld}</Notice>}

          {res.tradeoffs.length > 0 && (
            <Card>
              <CardHeader title="Mission trade-offs" tag={<DataTag kind="calculated" />} subtitle="Opposing strengths, stated in plain language. MoonNav does not pick a single winner when a trade-off exists." />
              <ul className="space-y-2 px-4 py-3 text-[15px] leading-relaxed text-text-2" data-testid="tradeoffs">
                {res.tradeoffs.map((t) => <li key={`${t.a}|${t.b}`}>• {t.text}</li>)}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Side-by-side results" tag={<DataTag kind="calculated" />} subtitle={res.method.order} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <caption className="sr-only">Comparison metrics, constraints, scores and recommendations</caption>
                <thead className="text-left text-xs text-muted">
                  <tr>{["Rank", "Scenario", "Sunlight", "Sun elev. min/mean/max", "Geometric DTE", "Terrain", "Data", "Constraints", "Score /100", "Recommendation"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="num">
                  {res.rows.map((r) => (
                    <tr key={r.analysisId} className="border-t border-line align-top">
                      <td className="px-3 py-2 font-semibold">{r.rank ?? "—"}{r.tiedWith.length > 0 && <span className="ml-1 rounded bg-accent-soft px-1 text-[11px] font-medium text-accent" title={`Tied with ${r.tiedWith.join(", ")}`}>Tie</span>}</td>
                      <td className="px-3 py-2"><div className="flex items-center gap-1 font-medium">{r.pareto && <Star size={13} className="text-accent" aria-label="Pareto-optimal" />}{r.label}</div><div className="text-xs text-muted">{r.siteLabel} · {r.windowLabel} UTC</div><div className="adv-only text-xs text-muted">quality {r.metrics.quality} · terrain {r.metrics.siteHeightM == null ? "—" : `${r.metrics.siteHeightM.toFixed(0)} m`}</div></td>
                      <td className="px-3 py-2 text-sun">{r.metrics.sunHours.toFixed(1)} h<div className="text-xs text-muted">{pct(r.metrics.sunFraction)} · {r.metrics.sunIntervals} int.</div></td>
                      <td className="px-3 py-2">{r.metrics.sunElMean == null ? "—" : `${r.metrics.sunElMin?.toFixed(1)} / ${r.metrics.sunElMean.toFixed(1)} / ${r.metrics.sunElMax?.toFixed(1)}°`}</td>
                      <td className="px-3 py-2 text-earth">{r.metrics.dteHours.toFixed(1)} h<div className="text-xs text-muted">{pct(r.metrics.dteFraction)} · mask {r.metrics.antennaMaskDeg ?? "none"}</div></td>
                      <td className="px-3 py-2">{r.metrics.slopeDeg == null ? <span className="text-muted">slope n/a</span> : `${r.metrics.slopeDeg.toFixed(1)}°`}<div className="text-xs text-muted">{r.metrics.roughnessM == null ? "" : `rough ${r.metrics.roughnessM.toFixed(2)} m · `}{r.metrics.terrainResolutionM == null ? "" : `${r.metrics.terrainResolutionM} m DEM`}</div></td>
                      <td className="px-3 py-2">{pct(r.metrics.unknownFraction)} unknown<div className="text-xs text-muted">{r.metrics.quality} · {r.metrics.windowHours.toFixed(0)} h window</div></td>
                      <td className="px-3 py-2">{r.gates.length === 0 ? <span className="text-muted">none set</span> : <StatusBadge status={r.gateStatus === "pass" ? "ok" : r.gateStatus === "fail" ? "failed" : "unavailable"} />}<ul className="mt-1 text-xs text-muted">{r.gates.map((g) => <li key={g.gate}>{g.gate}: {g.result}</li>)}</ul></td>
                      <td className="px-3 py-2"><span className="text-[15px] font-semibold">{r.score100 == null ? "—" : r.score100.toFixed(1)}</span>{r.breakdown && <div className="text-xs text-muted">sun {r.breakdown.sun.toFixed(1)} + DTE {r.breakdown.dte.toFixed(1)}{r.breakdown.energy ? ` + E ${r.breakdown.energy.toFixed(1)}` : ""}</div>}</td>
                      <td className="max-w-[16rem] px-3 py-2"><span className={cx("inline-block rounded border px-1.5 py-0.5 text-xs font-medium capitalize", LEVEL[r.recommendation.level])}>{r.recommendation.level}</span><div className="mt-1 text-xs leading-snug text-muted">{r.recommendation.reason}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-4 py-3 text-xs leading-relaxed text-muted">
              <p>★ Pareto-optimal: {res.method.pareto}. Scores within {res.method.tieTolerancePoints} points share a rank and are marked “Tie”.</p>
              <p className="mt-1">Normalisation: {res.method.normalization}. {res.compatibility.energyComparable ? "" : "Energy is excluded from scoring unless every analysis has identical panel assumptions."}</p>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Sunlight vs direct-to-Earth trade-off" subtitle="Each point is a scenario. Points on the dashed Pareto front are not beaten on both axes by any other passing scenario." />
              <div className="px-2 py-2"><TradeoffScatter points={res.rows.map((r) => ({ label: r.label, sun: r.metrics.sunHours, dte: r.metrics.dteHours, pareto: r.pareto, excluded: r.gateStatus === "fail" }))} /></div>
            </Card>
            <Card>
              <CardHeader title="Score breakdown" subtitle="Points contributed by each criterion with your current weights (0–100)." />
              <div className="px-2 py-2"><CompareBars stacked yName="points" ariaLabel="Stacked score breakdown per scenario" labels={res.rows.map((r) => r.label)} series={[{ name: "Sunlight", values: res.rows.map((r) => +(r.breakdown?.sun ?? 0).toFixed(2)), color: "sun", unit: "pts" }, { name: "Direct-to-Earth", values: res.rows.map((r) => +(r.breakdown?.dte ?? 0).toFixed(2)), color: "earth", unit: "pts" }]} /></div>
            </Card>
            <Card>
              <CardHeader title="Sunlight hours per scenario" />
              <div className="px-2 py-2"><CompareBars yName="h" max={null} ariaLabel="Direct sunlight hours per scenario" labels={res.rows.map((r) => r.label)} series={[{ name: "Direct sunlight (h)", values: res.rows.map((r) => +r.metrics.sunHours.toFixed(2)), color: "sun", unit: "h" }]} /></div>
            </Card>
            <Card>
              <CardHeader title="Direct-to-Earth hours per scenario" />
              <div className="px-2 py-2"><CompareBars yName="h" max={null} ariaLabel="Geometric direct-to-Earth hours per scenario" labels={res.rows.map((r) => r.label)} series={[{ name: "Geometric DTE (h)", values: res.rows.map((r) => +r.metrics.dteHours.toFixed(2)), color: "earth", unit: "h" }]} /></div>
            </Card>
          </div>
          <Card>
            <CardHeader title="Combined: sunlit vs geometric DTE fraction" />
            <div className="px-2 py-2"><CompareBars labels={res.rows.map((r) => r.label)} series={[{ name: "Sunlit %", values: res.rows.map((r) => +(r.metrics.sunFraction * 100).toFixed(2)), color: "sun", unit: "%" }, { name: "Geometric DTE %", values: res.rows.map((r) => +(r.metrics.dteFraction * 100).toFixed(2)), color: "earth", unit: "%" }]} /></div>
          </Card>

          <Card>
            <CardHeader title="Site × date matrix" subtitle="Rows: distinct sites. Columns: analysis window start (UTC). Each cell: sunlight / direct-to-Earth hours and score." />
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="matrix">
                <caption className="sr-only">Site by date comparison matrix</caption>
                <thead className="text-left text-xs text-muted"><tr><th scope="col" className="px-3 py-2 font-medium">Site</th>{res.matrix.windows.map((wl) => <th key={wl} scope="col" className="px-3 py-2 font-medium">{wl}</th>)}</tr></thead>
                <tbody className="num">
                  {res.matrix.sites.map((s, i) => (
                    <tr key={s.key} className="border-t border-line">
                      <th scope="row" className="px-3 py-2 text-left font-medium">{s.label}</th>
                      {res.matrix.cells[i].map((c, j) => (
                        <td key={j} className="px-3 py-2">{c ? <><span className="text-sun">{c.sunHours.toFixed(1)} h</span> / <span className="text-earth">{c.dteHours.toFixed(1)} h</span><div className="text-xs text-muted">{c.score100 == null ? "—" : `${c.score100.toFixed(1)} pts`} · {c.gateStatus}</div></> : <span className="text-muted">—</span>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {multiDate && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader title="Sunlight across dates" />
                <div className="px-2 py-2"><MultiDateLines unit="h" windows={res.matrix.windows} series={res.matrix.sites.map((s, i) => ({ name: s.label, values: res.matrix.cells[i].map((c) => (c ? +c.sunHours.toFixed(2) : null)) }))} /></div>
              </Card>
              <Card>
                <CardHeader title="Direct-to-Earth across dates" />
                <div className="px-2 py-2"><MultiDateLines unit="h" windows={res.matrix.windows} series={res.matrix.sites.map((s, i) => ({ name: s.label, values: res.matrix.cells[i].map((c) => (c ? +c.dteHours.toFixed(2) : null)) }))} /></div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
