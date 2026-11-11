import type { Metadata } from "next";
import sitesData from "@/data/sites.json";
import { PageHeader } from "@/components/ui";
import { PlannerClient } from "@/components/planner/PlannerClient";
import { requirePageUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Mission Planner" };

export default async function PlannerPage() {
  await requirePageUser("/app/planner");
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Mission Planner" description="Choose any site inside 75°S–90°S and any UTC window: suitability maps, a site × date matrix, terrain hazard screening and location/date sensitivity — all computed live from NASA LOLA terrain and SPICE geometry." />
      <PlannerClient sites={sitesData.sites.map((s) => ({ key: s.key, name: s.name, latitudeDeg: s.latitudeDeg, longitudeEastDeg: s.longitudeEastDeg }))} />
    </div>
  );
}
