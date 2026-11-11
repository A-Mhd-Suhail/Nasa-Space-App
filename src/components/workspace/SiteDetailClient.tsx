"use client";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { AnalysisResult, HorizonData } from "@/lib/analysis-types";
import { Button, Card, CardHeader, DataTag, fmtNum, LinkButton, Notice, Select } from "../ui";
import type { TerrainPatch } from "../viz/TerrainScene";
import { useChartTheme } from "../viz/EChart";
import { api } from "./api";
import { useAnalysisResult } from "./ResultLoader";

const SiteScene = dynamic(() => import("../explore/SiteScene").then((m) => m.SiteScene), { ssr: false });
const TerrainScene = dynamic(() => import("../viz/TerrainScene").then((m) => m.TerrainScene), { ssr: false });
const HorizonPanorama = dynamic(() => import("../viz/charts").then((m) => m.HorizonPanorama), { ssr: false });
const EChart = dynamic(() => import("../viz/EChart").then((m) => m.EChart), { ssr: false });

type Site = { key: string; name: string; featureType: string; latitudeDeg: number; longitudeEastDeg: number; diameterKm: number | null; heightM: number | null; source: string; sourceUrl: string | null; note: string };
type Profile = { azimuthDeg: number; distanceM: (number | null)[]; heightM: (number | null)[]; elevationAngleDeg: (number | null)[]; siteHeightM: number; noDataSamples: number };

export function SiteDetailClient({ site, analysis, analyses, featured, sites }: { site: Site; analysis: { id: string; label: string } | null; analyses: { id: string; label: string }[]; featured: boolean; sites: { key: string; name: string }[] }) {
  const router = useRouter();
  const [az, setAz] = useState(0);
  const full = useAnalysisResult(analysis?.id ?? null);
  const demo = useQuery<AnalysisResult>({ queryKey: ["demo", site.key], queryFn: () => fetch(`/data/demo/${site.key}.json`).then((r) => r.json()), enabled: !analysis && featured });
  const result: AnalysisResult | undefined = analysis ? full.data?.result : demo.data;
  const patch = useQuery<TerrainPatch>({
    queryKey: ["patch", site.key, site.latitudeDeg, site.longitudeEastDeg],
    queryFn: () => (featured ? fetch(`/data/terrain/${site.key}.json`).then((r) => r.json()) : api(`/api/v1/terrain/patch?lat=${site.latitudeDeg}&lon=${site.longitudeEastDeg}`)),
  });
  const horizon = useQuery<{ horizon: HorizonData }>({
    queryKey: ["horizon", site.latitudeDeg, site.longitudeEastDeg],
    queryFn: () => api("/api/v1/terrain/horizon", { method: "POST", body: { latitudeDeg: site.latitudeDeg, longitudeEastDeg: site.longitudeEastDeg } }),
    enabled: !result && !demo.isLoading && !full.isLoading,
  });
  const profile = useQuery<Profile>({ queryKey: ["profile", site.latitudeDeg, site.longitudeEastDeg, az], queryFn: () => api(`/api/v1/terrain/profile?lat=${site.latitudeDeg}&lon=${site.longitudeEastDeg}&azimuth=${az}&maxM=60000`) });
  const hz = result?.horizon ?? horizon.data?.horizon ?? null;

  const T = useChartTheme();
  const profileOpt = useMemo(() => {
    const p = profile.data;
    if (!p) return null;
    return {
      grid: { left: 56, right: 56, top: 30, bottom: 40 },
      legend: { top: 0, textStyle: { color: T.text } },
      tooltip: { trigger: "axis" },
      xAxis: { type: "value", name: "distance (km)", nameLocation: "middle", nameGap: 26, axisLabel: { color: T.muted }, splitLine: { lineStyle: { color: T.line } } },
      yAxis: [
        { type: "value", name: "height (m)", axisLabel: { color: T.muted }, splitLine: { lineStyle: { color: T.line } } },
        { type: "value", name: "elev. angle (°)", axisLabel: { color: T.muted }, splitLine: { show: false } },
      ],
      series: [
        { name: "LOLA height", type: "line", showSymbol: false, data: p.distanceM.map((d, i) => [(d ?? 0) / 1000, p.heightM[i]]), lineStyle: { color: T.ink }, itemStyle: { color: T.ink }, areaStyle: { color: T.fill, origin: "start" } },
        { name: "Elevation angle from site", type: "line", yAxisIndex: 1, showSymbol: false, data: p.distanceM.map((d, i) => [(d ?? 0) / 1000, p.elevationAngleDeg[i]]), lineStyle: { color: T.accent, width: 1.4, type: "dashed" }, itemStyle: { color: T.accent } },
      ],
    };
  }, [profile.data, T]);

  const manifest = () => {
    const m = {
      generatedAtUtc: new Date().toISOString(),
      site,
      terrainProduct: patch.data?.product ?? result?.provenance.terrainProduct ?? null,
      horizonParams: hz?.params ?? null,
      analysis: result ? { id: analysis?.id ?? null, demo: result.demo ?? null, provenance: result.provenance, timeRange: result.timeRange } : null,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(m, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `moonnav-site-${site.key}-manifest.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-text-2">Site
          <Select value={site.key} onChange={(e) => router.push(`/app/sites/${e.target.value}`)} className="min-w-0 sm:min-w-56">{site.key === "custom" && <option value="custom">{site.name}</option>}{sites.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</Select>
        </label>
        {analyses.length > 0 && (
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-text-2">Analysis
            <Select value={analysis?.id ?? ""} onChange={(e) => router.push(`/app/sites/${site.key}${e.target.value ? `?analysisId=${e.target.value}` : ""}`)} className="min-w-0 sm:min-w-64"><option value="">{featured ? "Precomputed demonstration" : "Terrain only"}</option>{analyses.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select>
          </label>
        )}
        <div className="ml-auto flex gap-2"><Button s="sm" onClick={manifest}>Download data manifest</Button><LinkButton s="sm" variant="primary" href={site.key === "custom" ? `/app/scenarios/new?lat=${site.latitudeDeg}&lon=${site.longitudeEastDeg}` : `/app/scenarios/new?site=${site.key}`}>New scenario here</LinkButton></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {result ? (
            <>
              {!analysis && <Notice title="Precomputed demonstration">Showing the precomputed 15 Nov – 15 Dec 2026 analysis. Run your own scenario for other dates or assumptions.</Notice>}
              <SiteScene r={result} patch={patch.data ?? null} precomputed={!analysis} />
            </>
          ) : (
            <>
              <Notice title="Terrain only">No analysis is selected for this site, so Sun and Earth directions are not shown. The horizon below is computed live from LOLA.</Notice>
              <TerrainScene patch={patch.data ?? null} horizon={hz} />
              <Card>
                <CardHeader title="360° horizon profile" tag={hz ? <DataTag kind="calculated" /> : <DataTag kind="unavailable" />} />
                <div className="px-2 py-2">{hz ? <HorizonPanorama horizon={hz} rows={[]} height={260} /> : horizon.error ? <p className="p-3 text-sm text-warn">{(horizon.error as Error).message}</p> : <div className="h-60 animate-pulse rounded bg-panel-2" />}</div>
              </Card>
            </>
          )}
          <Card>
            <CardHeader title="Elevation profile" tag={<DataTag kind="measured" />} subtitle="LOLA heights along one azimuth with the elevation angle each point subtends from the site (curvature included)." actions={<label className="flex items-center gap-2 text-xs text-text-2">Azimuth <input type="range" min={0} max={359} value={az} onChange={(e) => setAz(Number(e.target.value))} aria-label="Profile azimuth" /> <span className="num w-10">{az}°</span></label>} />
            <div className="px-2 py-2">{profileOpt ? <EChart option={profileOpt} height={260} ariaLabel={`Terrain elevation profile toward azimuth ${az} degrees`} /> : profile.error ? <p className="p-3 text-sm text-warn">{(profile.error as Error).message}</p> : <div className="h-60 animate-pulse rounded bg-panel-2" />}</div>
            {profile.data?.noDataSamples ? <p className="px-4 pb-3 text-xs text-warn">{profile.data.noDataSamples} samples outside coverage are shown as gaps.</p> : null}
          </Card>
        </div>
        <Card>
          <CardHeader title="Site metadata" tag={<DataTag kind="measured" />} />
          <dl className="num space-y-2 px-4 py-3 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-muted">Latitude</dt><dd>{site.latitudeDeg.toFixed(5)}°</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Longitude (E)</dt><dd>{site.longitudeEastDeg.toFixed(5)}°</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">LOLA height</dt><dd>{fmtNum(site.heightM ?? hz?.siteHeightM ?? null, 1)} m</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Datum</dt><dd className="text-right">sphere 1737.4 km, MOON_ME</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Diameter</dt><dd>{site.diameterKm ? `${site.diameterKm} km` : "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Truncated rays</dt><dd>{hz ? `${hz.truncatedRayCount}/${hz.azimuthsDeg.length}` : "—"}</dd></div>
          </dl>
          <p className="border-t border-line px-4 py-3 text-xs text-muted">{site.note} {site.sourceUrl && <a className="text-accent hover:underline" href={site.sourceUrl} target="_blank" rel="noopener noreferrer">Gazetteer ↗</a>}</p>
        </Card>
      </div>
    </div>
  );
}
