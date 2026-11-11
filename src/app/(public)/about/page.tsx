import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-14 sm:px-6">
      <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <PageHeader title="About MoonNav" description="A decision-support tool for comparing lunar south-pole sites and dates by terrain-aware sunlight and geometric Earth visibility." />
          <div className="max-w-[66ch] space-y-4 text-[15px] leading-relaxed text-text-2">
            <p>MoonNav answers a planner&apos;s first questions about a polar site: when does sunlight reach it, when is Earth in line of sight, and how do those answers change with a few kilometres of position or a few days of schedule. It computes Sun and Earth directions with NASA/JPL&apos;s SPICE toolkit and compares them with a 300 km terrain horizon traced through NASA&apos;s LOLA elevation model, including the Moon&apos;s curvature.</p>
            <p>Results are reproducible: every scenario is immutable, and every analysis records the terrain product, kernel set, method version and their checksums. Values carry labels that say whether they are source data, calculated, modelled or precomputed — and unknown is reported as unknown.</p>
            <p>MoonNav began as a response to the 2026 NASA Space Apps Challenge <a href="https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/" target="_blank" rel="noopener noreferrer">“Lunar Landing Site Navigator”</a>. It is an independent research and education prototype: not NASA-owned, endorsed or flight-certified, and it does not select approved landing sites.</p>
          </div>
        </div>
        <div className="space-y-6 lg:pt-24">
          <dl className="divide-y divide-line rounded-[6px] border border-line bg-panel text-sm">
            {[
              ["Terrain", "LRO LOLA LDEM_75S_240M (NASA PDS), 75°S–90°S"],
              ["Ephemeris", "NAIF SPICE DE440 / Moon PA DE440, MOON_ME frame"],
              ["Validation", "JPL Horizons observer tables, < 0.01°"],
              ["Feature names", "IAU WGPSN / USGS Gazetteer"],
              ["Method version", "moonnav-method-1.0.0"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-4 px-5 py-3"><dt className="text-muted">{k}</dt><dd className="text-text">{v}</dd></div>
            ))}
          </dl>
          <p className="text-sm text-muted">Read the <Link href="/methodology">methodology</Link>, the <Link href="/sources">data sources</Link> and the <Link href="/limitations">known limitations</Link>.</p>
        </div>
      </div>
    </div>
  );
}
