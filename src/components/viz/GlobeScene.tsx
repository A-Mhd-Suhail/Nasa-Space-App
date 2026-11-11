"use client";
import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { COVERAGE_LAT, R_MOON_M } from "@/lib/lunar";
import { type HeightMap, heightAt, MOON_RADIUS_M, reliefSphere } from "./globe-math";

/**
 * Global textured Moon. Texture = NASA Moon Trek LRO WAC global mosaic (equirectangular, 8×4 tiles
 * at matrix 2) with the LRO WAC South Pole v2 mosaic reprojected into the cap south of 65°S, where
 * the global product is smeared. Both services were verified from their WMTSCapabilities.xml.
 * Sphere radius is the 1737.4 km LOLA reference; there is no relief on the globe (the regional and
 * site 3D views carry the DEM).
 */
const EQ = "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm";
const SP = "https://trek.nasa.gov/tiles/Moon/SP/LRO_WAC_Mosaic_SPole60_100m_v02/1.0.0/default/default028mm";
const SP_HALF = 1_095_930; // tile-matrix top-left corner (m), matrix 1 → 2×2 tiles cover the mosaic
const R = 1; // scene units: lunar radii

export type GlobeSite = { key: string; name: string; latitudeDeg: number; longitudeEastDeg: number };

/** Same parameterisation as THREE.SphereGeometry so markers sit exactly on the texture. */
function toScene(latDeg: number, lonEastDeg: number, r = R): THREE.Vector3 {
  const u = (((lonEastDeg + 180) % 360) + 360) % 360 / 360;
  const v = (90 - latDeg) / 180;
  const phi = u * Math.PI * 2;
  const theta = v * Math.PI;
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

function fromScene(p: THREE.Vector3): { lat: number; lon: number } {
  const n = p.clone().normalize();
  const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, n.y))) * 180) / Math.PI;
  let lon = (Math.atan2(n.z, -n.x) * 180) / Math.PI - 180;
  lon = ((lon % 360) + 360) % 360;
  return { lat, lon };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(url));
    im.src = url;
  });
}

type TexState = { tex: THREE.CanvasTexture | null; loaded: number; total: number; failed: number };

function useMoonTexture(): TexState {
  const [s, setS] = useState<TexState>({ tex: null, loaded: 0, total: 36, failed: 0 });
  useEffect(() => {
    let live = true;
    const W = 2048, H = 1024;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#5d5a55";
    ctx.fillRect(0, 0, W, H);
    let loaded = 0, failed = 0;
    const bump = (ok: boolean) => {
      if (ok) loaded++;
      else failed++;
      if (live) setS((p) => ({ ...p, loaded, failed }));
    };
    const eq = [] as Promise<void>[];
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 8; col++)
        eq.push(loadImage(`${EQ}/2/${row}/${col}.jpg`).then((im) => { ctx.drawImage(im, col * 256, row * 256); bump(true); }, () => bump(false)));
    const sp = [0, 1].flatMap((row) => [0, 1].map((col) => loadImage(`${SP}/1/${row}/${col}.png`).then((im) => ({ im, row, col }), () => { bump(false); return null; })));
    Promise.all([Promise.all(eq), Promise.all(sp)]).then(([, tiles]) => {
      if (!live) return;
      const ok = tiles.filter(Boolean) as { im: HTMLImageElement; row: number; col: number }[];
      ok.forEach(() => bump(true));
      if (ok.length === 4) {
        // Reproject the polar mosaic (stereographic, 0°E up) into equirectangular rows south of 65°S.
        const pc = document.createElement("canvas");
        pc.width = pc.height = 512;
        const pctx = pc.getContext("2d", { willReadFrequently: true })!;
        ok.forEach(({ im, row, col }) => pctx.drawImage(im, col * 256, row * 256));
        const src = pctx.getImageData(0, 0, 512, 512).data;
        const y0 = Math.floor(((90 + 65) / 180) * H);
        const out = ctx.getImageData(0, y0, W, H - y0);
        for (let y = 0; y < H - y0; y++) {
          const lat = 90 - ((y0 + y + 0.5) / H) * 180;
          const rho = 2 * R_MOON_M * Math.tan(Math.PI / 4 + (lat * Math.PI) / 360);
          const blend = Math.min(1, (-65 - lat) / 3); // fade in over 65–68°S
          for (let x = 0; x < W; x++) {
            const lon = ((x + 0.5) / W) * 360 - 180;
            const a = (lon * Math.PI) / 180;
            const px = Math.floor(((rho * Math.sin(a) + SP_HALF) / (2 * SP_HALF)) * 512);
            const py = Math.floor(((SP_HALF - rho * Math.cos(a)) / (2 * SP_HALF)) * 512);
            if (px < 0 || py < 0 || px >= 512 || py >= 512) continue;
            const si = (py * 512 + px) * 4;
            if (src[si + 3] === 0) continue;
            const di = (y * W + x) * 4;
            for (let c = 0; c < 3; c++) out.data[di + c] = out.data[di + c] * (1 - blend) + src[si + c] * blend;
          }
        }
        ctx.putImageData(out, 0, y0);
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      setS((p) => ({ ...p, tex }));
    });
    return () => {
      live = false;
    };
  }, []);
  return s;
}

/* ----------------------------- global LOLA relief ----------------------------- */
type ReliefLevel = "low" | "high";
const RELIEF_FILES: Record<ReliefLevel, { file: string; w: number; h: number; seg: [number, number] }> = {
  low: { file: "global_relief_4ppd.i16", w: 1440, h: 720, seg: [360, 180] }, // ~7.6 km grid, 1° mesh
  high: { file: "global_relief_8ppd.i16", w: 2880, h: 1440, seg: [1080, 540] }, // ~3.8 km grid, 1/3° mesh
};
const reliefCache = new Map<ReliefLevel, Promise<HeightMap>>();
function loadRelief(level: ReliefLevel): Promise<HeightMap> {
  let p = reliefCache.get(level);
  if (!p) {
    const f = RELIEF_FILES[level];
    p = fetch(`/data/terrain/${f.file}`).then(async (r) => {
      if (!r.ok) throw new Error(`relief ${level} HTTP ${r.status}`);
      const buf = await r.arrayBuffer();
      if (buf.byteLength !== f.w * f.h * 2) throw new Error("relief size mismatch");
      return { data: new Int16Array(buf), width: f.w, height: f.h };
    });
    p.catch(() => reliefCache.delete(level));
    reliefCache.set(level, p);
  }
  return p;
}
/** Loads the requested LOD; keeps the last loaded map visible while a finer one streams in. */
function useRelief(level: ReliefLevel, enabled: boolean) {
  const [maps, setMaps] = useState<Partial<Record<ReliefLevel, HeightMap>>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || maps[level]) return;
    let live = true;
    loadRelief(level).then((m) => live && setMaps((s) => ({ ...s, [level]: m })), (e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [level, enabled, maps]);
  const map = maps[level] ?? maps.low ?? null;
  const shown: ReliefLevel | null = maps[level] ? level : maps.low ? "low" : null;
  return { map, shown, error };
}

/** Switches LOD with the camera distance (with hysteresis). */
function LodWatcher({ onLevel }: { onLevel: (l: ReliefLevel) => void }) {
  const cur = useRef<ReliefLevel>("low");
  useFrame(({ camera }) => {
    const d = camera.position.length();
    const next: ReliefLevel = cur.current === "low" ? (d < 2.1 ? "high" : "low") : d > 2.5 ? "low" : "high";
    if (next !== cur.current) {
      cur.current = next;
      onLevel(next);
    }
  });
  return null;
}

/** Light that follows the camera: a display aid for reading relief, explicitly not the Sun. */
function CameraLight() {
  const ref = useRef<THREE.DirectionalLight>(null);
  useFrame(({ camera }) => {
    if (!ref.current) return;
    // From slightly above-left of the view so relief casts readable shading.
    const up = camera.up.clone().multiplyScalar(0.6);
    const left = new THREE.Vector3().crossVectors(camera.up, camera.position).normalize().multiplyScalar(-0.6);
    ref.current.position.copy(camera.position.clone().add(up).add(left).multiplyScalar(4));
  });
  return <directionalLight ref={ref} intensity={2.2} />;
}

function ReliefMoon({ map, level, exaggeration, tex, lit, onPointerMove, onPointerOut, onClick }: {
  map: HeightMap | null; level: ReliefLevel; exaggeration: number; tex: THREE.Texture | null; lit: boolean;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void; onPointerOut: () => void; onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const geom = useMemo(() => {
    const [sw, sh] = map ? RELIEF_FILES[level].seg : [160, 80];
    const g = reliefSphere(map, sw, sh, exaggeration);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(g.positions, 3));
    bg.setAttribute("uv", new THREE.BufferAttribute(g.uvs, 2));
    bg.setIndex(new THREE.BufferAttribute(g.indices, 1));
    bg.computeVertexNormals();
    bg.computeBoundingSphere();
    return bg;
  }, [map, level, exaggeration]);
  useEffect(() => () => geom.dispose(), [geom]); // free GPU memory when LOD / exaggeration changes
  return (
    <mesh geometry={geom} onPointerMove={onPointerMove} onPointerOut={onPointerOut} onClick={onClick}>
      {lit ? (
        <meshLambertMaterial key={tex ? "tex-lit" : "plain-lit"} map={tex ?? undefined} color={tex ? "#ffffff" : "#8a857c"} />
      ) : (
        <meshBasicMaterial key={tex ? "tex" : "plain"} map={tex ?? undefined} color={tex ? "#ffffff" : "#6b6760"} />
      )}
    </mesh>
  );
}

function Graticule() {
  const group = useMemo(() => {
    const g = new THREE.Group();
    const add = (pts: THREE.Vector3[], color: string, opacity: number) => g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
    for (let lat = -60; lat <= 60; lat += 30) add(Array.from({ length: 181 }, (_, i) => toScene(lat, i * 2, 1.002)), lat === 0 ? "#e2be7a" : "#efe9dd", lat === 0 ? 0.5 : 0.18);
    for (let lon = 0; lon < 360; lon += 30) add(Array.from({ length: 91 }, (_, i) => toScene(-90 + i * 2, lon, 1.002)), lon === 0 ? "#e2be7a" : "#efe9dd", lon === 0 ? 0.5 : 0.18);
    add(Array.from({ length: 181 }, (_, i) => toScene(COVERAGE_LAT, i * 2, 1.003)), "#d99577", 0.9);
    return g;
  }, []);
  return <primitive object={group} />;
}

type OrbitLike = { target: THREE.Vector3; update: () => void };

/** Smoothly moves the camera to `to` (scene coords) whenever `token` changes. */
function CameraRig({ to, token, controls }: { to: THREE.Vector3 | null; token: number; controls: React.RefObject<OrbitLike | null> }) {
  const { camera } = useThree();
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; t: number } | null>(null);
  useEffect(() => {
    if (to) anim.current = { from: camera.position.clone(), to: to.clone(), t: 0 };
  }, [token, to, camera]);
  useFrame((_, dt) => {
    const a = anim.current;
    if (!a) return;
    a.t = Math.min(1, a.t + dt / 1.1);
    const k = a.t < 0.5 ? 2 * a.t * a.t : 1 - (-2 * a.t + 2) ** 2 / 2; // ease in-out
    // Slerp the direction and lerp the distance so the path arcs around the Moon instead of through it.
    const dir = a.from.clone().normalize().lerp(a.to.clone().normalize(), k).normalize();
    const dist = THREE.MathUtils.lerp(a.from.length(), a.to.length(), k);
    camera.position.copy(dir.multiplyScalar(dist));
    camera.lookAt(0, 0, 0);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

export function GlobeScene({
  sites, selectedKey, onSelect, onOpenRegional, height = 520, picked, onPick, sun, autoRotate = false,
}: {
  /** Slowly spin the globe until the user interacts (home preview). */
  autoRotate?: boolean;
  sites: GlobeSite[];
  selectedKey: string | null;
  onSelect: (k: string) => void;
  onOpenRegional?: () => void;
  height?: number;
  /** Arbitrary user-picked point (any latitude). */
  picked?: { lat: number; lon: number } | null;
  onPick?: (p: { lat: number; lon: number }) => void;
  /** Sub-solar direction (lat/lon of the Sun's direction in MOON_ME) from a SPICE result; lights the globe. */
  sun?: { lat: number; lon: number; label: string } | null;
}) {
  const t = useMoonTexture();
  const [hover, setHover] = useState<{ lat: number; lon: number } | null>(null);
  // Lighting: SPICE Sun (when a result supplies it), a camera "relief light" (display aid), or the unlit mosaic.
  const [lightMode, setLightMode] = useState<"sun" | "relief" | "unlit">(sun ? "sun" : "relief");
  const [exaggeration, setExaggeration] = useState(1);
  const hasSun = !!sun;
  useEffect(() => {
    if (hasSun) setLightMode("sun"); // eslint-disable-line react-hooks/set-state-in-effect -- adopt SPICE lighting once a result supplies it
  }, [hasSun]);
  const [level, setLevel] = useState<ReliefLevel>("low");
  const relief = useRelief(level, true);
  const surfR = (lat: number, lon: number) => (relief.map ? 1 + (exaggeration * heightAt(relief.map, lat, lon)) / MOON_RADIUS_M : 1);
  const controls = useRef<OrbitLike | null>(null);
  const sel = sites.find((s) => s.key === selectedKey);
  // start looking at the south polar region from 45°S over the near side
  const home = useMemo(() => toScene(-62, 0, 3.6), []);
  const cam = useMemo(() => home.toArray() as [number, number, number], [home]);
  const [fly, setFly] = useState<{ to: THREE.Vector3 | null; token: number }>({ to: null, token: 0 });
  const flyTo = (v: THREE.Vector3) => setFly((f) => ({ to: v, token: f.token + 1 }));
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const focus = picked ?? (sel ? { lat: sel.latitudeDeg, lon: sel.longitudeEastDeg } : null);
  const focusKey = focus ? `${focus.lat.toFixed(4)},${focus.lon.toFixed(4)}` : "";
  // Fly to the selected site / picked point whenever it changes.
  useEffect(() => {
    if (!focus) return;
    setFly((f) => ({ to: toScene(focus.lat, focus.lon, 2.4), token: f.token + 1 })); // eslint-disable-line react-hooks/set-state-in-effect -- camera animation is driven by the selection
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by focusKey
  }, [focusKey]);
  const sunPos = sun ? toScene(sun.lat, sun.lon, 20) : null;
  const mode = lightMode === "sun" && !sunPos ? "relief" : lightMode;
  const useLight = mode === "sun";
  const btn = "rounded-[4px] bg-[rgb(28_26_23/0.8)] px-2 py-1 text-[11px] text-[#efe9dd] hover:bg-[rgb(28_26_23/0.95)]";
  return (
    <div role="region" aria-label="Interactive 3D Moon globe (NASA Moon Trek imagery)" className="relative overflow-hidden rounded-[6px] border border-line bg-[#141310]" style={{ height }} data-testid="globe">
      <Canvas camera={{ position: cam, fov: 35, near: 0.01, far: 50 }} dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        {useLight && (
          <>
            <ambientLight intensity={0.08} />
            <directionalLight position={sunPos!.toArray()} intensity={2.6} />
            <mesh position={sunPos!.clone().setLength(4.5).toArray()}><sphereGeometry args={[0.06, 16, 16]} /><meshBasicMaterial color="#f3d27a" /></mesh>
          </>
        )}
        {mode === "relief" && (
          <>
            <ambientLight intensity={0.25} />
            <CameraLight />
          </>
        )}
        <ReliefMoon
          map={relief.map}
          level={relief.shown ?? "low"}
          exaggeration={exaggeration}
          tex={t.tex}
          lit={mode !== "unlit"}
          onPointerMove={(e) => setHover(fromScene(e.point))}
          onPointerOut={() => setHover(null)}
          onClick={(e) => {
            if (!onPick || e.delta > 4) return; // ignore drags (orbiting)
            e.stopPropagation();
            onPick(fromScene(e.point));
          }}
        />
        <LodWatcher onLevel={setLevel} />
        <Graticule />
        {sites.map((s) => {
          const on = s.key === selectedKey;
          return (
            <group key={s.key} position={toScene(s.latitudeDeg, s.longitudeEastDeg, surfR(s.latitudeDeg, s.longitudeEastDeg) + 0.004)}>
              <mesh onClick={(e) => { e.stopPropagation(); onSelect(s.key); }}>
                <sphereGeometry args={[on ? 0.012 : 0.008, 16, 16]} />
                <meshBasicMaterial color={on ? "#d99577" : "#fffcf5"} />
              </mesh>
            </group>
          );
        })}
        {picked && (
          <mesh position={toScene(picked.lat, picked.lon, surfR(picked.lat, picked.lon) + 0.006)}>
            <sphereGeometry args={[0.014, 16, 16]} />
            <meshBasicMaterial color="#e2be7a" />
          </mesh>
        )}
        <CameraRig to={fly.to} token={fly.token} controls={controls} />
        <OrbitControls ref={controls as never} enablePan minDistance={1.25} maxDistance={6} rotateSpeed={0.5} enableDamping={!reduced} autoRotate={autoRotate && !reduced && !focus} autoRotateSpeed={0.6} />
      </Canvas>
      <div className="pointer-events-none absolute left-2 top-2 max-w-[70%] rounded-[3px] bg-[rgb(28_26_23/0.8)] px-2 py-1 text-[11px] leading-snug text-[#efe9dd]">
        {t.tex ? "LRO WAC mosaics (NASA/GSFC/ASU) via NASA Moon Trek" : `Loading NASA imagery… ${t.loaded}/${t.total} tiles`}
        <span className="block" data-testid="relief-status">
          {relief.map ? `Relief: NASA LOLA LDEM_16 → ${relief.shown === "high" ? "8 px/deg (~3.8 km)" : "4 px/deg (~7.6 km)"} · ${exaggeration === 1 ? "true scale (1.0×)" : `VISUAL EXAGGERATION ${exaggeration}× — display only`}` : relief.error ? `Relief unavailable (${relief.error}) — smooth sphere shown` : "Loading LOLA relief…"}
        </span>
        {mode === "relief" && <span className="block text-[#cfc6b5]">Shading: camera light for reading relief (not the Sun)</span>}
        {t.failed > 0 && <span className="block text-[#f0b3a3]">{t.failed} tile(s) unavailable — shown as grey.</span>}
        {useLight && sun && <span className="block text-[#f3d27a]">Lit by the SPICE Sun direction · {sun.label}</span>}
      </div>
      <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
        <button type="button" className={btn} onClick={() => flyTo(home)}>Reset view</button>
        <button type="button" className={btn} onClick={() => flyTo(new THREE.Vector3(0, -3.2, 0.001))}>South-pole view</button>
        {focus && <button type="button" className={btn} onClick={() => flyTo(toScene(focus.lat, focus.lon, 2.0))}>Fly to selection</button>}
        <label className={`${btn} flex items-center gap-1`}>
          Light
          <select aria-label="Globe lighting" value={mode} onChange={(e) => setLightMode(e.target.value as "sun" | "relief" | "unlit")} className="bg-transparent text-[11px] outline-none">
            {sunPos && <option value="sun">SPICE Sun</option>}
            <option value="relief">Relief (camera)</option>
            <option value="unlit">Unlit mosaic</option>
          </select>
        </label>
        <label className={`${btn} flex items-center gap-1`}>
          Relief
          <select aria-label="Vertical exaggeration" value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))} className="bg-transparent text-[11px] outline-none">
            {[1, 2, 5, 10, 20].map((x) => <option key={x} value={x}>{x === 1 ? "1.0× true" : `${x}× (visual)`}</option>)}
          </select>
        </label>
      </div>
      <div className="num pointer-events-none absolute bottom-2 right-2 rounded-[3px] bg-[rgb(28_26_23/0.8)] px-2 py-1 font-mono text-[12px] text-[#efe9dd]" aria-live="off" data-testid="globe-readout">
        {hover ? `${Math.abs(hover.lat).toFixed(2)}°${hover.lat < 0 ? "S" : "N"} ${hover.lon.toFixed(2)}°E` : picked ? `picked ${Math.abs(picked.lat).toFixed(3)}°${picked.lat < 0 ? "S" : "N"} ${picked.lon.toFixed(3)}°E` : `Drag to rotate · right-drag to pan · scroll to zoom${onPick ? " · click to pick" : ""}`}
      </div>
      {sel && onOpenRegional && !picked && (
        <button type="button" onClick={onOpenRegional} className="absolute bottom-2 left-2 rounded-[4px] bg-accent px-3 py-1.5 text-[12px] text-accent-ink">
          Open {sel.name} ({Math.abs(sel.latitudeDeg).toFixed(2)}°S) in polar region 3D
        </button>
      )}
    </div>
  );
}
