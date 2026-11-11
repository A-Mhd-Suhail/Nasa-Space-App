"use client";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { MAP_EXTENT, R_MOON_M, toLatLon } from "@/lib/lunar";
import { Swatch } from "../ui";

export type RegionalGrid = { grid: number; extentM: number; radiusM: number; heights: string; product: Record<string, unknown>; generatedAtUtc: string };
export type RegionalSite = { key: string; name: string; latitudeDeg: number; longitudeEastDeg: number; heightM: number | null };

function decode(b64: string): Int16Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Int16Array(u8.buffer);
}

/** Body-fixed MOON_ME position (km) for lat/lon/height, rotated so the south pole points up (scene +Z) and sits near the origin. */
function toScene(lat: number, lon: number, h: number, exag: number): THREE.Vector3 {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  const r = (R_MOON_M + h * exag) / 1000;
  const bx = r * Math.cos(la) * Math.cos(lo);
  const by = r * Math.cos(la) * Math.sin(lo);
  const bz = r * Math.sin(la);
  // map orientation: 0°E toward scene +Y (matches the 2D chart, 0°E up), 90°E toward scene +X
  return new THREE.Vector3(by, bx, -bz - R_MOON_M / 1000);
}

/** Sun direction in the same scene frame, from a site's ENU azimuth/elevation (the Sun is effectively at infinity). */
export function sunDirectionScene(siteLat: number, siteLon: number, azDeg: number, elDeg: number): THREE.Vector3 {
  const la = (siteLat * Math.PI) / 180;
  const lo = (siteLon * Math.PI) / 180;
  const a = (azDeg * Math.PI) / 180;
  const e = (elDeg * Math.PI) / 180;
  const east = [-Math.sin(lo), Math.cos(lo), 0];
  const north = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const b = [0, 1, 2].map((k) => Math.sin(a) * Math.cos(e) * east[k] + Math.cos(a) * Math.cos(e) * north[k] + Math.sin(e) * up[k]);
  return new THREE.Vector3(b[1], b[0], -b[2]).normalize();
}

function CapMesh({ data, exag }: { data: RegionalGrid; exag: number }) {
  const geom = useMemo(() => {
    const g = data.grid;
    const h = decode(data.heights);
    const pos = new Float32Array(g * g * 3);
    const col = new Float32Array(g * g * 3);
    const c = new THREE.Color();
    const [x0, , x1] = MAP_EXTENT;
    for (let row = 0; row < g; row++) {
      for (let colI = 0; colI < g; colI++) {
        const i = row * g + colI;
        const x = x0 + ((x1 - x0) * colI) / (g - 1);
        const y = data.extentM - (2 * data.extentM * row) / (g - 1);
        const { lat, lon } = toLatLon(x, y);
        const hv = h[i] === -32768 ? Number.NaN : h[i] * 0.5;
        const p = toScene(lat, lon, Number.isFinite(hv) ? hv : 0, exag);
        pos.set([p.x, p.y, p.z], i * 3);
        const t = Number.isFinite(hv) ? Math.min(1, Math.max(0, (hv + 6000) / 12000)) : 0;
        c.setHSL(0.09 - 0.02 * t, 0.1 + 0.07 * t, 0.24 + 0.5 * t);
        col.set([c.r, c.g, c.b], i * 3);
      }
    }
    const idx: number[] = [];
    for (let row = 0; row < g - 1; row++) {
      for (let colI = 0; colI < g - 1; colI++) {
        const a = row * g + colI;
        const b = a + 1;
        const cc = a + g;
        const d = cc + 1;
        // skip quads that touch cells outside the 75°S coverage disk
        if ([a, b, cc, d].some((k) => h[k] === -32768)) continue;
        idx.push(a, cc, b, b, cc, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }, [data, exag]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function RegionalScene({
  data, sites, selectedKey, sun, onSelect, height = 520,
}: {
  data: RegionalGrid | null;
  sites: RegionalSite[];
  selectedKey?: string | null;
  sun?: THREE.Vector3 | null;
  onSelect?: (key: string) => void;
  height?: number;
}) {
  const [exag, setExag] = useState(5);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const [webgl] = useState<boolean>(() => {
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      return false;
    }
  });
  const markers = useMemo(() => sites.map((s) => ({ ...s, p: toScene(s.latitudeDeg, s.longitudeEastDeg, (s.heightM ?? 0) + 4000 / Math.max(exag, 1), exag) })), [sites, exag]);
  if (!webgl) {
    return <div className="grid place-items-center rounded-[6px] border border-line bg-panel-2 p-6 text-center text-sm text-text-2" style={{ height }}>3D view unavailable on this device (no WebGL). The 2D chart shows the same terrain.</div>;
  }
  if (!data) return <div className="grid animate-pulse place-items-center rounded-[6px] border border-line bg-viewport text-sm text-[#a69f91]" style={{ height }}>Loading the 75°S terrain cap…</div>;
  const sunPos = (sun ?? new THREE.Vector3(0.3, 0.9, 0.05).normalize()).clone().multiplyScalar(900);
  return (
    <div className="relative overflow-hidden rounded-[6px] border border-line bg-viewport" style={{ height }}>
      <Canvas shadows camera={{ position: [0, -820, 760], up: [0, 0, 1], fov: 40, near: 1, far: 6000 }} dpr={[1, 2]} aria-label="3D view of the lunar south polar cap from LOLA terrain">
        <color attach="background" args={["#141210"]} />
        <ambientLight intensity={0.28} />
        <hemisphereLight args={["#afa4d6", "#141210", 0.25]} />
        <directionalLight position={sunPos.toArray()} intensity={2.4} color="#fff1d6" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-520} shadow-camera-right={520} shadow-camera-top={520} shadow-camera-bottom={-520} shadow-camera-near={10} shadow-camera-far={2400} shadow-bias={-0.0006} />
        <CapMesh data={data} exag={exag} />
        {markers.map((m) => (
          <mesh key={m.key} position={m.p} rotation={[Math.PI / 2, 0, 0]} onClick={(e) => { e.stopPropagation(); onSelect?.(m.key); }}>
            <coneGeometry args={[m.key === selectedKey ? 12 : 7, m.key === selectedKey ? 40 : 24, 18]} />
            <meshBasicMaterial color={m.key === selectedKey ? "#d99577" : "#efe9dd"} />
          </mesh>
        ))}
        <OrbitControls ref={controls} makeDefault enableDamping maxDistance={1800} minDistance={60} />
      </Canvas>
      <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
        <label className="flex items-center gap-1.5 rounded-[3px] bg-[rgb(20_18_16/0.82)] px-2 py-1 text-[12px] text-[#efe9dd]">
          Vertical exaggeration
          <select value={exag} onChange={(e) => setExag(Number(e.target.value))} className="rounded-[3px] border border-[#4a453c] bg-[#25221e] px-1 text-[12px] text-[#efe9dd]">
            {[1, 3, 5, 10].map((v) => <option key={v} value={v}>{v}×</option>)}
          </select>
        </label>
        <button type="button" onClick={() => controls.current?.reset()} className="rounded-[3px] bg-[rgb(20_18_16/0.82)] px-2 py-1 text-[12px] text-[#efe9dd] hover:bg-[rgb(20_18_16/0.95)]">Reset camera</button>
      </div>
      <div className="pointer-events-none absolute right-2 top-2 space-y-1 rounded-[3px] bg-[rgb(20_18_16/0.82)] px-2.5 py-1.5 text-[12px] text-[#efe9dd]" aria-hidden>
        <div className="flex items-center gap-1.5"><Swatch color="#d99577" shape="tri" /> selected site</div>
        <div className="flex items-center gap-1.5"><Swatch color="#efe9dd" shape="tri" /> other named sites</div>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-[3px] bg-[rgb(20_18_16/0.82)] px-2.5 py-1.5 text-[12px] leading-snug text-[#cfc7b8]">
        LOLA {String(data.product.fileName ?? "")} resampled to {data.grid}×{data.grid} (~{((2 * data.extentM) / data.grid / 1000).toFixed(1)} km), each sample on the 1737.4 km sphere — lunar curvature is real; heights shown {exag}× exaggerated.
        Coverage is 75°S–90°S only. {sun ? "Lit along the SPICE Sun direction at the selected time; shadows are a visual aid." : "Illustrative lighting."}
      </div>
    </div>
  );
}
