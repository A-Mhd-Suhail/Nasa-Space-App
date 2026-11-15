/** Mission-event state machine for the simulator. Only the listed transitions are legal; an illegal one throws. */
export const STATES = [
  "NOMINAL_DESCENT",
  "COMMUNICATION_BLACKOUT",
  "AUTONOMOUS_RESPONSE",
  "RELAY_VISIBILITY_CHECK",
  "TRAJECTORY_DEVIATION",
  "RECOVERY_FEASIBILITY_CHECK",
  "ALTERNATIVE_SITE_EVALUATION",
  "SIMULATED_TOUCHDOWN",
  "RECOVERY_FAILURE",
] as const;
export type MissionState = (typeof STATES)[number];

export const TRANSITIONS: Record<MissionState, MissionState[]> = {
  NOMINAL_DESCENT: ["COMMUNICATION_BLACKOUT", "TRAJECTORY_DEVIATION", "SIMULATED_TOUCHDOWN"],
  COMMUNICATION_BLACKOUT: ["AUTONOMOUS_RESPONSE"],
  AUTONOMOUS_RESPONSE: ["RELAY_VISIBILITY_CHECK", "TRAJECTORY_DEVIATION", "SIMULATED_TOUCHDOWN"],
  RELAY_VISIBILITY_CHECK: ["TRAJECTORY_DEVIATION", "SIMULATED_TOUCHDOWN"],
  TRAJECTORY_DEVIATION: ["RECOVERY_FEASIBILITY_CHECK"],
  RECOVERY_FEASIBILITY_CHECK: ["ALTERNATIVE_SITE_EVALUATION", "SIMULATED_TOUCHDOWN", "RECOVERY_FAILURE"],
  ALTERNATIVE_SITE_EVALUATION: ["SIMULATED_TOUCHDOWN", "RECOVERY_FAILURE"],
  SIMULATED_TOUCHDOWN: [],
  RECOVERY_FAILURE: [],
};
export const LABELS: Record<MissionState, string> = {
  NOMINAL_DESCENT: "Nominal descent",
  COMMUNICATION_BLACKOUT: "Communication blackout",
  AUTONOMOUS_RESPONSE: "Autonomous response",
  RELAY_VISIBILITY_CHECK: "Relay visibility check",
  TRAJECTORY_DEVIATION: "Trajectory deviation",
  RECOVERY_FEASIBILITY_CHECK: "Recovery feasibility check",
  ALTERNATIVE_SITE_EVALUATION: "Alternative site evaluation",
  SIMULATED_TOUCHDOWN: "Simulated touchdown",
  RECOVERY_FAILURE: "Recovery failure",
};
export type HistoryItem = { state: MissionState; tS: number; reason: string };

export function start(): HistoryItem[] {
  return [{ state: "NOMINAL_DESCENT", tS: 0, reason: "simulation start" }];
}
export function advance(h: HistoryItem[], next: MissionState, tS: number, reason: string): HistoryItem[] {
  const cur = h[h.length - 1].state;
  if (!TRANSITIONS[cur].includes(next)) throw new Error(`illegal transition ${cur} -> ${next}`);
  if (tS < h[h.length - 1].tS) throw new Error("time must not run backwards");
  return [...h, { state: next, tS, reason }];
}
export const stateAt = (h: HistoryItem[], tS: number): HistoryItem => [...h].reverse().find((x) => x.tS <= tS) ?? h[0];
