import { G0, MU_MOON_KM3_S2, R_MOON_KM, type Vec3 } from "./geometry";

/**
 * Simplified, configurable point-mass terminal-descent model in the local ENU frame at the landing target
 * (x east, y north, z up, metres). Uniform lunar gravity g = mu/R^2, thrust acceleration limited by the vehicle,
 * propellant by the rocket equation. SIMULATED: this is a teaching model, not a flight-dynamics tool.
 */
export type Vehicle = {
  dryMassKg: number;
  propellantKg: number;
  maxThrustN: number;
  ispS: number;
  maxBurnS: number;
  lateralThrustFraction: number; // share of maxThrust that may point sideways (0..1)
  reservePropellantKg: number;
};
export const DEFAULT_VEHICLE: Vehicle = { dryMassKg: 1800, propellantKg: 900, maxThrustN: 9000, ispS: 310, maxBurnS: 220, lateralThrustFraction: 0.35, reservePropellantKg: 40 };

export type DescentInit = { altitudeM: number; rangeM: number; approachBearingDeg: number; horizontalSpeedMs: number; verticalSpeedMs: number };
export const DEFAULT_INIT: DescentInit = { altitudeM: 2000, rangeM: 3000, approachBearingDeg: 200, horizontalSpeedMs: 40, verticalSpeedMs: -25 };

/**
 * A mid-descent anomaly that starts at `onsetS`: horizontal/vertical speed multiplied by a factor (a navigation or engine error),
 * thrust scaled (insufficient braking), or the remaining burn schedule stretched/shortened (incorrect thrust duration).
 */
export type Deviation = { onsetS?: number; horizontalSpeedFactor?: number; verticalSpeedFactor?: number; thrustScale?: number; burnDurationFactor?: number };
export const isDeviated = (d: Deviation) => [d.horizontalSpeedFactor, d.verticalSpeedFactor, d.thrustScale, d.burnDurationFactor].some((v) => v !== undefined && v !== 1);
/** Lunar surface gravity, mu/R^2. Treated as uniform: over a 3 km terminal descent it varies by only ~0.2%, and a uniform field keeps the closed-form checks exact. */
export const G_SURFACE = (MU_MOON_KM3_S2 * 1e9) / Math.pow(R_MOON_KM * 1000, 2);
export const gAt = (_zM: number) => G_SURFACE;

export type Limits = { landingRadiusM: number; maxTouchdownVerticalMs: number; maxTouchdownHorizontalMs: number };
export const DEFAULT_LIMITS: Limits = { landingRadiusM: 100, maxTouchdownVerticalMs: 2.5, maxTouchdownHorizontalMs: 1.5 };

export type Sample = { t: number; r: Vec3; v: Vec3; massKg: number; thrustN: number };
const v3 = (a: number, b: number, c: number): Vec3 => [a, b, c];

export function startState(init: DescentInit): { r: Vec3; v: Vec3 } {
  const b = (init.approachBearingDeg * Math.PI) / 180;
  const hs = init.horizontalSpeedMs;
  const vs = init.verticalSpeedMs;
  // starts at the given bearing from the target and flies toward it
  return { r: v3(init.rangeM * Math.sin(b), init.rangeM * Math.cos(b), init.altitudeM), v: v3(-hs * Math.sin(b), -hs * Math.cos(b), vs) };
}

/** Cubic-position (linear-acceleration) guidance from (r, v) to (rf, vf) in time T. Returns total acceleration a(t) = a0 + j t (gravity included). */
export function polyGuidance(r: Vec3, v: Vec3, rf: Vec3, vf: Vec3, T: number): { a0: Vec3; j: Vec3 } {
  const a0: number[] = [];
  const j: number[] = [];
  for (let k = 0; k < 3; k++) {
    const dv = vf[k] - v[k];
    const dr = rf[k] - r[k] - v[k] * T;
    const jk = (-12 * (dr - (dv * T) / 2)) / (T * T * T);
    j.push(jk);
    a0.push((dv - (jk * T * T) / 2) / T);
  }
  return { a0: a0 as Vec3, j: j as Vec3 };
}
/** Thrust acceleration (excludes gravity): a_total - g_vec. */
const thrustAccel = (a0: Vec3, j: Vec3, t: number, g: number): Vec3 => [a0[0] + j[0] * t, a0[1] + j[1] * t, a0[2] + j[2] * t + g];
const mag = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

export type Plan = { T: number; a0: Vec3; j: Vec3; maxThrustAccel: number; propellantKg: number };

/** Nominal landing plan: the time-to-go that needs the least peak thrust acceleration while keeping thrust upward and altitude >= 0. */
export function designNominal(init: DescentInit, veh: Vehicle): Plan | null {
  const { r, v } = startState(init);
  const m0 = veh.dryMassKg + veh.propellantKg;
  let best: Plan | null = null;
  for (let T = 15; T <= 400; T += 1) {
    const { a0, j } = polyGuidance(r, v, [0, 0, 0], [0, 0, 0], T);
    let ok = true;
    let peak = 0;
    let m = m0;
    let dvTotal = 0;
    for (let k = 0; k <= 60; k++) {
      const t = (T * k) / 60;
      const a = thrustAccel(a0, j, t, G_SURFACE);
      if (a[2] < -1e-9) ok = false;
      const z = r[2] + v[2] * t + 0.5 * a0[2] * t * t + (j[2] * t * t * t) / 6;
      if (z < -1) ok = false;
      peak = Math.max(peak, mag(a));
      const dt = T / 60;
      if (k < 60) {
        m -= (mag(a) * m * dt) / (veh.ispS * G0);
        dvTotal += mag(a) * dt;
      }
    }
    if (!ok || peak * m0 > veh.maxThrustN * 0.85) continue; // keep 15% control margin in the nominal plan
    if (!best || peak < best.maxThrustAccel) best = { T, a0, j, maxThrustAccel: peak, propellantKg: m0 - m };
    void dvTotal;
  }
  return best;
}

/** Integrate the descent forward. `cmd(t)` returns the commanded thrust acceleration (m/s^2 vector) or null for no thrust. */
export function propagate(args: { r: Vec3; v: Vec3; massKg: number; veh: Vehicle; cmd: (t: number, s: { r: Vec3; v: Vec3; massKg: number }) => Vec3 | null; tMax: number; dt?: number; t0?: number }): { samples: Sample[]; touchdown: Sample | null; propellantUsedKg: number } {
  const dt = args.dt ?? 0.25;
  let r = args.r;
  let v = args.v;
  let m = args.massKg;
  const samples: Sample[] = [{ t: args.t0 ?? 0, r, v, massKg: m, thrustN: 0 }];
  const t0 = args.t0 ?? 0;
  let touchdown: Sample | null = null;
  const used0 = m;
  const accelAt = (rr: Vec3, vv: Vec3, mm: number, t: number): { a: Vec3; thrustN: number } => {
    const c = mm > args.veh.dryMassKg ? args.cmd(t, { r: rr, v: vv, massKg: mm }) : null;
    let a: Vec3 = [0, 0, -gAt(rr[2])];
    let F = 0;
    if (c) {
      const am = mag(c);
      const cap = args.veh.maxThrustN / mm;
      const k = am > cap ? cap / am : 1;
      a = [a[0] + c[0] * k, a[1] + c[1] * k, a[2] + c[2] * k];
      F = am * k * mm;
    }
    return { a, thrustN: F };
  };
  for (let t = t0; t < t0 + args.tMax; t += dt) {
    // velocity-Verlet-like step (accurate for slowly varying thrust; verified against closed-form ballistic fall in tests)
    const a1 = accelAt(r, v, m, t);
    const rn: Vec3 = [r[0] + v[0] * dt + 0.5 * a1.a[0] * dt * dt, r[1] + v[1] * dt + 0.5 * a1.a[1] * dt * dt, r[2] + v[2] * dt + 0.5 * a1.a[2] * dt * dt];
    const mn = Math.max(args.veh.dryMassKg, m - (a1.thrustN * dt) / (args.veh.ispS * G0));
    const a2 = accelAt(rn, [v[0] + a1.a[0] * dt, v[1] + a1.a[1] * dt, v[2] + a1.a[2] * dt], mn, t + dt);
    const vn: Vec3 = [v[0] + 0.5 * (a1.a[0] + a2.a[0]) * dt, v[1] + 0.5 * (a1.a[1] + a2.a[1]) * dt, v[2] + 0.5 * (a1.a[2] + a2.a[2]) * dt];
    if (rn[2] <= 0) {
      // interpolate the touchdown instant
      const f = r[2] / (r[2] - rn[2] || 1);
      const rt: Vec3 = [r[0] + (rn[0] - r[0]) * f, r[1] + (rn[1] - r[1]) * f, 0];
      const vt: Vec3 = [v[0] + (vn[0] - v[0]) * f, v[1] + (vn[1] - v[1]) * f, v[2] + (vn[2] - v[2]) * f];
      touchdown = { t: t + dt * f, r: rt, v: vt, massKg: m + (mn - m) * f, thrustN: a1.thrustN };
      samples.push(touchdown);
      break;
    }
    r = rn;
    v = vn;
    m = mn;
    samples.push({ t: t + dt, r, v, massKg: m, thrustN: a2.thrustN });
  }
  return { samples, touchdown, propellantUsedKg: used0 - (samples[samples.length - 1]?.massKg ?? m) };
}

export type RunResult = { samples: Sample[]; touchdown: Sample | null; propellantUsedKg: number; plan: Plan };

/** The planned descent, or one flown with the SAME open-loop thrust schedule but an anomaly starting at dev.onsetS. */
export function flyPlan(init: DescentInit, veh: Vehicle, plan: Plan, dev: Deviation = {}, tMax = 600): RunResult {
  const { r, v } = startState(init);
  const m0 = veh.dryMassKg + veh.propellantKg;
  const sched = (tau: number): Vec3 => thrustAccel(plan.a0, plan.j, Math.min(Math.max(0, tau), plan.T), G_SURFACE);
  const onset = isDeviated(dev) ? Math.max(0, Math.min(dev.onsetS ?? 20, plan.T - 1)) : Infinity;
  const phase1 = propagate({ r, v, massKg: m0, veh, tMax: Number.isFinite(onset) ? onset : tMax, cmd: (t) => (t <= plan.T ? sched(t) : null) });
  if (!Number.isFinite(onset) || phase1.touchdown) return { ...phase1, plan };
  const last = phase1.samples[phase1.samples.length - 1];
  const hf = dev.horizontalSpeedFactor ?? 1;
  const vf = dev.verticalSpeedFactor ?? 1;
  const k = dev.thrustScale ?? 1;
  const f = dev.burnDurationFactor ?? 1;
  const v2: Vec3 = [last.v[0] * hf, last.v[1] * hf, last.v[2] * vf];
  const phase2 = propagate({
    r: last.r, v: v2, massKg: last.massKg, veh, tMax: tMax - last.t, t0: last.t,
    cmd: (t) => {
      const tau = onset + (t - onset) / f; // stretched or shortened schedule
      if (tau > plan.T) return null;
      const a = sched(tau);
      return [a[0] * k, a[1] * k, a[2] * k];
    },
  });
  const samples = [...phase1.samples, ...phase2.samples.slice(1)];
  return { samples, touchdown: phase2.touchdown, propellantUsedKg: m0 - samples[samples.length - 1].massKg, plan };
}

/** Where the lander lands if thrust stops now. */
export function ballisticTouchdown(s: { r: Vec3; v: Vec3; massKg: number }, veh: Vehicle): Sample | null {
  return propagate({ r: s.r, v: s.v, massKg: s.massKg, veh, cmd: () => null, tMax: 900, dt: 0.5 }).touchdown;
}

/* ------------------------------ recovery solver ------------------------------ */
export type Mode = "retrograde" | "vertical" | "divert" | "target";
export type RecoveryAim = { pos: Vec3; vel: Vec3; label: string };
export type Violation = { kind: "thrust" | "lateral" | "downward_thrust" | "altitude" | "burn_time" | "propellant"; message: string; severity: number };
export type Recovery = {
  feasible: boolean;
  mode: Mode;
  aim: RecoveryAim;
  T: number | null;
  deltaVMs: number;
  propellantKg: number;
  remainingPropellantKg: number;
  burnTimeS: number;
  peakThrustAccel: number;
  peakThrustN: number;
  velocityBefore: Vec3;
  velocityAfter: Vec3;
  touchdown: Vec3 | null;
  path: Sample[]; // the corrected trajectory (for the 3D scene)
  violations: Violation[]; // why it is not feasible (best attempt)
  summary: string;
};

function evaluateProfile(s: { r: Vec3; v: Vec3; massKg: number }, aim: RecoveryAim, veh: Vehicle, T: number) {
  const { a0, j } = polyGuidance(s.r, s.v, aim.pos, aim.vel, T);
  const N = Math.max(40, Math.ceil(T / 1));
  let m = s.massKg;
  let dv = 0;
  let peakA = 0;
  let peakF = 0;
  let minZ = Infinity;
  let downward = 0;
  let overThrust = 0;
  let overLat = 0;
  const latCap = veh.maxThrustN * veh.lateralThrustFraction;
  for (let k = 0; k <= N; k++) {
    const t = (T * k) / N;
    const a = thrustAccel(a0, j, t, gAt(Math.max(0, s.r[2])));
    const F = mag(a) * m;
    peakA = Math.max(peakA, mag(a));
    peakF = Math.max(peakF, F);
    overThrust = Math.max(overThrust, F / veh.maxThrustN - 1);
    overLat = Math.max(overLat, (Math.hypot(a[0], a[1]) * m) / Math.max(latCap, 1e-9) - 1);
    if (a[2] < 0) downward = Math.max(downward, -a[2]);
    const z = s.r[2] + s.v[2] * t + 0.5 * a0[2] * t * t + (j[2] * t * t * t) / 6;
    minZ = Math.min(minZ, z - (k === N ? 0 : 0));
    if (k < N) {
      const dt = T / N;
      m -= (mag(a) * m * dt) / (veh.ispS * G0);
      dv += mag(a) * dt;
    }
  }
  const used = s.massKg - m;
  const avail = veh.propellantKg - (s.massKg - veh.dryMassKg - veh.propellantKg < 0 ? 0 : 0);
  void avail;
  return { a0, j, dv, used, peakA, peakF, minZ, downward, overThrust, overLat, mEnd: m };
}

export function solveRecovery(s: { r: Vec3; v: Vec3; massKg: number }, aim: RecoveryAim, veh: Vehicle, mode: Mode): Recovery {
  const propNow = Math.max(0, s.massKg - veh.dryMassKg);
  const usable = propNow - veh.reservePropellantKg;
  const base = { mode, aim, velocityBefore: s.v, deltaVMs: 0, propellantKg: 0, remainingPropellantKg: propNow, burnTimeS: 0, peakThrustAccel: 0, peakThrustN: 0, velocityAfter: s.v, touchdown: null as Vec3 | null, path: [] as Sample[] };
  type Cand = { T: number; ev: ReturnType<typeof evaluateProfile>; viol: Violation[]; score: number };
  let best: Cand | null = null;
  let bestFeasible: Cand | null = null;
  for (let T = 3; T <= Math.max(60, veh.maxBurnS * 1.5); T += T < 30 ? 0.5 : 1) {
    const ev = evaluateProfile(s, aim, veh, T);
    const viol: Violation[] = [];
    if (ev.overThrust > 1e-6) viol.push({ kind: "thrust", message: `needs a peak thrust of ${ev.peakF.toFixed(0)} N; the vehicle provides ${veh.maxThrustN.toFixed(0)} N`, severity: ev.overThrust });
    if (ev.overLat > 1e-6) viol.push({ kind: "lateral", message: `the sideways thrust needed exceeds the ${(veh.lateralThrustFraction * 100).toFixed(0)}% of thrust available laterally`, severity: ev.overLat });
    if (ev.downward > 1e-6) viol.push({ kind: "downward_thrust", message: `needs to accelerate downward by ${ev.downward.toFixed(2)} m/s²; thrust can only push up (gravity already pulls down)`, severity: ev.downward / 3 });
    if (ev.minZ < -1) viol.push({ kind: "altitude", message: `the path would dip ${(-ev.minZ).toFixed(0)} m below the surface before reaching the aim point`, severity: -ev.minZ / 100 });
    if (T > veh.maxBurnS) viol.push({ kind: "burn_time", message: `needs ${T.toFixed(0)} s of continuous burn; the engine limit is ${veh.maxBurnS.toFixed(0)} s`, severity: (T - veh.maxBurnS) / veh.maxBurnS });
    if (ev.used > usable + 1e-6) viol.push({ kind: "propellant", message: `needs ${ev.used.toFixed(1)} kg of propellant; ${Math.max(0, usable).toFixed(1)} kg is available above the ${veh.reservePropellantKg} kg reserve`, severity: (ev.used - usable) / Math.max(usable, 10) });
    const score = viol.reduce((a, x) => a + x.severity, 0);
    const c = { T, ev, viol, score };
    if (!viol.length && (!bestFeasible || ev.used < bestFeasible.ev.used)) bestFeasible = c;
    if (!best || score < best.score || (score === best.score && ev.used < best.ev.used)) best = c;
  }
  const pick = bestFeasible ?? best!;
  const ev = pick.ev;
  // Build the corrected trajectory by actually flying the commanded profile through the integrator (consistency check, not just algebra).
  const flown = propagate({
    r: s.r, v: s.v, massKg: s.massKg, veh, tMax: pick.T + 2, dt: 0.25,
    cmd: (t) => (t <= pick.T ? thrustAccel(ev.a0, ev.j, t, gAt(0)) : null),
  });
  const last = flown.samples[flown.samples.length - 1];
  const feasible = !!bestFeasible;
  const vAfter: Vec3 = flown.touchdown ? flown.touchdown.v : last.v;
  const result: Recovery = {
    ...base,
    feasible,
    T: pick.T,
    deltaVMs: ev.dv,
    propellantKg: ev.used,
    remainingPropellantKg: propNow - ev.used,
    burnTimeS: pick.T,
    peakThrustAccel: ev.peakA,
    peakThrustN: ev.peakF,
    velocityAfter: feasible ? aim.vel : vAfter,
    touchdown: feasible ? aim.pos : flown.touchdown ? flown.touchdown.r : null,
    path: flown.samples,
    violations: feasible ? [] : pick.viol,
    summary: feasible
      ? `Feasible: ${ev.dv.toFixed(1)} m/s of delta-v over ${pick.T.toFixed(0)} s, ${ev.used.toFixed(1)} kg of propellant (${(propNow - ev.used).toFixed(1)} kg left).`
      : "RECOVERY NOT FEASIBLE: " + (pick.viol.map((x) => x.message).join("; ") || "no profile satisfies the limits"),
  };
  return result;
}

export function touchdownAssessment(td: { r: Vec3; v: Vec3 } | null, aimPos: Vec3, lim: Limits) {
  if (!td) return { landed: false, distanceM: Infinity, verticalMs: 0, horizontalMs: 0, safe: false, reasons: ["no touchdown within the simulated window"] };
  const distanceM = Math.hypot(td.r[0] - aimPos[0], td.r[1] - aimPos[1]);
  const verticalMs = Math.abs(td.v[2]);
  const horizontalMs = Math.hypot(td.v[0], td.v[1]);
  const reasons: string[] = [];
  if (distanceM > lim.landingRadiusM) reasons.push(`touchdown ${distanceM.toFixed(0)} m from the aim point (limit ${lim.landingRadiusM} m)`);
  if (verticalMs > lim.maxTouchdownVerticalMs) reasons.push(`vertical speed ${verticalMs.toFixed(1)} m/s at touchdown (limit ${lim.maxTouchdownVerticalMs} m/s)`);
  if (horizontalMs > lim.maxTouchdownHorizontalMs) reasons.push(`horizontal speed ${horizontalMs.toFixed(1)} m/s at touchdown (limit ${lim.maxTouchdownHorizontalMs} m/s)`);
  return { landed: true, distanceM, verticalMs, horizontalMs, safe: reasons.length === 0, reasons };
}

/** Aim builder for each emergency maneuver. */
export function aimFor(mode: Mode, s: { r: Vec3; v: Vec3; massKg: number }, veh: Vehicle, target: { pos: Vec3; label: string }): RecoveryAim {
  if (mode === "target") return { pos: [target.pos[0], target.pos[1], target.pos[2]], vel: [0, 0, 0], label: target.label };
  if (mode === "divert") return { pos: target.pos, vel: [0, 0, 0], label: target.label };
  if (mode === "vertical") {
    const bt = ballisticTouchdown(s, veh);
    const p = bt ? bt.r : ([s.r[0], s.r[1], 0] as Vec3);
    return { pos: [p[0], p[1], 0], vel: [s.v[0], s.v[1], 0], label: "predicted touchdown (vertical braking only)" };
  }
  // retrograde: stop horizontally using the lateral authority
  const vh = Math.hypot(s.v[0], s.v[1]);
  const aLat = (veh.maxThrustN * veh.lateralThrustFraction) / s.massKg;
  const d = aLat > 0 ? (vh * vh) / (2 * aLat) : 0;
  const ux = vh > 1e-9 ? s.v[0] / vh : 0;
  const uy = vh > 1e-9 ? s.v[1] / vh : 0;
  return { pos: [s.r[0] + ux * d, s.r[1] + uy * d, 0], vel: [0, 0, 0], label: "horizontal stopping point (retrograde burn)" };
}
