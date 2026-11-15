import type { Environment } from "./environment";
import { type Vec3 } from "./geometry";
import { advance, start, type HistoryItem } from "./machine";
import { aimFor, ballisticTouchdown, DEFAULT_INIT, DEFAULT_LIMITS, DEFAULT_VEHICLE, designNominal, flyPlan, touchdownAssessment, isDeviated, type Deviation, type DescentInit, type Limits, type Mode, type Plan, type Recovery, type Sample, type Vehicle, solveRecovery } from "./physics";
import { evaluateComm, type CommState, type RelayOrbit } from "./relay";
import { DEFAULT_SITE_CONFIG, evaluateSites, type SiteCandidate, type SiteConfig, type SiteEvaluation } from "./sites";

export type SimConfig = {
  env: Environment;
  init: DescentInit;
  vehicle: Vehicle;
  limits: Limits;
  deviation: Deviation;
  blackout: { enabled: boolean; atS: number };
  relay: RelayOrbit;
  maskDeg: number;
  mode: Mode; // the maneuver the user asked to try on the original target
  decisionDelayS: number;
  candidates: SiteCandidate[];
  siteCfg: SiteConfig;
  evaluateAlternatives: boolean;
  alwaysEvaluateSites?: boolean; // evaluate candidates even if the original target is still reachable (user asked)
};
export const DEFAULT_CONFIG = (env: Environment): SimConfig => ({
  env, init: DEFAULT_INIT, vehicle: DEFAULT_VEHICLE, limits: DEFAULT_LIMITS, deviation: {},
  blackout: { enabled: false, atS: 40 }, relay: { altitudeKm: 500, inclinationDeg: 90, raanDeg: 0, phaseDeg: 0 }, maskDeg: 5,
  mode: "target", decisionDelayS: 3, candidates: [], siteCfg: DEFAULT_SITE_CONFIG, evaluateAlternatives: true,
});

export type CommSample = { tS: number; direct: CommState["direct"]["effective"]; l2r: CommState["landerToRelay"]["state"]; r2e: CommState["relayToEarth"]["state"]; relay: CommState["relay"]["available"]; relayBody: Vec3; rangeKm: number };
export type SimResult = {
  error: string | null;
  plan: Plan | null;
  planned: Sample[];
  actual: Sample[];
  actualTouchdown: Sample | null;
  plannedTouchdown: Sample | null;
  detectedAtS: number | null;
  decisionAtS: number | null;
  decisionState: { r: Vec3; v: Vec3; massKg: number } | null;
  comm: CommSample[];
  blackoutStartS: number | null;
  history: HistoryItem[];
  recoveryToTarget: Recovery | null;
  recoveryChosen: Recovery | null; // the maneuver the user selected, flown from the decision point
  siteEval: SiteEvaluation | null;
  outcome: { originalReachable: boolean | null; alternativeReachable: boolean | null; recovered: boolean; status: "NOMINAL_TOUCHDOWN" | "RECOVERED_ORIGINAL" | "RECOVERED_ALTERNATIVE" | "RECOVERED_OFF_TARGET" | "RECOVERY_NOT_FEASIBLE" | "UNSAFE_TOUCHDOWN"; headline: string; reasons: string[] };
  explanations: string[];
};

const at = (s: Sample[], t: number): Sample => {
  if (t <= s[0].t) return s[0];
  for (let i = 1; i < s.length; i++) {
    if (s[i].t >= t) {
      const f = (t - s[i - 1].t) / Math.max(1e-9, s[i].t - s[i - 1].t);
      const lerp = (a: Vec3, b: Vec3): Vec3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      return { t, r: lerp(s[i - 1].r, s[i].r), v: lerp(s[i - 1].v, s[i].v), massKg: s[i - 1].massKg + (s[i].massKg - s[i - 1].massKg) * f, thrustN: s[i].thrustN };
    }
  }
  return s[s.length - 1];
};
export const sampleAt = at;

export function commAt(cfg: SimConfig, r: Vec3, tS: number): CommState {
  return evaluateComm({
    siteLatDeg: cfg.env.site.latDeg, siteLonEastDeg: cfg.env.site.lonEastDeg, siteHeightM: cfg.env.site.heightM,
    landerEnuM: r, earth: cfg.env.earth, horizon: cfg.env.horizon, relay: cfg.relay, tS, maskDeg: cfg.maskDeg,
    forcedBlackout: cfg.blackout.enabled && tS >= cfg.blackout.atS,
  });
}

export function runSimulation(cfg: SimConfig): SimResult {
  const empty: SimResult = { error: null, plan: null, planned: [], actual: [], actualTouchdown: null, plannedTouchdown: null, detectedAtS: null, decisionAtS: null, decisionState: null, comm: [], blackoutStartS: null, history: start(), recoveryToTarget: null, recoveryChosen: null, siteEval: null, outcome: { originalReachable: null, alternativeReachable: null, recovered: false, status: "NOMINAL_TOUCHDOWN", headline: "", reasons: [] }, explanations: [] };
  const plan = designNominal(cfg.init, cfg.vehicle);
  if (!plan) return { ...empty, error: "No feasible nominal descent exists for these vehicle and trajectory settings (thrust, propellant or geometry too limited). Adjust the vehicle or the approach." };
  const planRun = flyPlan(cfg.init, cfg.vehicle, plan, {});
  const actRun = flyPlan(cfg.init, cfg.vehicle, plan, cfg.deviation);
  const planned = planRun.samples;
  const actual = actRun.samples;
  const explanations: string[] = [];
  const deviated = isDeviated(cfg.deviation);

  // deviation detection: the lander's own navigation compares state to the plan
  let detectedAtS: number | null = null;
  if (deviated) {
    for (const a of actual) {
      const p = at(planned, a.t);
      const dpos = Math.hypot(a.r[0] - p.r[0], a.r[1] - p.r[1], a.r[2] - p.r[2]);
      const dvel = Math.hypot(a.v[0] - p.v[0], a.v[1] - p.v[1], a.v[2] - p.v[2]);
      if (dpos > 150 || dvel > 4) {
        detectedAtS = a.t;
        break;
      }
    }
  }

  // communication timeline along the actual trajectory (1 s steps)
  const comm: CommSample[] = [];
  const tEnd = (actRun.touchdown?.t ?? actual[actual.length - 1].t) + 0;
  let blackoutStartS: number | null = null;
  for (let t = 0; t <= tEnd + 1e-9; t += 1) {
    const s = at(actual, t);
    const c = commAt(cfg, s.r, t);
    comm.push({ tS: t, direct: c.direct.effective, l2r: c.landerToRelay.state, r2e: c.relayToEarth.state, relay: c.relay.available, relayBody: c.relayBody, rangeKm: c.relayRangeKm });
    if (blackoutStartS === null && c.direct.effective === "lost") blackoutStartS = t;
  }

  // state machine
  let history = start();
  const tDecision = detectedAtS !== null ? Math.min(tEnd, detectedAtS + cfg.decisionDelayS) : null;
  const blackoutFirst = blackoutStartS !== null && (detectedAtS === null || blackoutStartS <= detectedAtS);
  if (blackoutFirst && blackoutStartS !== null) {
    const forced = cfg.blackout.enabled && blackoutStartS >= cfg.blackout.atS;
    history = advance(history, "COMMUNICATION_BLACKOUT", blackoutStartS, forced ? "injected blackout (simulated anomaly)" : "terrain or antenna mask blocks the direct Earth path");
    history = advance(history, "AUTONOMOUS_RESPONSE", blackoutStartS + 1, "no ground contact: the lander continues on its pre-loaded contingency sequence");
    const rc = comm[Math.min(comm.length - 1, Math.round(blackoutStartS) + 2)];
    history = advance(history, "RELAY_VISIBILITY_CHECK", blackoutStartS + 2, `lander→relay ${rc.l2r}, relay→Earth ${rc.r2e}: relay path ${rc.relay}`);
    explanations.push(`Direct Earth communication was lost at t = ${blackoutStartS.toFixed(0)} s. The relay path is ${rc.relay} (lander→relay ${rc.l2r}, relay→Earth ${rc.r2e}) - a geometric result only, not an RF link.`);
  } else if (blackoutStartS !== null) {
    explanations.push(`Direct Earth communication was lost at t = ${blackoutStartS.toFixed(0)} s while the deviation was already being handled.`);
  }

  let recoveryToTarget: Recovery | null = null;
  let recoveryChosen: Recovery | null = null;
  let siteEval: SiteEvaluation | null = null;
  let decisionState: SimResult["decisionState"] = null;
  const target = { pos: [0, 0, 0] as Vec3, label: "original landing target" };
  let status: SimResult["outcome"]["status"] = "NOMINAL_TOUCHDOWN";
  let headline = "";
  const reasons: string[] = [];
  let originalReachable: boolean | null = null;
  let alternativeReachable: boolean | null = null;
  let recovered = false;

  const actualTd = actRun.touchdown;
  const nominalAssess = touchdownAssessment(actualTd, target.pos, cfg.limits);

  if (deviated && detectedAtS !== null && tDecision !== null) {
    const t0 = Math.max(history[history.length - 1].tS, detectedAtS);
    history = advance(history, "TRAJECTORY_DEVIATION", t0, `state differs from the plan (detected at t = ${detectedAtS.toFixed(0)} s)`);
    history = advance(history, "RECOVERY_FEASIBILITY_CHECK", Math.max(t0, tDecision), "evaluating thrust, propellant, altitude and geometry");
    const s = at(actual, tDecision);
    decisionState = { r: s.r, v: s.v, massKg: s.massKg };
    recoveryToTarget = solveRecovery(decisionState, aimFor("target", decisionState, cfg.vehicle, target), cfg.vehicle, "target");
    originalReachable = recoveryToTarget.feasible;
    if (cfg.evaluateAlternatives && cfg.candidates.length && (cfg.mode === "divert" || cfg.alwaysEvaluateSites)) {
      siteEval = evaluateSites({ candidates: cfg.candidates, state: decisionState, predictedTouchdown: actualTd ? actualTd.r : null, veh: cfg.vehicle, cfg: cfg.siteCfg });
    }
    if (cfg.mode === "target") recoveryChosen = recoveryToTarget;
    else if (cfg.mode === "divert") {
      // lateral divert: the best passing zone, else the nearest candidate (so the infeasibility is shown, not hidden)
      const pick = siteEval?.recommended ?? [...(siteEval?.assessments ?? [])].sort((a, b) => a.distanceFromTargetM - b.distanceFromTargetM)[0];
      recoveryChosen = pick ? pick.recovery : null;
    } else recoveryChosen = solveRecovery(decisionState, aimFor(cfg.mode, decisionState, cfg.vehicle, target), cfg.vehicle, cfg.mode);
    const noAction = actualTd ? `without action it touches down ${nominalAssess.distanceM.toFixed(0)} m from the target at ${nominalAssess.verticalMs.toFixed(1)} m/s vertical / ${nominalAssess.horizontalMs.toFixed(1)} m/s horizontal` : "without action it does not reach the surface in the simulated window";
    explanations.push(`At t = ${tDecision.toFixed(0)} s the lander is ${s.r[2].toFixed(0)} m up, ${Math.hypot(s.r[0], s.r[1]).toFixed(0)} m from the target, moving ${Math.hypot(s.v[0], s.v[1]).toFixed(1)} m/s sideways and ${s.v[2].toFixed(1)} m/s vertically; ${noAction}.`);
    const bt = ballisticTouchdown(decisionState, cfg.vehicle);
    const tAfter = (rec: Recovery | null) => Math.max(tDecision, tDecision + (rec?.burnTimeS ?? 0));
    const wantAlternatives = cfg.evaluateAlternatives && cfg.candidates.length > 0;
    const evalNow = () => (siteEval = siteEval ?? evaluateSites({ candidates: cfg.candidates, state: decisionState!, predictedTouchdown: actualTd ? actualTd.r : bt ? bt.r : null, veh: cfg.vehicle, cfg: cfg.siteCfg }));
    if (cfg.mode === "target") {
      if (recoveryToTarget.feasible) {
        recovered = true;
        status = "RECOVERED_ORIGINAL";
        history = advance(history, "SIMULATED_TOUCHDOWN", tAfter(recoveryToTarget), "recovered onto the original target");
        headline = "ORIGINAL TARGET REACHABLE - RECOVERY FEASIBLE";
        reasons.push(recoveryToTarget.summary);
      } else {
        reasons.push(recoveryToTarget.summary);
        if (wantAlternatives) {
          history = advance(history, "ALTERNATIVE_SITE_EVALUATION", Math.max(tDecision, history[history.length - 1].tS), "the original target cannot be reached; evaluating alternatives");
          const ev = evalNow();
          if (ev.recommended) {
            alternativeReachable = true;
            recovered = true;
            status = "RECOVERED_ALTERNATIVE";
            history = advance(history, "SIMULATED_TOUCHDOWN", tAfter(ev.recommended.recovery), `diverted to ${ev.recommended.candidate.label}`);
            headline = `ORIGINAL TARGET NOT REACHABLE - ${ev.headline}`;
          } else {
            alternativeReachable = false;
            status = "RECOVERY_NOT_FEASIBLE";
            history = advance(history, "RECOVERY_FAILURE", Math.max(tDecision, history[history.length - 1].tS), ev.headline);
            headline = `RECOVERY NOT FEASIBLE - ${ev.headline}`;
          }
          reasons.push(ev.note);
        } else {
          status = "RECOVERY_NOT_FEASIBLE";
          history = advance(history, "RECOVERY_FAILURE", Math.max(tDecision, history[history.length - 1].tS), "recovery not feasible and no alternatives evaluated");
          headline = "RECOVERY NOT FEASIBLE";
        }
      }
    } else if (cfg.mode === "divert") {
      history = advance(history, "ALTERNATIVE_SITE_EVALUATION", Math.max(tDecision, history[history.length - 1].tS), "lateral divert requested; evaluating alternative zones");
      const ev = wantAlternatives ? evalNow() : null;
      if (ev?.recommended) {
        alternativeReachable = true;
        recovered = true;
        status = "RECOVERED_ALTERNATIVE";
        history = advance(history, "SIMULATED_TOUCHDOWN", tAfter(ev.recommended.recovery), `diverted to ${ev.recommended.candidate.label}`);
        headline = `LATERAL DIVERT FEASIBLE - ${ev.headline}`;
        reasons.push(ev.note, ev.recommended.recovery.summary);
      } else {
        alternativeReachable = false;
        status = "RECOVERY_NOT_FEASIBLE";
        history = advance(history, "RECOVERY_FAILURE", Math.max(tDecision, history[history.length - 1].tS), ev ? ev.headline : "no candidate zones available");
        headline = `RECOVERY NOT FEASIBLE - ${ev ? ev.headline : "NO FEASIBLE ALTERNATIVE LANDING SITE FOUND"}`;
        if (ev) reasons.push(ev.note);
      }
      reasons.push(`Returning to the original target by full guidance: ${recoveryToTarget.feasible ? "feasible" : "not feasible"}.`);
    } else {
      // retrograde braking or vertical braking only: judge the selected maneuver, not the original target
      const rec = recoveryChosen!;
      const td = rec.path[rec.path.length - 1];
      const a = touchdownAssessment(rec.feasible ? { r: rec.touchdown ?? td.r, v: rec.velocityAfter } : null, rec.aim.pos, { ...cfg.limits, landingRadiusM: Infinity });
      const label = cfg.mode === "retrograde" ? "RETROGRADE BRAKING" : "VERTICAL BRAKING ONLY";
      if (rec.feasible && a.safe) {
        recovered = true;
        status = "RECOVERED_OFF_TARGET";
        const off = rec.touchdown ? Math.hypot(rec.touchdown[0], rec.touchdown[1]) : 0;
        history = advance(history, "SIMULATED_TOUCHDOWN", tAfter(rec), `${label.toLowerCase()} gives a soft touchdown ${off.toFixed(0)} m from the target`);
        headline = `${label} FEASIBLE - SOFT TOUCHDOWN ${off.toFixed(0)} m FROM THE ORIGINAL TARGET`;
        reasons.push(rec.summary);
      } else {
        status = "RECOVERY_NOT_FEASIBLE";
        history = advance(history, "RECOVERY_FAILURE", Math.max(tDecision, history[history.length - 1].tS), `${label.toLowerCase()} cannot give a safe touchdown`);
        headline = `RECOVERY NOT FEASIBLE - ${label} CANNOT GIVE A SAFE TOUCHDOWN`;
        reasons.push(rec.feasible ? `touchdown would still be at ${a.horizontalMs.toFixed(1)} m/s horizontal (limit ${cfg.limits.maxTouchdownHorizontalMs} m/s)` : rec.summary);
      }
      reasons.push(`Returning to the original target by full guidance: ${recoveryToTarget.feasible ? "feasible" : "not feasible"}.`);
    }
  } else if (cfg.alwaysEvaluateSites && cfg.candidates.length && !deviated) {
    const s = at(actual, Math.min(20, tEnd));
    decisionState = { r: s.r, v: s.v, massKg: s.massKg };
    siteEval = evaluateSites({ candidates: cfg.candidates, state: decisionState, predictedTouchdown: actualTd ? actualTd.r : null, veh: cfg.vehicle, cfg: cfg.siteCfg });
    explanations.push("Alternative landing zones were evaluated on request from the state at t = " + s.t.toFixed(0) + " s; the descent itself is nominal.");
    if (nominalAssess.safe) {
      history = advance(history, "SIMULATED_TOUCHDOWN", actualTd?.t ?? tEnd, "touchdown within the landing limits");
      headline = "NOMINAL DESCENT - SIMULATED TOUCHDOWN WITHIN LIMITS";
      reasons.push(`Touchdown ${nominalAssess.distanceM.toFixed(0)} m from the target. ${siteEval.headline}.`);
    } else {
      status = "UNSAFE_TOUCHDOWN";
      history = advance(history, "SIMULATED_TOUCHDOWN", actualTd?.t ?? tEnd, "touchdown outside the landing limits");
      headline = "UNSAFE TOUCHDOWN";
      reasons.push(...nominalAssess.reasons);
    }
  } else if (nominalAssess.safe) {
    history = advance(history, "SIMULATED_TOUCHDOWN", actualTd?.t ?? tEnd, "touchdown within the landing limits");
    headline = "NOMINAL DESCENT - SIMULATED TOUCHDOWN WITHIN LIMITS";
    reasons.push(`Touchdown ${nominalAssess.distanceM.toFixed(0)} m from the target at ${nominalAssess.verticalMs.toFixed(1)} m/s vertical, ${nominalAssess.horizontalMs.toFixed(1)} m/s horizontal.`);
  } else {
    status = "UNSAFE_TOUCHDOWN";
    history = advance(history, "SIMULATED_TOUCHDOWN", actualTd?.t ?? tEnd, "touchdown outside the landing limits");
    headline = "UNSAFE TOUCHDOWN";
    reasons.push(...nominalAssess.reasons);
  }
  return { error: null, plan, planned, actual, actualTouchdown: actualTd, plannedTouchdown: planRun.touchdown, detectedAtS, decisionAtS: tDecision, decisionState, comm, blackoutStartS, history, recoveryToTarget, recoveryChosen, siteEval, outcome: { originalReachable, alternativeReachable, recovered, status, headline, reasons }, explanations };
}
