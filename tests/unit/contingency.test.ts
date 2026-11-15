import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, runSimulation } from "@/lib/contingency/engine";
import { illustrativeEnvironment, parseEnvironment, candidatesFromHazards } from "@/lib/contingency/environment";
import { azElOf, enuDirection, enuToBody, bodyToEnu, horizonElevationAtAltitude, mapOffsetToEnu, enuToMapOffset, R_MOON_KM, segmentHitsMoon } from "@/lib/contingency/geometry";
import { advance, start, TRANSITIONS } from "@/lib/contingency/machine";
import { aimFor, ballisticTouchdown, DEFAULT_INIT, DEFAULT_LIMITS, DEFAULT_VEHICLE, designNominal, flyPlan, G_SURFACE, propagate, solveRecovery, touchdownAssessment, type Vehicle } from "@/lib/contingency/physics";
import { commWindows, evaluateComm, horizonAt, linkMarginDb, orbitPeriodS, relayPosition, terrainSight, type CommInputs, type HorizonProfile } from "@/lib/contingency/relay";
import { DEFAULT_SITE_CONFIG, evaluateSites, type SiteCandidate } from "@/lib/contingency/sites";

const flatHorizon = (deg: number, blockM = 5000): HorizonProfile => ({ observerRadiusM: R_MOON_KM * 1000 + 2, stepDeg: 0.5, samples: Array.from({ length: 720 }, (_, i) => ({ azimuthDeg: i * 0.5, elevationDeg: deg, blockingDistanceM: blockM })) });
const site = { siteLatDeg: -88, siteLonEastDeg: 0, siteHeightM: 0 };
const base = (over: Partial<CommInputs>): CommInputs => ({ ...site, landerEnuM: [0, 0, 0], earth: { azDeg: 0, elDeg: 30, distanceKm: 384_400 }, horizon: flatHorizon(2), relay: { altitudeKm: 500, inclinationDeg: 90, raanDeg: 0, phaseDeg: 272 }, tS: 0, maskDeg: 5, ...over });

describe("frames and geometry", () => {
  it("ENU <-> body round trip and azimuth convention", () => {
    const v: [number, number, number] = [3, -4, 12];
    const b = enuToBody(v, -88, 33);
    const back = bodyToEnu(b, -88, 33);
    back.forEach((x, i) => expect(x).toBeCloseTo(v[i], 9));
    const ae = azElOf(enuDirection(120, 25));
    expect(ae.azDeg).toBeCloseTo(120, 9);
    expect(ae.elDeg).toBeCloseTo(25, 9);
  });
  it("map offsets rotate consistently with the longitude", () => {
    const [e, n] = mapOffsetToEnu(1000, 500, 77);
    const [dx, dy] = enuToMapOffset(e, n, 77);
    expect(dx).toBeCloseTo(1000, 6);
    expect(dy).toBeCloseTo(500, 6);
    expect(mapOffsetToEnu(1, 2, 0)).toEqual([1, 2]);
  });
  it("a ray into the Moon is occulted, a tangent ray is not", () => {
    expect(segmentHitsMoon([R_MOON_KM + 100, 0, 0], [-1, 0, 0], 384_400)).toBe(true);
    expect(segmentHitsMoon([R_MOON_KM + 100, 0, 0], [1, 0, 0], 384_400)).toBe(false);
    expect(segmentHitsMoon([R_MOON_KM, 0, 0], [0, 1, 0], 1000)).toBe(false); // exactly tangent
  });
  it("raising the observer lowers the horizon of the same blocking terrain", () => {
    const h0 = 3;
    const hi = horizonElevationAtAltitude({ horizonDeg: h0, blockingDistanceM: 4000, observerRadiusM: 1_737_402, altitudeM: 500 });
    expect(hi).toBeLessThan(h0);
    expect(horizonElevationAtAltitude({ horizonDeg: h0, blockingDistanceM: 4000, observerRadiusM: 1_737_402, altitudeM: 0 })).toBe(h0);
    // exact against flat-ground geometry for a nearby wall: tan(angle) = (H - z) / d
    const wallH = 4000 * Math.tan((3 * Math.PI) / 180);
    expect(Math.tan((hi * Math.PI) / 180)).toBeCloseTo((wallH - 500) / 4000, 2);
  });
});

describe("communication: direct Earth, relay legs, windows", () => {
  it("direct Earth visibility available", () => {
    const c = evaluateComm(base({}));
    expect(c.direct.effective).toBe("available");
    expect(c.direct.clearanceDeg).toBeGreaterThan(20);
  });
  it("direct Earth visibility blocked by terrain, with a terrain reason", () => {
    const c = evaluateComm(base({ earth: { azDeg: 0, elDeg: 8, distanceKm: 384_400 }, horizon: flatHorizon(12) }));
    expect(c.direct.effective).toBe("lost");
    expect(c.direct.reason).toMatch(/terrain/);
  });
  it("antenna mask can block a path that terrain alone would allow", () => {
    const c = evaluateComm(base({ earth: { azDeg: 0, elDeg: 4, distanceKm: 384_400 }, horizon: flatHorizon(1), maskDeg: 10 }));
    expect(c.direct.effective).toBe("lost");
    expect(c.direct.reason).toMatch(/mask/);
  });
  it("a forced blackout is reported as simulated, whatever the geometry", () => {
    const c = evaluateComm(base({ forcedBlackout: true }));
    expect(c.direct.effective).toBe("lost");
    expect(c.direct.forced).toBe(true);
    expect(c.direct.reason).toMatch(/simulated/);
  });
  it("no ephemeris means unknown, never visible", () => {
    expect(evaluateComm(base({ earth: null })).direct.effective).toBe("unknown");
  });
  it("relay sees the lander AND Earth: relay path available", () => {
    const c = evaluateComm(base({ earth: { azDeg: 0, elDeg: 30, distanceKm: 384_400 }, horizon: flatHorizon(2) }));
    expect(c.landerToRelay.state).toBe("visible");
    expect(c.relayToEarth.state).toBe("visible");
    expect(c.relay.available).toBe("AVAILABLE");
  });
  it("relay sees the lander but NOT Earth: unavailable", () => {
    const c = evaluateComm(base({ earth: { azDeg: 0, elDeg: -60, distanceKm: 384_400 } }));
    expect(c.landerToRelay.state).toBe("visible");
    expect(c.relayToEarth.state).toBe("blocked");
    expect(c.relay.available).toBe("UNAVAILABLE");
    expect(c.relay.reason).toMatch(/Earth/);
  });
  it("relay sees Earth but NOT the lander: unavailable", () => {
    const c = evaluateComm(base({ relay: { altitudeKm: 500, inclinationDeg: 90, raanDeg: 0, phaseDeg: 92 } }));
    expect(c.relayToEarth.state).toBe("visible");
    expect(c.landerToRelay.state).toBe("blocked");
    expect(c.relay.available).toBe("UNAVAILABLE");
    expect(c.relay.reason).toMatch(/lander/);
  });
  it("neither leg: unavailable and says so", () => {
    const c = evaluateComm(base({ relay: { altitudeKm: 500, inclinationDeg: 90, raanDeg: 0, phaseDeg: 0 }, earth: { azDeg: 180, elDeg: 0, distanceKm: 384_400 }, horizon: flatHorizon(10) }));
    expect(c.landerToRelay.state).toBe("blocked");
    expect(c.relayToEarth.state).toBe("blocked");
    expect(c.relay.reason).toMatch(/neither/);
  });
  it("terrain between the lander and the relay blocks that leg even when the relay is above the geometric horizon", () => {
    const relay = { altitudeKm: 500, inclinationDeg: 90, raanDeg: 0, phaseDeg: 292 }; // 20 degrees of orbit away from overhead
    const open = evaluateComm(base({ relay, horizon: flatHorizon(2) }));
    expect(open.landerToRelay.state).toBe("visible");
    const el = open.landerToRelay.elevationDeg;
    expect(el).toBeGreaterThan(5);
    const walled = evaluateComm(base({ relay, horizon: flatHorizon(el + 3) }));
    expect(walled.landerToRelay.state).toBe("blocked");
    expect(walled.landerToRelay.reason).toMatch(/terrain/);
  });
  it("terrain with no data is unknown, not clear sky", () => {
    const hz = flatHorizon(2);
    hz.samples = hz.samples.map((s) => ({ ...s, elevationDeg: null, blockingDistanceM: null }));
    expect(terrainSight({ azDeg: 10, elDeg: 30, horizon: hz, altitudeM: 0 }).state).toBe("unknown");
  });
  it("relay windows come and go as the orbit moves", () => {
    const { tS: _t, ...inp } = base({});
    void _t;
    const period = orbitPeriodS(500);
    const rel = commWindows({ ...inp, relay: { altitudeKm: 500, inclinationDeg: 90, raanDeg: 0, phaseDeg: 200 } }, 0, 2 * period, 30, (c) => c.relay.available === "AVAILABLE");
    expect(rel.length).toBeGreaterThanOrEqual(1);
    for (const w of rel) expect(w.endS).toBeGreaterThan(w.startS);
    const covered = rel.reduce((a, w) => a + (w.endS - w.startS), 0);
    expect(covered).toBeGreaterThan(0);
    expect(covered).toBeLessThan(2 * period); // not permanently visible
  });
  it("relay motion: circular orbit radius and period are right", () => {
    const o = { altitudeKm: 100, inclinationDeg: 90, raanDeg: 0, phaseDeg: 0 };
    expect(Math.hypot(...relayPosition(o, 0, 0))).toBeCloseTo(R_MOON_KM + 100, 6);
    expect(orbitPeriodS(100) / 60).toBeGreaterThan(117);
    expect(orbitPeriodS(100) / 60).toBeLessThan(119);
    const p0 = relayPosition(o, 0, 0);
    const pT = relayPosition(o, orbitPeriodS(100), 0);
    pT.forEach((x, i) => expect(x).toBeCloseTo(p0[i], 4));
  });
  it("horizon interpolation wraps at 360 degrees", () => {
    const p = flatHorizon(4);
    expect(horizonAt(p, 359.9)?.elevationDeg).toBeCloseTo(4, 9);
  });
  it("optional RF margin: textbook free-space path loss and 6 dB per distance doubling", () => {
    const a = { frequencyHz: 8.4e9, eirpDbw: 40, gOverTdbK: 30, dataRateBps: 1e6, requiredEbN0Db: 3, otherLossesDb: 2, distanceKm: 384_400 };
    const fspl = 20 * Math.log10((4 * Math.PI * 384_400e3 * 8.4e9) / 299_792_458);
    expect(fspl).toBeCloseTo(222.6, 0);
    expect(linkMarginDb(a) - linkMarginDb({ ...a, distanceKm: 768_800 })).toBeCloseTo(6.02, 1);
  });
});

describe("descent physics", () => {
  const veh = DEFAULT_VEHICLE;
  it("free fall matches the closed form", () => {
    const out = propagate({ r: [0, 0, 1000], v: [5, 0, -10], massKg: 1000, veh, cmd: () => null, tMax: 30, dt: 0.1 });
    const s = out.samples.find((x) => Math.abs(x.t - 10) < 1e-6)!;
    expect(s.r[2]).toBeCloseTo(1000 - 10 * 10 - 0.5 * G_SURFACE * 100, 3);
    expect(s.v[2]).toBeCloseTo(-10 - G_SURFACE * 10, 3);
    expect(s.r[0]).toBeCloseTo(50, 6);
  });
  it("propellant follows the rocket equation (constant thrust: mdot = F / (Isp g0))", () => {
    const out = propagate({ r: [0, 0, 1e6], v: [0, 0, 0], massKg: 2000, veh, cmd: () => [0, 0, 3], tMax: 50, dt: 0.1 });
    const used = 2000 - out.samples[out.samples.length - 1].massKg;
    expect(used).toBeGreaterThan(0);
    expect(used).toBeCloseTo((2000 * 3 * 50) / (veh.ispS * 9.80665), -1); // within ~5 kg: mass falls as it burns
  });
  it("the nominal plan lands softly on the target", () => {
    const plan = designNominal(DEFAULT_INIT, veh)!;
    const run = flyPlan(DEFAULT_INIT, veh, plan);
    const a = touchdownAssessment(run.touchdown, [0, 0, 0], DEFAULT_LIMITS);
    expect(a.safe).toBe(true);
    expect(a.distanceM).toBeLessThan(5);
    expect(plan.maxThrustAccel * (veh.dryMassKg + veh.propellantKg)).toBeLessThan(veh.maxThrustN);
  });
  const fly = (dev: Parameters<typeof flyPlan>[3]) => {
    const plan = designNominal(DEFAULT_INIT, veh)!;
    return flyPlan(DEFAULT_INIT, veh, plan, dev);
  };
  const along = (td: { r: number[] } | null) => { // position along the approach direction (positive = beyond the target)
    const b = (DEFAULT_INIT.approachBearingDeg * Math.PI) / 180;
    return td ? -(td.r[0] * Math.sin(b) + td.r[1] * Math.cos(b)) : NaN;
  };
  it("horizontal overshoot lands beyond the target", () => expect(along(fly({ onsetS: 20, horizontalSpeedFactor: 1.35 }).touchdown)).toBeGreaterThan(300));
  it("horizontal undershoot lands short of the target", () => expect(along(fly({ onsetS: 20, horizontalSpeedFactor: 0.65 }).touchdown)).toBeLessThan(-300));
  it("excessive horizontal velocity leaves a touchdown speed far above the limit", () => {
    const a = touchdownAssessment(fly({ onsetS: 20, horizontalSpeedFactor: 1.8 }).touchdown, [0, 0, 0], DEFAULT_LIMITS);
    expect(a.horizontalMs).toBeGreaterThan(DEFAULT_LIMITS.maxTouchdownHorizontalMs * 5);
    expect(a.safe).toBe(false);
  });
  it("excessive vertical velocity makes an unsafe vertical touchdown", () => {
    const a = touchdownAssessment(fly({ onsetS: 20, verticalSpeedFactor: 1.6 }).touchdown, [0, 0, 0], DEFAULT_LIMITS);
    expect(a.verticalMs).toBeGreaterThan(DEFAULT_LIMITS.maxTouchdownVerticalMs);
    expect(a.safe).toBe(false);
  });
  it("insufficient braking (thrust 60%) is unsafe; a stretched burn changes the outcome", () => {
    expect(touchdownAssessment(fly({ onsetS: 20, thrustScale: 0.6 }).touchdown, [0, 0, 0], DEFAULT_LIMITS).safe).toBe(false);
    const stretched = fly({ onsetS: 20, burnDurationFactor: 1.5 });
    const nominal = fly({});
    expect(Math.hypot(...(stretched.touchdown!.r as [number, number, number]))).toBeGreaterThan(Math.hypot(...(nominal.touchdown!.r as [number, number, number])) + 1);
  });

  const state = () => {
    const r = fly({ onsetS: 20, horizontalSpeedFactor: 1.35 });
    const s = r.samples.find((x) => x.t >= 24)!;
    return { r: s.r, v: s.v, massKg: s.massKg };
  };
  it("a successful correction lands on the target within the limits (flown through the integrator, not just algebra)", () => {
    const s = state();
    const rec = solveRecovery(s, aimFor("target", s, veh, { pos: [0, 0, 0], label: "t" }), veh, "target");
    expect(rec.feasible).toBe(true);
    expect(rec.violations).toEqual([]);
    const td = rec.path[rec.path.length - 1];
    expect(Math.hypot(td.r[0], td.r[1])).toBeLessThan(DEFAULT_LIMITS.landingRadiusM);
    expect(Math.abs(td.v[2])).toBeLessThan(DEFAULT_LIMITS.maxTouchdownVerticalMs);
    expect(Math.hypot(td.v[0], td.v[1])).toBeLessThan(DEFAULT_LIMITS.maxTouchdownHorizontalMs);
    expect(rec.propellantKg).toBeGreaterThan(0);
    expect(rec.remainingPropellantKg).toBeCloseTo(s.massKg - veh.dryMassKg - rec.propellantKg, 3);
    expect(rec.deltaVMs).toBeGreaterThan(Math.hypot(s.v[0], s.v[1]) * 0.5);
  });
  it("insufficient thrust: RECOVERY NOT FEASIBLE and the reason names thrust", () => {
    const weak: Vehicle = { ...veh, maxThrustN: 3200 };
    const s = state();
    const rec = solveRecovery(s, aimFor("target", s, weak, { pos: [0, 0, 0], label: "t" }), weak, "target");
    expect(rec.feasible).toBe(false);
    expect(rec.summary).toMatch(/RECOVERY NOT FEASIBLE/);
    expect(rec.violations.some((v) => v.kind === "thrust" || v.kind === "lateral")).toBe(true);
  });
  it("insufficient fuel: not feasible, reason names propellant", () => {
    const dry: Vehicle = { ...veh, propellantKg: 60 };
    const s = { ...state(), massKg: dry.dryMassKg + 60 };
    const rec = solveRecovery(s, aimFor("target", s, dry, { pos: [0, 0, 0], label: "t" }), dry, "target");
    expect(rec.feasible).toBe(false);
    expect(rec.violations.some((v) => v.kind === "propellant")).toBe(true);
  });
  it("physically infeasible: too low and too fast", () => {
    const s = { r: [0, 0, 60] as [number, number, number], v: [30, 0, -45] as [number, number, number], massKg: 2700 };
    const rec = solveRecovery(s, { pos: [0, 0, 0], vel: [0, 0, 0], label: "t" }, veh, "target");
    expect(rec.feasible).toBe(false);
    expect(rec.summary).toMatch(/RECOVERY NOT FEASIBLE/);
  });
  it("retrograde braking reports before/after velocity and a stopping point", () => {
    const s = state();
    const aim = aimFor("retrograde", s, veh, { pos: [0, 0, 0], label: "t" });
    expect(aim.vel).toEqual([0, 0, 0]);
    const rec = solveRecovery(s, aim, veh, "retrograde");
    expect(rec.velocityBefore).toEqual(s.v);
    if (rec.feasible) expect(Math.hypot(rec.velocityAfter[0], rec.velocityAfter[1])).toBeLessThan(0.01);
  });
  it("ballistic prediction touches down on the ground", () => {
    const td = ballisticTouchdown({ r: [0, 0, 500], v: [10, 0, -5], massKg: 2000 }, veh)!;
    expect(td.r[2]).toBe(0);
    expect(td.r[0]).toBeGreaterThan(0);
  });
});

const cand = (id: string, over: Partial<SiteCandidate>): SiteCandidate => ({ id, label: `Zone ${id}`, enuM: [300, 200, 0], latDeg: -89, lonEastDeg: 10, heightM: 100, slopeDeg: 4, roughnessM: 0.4, hazardClass: 0, rimRidge: false, sunPct: 60, earthPct: 50, permanentShadow: false, resolutionM: 240, ...over });

describe("alternative landing sites", () => {
  const veh = DEFAULT_VEHICLE;
  const plan = designNominal(DEFAULT_INIT, veh)!;
  const run = flyPlan(DEFAULT_INIT, veh, plan, { onsetS: 20, horizontalSpeedFactor: 1.35 });
  const s0 = run.samples.find((x) => x.t >= 24)!;
  const state = { r: s0.r, v: s0.v, massKg: s0.massKg };
  const td = run.touchdown!.r;
  // candidate positions on the approach side of the aim, kept within divert reach
  const near = (k: number): [number, number, number] => [state.r[0] * k, state.r[1] * k, 0];

  it("original site reachable / unreachable follows the propulsion limits", () => {
    const aim = aimFor("target", state, veh, { pos: [0, 0, 0], label: "t" });
    expect(solveRecovery(state, aim, veh, "target").feasible).toBe(true);
    const weak = { ...veh, maxThrustN: 3000 };
    expect(solveRecovery(state, aim, weak, "target").feasible).toBe(false);
  });
  it("an alternative that passes every mandatory check is recommended", () => {
    const e = evaluateSites({ candidates: [cand("A", { enuM: near(0.15) })], state, predictedTouchdown: td, veh });
    expect(e.assessments[0].verdict).toBe("PASS");
    expect(e.recommended?.candidate.id).toBe("A");
    expect(e.headline).toMatch(/ALTERNATIVE FOUND/);
  });
  it("a site that fails the slope constraint is never recommended, even with a better score elsewhere", () => {
    const steep = cand("S", { enuM: near(0.15), slopeDeg: 22, sunPct: 100, earthPct: 100 });
    const e = evaluateSites({ candidates: [steep], state, predictedTouchdown: td, veh });
    expect(e.assessments[0].verdict).toBe("FAIL");
    expect(e.assessments[0].checks.find((c) => c.id === "slope")?.status).toBe("fail");
    expect(e.recommended).toBeNull();
    expect(e.headline).toBe("NO FEASIBLE ALTERNATIVE LANDING SITE FOUND");
  });
  it("a failing 'perfect-score' site loses to a passing modest one", () => {
    const e = evaluateSites({ candidates: [cand("S", { enuM: near(0.12), slopeDeg: 20, sunPct: 100, earthPct: 100 }), cand("M", { enuM: near(0.2), slopeDeg: 12, roughnessM: 1.2, sunPct: 25, earthPct: 15 })], state, predictedTouchdown: td, veh });
    expect(e.recommended?.candidate.id).toBe("M");
  });
  it("a site lacking data is UNVERIFIED and not called safe", () => {
    const e = evaluateSites({ candidates: [cand("U", { enuM: near(0.15), slopeDeg: null, roughnessM: null, heightM: null })], state, predictedTouchdown: td, veh });
    expect(e.assessments[0].verdict).toBe("UNVERIFIED");
    expect(e.recommended).toBeNull();
    expect(e.note).toMatch(/unknown/);
  });
  it("missing illumination data makes the site unverified when sunlight/Earth are mandatory", () => {
    const e = evaluateSites({ candidates: [cand("I", { enuM: near(0.15), sunPct: null, earthPct: null })], state, predictedTouchdown: td, veh });
    expect(e.assessments[0].verdict).toBe("UNVERIFIED");
    const relaxed = evaluateSites({ candidates: [cand("I", { enuM: near(0.15), sunPct: null, earthPct: null })], state, predictedTouchdown: td, veh, cfg: { ...DEFAULT_SITE_CONFIG, requireSunEarth: false } });
    expect(relaxed.assessments[0].verdict).toBe("PASS");
  });
  it("a permanently shadowed site fails the sunlight check", () => {
    const e = evaluateSites({ candidates: [cand("P", { enuM: near(0.15), permanentShadow: true, sunPct: 0 })], state, predictedTouchdown: td, veh });
    expect(e.assessments[0].checks.find((c) => c.id === "sun")?.status).toBe("fail");
  });
  it("a site beyond the divert capability fails reachability", () => {
    const e = evaluateSites({ candidates: [cand("F", { enuM: [60_000, 0, 0] })], state, predictedTouchdown: td, veh });
    expect(e.assessments[0].checks.find((c) => c.id === "reach")?.status).toBe("fail");
    expect(e.headline).toBe("NO FEASIBLE ALTERNATIVE LANDING SITE FOUND");
  });
  it("no candidates at all is reported as no feasible alternative", () => {
    expect(evaluateSites({ candidates: [], state, predictedTouchdown: td, veh }).headline).toBe("NO FEASIBLE ALTERNATIVE LANDING SITE FOUND");
  });
  it("candidates are picked from a real hazard grid, well separated, and unknown cells are counted", () => {
    const n = 21;
    const g = (f: (i: number, j: number) => number | null) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => f(i, j)));
    const hz = { center: { latitudeDeg: -88, longitudeEastDeg: 0 }, grid: { spacingM: 200, size: n, halfSizeM: 2000 }, heightM: g(() => 100), slopeDeg: g((i, j) => (i < 3 ? null : 3 + ((i * 7 + j * 3) % 10))), roughnessM: g((i) => (i < 3 ? null : 0.3)), hazardClass: g(() => 0) as number[][], rimRidge: g(() => 0) as number[][] };
    const { candidates, unknownFraction } = candidatesFromHazards(hz, { maxCount: 4, minSeparationM: 600, targetHeightM: 100 });
    expect(candidates.length).toBe(4);
    expect(unknownFraction).toBeCloseTo(3 / n, 3);
    for (let a = 0; a < candidates.length; a++) for (let b = a + 1; b < candidates.length; b++) expect(Math.hypot(candidates[a].enuM[0] - candidates[b].enuM[0], candidates[a].enuM[1] - candidates[b].enuM[1])).toBeGreaterThanOrEqual(600 - 1e-6);
  });
});

describe("state machine and whole-scenario runs", () => {
  const env = illustrativeEnvironment({ latDeg: -88, lonEastDeg: 0 }, { azDeg: 0, elDeg: 30 }, 2);
  it("only legal transitions are accepted", () => {
    let h = start();
    h = advance(h, "COMMUNICATION_BLACKOUT", 10, "x");
    expect(() => advance(h, "SIMULATED_TOUCHDOWN", 11, "skip")).toThrow(/illegal/);
    expect(() => advance(h, "AUTONOMOUS_RESPONSE", 5, "back in time")).toThrow(/backwards/);
    expect(TRANSITIONS.SIMULATED_TOUCHDOWN).toEqual([]);
  });
  it("nominal descent ends in a simulated touchdown within limits", () => {
    const r = runSimulation(DEFAULT_CONFIG(env));
    expect(r.outcome.status).toBe("NOMINAL_TOUCHDOWN");
    expect(r.history.map((h) => h.state)).toEqual(["NOMINAL_DESCENT", "SIMULATED_TOUCHDOWN"]);
  });
  it("a blackout walks through blackout -> autonomous response -> relay check", () => {
    const r = runSimulation({ ...DEFAULT_CONFIG(env), blackout: { enabled: true, atS: 40 } });
    const states = r.history.map((h) => h.state);
    expect(states.slice(0, 4)).toEqual(["NOMINAL_DESCENT", "COMMUNICATION_BLACKOUT", "AUTONOMOUS_RESPONSE", "RELAY_VISIBILITY_CHECK"]);
    expect(r.blackoutStartS).toBe(40);
    expect(r.comm.find((c) => c.tS === 41)?.direct).toBe("lost");
    expect(r.comm.find((c) => c.tS === 39)?.direct).toBe("available");
  });
  it("a deviation is detected, evaluated and recovered or rejected, never silently", () => {
    const r = runSimulation({ ...DEFAULT_CONFIG(env), deviation: { onsetS: 20, horizontalSpeedFactor: 1.35 } });
    expect(r.detectedAtS).not.toBeNull();
    expect(r.history.map((h) => h.state)).toContain("TRAJECTORY_DEVIATION");
    expect(r.history.map((h) => h.state)).toContain("RECOVERY_FEASIBILITY_CHECK");
    expect(["RECOVERED_ORIGINAL", "RECOVERED_ALTERNATIVE", "RECOVERY_NOT_FEASIBLE"]).toContain(r.outcome.status);
  });
  it("with too little propellant and no alternatives the outcome is RECOVERY NOT FEASIBLE", () => {
    const cfg = DEFAULT_CONFIG(env);
    const r = runSimulation({ ...cfg, vehicle: { ...cfg.vehicle, propellantKg: 260 }, deviation: { onsetS: 20, horizontalSpeedFactor: 2.5 }, candidates: [] });
    expect(r.outcome.status).toBe("RECOVERY_NOT_FEASIBLE");
    expect(r.outcome.originalReachable).toBe(false);
    expect(r.outcome.headline).toMatch(/RECOVERY NOT FEASIBLE/);
    expect(r.history[r.history.length - 1].state).toBe("RECOVERY_FAILURE");
  });
  it("retrograde braking is judged on its own result and reports distance from the target", () => {
    const r = runSimulation({ ...DEFAULT_CONFIG(env), deviation: { onsetS: 20, horizontalSpeedFactor: 1.35 }, mode: "retrograde" });
    expect(r.recoveryChosen?.mode).toBe("retrograde");
    expect(["RECOVERED_OFF_TARGET", "RECOVERY_NOT_FEASIBLE"]).toContain(r.outcome.status);
    if (r.outcome.status === "RECOVERED_OFF_TARGET") expect(r.outcome.headline).toMatch(/RETROGRADE BRAKING FEASIBLE/);
  });
  it("vertical braking alone cannot give a safe touchdown while horizontal speed remains", () => {
    const r = runSimulation({ ...DEFAULT_CONFIG(env), deviation: { onsetS: 20, horizontalSpeedFactor: 1.35 }, mode: "vertical" });
    expect(r.outcome.status).toBe("RECOVERY_NOT_FEASIBLE");
    expect(r.outcome.headline).toMatch(/VERTICAL BRAKING ONLY CANNOT GIVE A SAFE TOUCHDOWN/);
  });
  it("lateral divert with no candidates is reported as no feasible alternative", () => {
    const r = runSimulation({ ...DEFAULT_CONFIG(env), deviation: { onsetS: 20, horizontalSpeedFactor: 1.35 }, mode: "divert", candidates: [] });
    expect(r.outcome.status).toBe("RECOVERY_NOT_FEASIBLE");
    expect(r.outcome.headline).toMatch(/NO FEASIBLE ALTERNATIVE LANDING SITE FOUND/);
  });
  it("an impossible vehicle returns an explicit error instead of invented numbers", () => {
    const cfg = DEFAULT_CONFIG(env);
    const r = runSimulation({ ...cfg, vehicle: { ...cfg.vehicle, maxThrustN: 500 } });
    expect(r.error).toMatch(/No feasible nominal descent/);
  });
});

describe("environment data handling", () => {
  const good = { utc: "2026-12-01T06:00:00Z", site: { latitudeDeg: -88, longitudeEastDeg: 10, heightM: 120 }, bodies: { earth: { azimuthDeg: 40, elevationDeg: 7.5, distanceKm: 391_000 }, sun: { azimuthDeg: 200, elevationDeg: 1.2 } }, horizon: { azimuthsDeg: Array.from({ length: 720 }, (_, i) => i * 0.5), elevationDeg: Array.from({ length: 720 }, () => 3), blockingDistanceM: Array.from({ length: 720 }, () => 4000), observerRadiusM: 1_737_522 }, provenance: { ephemeris: "NAIF SPICE" }, horizonsCheck: { status: "pass", maxSeparationDeg: 1e-6, detail: "JPL Horizons agrees" } };
  it("a valid ephemeris payload is accepted with its provenance", () => {
    const p = parseEnvironment(good);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.env.source).toBe("spice");
      expect(p.env.horizonsCheck?.status).toBe("pass");
      expect(p.env.horizon?.samples.length).toBe(720);
    }
  });
  it("incomplete ephemerides are rejected, not patched", () => {
    expect(parseEnvironment({ ...good, bodies: { earth: { azimuthDeg: 40 } } }).ok).toBe(false);
    expect(parseEnvironment(null).ok).toBe(false);
    expect(parseEnvironment({ ...good, site: { latitudeDeg: -40, longitudeEastDeg: 0 } }).ok).toBe(false);
  });
  it("invalid ephemerides are rejected (impossible distance, out-of-range elevation, NaN)", () => {
    expect(parseEnvironment({ ...good, bodies: { earth: { azimuthDeg: 40, elevationDeg: 7, distanceKm: 12 } } }).ok).toBe(false);
    expect(parseEnvironment({ ...good, bodies: { earth: { azimuthDeg: 40, elevationDeg: 120, distanceKm: 391_000 } } }).ok).toBe(false);
    expect(parseEnvironment({ ...good, bodies: { earth: { azimuthDeg: Number.NaN, elevationDeg: 7, distanceKm: 391_000 } } }).ok).toBe(false);
  });
  it("a malformed horizon degrades to 'no terrain data' (and terrain blocking is then unknown), never to a clear sky", () => {
    const p = parseEnvironment({ ...good, horizon: { azimuthsDeg: [1, 2], elevationDeg: [1, 2] } });
    expect(p.ok && p.env.horizon).toBeNull();
  });
  it("the illustrative fallback can never pass for measured data", () => {
    const e = illustrativeEnvironment({ latDeg: -88, lonEastDeg: 0 }, { azDeg: 10, elDeg: 20 });
    expect(e.source).toBe("illustrative");
    expect(e.horizon).toBeNull();
    expect(e.horizonsCheck).toBeNull();
    expect(e.provenance.ephemeris).toMatch(/none/);
    expect(e.notes.join(" ")).toMatch(/ILLUSTRATIVE/);
  });
});
