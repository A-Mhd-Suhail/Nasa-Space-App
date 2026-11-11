import { describe, expect, it } from "vitest";
import type { Interval } from "@/lib/analysis-types";
import { fmtDuration, operationsAt } from "@/lib/operations";

const iv = (a: string, b: string, kind: "visible" | "unknown" = "visible", sr = true, er = true): Interval => ({ startUtc: a, endUtc: b, durationS: (Date.parse(b) - Date.parse(a)) / 1000, kind, startRefined: sr, endRefined: er });
const W0 = "2026-12-01T00:00:00Z", W1 = "2026-12-02T00:00:00Z";
const ivs = [iv(W0, "2026-12-01T06:00:00Z", "visible", false, true), iv("2026-12-01T10:00:00Z", "2026-12-01T20:00:00Z"), iv("2026-12-01T22:00:00Z", W1, "visible", true, false)];

describe("operational windows", () => {
  it("inside a window: time to set comes from the refined interval end", () => {
    const o = operationsAt(ivs, W0, W1, "2026-12-01T12:00:00Z");
    expect(o.visibleNow).toBe(true);
    expect(o.nextEnd.utc).toBe("2026-12-01T20:00:00Z");
    expect(o.nextEnd.inSeconds).toBe(8 * 3600);
    expect(o.nextStart.utc).toBe("2026-12-01T22:00:00Z");
  });
  it("outside a window: next rise and gaps", () => {
    const o = operationsAt(ivs, W0, W1, "2026-12-01T07:00:00Z");
    expect(o.visibleNow).toBe(false);
    expect(o.nextEnd.utc).toBeNull();
    expect(o.nextStart.inSeconds).toBe(3 * 3600);
    expect(o.gaps.map((g) => g.durationS / 3600)).toEqual([4, 2]);
    expect(o.longestGapS).toBe(4 * 3600);
  });
  it("an interval clipped by the analysis window never yields an invented event time", () => {
    const o = operationsAt(ivs, W0, W1, "2026-12-01T23:00:00Z");
    expect(o.visibleNow).toBe(true);
    expect(o.nextEnd.utc).toBeNull();
    expect(o.nextEnd.beyondWindow).toBe(true);
    expect(o.nextStart.beyondWindow).toBe(true);
  });
  it("unknown periods are neither visible nor counted as blackout", () => {
    const o = operationsAt([iv(W0, "2026-12-01T12:00:00Z", "unknown")], W0, W1, "2026-12-01T01:00:00Z");
    expect(o.visibleNow).toBeNull();
    expect(o.gaps.every((g) => Date.parse(g.startUtc) >= Date.parse("2026-12-01T12:00:00Z") || Date.parse(g.endUtc) <= Date.parse(W0))).toBe(true);
  });
  it("formats durations", () => {
    expect(fmtDuration(90061)).toBe("1 d 1 h 1 min");
    expect(fmtDuration(3600)).toBe("1 h 0 min");
  });
});
