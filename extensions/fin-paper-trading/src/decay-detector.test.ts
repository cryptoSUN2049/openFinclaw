import { describe, expect, it } from "vitest";
import { DecayDetector } from "./decay-detector.js";
import type { EquitySnapshot } from "./types.js";

const DAY = 86400000;

function makeSnapshots(
  equities: number[],
  baseTime = Date.now() - equities.length * DAY,
): EquitySnapshot[] {
  let prev = equities[0] ?? 10_000;
  return equities.map((equity, i) => {
    const dailyPnl = equity - prev;
    const dailyPnlPct = prev > 0 ? (dailyPnl / prev) * 100 : 0;
    prev = equity;
    return {
      accountId: "test",
      timestamp: baseTime + i * DAY,
      equity,
      cash: equity * 0.5,
      positionsValue: equity * 0.5,
      dailyPnl,
      dailyPnlPct,
    };
  });
}

describe("DecayDetector", () => {
  const detector = new DecayDetector();

  it("returns healthy for insufficient data (< 7 days)", () => {
    const snapshots = makeSnapshots([10_000, 10_100, 10_200]);
    const result = detector.evaluate(snapshots);
    expect(result.decayLevel).toBe("healthy");
    expect(result.consecutiveLossDays).toBe(0);
  });

  it("detects healthy state with steady profits", () => {
    // 10 days of steady 1% gains
    const equities: number[] = [];
    let eq = 10_000;
    for (let i = 0; i < 10; i++) {
      equities.push(eq);
      eq *= 1.01;
    }
    const snapshots = makeSnapshots(equities);
    const result = detector.evaluate(snapshots);
    expect(result.decayLevel).toBe("healthy");
    expect(result.consecutiveLossDays).toBe(0);
    expect(result.currentDrawdown).toBe(0);
  });

  it("detects warning with recent dip", () => {
    // 8 days up, then 3 days of small losses
    const equities = [
      10_000, 10_100, 10_200, 10_300, 10_400, 10_500, 10_600, 10_700, 10_680, 10_650, 10_620,
    ];
    const snapshots = makeSnapshots(equities);
    const result = detector.evaluate(snapshots);
    expect(result.consecutiveLossDays).toBe(3);
    // Should be at least warning due to 3 consecutive loss days
    expect(["warning", "degrading", "critical"]).toContain(result.decayLevel);
  });

  it("detects degrading with extended losses", () => {
    // Start high, then 5+ consecutive loss days
    const equities = [10_000, 10_200, 10_400, 10_300, 10_200, 10_100, 10_000, 9_900, 9_800];
    const snapshots = makeSnapshots(equities);
    const result = detector.evaluate(snapshots);
    expect(result.consecutiveLossDays).toBeGreaterThanOrEqual(5);
    expect(["degrading", "critical"]).toContain(result.decayLevel);
  });

  it("detects critical with big drawdown > 25%", () => {
    // Sharp drawdown: from 10000 peak down to 7000
    const equities = [10_000, 10_100, 10_200, 9_500, 8_800, 8_100, 7_500, 7_000];
    const snapshots = makeSnapshots(equities);
    const result = detector.evaluate(snapshots);
    // Drawdown from peak 10200 to 7000 = ~31%
    expect(result.currentDrawdown).toBeGreaterThan(25);
    expect(result.decayLevel).toBe("critical");
  });

  it("detects critical with 7+ consecutive loss days", () => {
    const equities = [10_000, 9_990, 9_980, 9_970, 9_960, 9_950, 9_940, 9_930, 9_920];
    const snapshots = makeSnapshots(equities);
    const result = detector.evaluate(snapshots);
    expect(result.consecutiveLossDays).toBeGreaterThanOrEqual(7);
    expect(result.decayLevel).toBe("critical");
  });

  it("tracks peak equity correctly", () => {
    const equities = [10_000, 10_500, 11_000, 10_800, 10_600, 10_400, 10_200, 10_000];
    const snapshots = makeSnapshots(equities);
    const result = detector.evaluate(snapshots);
    expect(result.peakEquity).toBe(11_000);
    expect(result.currentDrawdown).toBeCloseTo(((11_000 - 10_000) / 11_000) * 100, 1);
  });

  it("handles empty snapshots", () => {
    const result = detector.evaluate([]);
    expect(result.decayLevel).toBe("healthy");
    expect(result.peakEquity).toBe(0);
  });
});
