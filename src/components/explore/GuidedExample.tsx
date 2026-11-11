"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, CardHeader, cx, DataTag } from "../ui";

type Item = { siteKey: string; name: string; sunFraction: number; earthFraction: number; quality: string; site: { latitudeDeg: number; longitudeEastDeg: number; heightM: number | null; featureType: string } };

/** Guided example: a question, a prediction, then the computed answer (with the technical view showing the same numbers). */
export function GuidedExample({ items }: { items: Item[] }) {
  const a = items.find((i) => i.siteKey === "mons-malapert") ?? items[0];
  const b = items.find((i) => i.siteKey === "shackleton") ?? items[1];
  const [guess, setGuess] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const better = a.sunFraction >= b.sunFraction ? a : b;
  return (
    <Card className="mt-8">
      <CardHeader title="Guided example: mountain top or crater floor?" tag={<DataTag kind="precomputed" />} subtitle="Same 30-day window, same method, same assumptions." />
      <div className="space-y-4 px-4 py-4 text-sm">
        <p className="text-text-2">
          <strong className="text-text">{a.name}</strong> is a {a.site.featureType.toLowerCase()} at {Math.abs(a.site.latitudeDeg).toFixed(2)}°S, {a.site.heightM?.toFixed(0)} m above the reference sphere.{" "}
          <strong className="text-text">{b.name}</strong> is a {b.site.featureType.toLowerCase()} whose centre is at {Math.abs(b.site.latitudeDeg).toFixed(2)}°S, {b.site.heightM?.toFixed(0)} m. Which one gets more direct sunlight between 15 November and 15 December 2026?
        </p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Your prediction">
          {[a, b].map((x) => (
            <button key={x.siteKey} type="button" role="radio" aria-checked={guess === x.siteKey} onClick={() => { setGuess(x.siteKey); setStep(1); }} className={cx("rounded-md border px-3 py-2", guess === x.siteKey ? "border-accent bg-accent-soft text-accent" : "border-line-2 hover:bg-panel-2")}>
              {x.name}
            </button>
          ))}
        </div>
        {step >= 1 && (
          <div className="rounded-md border border-line bg-panel-2 p-4">
            <p className="font-medium">{guess === better.siteKey ? "Correct." : "Not quite."} {better.name} receives more direct sunlight.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[a, b].map((x) => (
                <div key={x.siteKey}>
                  <div className="text-xs text-muted">{x.name}</div>
                  <div className="num text-2xl font-semibold text-sun">{(x.sunFraction * 100).toFixed(1)}% <span className="text-sm font-normal text-muted">sunlit</span></div>
                  <div className="num text-sm text-earth">{(x.earthFraction * 100).toFixed(1)}% Earth in view</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-text-2">Why: the Sun never rises more than a couple of degrees above the horizon here. A high massif sees over most surrounding terrain, while a crater floor is ringed by walls taller than the Sun ever climbs — it is a permanently shadowed region.</p>
            <details className="mt-3">
              <summary className="cursor-pointer text-accent">Show technical details</summary>
              <ul className="num mt-2 space-y-1 text-xs text-text-2">
                <li>Fractions are refined sunlit time ÷ analysed time, using the “any part of the disk visible” rule.</li>
                <li>{a.name}: sunFraction = {a.sunFraction}, earthFraction = {a.earthFraction}, quality = {a.quality}.</li>
                <li>{b.name}: sunFraction = {b.sunFraction}, earthFraction = {b.earthFraction}, quality = {b.quality}.</li>
                <li>Ephemeris: NAIF SPICE DE440, apparent (LT+S); terrain: LOLA LDEM_75S_240M, 300 km curvature-aware horizon.</li>
              </ul>
              <Link href={`/explore?site=${a.siteKey}&tab=sun`} className="mt-2 inline-block text-xs text-accent hover:underline">Open the full analysis →</Link>
            </details>
          </div>
        )}
      </div>
    </Card>
  );
}
