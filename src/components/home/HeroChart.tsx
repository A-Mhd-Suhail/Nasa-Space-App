"use client";
import { motion, useReducedMotion } from "motion/react";
import { MAP_EXTENT, toXY } from "@/lib/lunar";

type Station = { key: string; name: string; latitudeDeg: number; longitudeEastDeg: number; heightM: number | null; sunFraction: number; earthFraction: number };

const pos = (lat: number, lon: number) => {
  const [x0, y0, x1, y1] = MAP_EXTENT;
  const [x, y] = toXY(lat, lon);
  return { x: ((x - x0) / (x1 - x0)) * 1000, y: ((y1 - y) / (y1 - y0)) * 1000 };
};

/** The hero plate: LOLA south-polar relief with the copper traverse through the featured stations (real positions, real readings). */
export function HeroChart({ stations }: { stations: Station[] }) {
  const reduce = useReducedMotion();
  // traverse order and label sides are fixed for a legible, deterministic plate (positions are real)
  const ORDER = ["de-gerlache", "shackleton", "mons-malapert", "mons-mouton"];
  const SIDE: Record<string, number> = { "de-gerlache": -1, shackleton: 1, "mons-malapert": -1, "mons-mouton": 1 };
  const pts = [...stations].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)).map((s) => ({ ...s, ...pos(s.latitudeDeg, s.longitudeEastDeg) }));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  // keep the plate centred on the stations: crop to their bounding box with margin
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = 120;
  const vx = Math.max(0, Math.min(...xs) - pad);
  const vy = Math.max(0, Math.min(...ys) - pad);
  const vw = Math.min(1000 - vx, Math.max(...xs) - Math.min(...xs) + 2 * pad);
  const vh = Math.min(1000 - vy, Math.max(...ys) - Math.min(...ys) + 2 * pad);
  const side = Math.max(vw, vh);
  const cx = vx + vw / 2;
  const cy = vy + vh / 2;
  const box = `${(cx - side / 2).toFixed(0)} ${(cy - side / 2).toFixed(0)} ${side.toFixed(0)} ${side.toFixed(0)}`;
  const k = side / 1000;
  // label placement: away from the cluster centroid; separate labels that would collide on the same side
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const placed: { side: number; y: number }[] = [];
  const labels = pts.map((p) => {
    const sideSign = SIDE[p.key] ?? (p.x < mx ? -1 : 1);
    let ly = p.y + (p.key === "shackleton" ? 26 : -6) * k;
    for (const q of placed) if (q.side === sideSign && Math.abs(q.y - ly) < 58 * k) ly = q.y + 58 * k;
    placed.push({ side: sideSign, y: ly });
    return { sideSign, ly };
  });
  return (
    <figure className="relative">
      <div className="relative overflow-hidden rounded-[6px] border border-line bg-panel shadow-[var(--shadow-sheet)]">
        <svg viewBox={box} className="block aspect-square w-full" role="img" aria-label="LOLA south-polar relief map with the four featured stations joined by a traverse line">
          <image href="/data/lola_75s_240m_hillshade.webp" x="0" y="0" width="1000" height="1000" preserveAspectRatio="none" className="[mix-blend-mode:multiply] [[data-theme=dark]_&]:opacity-70 [[data-theme=dark]_&]:[mix-blend-mode:screen]" />
          <motion.path
            d={d}
            className="traverse-line"
            style={{ strokeWidth: 2.4 }}
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
          />
          {pts.map((p, i) => (
            <g key={p.key}>
              <circle cx={p.x} cy={p.y} r={11 * k} fill="var(--panel)" stroke="var(--accent)" strokeWidth={3 * k} />
              <circle cx={p.x} cy={p.y} r={4 * k} fill="var(--accent)" />
              {Math.abs(labels[i].ly - p.y) > 40 * k && <line x1={p.x} y1={p.y} x2={p.x + labels[i].sideSign * 18 * k} y2={labels[i].ly - 10 * k} stroke="var(--accent)" strokeWidth={1.2 * k} />}
              <g transform={`translate(${p.x + labels[i].sideSign * 20 * k} ${labels[i].ly})`}>
                <text textAnchor={labels[i].sideSign < 0 ? "end" : "start"} fontSize={30 * k} fontFamily="var(--font-newsreader)" fontWeight={500} fill="var(--text)" paintOrder="stroke" stroke="var(--panel)" strokeWidth={7 * k} strokeLinejoin="round">{p.name}</text>
                <text className="max-md:hidden" textAnchor={labels[i].sideSign < 0 ? "end" : "start"} y={24 * k} fontSize={17 * k} fontFamily="var(--font-plex-mono)" fill="var(--text-2)" paintOrder="stroke" stroke="var(--panel)" strokeWidth={6 * k} strokeLinejoin="round">
                  {`sun ${(p.sunFraction * 100).toFixed(0)}% · earth ${(p.earthFraction * 100).toFixed(0)}%`}
                </text>
              </g>
            </g>
          ))}
        </svg>
      </div>
      <figcaption className="mt-3 text-[12px] leading-relaxed text-muted">
        LOLA LDEM_75S_240M relief, south polar stereographic (0°E up). Stations are IAU feature centres; readings are precomputed MoonNav analyses for 15 Nov – 15 Dec 2026.
      </figcaption>
    </figure>
  );
}
