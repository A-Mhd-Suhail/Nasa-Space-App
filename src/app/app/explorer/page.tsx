import type { Metadata } from "next";
import demoIndex from "../../../../public/data/demo/index.json";
import sitesData from "@/data/sites.json";
import { ExploreClient } from "@/components/explore/ExploreClient";

export const metadata: Metadata = { title: "Site Explorer" };

export default async function AppExplorerPage({ searchParams }: { searchParams: Promise<{ site?: string; tab?: string }> }) {
  const sp = await searchParams;
  return <ExploreClient variant="app" sites={sitesData.sites} featured={demoIndex.items.map((i) => i.siteKey)} window={demoIndex.window as [string, string, number]} initialSite={sp.site ?? "mons-malapert"} initialTab={sp.tab ?? "sun"} signedIn />;
}
