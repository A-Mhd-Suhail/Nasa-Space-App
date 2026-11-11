import type { Interval } from "./analysis-types";

/**
 * Operational events at a chosen time, derived only from the engine's terrain-aware visibility
 * intervals (boundaries refined by bisection to the stated tolerance; airless Moon, no refraction).
 * Events outside the analysed window are reported as "beyond window", never estimated.
 */
export type EventInfo = { utc: string | null; inSeconds: number | null; beyondWindow: boolean; refined: boolean };
export type Operations = {
  visibleNow: boolean | null;
  currentInterval: Interval | null;
  nextEnd: EventInfo; // next sunset / Earthset / end of DTE window
  nextStart: EventInfo; // next sunrise / Earthrise / start of next DTE window
  gaps: { startUtc: string; endUtc: string; durationS: number }[]; // blackout / darkness intervals in the window
  longestGapS: number;
};

const ms = (s: string) => Date.parse(s);

export function operationsAt(intervals: Interval[], windowStartUtc: string, windowEndUtc: string, atUtc: string): Operations {
  const t = ms(atUtc);
  const vis = intervals.filter((i) => i.kind === "visible").sort((a, b) => ms(a.startUtc) - ms(b.startUtc));
  const unknown = intervals.filter((i) => i.kind === "unknown");
  const inUnknown = unknown.some((i) => ms(i.startUtc) <= t && t < ms(i.endUtc));
  const cur = vis.find((i) => ms(i.startUtc) <= t && t < ms(i.endUtc)) ?? null;
  const ev = (utc: string | null, refined: boolean, beyond: boolean): EventInfo => ({ utc, inSeconds: utc ? Math.max(0, (ms(utc) - t) / 1000) : null, beyondWindow: beyond, refined });
  let nextEnd: EventInfo;
  if (cur) nextEnd = cur.endRefined ? ev(cur.endUtc, true, false) : ev(null, false, true);
  else nextEnd = ev(null, false, false);
  const upcoming = vis.find((i) => ms(i.startUtc) > t);
  const nextStart = upcoming ? ev(upcoming.startUtc, upcoming.startRefined, false) : ev(null, false, true);
  // Blackout / darkness gaps = window minus (visible ∪ unknown): unknown time is never counted as a gap.
  const covered = [...vis, ...unknown].sort((a, b) => ms(a.startUtc) - ms(b.startUtc));
  const realGaps: Operations["gaps"] = [];
  let cursor = ms(windowStartUtc);
  for (const i of covered) {
    if (ms(i.startUtc) > cursor) realGaps.push({ startUtc: new Date(cursor).toISOString().replace(".000Z", "Z"), endUtc: i.startUtc, durationS: (ms(i.startUtc) - cursor) / 1000 });
    cursor = Math.max(cursor, ms(i.endUtc));
  }
  if (ms(windowEndUtc) > cursor) realGaps.push({ startUtc: new Date(cursor).toISOString().replace(".000Z", "Z"), endUtc: windowEndUtc, durationS: (ms(windowEndUtc) - cursor) / 1000 });
  return { visibleNow: inUnknown ? null : !!cur, currentInterval: cur, nextEnd, nextStart, gaps: realGaps, longestGapS: realGaps.reduce((m, g) => Math.max(m, g.durationS), 0) };
}

export function fmtDuration(s: number | null): string {
  if (s == null) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d} d ${h} h ${m} min` : h > 0 ? `${h} h ${m} min` : `${m} min`;
}
