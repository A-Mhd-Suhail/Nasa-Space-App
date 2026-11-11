import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Known limitations" };

const ITEMS: [string, string][] = [
  ["Terrain resolution", "The analysis DEM is LOLA LDEM_75S_240M (240 m pixels). Near-field terrain within about a kilometre is smoothed, so small rocks, boulders and local slopes are not represented. Results are not a landing-hazard assessment."],
  ["Coverage", "Terrain covers 75°S to the pole. Horizon rays that reach the coverage edge are flagged; if unseen terrain could change a decision, the state is reported as unknown."],
  ["Named sites", "Featured sites are IAU feature centres from the USGS Gazetteer. They are not NASA candidate landing regions or approved sites."],
  ["Power", "Energy is an idealized estimate from user-supplied panel assumptions. Thermal effects, dust, storage, MPPT and wiring losses beyond the derating factor are not modelled."],
  ["Communication", "Direct-to-Earth results are geometric line of sight only. No RF link budget, antenna pattern, pointing or ground-network availability is modelled."],
  ["Imagery", "No optical imagery (Moon Trek/LROC) is integrated; maps are derived from LOLA elevation."],
  ["Ephemeris horizon", "Analyses are limited to the DE440s kernel span (about 1849–2150) and to 400 days and 20,000 samples per analysis."],
  ["Earth disk", "Earth is treated as a sphere with its equatorial radius; its oblateness and atmosphere are ignored."],
  ["Prototype status", "MoonNav is an independent research/education prototype for the 2026 NASA Space Apps Challenge. It is not NASA-owned, endorsed or flight-certified."],
];

export default function LimitationsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageHeader title="Known limitations" description="What the current build cannot claim. These limits are also printed in every exported report." />
      <div className="space-y-3">
        {ITEMS.map(([t, d]) => (
          <Card key={t} className="p-4">
            <h2 className="font-medium">{t}</h2>
            <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-text-2">{d}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
