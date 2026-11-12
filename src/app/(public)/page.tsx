import { ArrowRight, ArrowUpRight, Globe2, Mountain, Sun } from "lucide-react";
import Link from "next/link";
import demoIndex from "../../../public/data/demo/index.json";
import malapert from "../../../public/data/demo/mons-malapert.json";
import sitesData from "@/data/sites.json";
import { HeroChart } from "@/components/home/HeroChart";
import { HomeGlobe } from "@/components/home/HomeGlobe";
import { HorizonPlate } from "@/components/home/HorizonPlate";
import { DemoButton } from "@/components/auth/DemoButton";
import { DataTag, LinkButton } from "@/components/ui";
import type { AnalysisResult } from "@/lib/analysis-types";

export const dynamic = "force-dynamic";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const CAPABILITIES: [string, string, string][] = [
  ["Site Explorer", "LOLA relief, slope and elevation layers in the polar projection, 17 named features, coordinate inspection and saved locations.", "/explore"],
  ["Sun & Power", "Sun azimuth and elevation against the terrain horizon, refined sunlit intervals and, only with panel assumptions, idealized energy.", "/explore?site=mons-mouton&tab=sun"],
  ["Earth & DTE", "Earth line of sight above terrain and an antenna mask. Geometry only: never presented as radio-link availability.", "/explore?site=mons-malapert&tab=earth"],
  ["3D terrain", "A 40 km LOLA patch in the site's own frame and a regional view of the whole 75°S cap, lit from the computed Sun.", "/explore?site=mons-malapert&tab=3d"],
  ["Comparison", "Two to eight scenarios: compatibility first, hard gates second, weighted preferences last. Ranking is withheld when inputs differ.", "/register"],
  ["Reports", "PDF briefs, CSV series and JSON with kernel and terrain checksums, shared through expiring, revocable links.", "/register"],
];

const SOURCES: [string, string, string][] = [
  ["NASA PDS · LRO LOLA LDEM_75S_240M", "Terrain heights, 240 m, 75°S–pole; label-validated and SHA-256 checked", "In use"],
  ["NASA/JPL NAIF SPICE", "DE440 positions, DE440 lunar orientation, MOON_ME frame", "In use"],
  ["JPL Horizons", "Live independent cross-check per analysis: Sun and Earth angles agree within 0.01°", "Validation"],
  ["IAU / USGS Gazetteer", "Feature names and centre coordinates", "In use"],
  ["NASA Moon Trek WMTS", "LRO WAC imagery for the 2D map layer and the 3D globe texture", "In use"],
];

export default function Home() {
  const sites = Object.fromEntries(sitesData.sites.map((s) => [s.key, s]));
  const stations = demoIndex.items.map((i) => ({ ...sites[i.siteKey], key: i.siteKey, name: i.name, sunFraction: i.sunFraction, earthFraction: i.earthFraction }));
  const r = malapert as unknown as AnalysisResult;
  return (
    <>
      {/* Thesis: the light at a polar site, read off real terrain */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:pb-20 lg:pt-16">
          <div className="max-w-xl">
            <h1 className="font-display text-[clamp(2.6rem,1.6rem+3.6vw,4.4rem)] font-medium leading-[1.02] tracking-[-0.025em] text-text">
              Read the light before you land.
            </h1>
            <p className="mt-6 text-[17px] leading-relaxed text-text-2">
              At the lunar south pole the Sun skims the horizon and Earth hangs low. MoonNav traces both against the real terrain — LOLA laser
              altimetry with lunar curvature, NAIF SPICE ephemerides checked against JPL Horizons — and turns it into sunlight intervals,
              direct-to-Earth windows and comparisons you can defend.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/app/scenarios/new?guided=1" variant="primary" s="lg">Start mission planning <ArrowRight size={17} /></LinkButton>
              <LinkButton href="/explore" variant="secondary" s="lg">Explore without an account</LinkButton>
              <DemoButton variant="cta" testId="home-demo-button" />
              <LinkButton href="#method" variant="ghost" s="lg">How it works</LinkButton>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-[6px] border border-line bg-line text-[13px]">
              {[
                ["Terrain", "240 m LOLA"],
                ["Horizon", "300 km, curved"],
                ["Ephemeris", "< 0.01° vs JPL"],
              ].map(([k, v]) => (
                <div key={k} className="bg-panel px-3 py-2.5">
                  <dt className="text-muted">{k}</dt>
                  <dd className="num mt-0.5 font-medium text-text">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroChart stations={stations} />
        </div>
      </section>

      {/* Interactive 3D Moon preview */}
      <section className="border-b border-line bg-bg-2">
        <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="max-w-md">
            <h2 className="font-display text-[clamp(1.6rem,1.2rem+1.2vw,2.2rem)] leading-tight">Google Maps, but for planning Moon landings</h2>
            <p className="mt-3 text-text-2">Drag to turn the Moon, scroll to zoom. The dots are named south-polar features; click one to open it in the Site Explorer with its terrain, sunlight and Earth visibility.</p>
            <ol className="mt-5 space-y-2 text-[15px] text-text-2">
              <li><strong className="text-text">1. Pick a site</strong> — a named feature, a click on the map or exact coordinates.</li>
              <li><strong className="text-text">2. Pick a UTC date and interval</strong> — the Sun circles the polar sky once every ~29.5 days.</li>
              <li><strong className="text-text">3. MoonNav computes</strong> Sun and Earth directions (SPICE) against the LOLA terrain skyline.</li>
              <li><strong className="text-text">4. Compare and report</strong> — sunlight vs direct-to-Earth trade-offs, exportable briefs.</li>
            </ol>
          </div>
          <HomeGlobe sites={sitesData.sites.map((s) => ({ key: s.key, name: s.name, latitudeDeg: s.latitudeDeg, longitudeEastDeg: s.longitudeEastDeg }))} />
        </div>
      </section>

      {/* Station readings: the same numbers as the plate, in a field-book ledger */}
      <section className="mx-auto max-w-[1240px] px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-[clamp(1.6rem,1.2rem+1.2vw,2.2rem)] leading-tight">Four stations, one month of light</h2>
            <p className="mt-2 max-w-[62ch] text-text-2">Same window, sampling and assumptions at every station: 15 Nov – 15 Dec 2026, 30-minute steps refined to 10 s, observer 2 m above the terrain, 5° antenna mask.</p>
          </div>
          <DataTag kind="precomputed" />
        </div>
        <div className="mt-6 overflow-x-auto rounded-[6px] border border-line bg-panel shadow-[var(--shadow-sheet)]">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Precomputed sunlight and Earth visibility at the featured stations</caption>
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-muted">
                <th scope="col" className="px-5 py-3 font-medium">Station</th>
                <th scope="col" className="px-5 py-3 font-medium">Position</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">LOLA height</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Sunlit</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Earth in view</th>
                <th scope="col" className="px-5 py-3"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="num">
              {stations.map((s) => (
                <tr key={s.key} className="border-b border-line last:border-0 hover:bg-panel-2">
                  <th scope="row" className="px-5 py-3.5 text-left font-display text-[17px] font-normal">{s.name}</th>
                  <td className="px-5 py-3.5 text-text-2">{Math.abs(s.latitudeDeg).toFixed(3)}°S {s.longitudeEastDeg.toFixed(3)}°E</td>
                  <td className="px-5 py-3.5 text-right text-text-2">{s.heightM?.toFixed(0)} m</td>
                  <td className="px-5 py-3.5 text-right font-medium text-sun">{pct(s.sunFraction)}</td>
                  <td className="px-5 py-3.5 text-right font-medium text-earth">{pct(s.earthFraction)}</td>
                  <td className="px-5 py-3.5 text-right"><Link href={`/explore?site=${s.key}`} className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline hover:underline-offset-4">Open <ArrowUpRight size={14} /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-muted">Shackleton and de Gerlache readings are crater-centre floors: permanently shadowed, so 0% sunlight is the expected answer, not a gap.</p>
      </section>

      {/* Why: three constraints, set as a ruled spread rather than cards */}
      <section className="border-y border-line bg-bg-2">
        <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6">
          <h2 className="max-w-2xl font-display text-[clamp(1.6rem,1.2rem+1.2vw,2.2rem)] leading-tight">Three things decide whether a polar site works</h2>
          <div className="mt-10 grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
            {[
              { Icon: Sun, c: "text-sun", t: "Sunlight", d: "The Sun never climbs more than about 1.5° above the pole's horizon geometry, so a ridge tens of kilometres away can switch a site between light and shadow." },
              { Icon: Globe2, c: "text-earth", t: "Earth in view", d: "Earth hangs low and nearly fixed in the lunar sky, wobbling a few degrees with libration. Whether it clears local terrain decides direct-to-Earth line of sight." },
              { Icon: Mountain, c: "text-accent", t: "Terrain and date", d: "Crater walls, massifs and lunar curvature shape every horizon, and the Sun's path shifts through the month and the seasons. Small moves change the answer." },
            ].map(({ Icon, c, t, d }) => (
              <div key={t} className="md:px-8 md:first:pl-0 md:last:pr-0">
                <div className="flex items-center gap-2.5">
                  <Icon size={20} strokeWidth={1.75} className={c} />
                  <h3 className="font-display text-xl">{t}</h3>
                </div>
                <p className="mt-3 leading-relaxed text-text-2">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mechanism: a real horizon, demonstrated */}
      <section className="simple-only mx-auto max-w-[1240px] px-4 py-14 sm:px-6" data-testid="home-simple">
        <h2 className="font-display text-[clamp(1.6rem,1.2rem+1.2vw,2.2rem)] leading-tight">How it works, in plain words</h2>
        <ol className="mt-5 grid gap-4 text-[15px] leading-relaxed text-text-2 md:grid-cols-3">
          <li className="rounded-[6px] border border-line bg-panel p-4"><strong className="block text-text">1. Pick a place</strong>Choose a named spot near the Moon&apos;s south pole, or click anywhere on the map.</li>
          <li className="rounded-[6px] border border-line bg-panel p-4"><strong className="block text-text">2. Pick dates</strong>Near the pole the Sun crawls around the horizon, so the date changes everything.</li>
          <li className="rounded-[6px] border border-line bg-panel p-4"><strong className="block text-text">3. See sunlight and Earth</strong>MoonNav checks whether mountains or crater walls hide the Sun (power) or Earth (talking home).</li>
        </ol>
        <p className="mt-4 text-sm text-muted">Switch to <strong>Advanced</strong> (top bar) for the full method: reference frames, terrain resolution, data products and validation.</p>
      </section>

      <section id="method" className="adv-only mx-auto max-w-[1240px] scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-14">
          <div>
            <h2 className="font-display text-[clamp(1.6rem,1.2rem+1.2vw,2.2rem)] leading-tight">The horizon is the instrument</h2>
            <p className="mt-4 leading-relaxed text-text-2">
              For every half-degree of azimuth MoonNav traces the LOLA surface 300 km outward, placing each sample at its true 3D position so the
              Moon&apos;s curvature is included. The Sun and Earth, positioned by SPICE for each timestamp, are then compared with that skyline —
              disk by disk, with unseen terrain beyond coverage reported as <em>unknown</em> rather than clear.
            </p>
            <ol className="mt-8 space-y-0">
              {["Choose a site or coordinate", "Set a UTC window and step", "Analyse Sun and Earth against terrain", "Compare under explicit criteria"].map((s, i, a) => (
                <li key={s} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < a.length - 1 && <span aria-hidden className="absolute left-[11px] top-6 h-[calc(100%-18px)] border-l-[1.75px] border-dashed border-accent/70" />}
                  <span className="num relative grid h-6 w-6 shrink-0 place-items-center rounded-full border-[1.75px] border-accent bg-panel text-[11px] font-semibold text-accent">{i + 1}</span>
                  <span className="pt-0.5 text-text">{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-[6px] border border-line bg-panel p-5 shadow-[var(--shadow-sheet)] sm:p-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-display text-xl">Mons Malapert horizon</div>
                <div className="num text-[13px] text-muted">85.980°S 358.330°E · 4,915 m · 15 Nov – 15 Dec 2026</div>
              </div>
              <DataTag kind="precomputed" />
            </div>
            <HorizonPlate r={r} title="Mons Malapert horizon" />
            <dl className="num mt-6 grid grid-cols-2 gap-y-3 border-t border-line pt-4 text-[13px] sm:grid-cols-4">
              {[
                ["Sunlit", pct(r.sun.fractionVisible), "text-sun"],
                ["Sunlit intervals", String(r.sun.intervalCount), "text-text"],
                ["Earth in view", pct(r.earth.fractionVisible), "text-earth"],
                ["Quality", r.quality, "text-text"],
              ].map(([k, v, c]) => (
                <div key={k}>
                  <dt className="text-muted">{k}</dt>
                  <dd className={`mt-0.5 font-medium capitalize ${c}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Capabilities as an index, not a card grid */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6">
          <h2 className="font-display text-[clamp(1.6rem,1.2rem+1.2vw,2.2rem)] leading-tight">In the field book</h2>
          <ul className="mt-8 grid border-t border-line md:grid-cols-2">
            {CAPABILITIES.map(([t, d, h]) => (
              <li key={t} className="border-b border-line md:odd:border-r md:odd:pr-8 md:even:pl-8">
                <Link href={h} className="group flex gap-6 py-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-display text-xl text-text group-hover:text-accent">
                      {t} <ArrowUpRight size={16} className="opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="mt-1.5 leading-relaxed text-text-2">{d}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Sources ledger */}
      <section className="adv-only border-y border-line bg-bg-2">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 className="font-display text-[clamp(1.6rem,1.2rem+1.2vw,2.2rem)] leading-tight">Data you can trace</h2>
            <p className="mt-4 leading-relaxed text-text-2">Every analysis records the terrain product, kernel set, method version and their checksums. Labels on every number say whether it is source data, calculated, modelled or precomputed.</p>
            <Link href="/sources" className="mt-5 inline-flex items-center gap-1.5 text-accent hover:underline hover:underline-offset-4">Full source catalogue <ArrowRight size={15} /></Link>
          </div>
          <ul className="divide-y divide-line rounded-[6px] border border-line bg-panel">
            {SOURCES.map(([t, d, s]) => (
              <li key={t} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-4">
                <div className="min-w-0">
                  <div className="font-medium text-text">{t}</div>
                  <div className="text-[13px] text-muted">{d}</div>
                </div>
                <span className={`font-mono text-[11px] uppercase tracking-[0.06em] ${s === "Not connected" ? "text-unknown" : s === "Validation" ? "text-earth" : "text-ok"}`}>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Close */}
      <section className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6">
        <div className="grid gap-10 md:grid-cols-3">
          {[
            { t: "Mission planners", d: "Immutable scenarios, background analyses, comparisons under hard gates and reproducible reports.", h: "/register", c: "Start planning" },
            { t: "Educators & students", d: "Twelve steps from the problem to the blueprint, with a guided example that uses the real numbers.", h: "/learn", c: "Open Learn" },
            { t: "Curious visitors", d: "The polar map and four precomputed stations, with nothing to sign up for.", h: "/explore", c: "Explore the pole" },
          ].map((a) => (
            <div key={a.t} className="border-t-[1.75px] border-text pt-5">
              <h3 className="font-display text-xl">{a.t}</h3>
              <p className="mt-2 leading-relaxed text-text-2">{a.d}</p>
              <Link href={a.h} className="mt-4 inline-flex items-center gap-1.5 text-accent hover:underline hover:underline-offset-4">{a.c} <ArrowRight size={15} /></Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
