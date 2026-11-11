"use client";
import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import ImageLayer from "ol/layer/Image";
import TileLayer from "ol/layer/Tile";
import WMTS from "ol/source/WMTS";
import WMTSTileGrid from "ol/tilegrid/WMTS";
import VectorLayer from "ol/layer/Vector";
import Static from "ol/source/ImageStatic";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import { Projection } from "ol/proj";
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from "ol/style";
import { ScaleLine, Zoom, defaults as defaultControls } from "ol/control";
import { COVERAGE_LAT, MAP_EXTENT, toLatLon, toXY } from "@/lib/lunar";

export type MapSite = { key: string; name: string; latitudeDeg: number; longitudeEastDeg: number; featureType?: string };
export type MapLayers = { hillshade: boolean; imagery?: boolean; elevation: boolean; slope?: boolean; feasibility?: boolean; psr?: boolean; sunAverage?: boolean; graticule: boolean; sites: boolean; coverage: boolean; saved?: boolean };
export type ImageryStatus = "idle" | "loading" | "ok" | "error";
/** Client-rendered raster overlay in map metres (used by the feasibility layer). */
export type RasterOverlay = { url: string; extent: [number, number, number, number]; opacity?: number };

/**
 * NASA Moon Trek WMTS: LRO WAC Mosaic, South Pole v2 (100 m/px), south polar stereographic on the
 * 1737.4 km sphere with 0°E up — the same plane as the LOLA LDEM_75S product, so tiles need no
 * reprojection. Tile matrix taken from the service's WMTSCapabilities.xml (verified 2026-11-11).
 */
export const TREK_SP_WAC = {
  capabilities: "https://trek.nasa.gov/tiles/Moon/SP/LRO_WAC_Mosaic_SPole60_100m_v02/1.0.0/WMTSCapabilities.xml",
  template: "https://trek.nasa.gov/tiles/Moon/SP/LRO_WAC_Mosaic_SPole60_100m_v02/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.png",
  origin: [-1_095_930, 1_095_930] as [number, number],
  // ScaleDenominator x 0.28 mm for matrices 0..5
  resolutions: [0, 1, 2, 3, 4, 5].map((z) => (30_578_404.017857101 * 0.00028) / 2 ** z),
  attribution: "LRO WAC Mosaic, S Pole v2 — NASA/GSFC/Arizona State University via NASA Moon Trek",
};
export type SavedPoint = { id: string; name: string; latitudeDeg: number; longitudeEastDeg: number };

const proj = new Projection({ code: "MOONNAV:LOLA-SPS", units: "m", extent: MAP_EXTENT, global: false });

function graticule(): Feature[] {
  const out: Feature[] = [];
  for (const lat of [-76, -78, -80, -82, -84, -86, -88]) {
    const pts = Array.from({ length: 181 }, (_, i) => toXY(lat, i * 2));
    const f = new Feature(new LineString(pts));
    f.set("label", `${Math.abs(lat)}°S`);
    out.push(f);
  }
  for (let lon = 0; lon < 360; lon += 30) {
    const pts = Array.from({ length: 31 }, (_, i) => toXY(-90 + i * 0.5, lon));
    const f = new Feature(new LineString(pts));
    f.set("label", `${lon}°E`);
    out.push(f);
  }
  return out;
}

export function LunarMap({
  sites, selectedKey, picked, onPick, onSelectSite, layers, height = 520, ariaLabel = "Lunar south polar map", saved = [], overlay = null, onImageryStatus,
}: {
  overlay?: RasterOverlay | null;
  onImageryStatus?: (s: ImageryStatus) => void;
  sites: MapSite[];
  saved?: SavedPoint[];
  selectedKey?: string | null;
  picked?: { lat: number; lon: number } | null;
  onPick?: (p: { lat: number; lon: number }) => void;
  onSelectSite?: (key: string) => void;
  layers: MapLayers;
  height?: number | string;
  ariaLabel?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const refs = useRef<{ img?: TileLayer<WMTS>; feas?: ImageLayer<Static>; hill?: ImageLayer<Static>; elev?: ImageLayer<Static>; slope?: ImageLayer<Static>; sunAvg?: ImageLayer<Static>; psr?: ImageLayer<Static>; grat?: VectorLayer; sites?: VectorLayer; pick?: VectorLayer; cov?: VectorLayer; saved?: VectorLayer }>({});
  const cb = useRef({ onPick, onSelectSite, onImageryStatus });
  useEffect(() => {
    cb.current = { onPick, onSelectSite, onImageryStatus };
  }, [onPick, onSelectSite, onImageryStatus]);
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const hill = new ImageLayer({ source: new Static({ url: "/data/lola_75s_240m_hillshade.webp", imageExtent: MAP_EXTENT, projection: proj, attributions: "LOLA LDEM_75S_240M (NASA PDS) — derived hillshade" }) });
    const imgSource = new WMTS({
      url: TREK_SP_WAC.template,
      requestEncoding: "REST",
      layer: "LRO_WAC_Mosaic_SPole60_100m_v02",
      matrixSet: "default028mm",
      format: "image/png",
      style: "default",
      projection: proj,
      crossOrigin: "anonymous",
      tileGrid: new WMTSTileGrid({ origin: TREK_SP_WAC.origin, resolutions: TREK_SP_WAC.resolutions, matrixIds: ["0", "1", "2", "3", "4", "5"], tileSize: 256 }),
      attributions: TREK_SP_WAC.attribution,
      wrapX: false,
    });
    let pending = 0;
    let failed = 0;
    const status = (s: ImageryStatus) => cb.current.onImageryStatus?.(s);
    imgSource.on("tileloadstart", () => {
      pending++;
      status("loading");
    });
    imgSource.on("tileloadend", () => {
      pending = Math.max(0, pending - 1);
      if (!pending) status(failed ? "error" : "ok");
    });
    imgSource.on("tileloaderror", () => {
      failed++;
      pending = Math.max(0, pending - 1);
      if (!pending) status("error");
    });
    const img = new TileLayer({ source: imgSource, extent: MAP_EXTENT, visible: false, preload: 1 });
    const feas = new ImageLayer<Static>({ visible: false, opacity: 0.85 });
    const elev = new ImageLayer({ source: new Static({ url: "/data/lola_75s_240m_elevation.webp", imageExtent: MAP_EXTENT, projection: proj }), opacity: 0.85 });
    const slope = new ImageLayer({ source: new Static({ url: "/data/lola_75s_240m_slope.webp", imageExtent: MAP_EXTENT, projection: proj }), opacity: 0.85 });
    // LOLA team illumination products (PGDA 69): long-term solar visibility and permanently shadowed regions.
    const sunAvg = new ImageLayer({ source: new Static({ url: "/data/lola_avgsun_75s_240m.webp", imageExtent: MAP_EXTENT, projection: proj, attributions: "Average solar visibility, LOLA team (Mazarico et al. 2011), NASA PGDA/PDS" }), opacity: 0.9, visible: false });
    const psr = new ImageLayer({ source: new Static({ url: "/data/lola_psr_75s_240m.png", imageExtent: MAP_EXTENT, projection: proj, interpolate: false, attributions: "Permanently shadowed regions LPSR_75S_120M, LOLA team (Mazarico et al. 2011), NASA PGDA/PDS" }), visible: false });
    const gratStyle = (f: Feature) => new Style({ stroke: new Stroke({ color: "rgba(239,233,221,0.16)", width: 1 }), text: new Text({ text: f.get("label"), placement: "line", font: "10px 'IBM Plex Mono', monospace", fill: new Fill({ color: "rgba(239,233,221,0.6)" }) }) });
    const grat = new VectorLayer({ source: new VectorSource({ features: graticule() }), style: (f) => gratStyle(f as Feature) });
    const covRing = new Feature(new LineString(Array.from({ length: 361 }, (_, i) => toXY(COVERAGE_LAT, i))));
    const cov = new VectorLayer({ source: new VectorSource({ features: [covRing] }), style: new Style({ stroke: new Stroke({ color: "rgba(217,149,119,0.75)", width: 1.5, lineDash: [6, 5] }) }) });
    const siteLayer = new VectorLayer({ source: new VectorSource(), declutter: true });
    const savedLayer = new VectorLayer({ source: new VectorSource(), declutter: true });
    const pick = new VectorLayer({ source: new VectorSource() });
    refs.current = { img, feas, hill, elev, slope, sunAvg, psr, grat, sites: siteLayer, pick, cov, saved: savedLayer };
    const m = new Map({
      target: el.current,
      layers: [img, hill, elev, slope, sunAvg, psr, feas, grat, cov, savedLayer, siteLayer, pick],
      view: new View({ projection: proj, center: [0, 0], zoom: 2, extent: MAP_EXTENT, constrainOnlyCenter: true, showFullExtent: true, maxZoom: 12 }),
      controls: defaultControls({ zoom: false, rotate: false }).extend([new Zoom(), new ScaleLine({ units: "metric" })]),
    });
    m.getView().fit(MAP_EXTENT, { padding: [8, 8, 8, 8] });
    m.on("singleclick", (e) => {
      let hit: string | null = null;
      m.forEachFeatureAtPixel(e.pixel, (f) => {
        if (f.get("siteKey")) hit = f.get("siteKey");
        return !!hit;
      }, { layerFilter: (l) => l === siteLayer, hitTolerance: 6 });
      if (hit && cb.current.onSelectSite) return cb.current.onSelectSite(hit);
      const [x, y] = e.coordinate;
      cb.current.onPick?.(toLatLon(x, y));
    });
    let raf = 0;
    m.on("pointermove", (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCursor(toLatLon(e.coordinate[0], e.coordinate[1])));
    });
    map.current = m;
    return () => {
      m.setTarget(undefined);
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const r = refs.current;
    r.img?.setVisible(!!layers.imagery);
    r.feas?.setVisible(!!layers.feasibility);
    r.hill?.setVisible(layers.hillshade);
    r.elev?.setVisible(layers.elevation);
    r.slope?.setVisible(!!layers.slope);
    r.sunAvg?.setVisible(!!layers.sunAverage);
    r.psr?.setVisible(!!layers.psr);
    r.saved?.setVisible(layers.saved !== false);
    r.grat?.setVisible(layers.graticule);
    r.sites?.setVisible(layers.sites);
    r.cov?.setVisible(layers.coverage);
  }, [layers]);

  useEffect(() => {
    const l = refs.current.feas;
    if (!l) return;
    l.setSource(overlay ? new Static({ url: overlay.url, imageExtent: overlay.extent, projection: proj, interpolate: false, attributions: "MoonNav feasibility grid (SPICE + LOLA)" }) : null);
    l.setOpacity(overlay?.opacity ?? 0.85);
  }, [overlay]);

  useEffect(() => {
    const src = refs.current.sites?.getSource();
    if (!src) return;
    src.clear();
    for (const s of sites) {
      const f = new Feature(new Point(toXY(s.latitudeDeg, s.longitudeEastDeg)));
      f.set("siteKey", s.key);
      const sel = s.key === selectedKey;
      f.setStyle(
        new Style({
          image: new CircleStyle({ radius: sel ? 7.5 : 5, fill: new Fill({ color: sel ? "#d99577" : "#1c1a17" }), stroke: new Stroke({ color: sel ? "#fffcf5" : "#d99577", width: sel ? 2.5 : 1.8 }) }),
          text: new Text({ text: s.name, offsetY: -15, font: `${sel ? "600 " : "500 "}12px 'IBM Plex Sans', sans-serif`, fill: new Fill({ color: "#fffcf5" }), stroke: new Stroke({ color: "rgba(28,26,23,0.92)", width: 3.5 }) }),
          zIndex: sel ? 10 : 1,
        }),
      );
      src.addFeature(f);
    }
  }, [sites, selectedKey]);

  useEffect(() => {
    const src = refs.current.saved?.getSource();
    if (!src) return;
    src.clear();
    for (const l of saved) {
      const f = new Feature(new Point(toXY(l.latitudeDeg, l.longitudeEastDeg)));
      f.setStyle(new Style({
        image: new CircleStyle({ radius: 5, fill: new Fill({ color: "#afa4d6" }), stroke: new Stroke({ color: "#1c1a17", width: 1.5 }) }),
        text: new Text({ text: l.name, offsetY: 14, font: "italic 11px 'IBM Plex Sans', sans-serif", fill: new Fill({ color: "#efe9dd" }), stroke: new Stroke({ color: "rgba(28,26,23,0.9)", width: 3 }) }),
      }));
      src.addFeature(f);
    }
  }, [saved]);

  useEffect(() => {
    const src = refs.current.pick?.getSource();
    if (!src) return;
    src.clear();
    if (picked) {
      const f = new Feature(new Point(toXY(picked.lat, picked.lon)));
      f.setStyle(new Style({ image: new CircleStyle({ radius: 9, fill: new Fill({ color: "rgba(226,190,122,0.25)" }), stroke: new Stroke({ color: "#e2be7a", width: 2.2 }) }) }));
      src.addFeature(f);
    }
  }, [picked]);

  return (
    <div className="relative overflow-hidden rounded-[6px] border border-line bg-viewport" style={{ height }}>
      <div ref={el} className="absolute inset-0" role="application" aria-label={`${ariaLabel}. Click to select a coordinate; use the site list for keyboard selection.`} tabIndex={0} />
      <div className="pointer-events-none absolute right-2 top-2 max-w-[60%] rounded-[3px] bg-[rgb(28_26_23/0.78)] px-2 py-1 text-right font-mono text-[12px] text-[#efe9dd]">
        Polar stereographic · 0°E up
      </div>
      <div className="num pointer-events-none absolute bottom-2 right-2 rounded-[3px] bg-[rgb(28_26_23/0.78)] px-2 py-1 font-mono text-[12px] text-[#efe9dd]" aria-live="off">
        {cursor ? `${Math.abs(cursor.lat).toFixed(3)}°S ${cursor.lon.toFixed(3)}°E${cursor.lat > COVERAGE_LAT ? " · outside terrain coverage" : ""}` : "Move over the map for coordinates"}
      </div>
    </div>
  );
}
