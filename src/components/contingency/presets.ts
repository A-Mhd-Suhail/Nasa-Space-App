import type { Deviation, DescentInit, Mode, Vehicle } from "@/lib/contingency/physics";
import { DEFAULT_INIT, DEFAULT_VEHICLE } from "@/lib/contingency/physics";
import type { RelayOrbit } from "@/lib/contingency/relay";

export type DevKind = "overshoot" | "undershoot" | "vertical" | "braking" | "duration";
export const DEV_LABELS: Record<DevKind, { label: string; hint: string }> = {
  overshoot: { label: "Horizontal overshoot", hint: "horizontal speed 35% higher than planned from the onset" },
  undershoot: { label: "Horizontal undershoot", hint: "horizontal speed 35% lower than planned" },
  vertical: { label: "Excessive vertical descent velocity", hint: "downward speed 60% higher than planned" },
  braking: { label: "Insufficient braking", hint: "engine delivers only 60% of the commanded thrust" },
  duration: { label: "Incorrect thrust duration", hint: "the remaining burn schedule runs 50% longer than planned" },
};
export function deviationFrom(kinds: DevKind[], onsetS: number, extra: Partial<Deviation> = {}): Deviation {
  const d: Deviation = { onsetS };
  if (kinds.includes("overshoot")) d.horizontalSpeedFactor = 1.35;
  if (kinds.includes("undershoot")) d.horizontalSpeedFactor = (d.horizontalSpeedFactor ?? 1) * 0.65;
  if (kinds.includes("vertical")) d.verticalSpeedFactor = 1.6;
  if (kinds.includes("braking")) d.thrustScale = 0.6;
  if (kinds.includes("duration")) d.burnDurationFactor = 1.5;
  return kinds.length ? { ...d, ...extra } : d;
}

export type UiConfig = {
  siteKey: string;
  latDeg: number;
  lonEastDeg: number;
  utc: string;
  init: DescentInit;
  vehicle: Vehicle;
  devKinds: DevKind[];
  devExtra: Partial<Deviation>; // preset-only overrides of a kind's default size
  onsetS: number;
  blackout: { enabled: boolean; atS: number };
  relay: RelayOrbit;
  maskDeg: number;
  mode: Mode;
  followRecovery: boolean;
  alwaysEvaluateSites: boolean;
  fallbackEarth: { azDeg: number; elDeg: number; flatHorizonDeg: number };
  rf: { enabled: boolean; frequencyGHz: string; eirpDbw: string; gOverTdbK: string; dataRateBps: string; requiredEbN0Db: string; otherLossesDb: string };
};

export const BASE_UI: UiConfig = {
  siteKey: "mons-malapert", latDeg: -85.99, lonEastDeg: 0.0, utc: "2026-12-01T06:00:00Z",
  init: DEFAULT_INIT, vehicle: DEFAULT_VEHICLE, devKinds: [], devExtra: {}, onsetS: 20,
  blackout: { enabled: false, atS: 60 }, relay: { altitudeKm: 500, inclinationDeg: 90, raanDeg: 0, phaseDeg: 274 }, maskDeg: 0,
  mode: "target", followRecovery: true, alwaysEvaluateSites: false,
  fallbackEarth: { azDeg: 6.8, elDeg: 2, flatHorizonDeg: 2 },
  rf: { enabled: false, frequencyGHz: "", eirpDbw: "", gOverTdbK: "", dataRateBps: "", requiredEbN0Db: "", otherLossesDb: "" },
};

export type Preset = { id: string; label: string; summary: string; patch: Partial<UiConfig>; view: "descent" | "orbit" };
export const PRESETS: Preset[] = [
  { id: "normal", label: "1 · Normal lunar descent", summary: "A nominal powered descent to the Mons Malapert summit. At this site and date Earth stands about 2° above the horizon and the summit sees over the surrounding terrain, so direct contact holds all the way down (real SPICE and LOLA result).", patch: {}, view: "descent" },
  { id: "blackout", label: "2 · Earth communication blackout", summary: "The target is moved 300 m onto the Malapert flank (86.0°S). There, real LOLA terrain blocks the Earth direction as the lander descends: direct contact is lost near t = 144 s because the terrain horizon rises above Earth. The lander continues on its pre-loaded contingency sequence and the relay path is checked (the relay is deliberately on the far side here).", patch: { latDeg: -86.0, lonEastDeg: 0, siteKey: "custom", relay: { altitudeKm: 500, inclinationDeg: 90, raanDeg: 0, phaseDeg: 200 } }, view: "orbit" },
  { id: "relay", label: "3 · Relay orbiter visibility recovery", summary: "The flank site again, with a simulated antenna anomaly cutting direct contact at t = 60 s and the simulated relay overhead: both legs (lander→relay, relay→Earth) are visible, so a geometric relay path exists. Move the relay phase to watch it close. Geometry only: no radio link is implied.", patch: { latDeg: -86.0, lonEastDeg: 0, siteKey: "custom", blackout: { enabled: true, atS: 60 }, relay: { altitudeKm: 500, inclinationDeg: 90, raanDeg: 0, phaseDeg: 274 } }, view: "orbit" },
  { id: "overshoot", label: "4 · Excessive horizontal velocity", summary: "At t = 20 s the horizontal speed jumps 35% above plan. Without action the lander flies past the target at speed; the simulator checks whether a correction can recover it.", patch: { devKinds: ["overshoot"] }, view: "descent" },
  { id: "braking", label: "5 · Emergency braking", summary: "Horizontal speed 35% above plan, answered with a retrograde braking burn from the decision point: the lander stops its sideways motion and lands softly short of where it would have flown. Watch the blue path, the delta-v and the propellant cost.", patch: { devKinds: ["overshoot"], mode: "retrograde" }, view: "descent" },
  { id: "alternative", label: "6 · Alternative landing site selection", summary: "A severe overshoot (horizontal speed 2.5× the plan at t = 40 s) with limited propellant (260 kg) makes the original target unreachable. Candidate zones from real LOLA terrain are then checked against mandatory constraints; a failing zone is never recommended. Lower the propellant in the configuration to see NO FEASIBLE ALTERNATIVE LANDING SITE FOUND.", patch: { devKinds: ["overshoot"], devExtra: { horizontalSpeedFactor: 2.5 }, vehicle: { ...DEFAULT_VEHICLE, propellantKg: 260 }, onsetS: 40, alwaysEvaluateSites: true }, view: "descent" },
];
