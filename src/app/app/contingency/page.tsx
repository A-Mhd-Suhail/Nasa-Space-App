import type { Metadata } from "next";
import sitesData from "@/data/sites.json";
import { PageHeader } from "@/components/ui";
import { ContingencyClient } from "@/components/contingency/ContingencyClient";
import { requirePageUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Mission Emergency Simulator" };

export default async function ContingencyPage() {
  await requirePageUser("/app/contingency");
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title="Mission Emergency Simulator" description="A 3D decision-support simulation of lunar landing contingencies: communication blackout and relay visibility, trajectory deviation, emergency maneuvers within real propulsion limits, and alternative landing sites from NASA LOLA terrain. Simulated only." />
      <ContingencyClient sites={sitesData.sites.map((s) => ({ key: s.key, name: s.name, latitudeDeg: s.latitudeDeg, longitudeEastDeg: s.longitudeEastDeg }))} />
    </div>
  );
}
