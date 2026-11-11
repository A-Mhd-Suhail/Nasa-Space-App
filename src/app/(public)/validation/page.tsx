import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Card, CardHeader, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Scientific validation" };
export const dynamic = "force-dynamic";

type Rec = { id: string; category: string; source: string; product: string; epochUtc: string; location: string; method: string; moonnav: unknown; reference: unknown; difference: unknown; tolerance: string; result: string; note?: string };
type Report = { generatedAtUtc: string; live: boolean; summary: Record<string, number>; records: Rec[]; statement: string };

const show = (v: unknown): string => (v == null ? "—" : typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k} ${show(x)}`).join(" · ") : String(v));
const TONE: Record<string, string> = { pass: "text-ok", fail: "text-bad", unavailable: "text-unknown" };

export default function ValidationPage() {
  let rep: Report | null = null;
  try {
    rep = JSON.parse(readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "public/data/validation.json"), "utf8")) as Report;
  } catch {
    rep = null;
  }
  const cats = rep ? [...new Set(rep.records.map((r) => r.category))] : [];
  return (
    <div className="mx-auto max-w-[1240px] space-y-6 px-4 py-12 sm:px-6">
      <header className="max-w-3xl">
        <h1 className="font-display text-[clamp(2rem,1.4rem+2vw,3rem)] leading-tight">Scientific validation</h1>
        <p className="mt-3 text-text-2">Reproducible comparisons of MoonNav&apos;s engine against NASA and JPL references: the SVS Dial-a-Moon / SVS 4930 values, the JPL Horizons API, NAIF SPICE time and frame identities, independent NASA PDS LOLA products, and the LOLA teamthe JPL Horizons API, NAIF SPICE time and frame identities, and independent NASA PDS LOLA products.apos;s permanent-shadow and long-term sunlight maps (Mazarico et al. 2011). Re-run with <code className="font-mono text-sm">npm run science:validate</code>.</p>
      </header>
      {!rep ? <Notice tone="warn">No validation report has been generated on this server yet.</Notice> : (
        <>
          <Notice tone={rep.summary.fail ? "bad" : "ok"} title={`${rep.summary.pass} pass · ${rep.summary.fail} fail · ${rep.summary.unavailable} reference unavailable`}>
            Generated {rep.generatedAtUtc.replace("T", " ").replace("Z", " UTC")}{rep.live ? " with live NASA/JPL services" : " (offline checks only)"}. {rep.statement}
          </Notice>
          {cats.map((c) => (
            <Card key={c}>
              <CardHeader title={c} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <caption className="sr-only">{c} validation results</caption>
                  <thead className="text-left text-xs text-muted"><tr>{["Check", "Reference", "Epoch (UTC)", "Location / frame", "Difference", "Tolerance", "Result"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {rep!.records.filter((r) => r.category === c).map((r) => (
                      <tr key={r.id} className="border-t border-line align-top">
                        <td className="px-3 py-2"><div className="font-medium">{r.id}</div><div className="text-xs text-muted">{r.method}</div></td>
                        <td className="px-3 py-2 text-xs">{r.source}<div className="text-muted">{r.product}</div></td>
                        <td className="num px-3 py-2 text-xs">{r.epochUtc}</td>
                        <td className="px-3 py-2 text-xs">{r.location}</td>
                        <td className="num px-3 py-2 text-xs">{show(r.difference)}<details className="mt-1"><summary className="cursor-pointer text-muted">values</summary><div>MoonNav: {show(r.moonnav)}</div><div>Reference: {show(r.reference)}</div></details></td>
                        <td className="px-3 py-2 text-xs">{r.tolerance}</td>
                        <td className={`px-3 py-2 font-semibold uppercase ${TONE[r.result] ?? ""}`}>{r.result}{r.note ? <div className="text-xs font-normal normal-case text-muted">{r.note}</div> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
