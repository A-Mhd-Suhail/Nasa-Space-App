import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed text-text-2 sm:px-6">
      <PageHeader title="Terms of use" />
      <div className="space-y-4">
        <p>MoonNav is an independent research and educational prototype created for the 2026 NASA Space Apps Challenge. It is not NASA-owned, NASA-endorsed or flight-certified, and its outputs must not be used as the sole basis for operational mission decisions.</p>
        <p>Results are calculated from public NASA/JPL data products under stated assumptions and limitations. MoonNav provides them “as is”, without warranty. Always check the methodology, data sources and known limitations.</p>
        <p>Do not attempt to access other users’ workspaces, bypass rate limits or abuse shared links. Share links are read-only, expire and can be revoked by their creator.</p>
        <p>Source data: NASA PDS (LOLA), NASA/JPL NAIF (SPICE kernels) and the IAU/USGS Gazetteer of Planetary Nomenclature. Please cite them when you reuse MoonNav outputs.</p>
      </div>
    </div>
  );
}
