import type { Metadata } from "next";
import demoIndex from "../../../../public/data/demo/index.json";
import sitesData from "@/data/sites.json";
import { ExploreClient } from "@/components/explore/ExploreClient";
import { currentUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Explore the lunar south pole" };

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ site?: string; tab?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser().catch(() => null);
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <ExploreClient sites={sitesData.sites} featured={demoIndex.items.map((i) => i.siteKey)} window={demoIndex.window as [string, string, number]} initialSite={sp.site ?? "mons-malapert"} initialTab={sp.tab ?? "sun"} signedIn={!!user} />
    </div>
  );
}
