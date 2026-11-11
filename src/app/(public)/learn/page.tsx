import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import demoIndex from "../../../../public/data/demo/index.json";
import sitesData from "@/data/sites.json";
import { DataTag, PageHeader } from "@/components/ui";
import { GuidedExample } from "@/components/explore/GuidedExample";

export const metadata: Metadata = { title: "Learn" };

const STEPS: [string, string][] = [
  ["Understand the actual problem", "A lander at the lunar south pole needs sunlight for power and a line of sight to Earth for direct communication. Both depend on where and when you land, because the Sun and Earth sit very low in the polar sky."],
  ["Define the Lunar Landing Site Navigator", "A guided tool that lets planners, educators and the public pick candidate sites and dates, then compare sunlight and Earth visibility quickly and transparently."],
  ["Why the South Pole is difficult", "No atmosphere to scatter light, so shadows are pitch black. The Sun stays within about ±1.5° of the horizon geometry at the pole, so crater rims and massifs tens of kilometres away cast long shadows. Some crater floors never see the Sun."],
  ["Translate challenge objectives into features", "Interactive site selection and comparison; date/time flexibility; Sun and Earth position views; power and communication assessment; 2D and 3D visualisations; time dynamics; accessibility across skill levels."],
  ["Identify the real data sources", "LOLA terrain from NASA's Planetary Data System, Sun/Earth/Moon geometry from NAIF SPICE (cross-checked with JPL Horizons), and IAU feature names from the USGS Gazetteer. Moon Trek imagery is a planned visual layer."],
  ["Design the architecture", "A Next.js web app (accounts, projects, reports) talks to a Python science service (SPICE + DEM + horizon engine). PostgreSQL stores scenarios and results metadata; object storage holds result files and reports."],
  ["Explain the science quantities", "Solar elevation and azimuth, Earth elevation and azimuth, the terrain horizon in each direction, sunlight duration and geometric direct-to-Earth (DTE) windows."],
  ["Calculate the geometry", "Convert the site to Moon-fixed coordinates, get Sun and Earth vectors from SPICE, rotate into local East-North-Up, compare with the terrain horizon, then find and refine the visibility intervals."],
  ["Build the 3D Moon view", "A local LOLA terrain mesh in the site frame, lit from the computed Sun direction, with Sun and Earth direction rays and the horizon ring, all driven by the selected timestamp."],
  ["Compare sites and dates", "Same metrics, same time span and products. Hard requirements first, then weighted preferences, with every assumption visible."],
  ["Differentiate the product", "Terrain-aware visibility instead of a flat-horizon guess, rapid scenario comparison, transparent provenance and quality labels, and an educational mode that never changes the numbers."],
  ["Complete the blueprint", "Routes, page layouts, user journeys, technology stack and a demonstration — this website is that blueprint, running."],
];

const GLOSSARY: [string, string][] = [
  ["Lunar latitude / longitude", "Planetocentric latitude (angle from the equatorial plane at the Moon's centre) and east-positive longitude from 0° to 360°."],
  ["Body-fixed frame", "Axes attached to the rotating Moon. MoonNav uses MOON_ME, the mean-Earth/polar-axis frame that LOLA products use."],
  ["Azimuth", "Compass direction of a target measured clockwise from local north: 0° N, 90° E, 180° S, 270° W."],
  ["Elevation", "Angle of a target above the local horizontal plane. Negative means below it."],
  ["Horizon (terrain)", "For each azimuth, the highest elevation angle of the surrounding terrain as seen from the site, including the drop caused by the Moon's curvature."],
  ["DEM", "Digital elevation model: a grid of terrain heights. MoonNav uses LOLA LDEM_75S_240M, 240 m per pixel."],
  ["LOLA", "Lunar Orbiter Laser Altimeter on NASA's Lunar Reconnaissance Orbiter; it measured the Moon's topography with laser pulses."],
  ["Ephemeris", "Tabulated positions of bodies over time. MoonNav uses the JPL DE440 ephemeris through SPICE."],
  ["Libration", "Small apparent wobbles of the Moon as seen from Earth (and of Earth as seen from the Moon), which move Earth by several degrees in the lunar sky."],
  ["Local ENU", "East-North-Up coordinates at the site, used to turn 3D vectors into azimuth and elevation."],
  ["Direct sunlight", "Some (or all, depending on the rule) of the Sun's disk is above the terrain horizon."],
  ["Solar irradiance", "Sunlight power per square metre arriving at the Moon, about 1361 W/m² at 1 AU, varying with the Sun's distance."],
  ["DTE (geometric)", "Direct-to-Earth line of sight: Earth is above the terrain (and the antenna mask)."],
  ["RF link", "Actual radio communication performance. It needs power, antennas, frequencies and ground stations — MoonNav does not compute it."],
  ["Uncertainty", "How much a result could differ because of data resolution, coverage and modelling choices. MoonNav reports quality reasons instead of a made-up confidence percentage."],
];

export default async function LearnPage() {
  const sites = Object.fromEntries(sitesData.sites.map((s) => [s.key, s]));
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader title="From the problem to the blueprint in 12 steps" description="The original MoonNav learning sequence, written for students, educators and curious visitors. Interactive parts use the same calculations as the planning workspace — Learn mode never invents easier numbers." />
      <GuidedExample items={demoIndex.items.map((i) => ({ ...i, site: sites[i.siteKey] }))} />
      <section aria-labelledby="steps" className="mt-14">
        <h2 id="steps" className="font-display text-[clamp(1.6rem,1.2rem+1.2vw,2.2rem)] leading-tight">The 12 steps</h2>
        <ol className="mt-6 border-t border-line">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="border-b border-line">
              <details className="group" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-baseline gap-5 py-4 hover:text-accent">
                  <span className="num w-7 shrink-0 font-mono text-[13px] text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-display text-[20px] leading-snug">{t}</span>
                  <Plus size={16} aria-hidden className="ml-auto shrink-0 self-center text-muted transition-transform group-open:rotate-45" />
                </summary>
                <p className="max-w-[68ch] pb-5 pl-12 leading-relaxed text-text-2">{d}</p>
              </details>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="glossary" className="mt-16">
        <h2 id="glossary" className="font-display text-[clamp(1.6rem,1.2rem+1.2vw,2.2rem)] leading-tight">Glossary</h2>
        <dl className="mt-6 grid border-t border-line md:grid-cols-2 md:gap-x-10">
          {GLOSSARY.map(([t, d]) => (
            <div key={t} className="border-b border-line py-4">
              <dt className="font-display text-[18px]">{t}</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-text-2">{d}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="mt-10 text-sm text-text-2">Ready for real numbers? <Link href="/explore" className="text-accent hover:underline">Open the explorer</Link> or read the <Link href="/methodology" className="text-accent hover:underline">methodology</Link>. <DataTag kind="illustrative" className="ml-1" /> diagrams on this page are explanatory only.</p>
    </div>
  );
}
