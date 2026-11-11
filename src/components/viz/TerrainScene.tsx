"use client";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { HorizonData } from "@/lib/analysis-types";
import { Swatch } from "../ui";

export type TerrainPatch = { grid: number; halfSizeM: number; spacingM: number; siteHeightM: number; missingSamples: number; heights: string; frame: string; product: Record<string, unknown> };

function decode(p: TerrainPatch): Float32Array {
  const bin = atob(p.heights);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const i16 = new Int16Array(buf);
  const out = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) out[i] = i16[i] === -32768 ? Number.NaN : i16[i] * 0.5;
  return out;
}

function dirENU(azDeg: number, elDeg: number): THREE.Vector3 {
  const a = (azDeg * Math.PI) / 180;
  const e = (elDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e));
}

function Terrain({ patch, exaggeration }: { patch: TerrainPatch; exaggeration: number }) {
  const geom = useMemo(() => {
    const n = patch.grid;
    const size = (2 * patch.halfSizeM) / 1000;
    const g = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
    const h = decode(patch);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of h) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const v = h[i];
      const z = Number.isFinite(v) ? v : lo;
      pos.setZ(i, (z / 1000) * exaggeration);
      const t = Number.isFinite(v) ? (v - lo) / Math.max(1, hi - lo) : 0;
      // warm regolith ramp: basalt lows -> mineral stone -> lunar ivory highs
      if (Number.isFinite(v)) c.setHSL(0.09 - 0.02 * t, 0.1 + 0.08 * t, 0.26 + 0.48 * t);
      else c.set("#e8907f");
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [patch, exaggeration]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Ray({ dir, color, length = 14, origin }: { dir: THREE.Vector3; color: string; length?: number; origin: THREE.Vector3 }) {
  const end = useMemo(() => origin.clone().add(dir.clone().multiplyScalar(length)), [origin, dir, length]);
  const line = useMemo(() => new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, end]), new THREE.LineBasicMaterial({ color })), [origin, end, color]);
  useEffect(() => () => line.geometry.dispose(), [line]);
  return (
    <group>
      <primitive object={line} />
      <mesh position={end}>
        <sphereGeometry args={[0.45, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

export function TerrainScene({
  patch, horizon, sun, earth, height = 460,
}: {
  patch: TerrainPatch | null;
  horizon?: HorizonData | null;
  sun?: { az: number; el: number; state: string } | null;
  earth?: { az: number; el: number; state: string } | null;
  height?: number;
}) {
  const [webgl] = useState<boolean>(() => {
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      return false;
    }
  });
  const [exag, setExag] = useState(1);
  const [showHorizon, setShowHorizon] = useState(true);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const siteZ = 0.002 * exag;
  const origin = useMemo(() => new THREE.Vector3(0, 0, siteZ + 0.05), [siteZ]);
  const ring = useMemo(() => {
    if (!horizon) return null;
    const r = 12;
    const pts = horizon.azimuthsDeg.map((a, i) => {
      const e = horizon.elevationDeg[i] ?? 0;
      return dirENU(a, e * exag).multiplyScalar(r).add(origin);
    });
    pts.push(pts[0]);
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [horizon, exag, origin]);

  if (webgl === false) {
    return (
      <div className="grid place-items-center rounded-[6px] border border-line bg-panel-2 p-6 text-center text-sm text-text-2" style={{ height }}>
        <div>
          <div className="font-medium text-text">3D view unavailable</div>
          <p className="mt-1 max-w-sm">This device or browser does not provide WebGL. The 2D map, horizon panorama and interval tables show the same analysis results.</p>
        </div>
      </div>
    );
  }
  if (!patch) {
    return <div className="grid animate-pulse place-items-center rounded-[6px] border border-line bg-viewport text-sm text-[#a69f91]" style={{ height }}>Loading LOLA terrain patch…</div>;
  }
  const sunDir = sun ? dirENU(sun.az, sun.el) : null;
  const earthDir = earth ? dirENU(earth.az, earth.el) : null;
  return (
    <div className="relative overflow-hidden rounded-[6px] border border-line bg-viewport" style={{ height }}>
      <Canvas shadows camera={{ position: [18, -26, 16], up: [0, 0, 1], fov: 40, near: 0.05, far: 400 }} dpr={[1, 2]} aria-label="3D local terrain view">
        <color attach="background" args={["#141210"]} />
        <ambientLight intensity={0.22} />
        <hemisphereLight args={["#afa4d6", "#141210", 0.25]} />
        {sunDir && (
          <directionalLight
            position={sunDir.clone().multiplyScalar(60).toArray()}
            intensity={sun && sun.el > -1 ? 2.6 : 0.15}
            color="#fff1d6"
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-30}
            shadow-camera-right={30}
            shadow-camera-top={30}
            shadow-camera-bottom={-30}
            shadow-camera-near={1}
            shadow-camera-far={140}
            shadow-bias={-0.0004}
          />
        )}
        <Terrain patch={patch} exaggeration={exag} />
        <mesh position={origin}>
          <coneGeometry args={[0.35, 1.1, 20]} />
          <meshBasicMaterial color="#d99577" />
        </mesh>
        {showHorizon && ring && <primitive object={new THREE.Line(ring, new THREE.LineBasicMaterial({ color: "#efe9dd", transparent: true, opacity: 0.75 }))} />}
        {sunDir && <Ray dir={sunDir} color="#e2be7a" origin={origin} />}
        {earthDir && <Ray dir={earthDir} color="#afa4d6" origin={origin} />}
        <mesh position={[0, patch.halfSizeM / 1000 + 1.2, 0.2]} rotation={[0, 0, 0]}>
          <coneGeometry args={[0.7, 1.8, 3]} />
          <meshBasicMaterial color="#efe9dd" />
        </mesh>
        <OrbitControls ref={controls} makeDefault enableDamping target={[0, 0, 0]} maxDistance={120} minDistance={3} />
      </Canvas>
      <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
        <label className="flex items-center gap-1.5 rounded-[3px] bg-[rgb(20_18_16/0.82)] px-2 py-1 text-[12px] text-[#efe9dd]">
          Vertical exaggeration
          <select value={exag} onChange={(e) => setExag(Number(e.target.value))} className="rounded-[3px] border border-[#4a453c] bg-[#25221e] px-1 text-[12px] text-[#efe9dd]">
            {[1, 2, 3, 5].map((v) => (
              <option key={v} value={v}>{v}×</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 rounded-[3px] bg-[rgb(20_18_16/0.82)] px-2 py-1 text-[12px] text-[#efe9dd]">
          <input type="checkbox" checked={showHorizon} onChange={(e) => setShowHorizon(e.target.checked)} /> Horizon ring
        </label>
        <button type="button" onClick={() => controls.current?.reset()} className="rounded-[3px] bg-[rgb(20_18_16/0.82)] px-2 py-1 text-[12px] text-[#efe9dd] hover:bg-[rgb(20_18_16/0.95)]">Reset camera</button>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-[3px] bg-[rgb(20_18_16/0.82)] px-2.5 py-1.5 text-[12px] leading-snug text-[#cfc7b8]">
        <div className="mb-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[#efe9dd]" aria-hidden>
          {sun && <span className="flex items-center gap-1.5"><Swatch color="#e2be7a" shape="line" /> Sun {sun.el.toFixed(2)}° · {sun.state.replace(/_/g, " ")}</span>}
          {earth && <span className="flex items-center gap-1.5"><Swatch color="#afa4d6" shape="line" /> Earth {earth.el.toFixed(2)}° · {earth.state.replace(/_/g, " ")}</span>}
          <span className="flex items-center gap-1.5"><Swatch color="#d99577" shape="tri" /> site</span>
          <span className="flex items-center gap-1.5"><Swatch color="#efe9dd" shape="tri" /> north edge</span>
        </div>
        LOLA {String(patch.product.fileName ?? "")} · {((patch.halfSizeM * 2) / 1000).toFixed(0)} × {((patch.halfSizeM * 2) / 1000).toFixed(0)} km local ENU patch, {patch.spacingM.toFixed(0)} m grid, curvature included
        {exag !== 1 ? <span className="text-[#e0b36a]"> · display exaggerated {exag}× (analysis uses true heights)</span> : null}
        {patch.missingSamples ? <span className="text-[#e8907f]"> · {patch.missingSamples} no-data samples shown in red</span> : null}
        <br />Lighting and shadows are a visual aid limited to this patch (a faint ambient fill is added so shadowed relief stays readable); visibility states come from the 300 km terrain horizon.
      </div>
    </div>
  );
}
