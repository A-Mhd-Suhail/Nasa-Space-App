"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { GlobeSite } from "../viz/GlobeScene";

const GlobeScene = dynamic(() => import("../viz/GlobeScene").then((m) => m.GlobeScene), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-[6px] border border-line bg-viewport" />,
});

/** Rotating 3D Moon on the home page; clicking a feature opens it in the Site Explorer. */
export function HomeGlobe({ sites }: { sites: GlobeSite[] }) {
  const router = useRouter();
  return <GlobeScene sites={sites} selectedKey={null} onSelect={(k) => router.push(`/explore?site=${encodeURIComponent(k)}&tab=sun`)} height={420} autoRotate />;
}
