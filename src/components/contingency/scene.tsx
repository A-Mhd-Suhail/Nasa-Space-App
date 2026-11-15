"use client";
import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { CommState } from "@/lib/contingency/relay";
import { orbitPeriodS, relayPosition, type RelayOrbit } from "@/lib/contingency/relay";
import type { Environment } from "@/lib/contingency/environment";
import { bodyPosition, enuDirection, enuToBody, mapOffsetToEnu, R_MOON_KM, type Vec3 } from "@/lib/contingency/geometry";
import type { Sample } from "@/lib/contingency/physics";
import type { SiteAssessment } from "@/lib/contingency/sites";
import { setPerfScene } from "../shell/PerfPanel";
import { useMoonTexture } from "../viz/GlobeScene";

export type TerrainGrid = { spacingM: number; size: number; halfSizeM: number; resolutionM: number; heightM: (number | null)[][] };
export type FocusKey = "overview" | "lander" | "relay" | "target";
export type SceneProps = {
  view: "descent" | "orbit";
  env: Environment;
  terrain: TerrainGrid | null;
  planned: Sample[];
  actual: Sample[];
  recovery: Sample[] | null;
  lander: Vec3; // ENU m relative to the target
  comm: CommState | null;
  relay: RelayOrbit;
  tS: number;
  sites: SiteAssessment[];
  selectedSite: string | null;
  predictedTouchdown: Vec3 | null;
  exaggeration: number;
  focus: { key: FocusKey; token: number };
  direct: "available" | "lost" | "unknown";
  tint: "nominal" | "deviated" | "recovering";
};

const GREEN = "#6fbf73";
const RED = "#e0584f";
const BLUE = "#5aa0e6";
const AMBER = "#e0a64a";
const GREY = "#8c867a";

const toKm = (p: Vec3, exag: number): [number, number, number] => [p[0] / 1000, p[1] / 1000, (p[2] / 1000) * exag];
const bodyToScene = (b: Vec3): [number, number, number] => [b[0], b[2], -b[1]]; // matches the globe parameterisation used elsewhere

/** Text label drawn into the canvas as a sprite (no DOM portals, so nothing can fail on unmount). */
function Label({ children, color = "#efe9dd", dy = 0 }: { children: React.ReactNode; color?: string; dy?: number }) {
  const text = String(Array.isArray(children) ? children.join("") : children);
  const tex = useMemo(() => {
    const cv = document.createElement("canvas");
    const ctx = cv.getContext("2d")!;
    const font = "600 26px system-ui, sans-serif";
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 22;
    cv.width = w;
    cv.height = 40;
    const c2 = cv.getContext("2d")!;
    c2.font = font;
    c2.fillStyle = "rgba(20,18,16,0.82)";
    c2.beginPath();
    c2.roundRect(0, 0, w, 40, 8);
    c2.fill();
    c2.fillStyle = color;
    c2.textBaseline = "middle";
    c2.fillText(text, 11, 21);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return { t, w };
  }, [text, color]);
  useEffect(() => () => tex.t.dispose(), [tex]);
  const h = 0.032;
  return (
    <sprite scale={[(h * tex.w) / 40, h, 1]} center={new THREE.Vector2(0.5, dy < 0 ? 1.4 : -0.5)} renderOrder={10}>
      <spriteMaterial map={tex.t} sizeAttenuation={false} depthTest={false} transparent />
    </sprite>
  );
}

function Rig({ to, token }: { to: { target: THREE.Vector3; pos: THREE.Vector3 } | null; token: number }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.Camera; controls: OrbitControlsImpl | null };
  const ref = useRef<{ target: THREE.Vector3; pos: THREE.Vector3; t: number } | null>(null);
  useEffect(() => {
    if (to) ref.current = { ...to, t: 0 };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    const r = ref.current;
    if (!r || !controls) return;
    r.t = Math.min(1, r.t + dt * 2.2);
    const k = 1 - Math.pow(1 - r.t, 3);
    controls.target.lerp(r.target, k);
    camera.position.lerp(r.pos, k);
    controls.update();
    if (r.t >= 1) ref.current = null;
  });
  return null;
}

/* ------------------------------- descent view ------------------------------- */
function TerrainMesh({ g, lonDeg, siteHeightM, exag }: { g: TerrainGrid; lonDeg: number; siteHeightM: number; exag: number }) {
  const geom = useMemo(() => {
    const n = g.size;
    const half = Math.floor(n / 2);
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const c = new THREE.Color();
    let lo = Infinity;
    let hi = -Infinity;
    for (const row of g.heightM) for (const v of row) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const [e, nn] = mapOffsetToEnu((j - half) * g.spacingM, -(i - half) * g.spacingM, lonDeg);
        const h = g.heightM[i]?.[j];
        const drop = (e * e + nn * nn) / (2 * R_MOON_KM * 1000);
        const z = h == null ? lo - siteHeightM - drop : h - siteHeightM - drop;
        pos.set([e / 1000, nn / 1000, (z / 1000) * exag], (i * n + j) * 3);
        const t = h == null ? 0 : (h - lo) / Math.max(1, hi - lo);
        if (h == null) c.set("#8a4b44");
        else c.setHSL(0.09 - 0.02 * t, 0.1 + 0.08 * t, 0.26 + 0.48 * t);
        col.set([c.r, c.g, c.b], (i * n + j) * 3);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = a + 1, cc = a + n, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }, [g, lonDeg, siteHeightM, exag]);
  useEffect(() => () => geom.dispose(), [geom]);
  return <mesh geometry={geom}><meshStandardMaterial vertexColors roughness={0.95} side={THREE.DoubleSide} /></mesh>;
}

function Lander({ pos, tint, scale = 1 }: { pos: [number, number, number]; tint: SceneProps["tint"]; scale?: number }) {
  const col = tint === "nominal" ? "#d8d2c4" : tint === "deviated" ? "#e8a39b" : "#a8c9f0";
  return (
    <group position={pos} scale={scale}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.03]}><cylinderGeometry args={[0.035, 0.04, 0.05, 16]} /><meshStandardMaterial color={col} metalness={0.4} roughness={0.5} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.012]}><coneGeometry args={[0.018, 0.03, 12]} /><meshStandardMaterial color="#555" /></mesh>
      {[0, 1, 2, 3].map((k) => {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        return <mesh key={k} position={[Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.005]} rotation={[0, 0, 0]}><boxGeometry args={[0.006, 0.006, 0.05]} /><meshStandardMaterial color="#9a958a" /></mesh>;
      })}
      <mesh position={[0, 0, 0.065]}><sphereGeometry args={[0.012, 10, 10]} /><meshBasicMaterial color={col} /></mesh>
    </group>
  );
}

function DescentScene(p: SceneProps) {
  const exag = p.exaggeration;
  const pt = (s: Sample[]) => s.filter((_, i) => i % 4 === 0 || i === s.length - 1).map((x) => new THREE.Vector3(...toKm(x.r, exag)));
  const planned = useMemo(() => pt(p.planned), [p.planned, exag]); // eslint-disable-line react-hooks/exhaustive-deps
  const actual = useMemo(() => pt(p.actual), [p.actual, exag]); // eslint-disable-line react-hooks/exhaustive-deps
  const recov = useMemo(() => (p.recovery ? pt(p.recovery) : null), [p.recovery, exag]); // eslint-disable-line react-hooks/exhaustive-deps
  const landerPos = toKm(p.lander, exag);
  const earth = p.env.earth;
  const eDir = earth ? enuDirection(earth.azDeg, earth.elDeg) : null;
  const sun = p.env.sun ? enuDirection(p.env.sun.azDeg, p.env.sun.elDeg) : null;
  const directCol = p.direct === "available" ? GREEN : p.direct === "lost" ? RED : AMBER;
  const lr = p.comm?.landerToRelay;
  const relayDir = lr ? enuDirection(lr.azimuthDeg, lr.elevationDeg) : null;
  const hzDeg = p.comm?.direct.horizonDeg;
  const ang = earth ? earth.azDeg : 0;
  const lightDir = (sun ?? ([0.3, 0.5, 0.6] as Vec3));
  return (
    <>
      <color attach="background" args={["#141210"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[lightDir[0] * 30, lightDir[1] * 30, Math.max(0.2, lightDir[2]) * 30]} intensity={2.2} color="#fff1d6" />
      {p.terrain && <TerrainMesh g={p.terrain} lonDeg={p.env.site.lonEastDeg} siteHeightM={p.env.site.heightM} exag={exag} />}
      {/* target */}
      <group position={[0, 0, 0.002]}>
        <mesh><ringGeometry args={[0.095, 0.105, 48]} /><meshBasicMaterial color={GREEN} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.02, 0.06, 12]} /><meshBasicMaterial color={GREEN} /></mesh>
        <group position={[0, 0, 0.1]}><Label color={GREEN}>Original target</Label></group>
      </group>
      {/* candidate zones */}
      {p.sites.map((s) => {
        const col = s.verdict === "PASS" ? GREEN : s.verdict === "FAIL" ? RED : AMBER;
        const sel = s.candidate.id === p.selectedSite;
        const z = (s.candidate.enuM[2] / 1000) * exag;
        return (
          <group key={s.candidate.id} position={[s.candidate.enuM[0] / 1000, s.candidate.enuM[1] / 1000, z + 0.002]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.05]}><coneGeometry args={[sel ? 0.05 : 0.035, sel ? 0.14 : 0.1, 14]} /><meshBasicMaterial color={col} /></mesh>
            <mesh><ringGeometry args={[0.07, 0.08, 32]} /><meshBasicMaterial color={col} side={THREE.DoubleSide} /></mesh>
            <group position={[0, 0, 0.12]}><Label color={col}>{`${s.candidate.label} · ${s.verdict}`}</Label></group>
          </group>
        );
      })}
      {/* trajectories */}
      {planned.length > 1 && <Line points={planned} color={GREEN} lineWidth={2} />}
      {actual.length > 1 && <Line points={actual} color={RED} lineWidth={2} dashed dashSize={0.06} gapSize={0.04} />}
      {recov && recov.length > 1 && <Line points={recov} color={BLUE} lineWidth={3} />}
      {p.predictedTouchdown && (
        <group position={[p.predictedTouchdown[0] / 1000, p.predictedTouchdown[1] / 1000, 0.01]}>
          <mesh rotation={[Math.PI / 4, 0, Math.PI / 4]}><octahedronGeometry args={[0.04]} /><meshBasicMaterial color={RED} /></mesh>
          <group position={[0, 0, 0.08]}><Label color={RED}>Predicted touchdown</Label></group>
        </group>
      )}
      <Lander pos={landerPos} tint={p.tint} />
      {/* Earth / Sun directions and sight lines (directions only; the bodies are not to scale) */}
      {eDir && (
        <>
          <Line points={[landerPos, [landerPos[0] + eDir[0] * 6, landerPos[1] + eDir[1] * 6, landerPos[2] + eDir[2] * 6]]} color={directCol} lineWidth={2.5} dashed={p.direct !== "available"} dashSize={0.15} gapSize={0.1} />
          <mesh position={[landerPos[0] + eDir[0] * 6, landerPos[1] + eDir[1] * 6, landerPos[2] + eDir[2] * 6]}><sphereGeometry args={[0.1, 16, 16]} /><meshBasicMaterial color="#6aa8ff" /></mesh>
          <group position={[landerPos[0] + eDir[0] * 6, landerPos[1] + eDir[1] * 6, landerPos[2] + eDir[2] * 6 + 0.25]}><Label color="#9ec4ff">Earth (direction, not to scale)</Label></group>
          {hzDeg != null && p.env.earth && (
            <Line points={[landerPos, [landerPos[0] + Math.sin((ang * Math.PI) / 180) * Math.cos((hzDeg * Math.PI) / 180) * 5, landerPos[1] + Math.cos((ang * Math.PI) / 180) * Math.cos((hzDeg * Math.PI) / 180) * 5, landerPos[2] + Math.sin((hzDeg * Math.PI) / 180) * 5]]} color={AMBER} lineWidth={1.5} dashed dashSize={0.1} gapSize={0.08} />
          )}
        </>
      )}
      {sun && (
        <group position={[sun[0] * 8, sun[1] * 8, Math.max(0.3, sun[2] * 8)]}><mesh><sphereGeometry args={[0.12, 16, 16]} /><meshBasicMaterial color="#ffd76a" /></mesh><Label color="#ffd76a" dy={-14}>Sun (direction)</Label></group>
      )}
      {relayDir && (
        <>
          <Line points={[landerPos, [landerPos[0] + relayDir[0] * 4, landerPos[1] + relayDir[1] * 4, landerPos[2] + relayDir[2] * 4]]} color={lr?.state === "visible" ? BLUE : lr?.state === "unknown" ? AMBER : RED} lineWidth={2} dashed dashSize={0.12} gapSize={0.08} />
          <group position={[landerPos[0] + relayDir[0] * 4, landerPos[1] + relayDir[1] * 4, landerPos[2] + relayDir[2] * 4]}><mesh><boxGeometry args={[0.12, 0.12, 0.12]} /><meshBasicMaterial color={lr?.state === "visible" ? BLUE : GREY} /></mesh><Label color={lr?.state === "visible" ? "#9ec4ff" : "#c9a29d"} dy={-14}>Simulated relay (direction · {p.comm ? p.comm.relayRangeKm.toFixed(0) : "?"} km away)</Label></group>
        </>
      )}
    </>
  );
}

/* -------------------------------- orbit view -------------------------------- */
function OrbitScene(p: SceneProps) {
  const texState = useMoonTexture();
  // Use the NASA imagery only if it actually arrived with real content (a failed or blank texture must not blacken the Moon).
  const tex = useMemo(() => {
    const t = texState.tex;
    const img = t?.image as HTMLCanvasElement | undefined;
    if (!t || !img?.getContext) return { tex: null as THREE.CanvasTexture | null };
    try {
      const cv = document.createElement("canvas");
      cv.width = 32;
      cv.height = 16;
      const c = cv.getContext("2d")!;
      c.drawImage(img, 0, 0, 32, 16);
      const d = c.getImageData(0, 0, 32, 16).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
      return { tex: sum / (d.length / 4) > 25 ? t : null };
    } catch {
      return { tex: t };
    }
  }, [texState.tex]);
  const R = R_MOON_KM / 1000;
  const site = bodyPosition(p.env.site.latDeg, p.env.site.lonEastDeg, p.env.site.heightM);
  const landerBody = enuToBody([p.lander[0] / 1000, p.lander[1] / 1000, R_MOON_KM + (p.env.site.heightM + p.lander[2]) / 1000], p.env.site.latDeg, p.env.site.lonEastDeg);
  const landerS = bodyToScene(landerBody).map((x) => x / 1000) as [number, number, number];
  const siteS = bodyToScene(site).map((x) => x / 1000) as [number, number, number];
  const relayB = p.comm?.relayBody ?? relayPosition(p.relay, p.tS);
  const relayS = bodyToScene(relayB).map((x) => x / 1000) as [number, number, number];
  const ring = useMemo(() => {
    const T = orbitPeriodS(p.relay.altitudeKm);
    return Array.from({ length: 121 }, (_, i) => new THREE.Vector3(...(bodyToScene(relayPosition(p.relay, (T * i) / 120, 0)).map((x) => x / 1000) as [number, number, number])));
  }, [p.relay]);
  const earth = p.env.earth;
  const eBody = earth ? enuToBody(enuDirection(earth.azDeg, earth.elDeg), p.env.site.latDeg, p.env.site.lonEastDeg) : null;
  const earthS = eBody ? (bodyToScene(eBody).map((x) => x * 6) as [number, number, number]) : null; // 6,000 km out: direction only
  const sun = p.env.sun ? enuToBody(enuDirection(p.env.sun.azDeg, p.env.sun.elDeg), p.env.site.latDeg, p.env.site.lonEastDeg) : null;
  const sunDir = sun ? bodyToScene(sun) : [1, 0.3, 0.4];
  const c = p.comm;
  const lrCol = c?.landerToRelay.state === "visible" ? BLUE : c?.landerToRelay.state === "unknown" ? AMBER : RED;
  const reCol = c?.relayToEarth.state === "visible" ? BLUE : c?.relayToEarth.state === "unknown" ? AMBER : RED;
  const dCol = p.direct === "available" ? GREEN : p.direct === "lost" ? RED : AMBER;
  return (
    <>
      <color attach="background" args={["#0d0c0b"]} />
      <ambientLight intensity={2.6} />
      <directionalLight position={[sunDir[0] * 20, sunDir[1] * 20, sunDir[2] * 20]} intensity={2.4} />
      <mesh><sphereGeometry args={[R, 96, 48]} />{tex.tex ? <meshStandardMaterial map={tex.tex} roughness={1} emissive="#3a3834" emissiveMap={tex.tex} emissiveIntensity={0.6} /> : <meshStandardMaterial color="#8a857b" emissive="#3a3834" roughness={1} />}</mesh>
      <Line points={ring} color="#9ec4ff" lineWidth={1.2} dashed dashSize={0.06} gapSize={0.04} />
      <group position={siteS}><mesh><sphereGeometry args={[0.02, 12, 12]} /><meshBasicMaterial color={GREEN} /></mesh><Label color={GREEN} dy={-14}>Landing target</Label></group>
      <group position={landerS}><mesh><sphereGeometry args={[0.014, 12, 12]} /><meshBasicMaterial color={p.tint === "nominal" ? "#fff" : p.tint === "deviated" ? RED : BLUE} /></mesh></group>
      <group position={relayS}><mesh><boxGeometry args={[0.07, 0.07, 0.07]} /><meshStandardMaterial color="#9ec4ff" emissive="#2a4a7a" /></mesh><Label color="#9ec4ff" dy={-16}>Simulated relay orbiter</Label></group>
      {earthS && (
        <>
          <mesh position={earthS}><sphereGeometry args={[0.18, 24, 24]} /><meshBasicMaterial color="#5a98f0" /></mesh>
          <group position={earthS}><Label color="#9ec4ff" dy={-24}>Earth (direction, not to scale)</Label></group>
          <Line points={[landerS, earthS]} color={dCol} lineWidth={2} dashed={p.direct !== "available"} dashSize={0.1} gapSize={0.07} />
          <Line points={[relayS, earthS]} color={reCol} lineWidth={2} dashed dashSize={0.1} gapSize={0.07} />
        </>
      )}
      <Line points={[landerS, relayS]} color={lrCol} lineWidth={2.5} dashed dashSize={0.06} gapSize={0.04} />
      {sun && <group position={[sunDir[0] * 5, sunDir[1] * 5, sunDir[2] * 5]}><mesh><sphereGeometry args={[0.15, 16, 16]} /><meshBasicMaterial color="#ffd76a" /></mesh><Label color="#ffd76a" dy={-20}>Sun (direction)</Label></group>}
    </>
  );
}

export function ContingencyScene(p: SceneProps) {
  const [webgl] = useState<boolean>(() => {
    try {
      const cv = document.createElement("canvas");
      return !!(cv.getContext("webgl2") || cv.getContext("webgl"));
    } catch {
      return false;
    }
  });
  const controls = useRef<OrbitControlsImpl | null>(null);
  useEffect(() => {
    setPerfScene("contingency-simulator", { view: p.view, terrain: p.terrain ? `${p.terrain.size}x${p.terrain.size}` : "none", sites: p.sites.length });
  }, [p.view, p.terrain, p.sites.length]);
  const rig = useMemo(() => {
    const exag = p.exaggeration;
    if (p.view === "orbit") {
      const R = R_MOON_KM / 1000;
      const siteS = new THREE.Vector3(...(bodyToScene(bodyPosition(p.env.site.latDeg, p.env.site.lonEastDeg, p.env.site.heightM)).map((x) => x / 1000) as [number, number, number]));
      const relayB = p.comm?.relayBody ?? relayPosition(p.relay, p.tS);
      const relayS = new THREE.Vector3(...(bodyToScene(relayB).map((x) => x / 1000) as [number, number, number]));
      if (p.focus.key === "relay") return { target: relayS.clone(), pos: relayS.clone().multiplyScalar(1.5).add(new THREE.Vector3(0.6, 0.6, 0.6)) };
      if (p.focus.key === "target" || p.focus.key === "lander") return { target: siteS.clone(), pos: siteS.clone().normalize().multiplyScalar(R + 1.2) };
      return { target: new THREE.Vector3(0, 0, 0), pos: siteS.clone().normalize().multiplyScalar(R * 2.2).add(new THREE.Vector3(0, 0, R * 2.6)) };
    }
    const L = new THREE.Vector3(...toKm(p.lander, exag));
    if (p.focus.key === "lander") return { target: L, pos: L.clone().add(new THREE.Vector3(0.5, -0.7, 0.35)) };
    if (p.focus.key === "target") return { target: new THREE.Vector3(0, 0, 0), pos: new THREE.Vector3(0.7, -1.0, 0.6) };
    if (p.focus.key === "relay") return null;
    return { target: new THREE.Vector3(0, 0, 0.8), pos: new THREE.Vector3(2.8, -4.2, 3.2) };
  }, [p.focus.key, p.focus.token, p.view]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!webgl) return <div className="grid h-[460px] place-items-center rounded-[6px] border border-line bg-panel-2 p-6 text-center text-sm text-text-2">3D view unavailable on this device (no WebGL). All simulation results are still shown in the panels.</div>;
  const initial: [number, number, number] = p.view === "orbit" ? [-3.2, -3.4, 5.2] : [2.8, -4.2, 3.2];
  return (
    <div className="relative w-full min-w-0 max-w-full overflow-hidden rounded-[6px] border border-line bg-viewport" data-testid="contingency-canvas" data-view={p.view}>
      <div className="h-[440px] sm:h-[560px]">
        <Canvas key={p.view} camera={{ position: initial, up: p.view === "orbit" ? [0, 1, 0] : [0, 0, 1], fov: 42, near: 0.005, far: 200 }} dpr={[1, 2]} aria-label={p.view === "orbit" ? "3D orbit view: Moon, simulated relay orbiter, Earth and Sun directions" : "3D descent view over LOLA terrain: lander, trajectories, landing zones"}>
          {p.view === "orbit" ? <OrbitScene {...p} /> : <DescentScene {...p} />}
          <OrbitControls ref={controls} makeDefault enableDamping enablePan minDistance={0.05} maxDistance={p.view === "orbit" ? 40 : 30} target={p.view === "orbit" ? [0, 0, 0] : [0, 0, 0.8]} />
          <Rig to={rig} token={p.focus.token} />
        </Canvas>
      </div>
    </div>
  );
}
