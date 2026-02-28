import { describe, expect, it } from "vitest";
import { detectDecay, assessSurvival } from "./decay-detector.ts";
import { mockDecaySignal } from "./test-utils.ts";

// ─── detectDecay ───────────────────────────────────────────────────

describe("detectDecay", () => {
  it("healthy strategy (sharpeRatio > 0.8, low loss days) -> green", () => {
    const result = detectDecay({
      rollingSharpe30d: 1.5,
      baselineSharpe90d: 1.5, // ratio = 1.0
      consecutiveLossDays: 2,
    });
    expect(result.level).toBe("green");
    expect(result.sharpeRatio).toBeCloseTo(1.0, 5);
  });

  it("declining strategy (sharpeRatio 0.6, 6 loss days) -> yellow", () => {
    const result = detectDecay({
      rollingSharpe30d: 0.9,
      baselineSharpe90d: 1.5, // ratio = 0.6
      consecutiveLossDays: 6,
    });
    expect(result.level).toBe("yellow");
    expect(result.sharpeRatio).toBeCloseTo(0.6, 5);
  });

  it("critical strategy (sharpeRatio 0.4) -> red", () => {
    const result = detectDecay({
      rollingSharpe30d: 0.6,
      baselineSharpe90d: 1.5, // ratio = 0.4
      consecutiveLossDays: 3,
    });
    expect(result.level).toBe("red");
    expect(result.sharpeRatio).toBeCloseTo(0.4, 5);
  });

  it("high consecutive loss (12 days) regardless of Sharpe -> red", () => {
    const result = detectDecay({
      rollingSharpe30d: 1.5,
      baselineSharpe90d: 1.5, // ratio = 1.0 (good)
      consecutiveLossDays: 12,
    });
    expect(result.level).toBe("red");
    expect(result.consecutiveLossDays).toBe(12);
  });

  it("zero baseline Sharpe -> ratio 0 -> red", () => {
    const result = detectDecay({
      rollingSharpe30d: 1.2,
      baselineSharpe90d: 0,
      consecutiveLossDays: 0,
    });
    expect(result.sharpeRatio).toBe(0);
    expect(result.level).toBe("red");
  });

  it("exact boundary: sharpeRatio exactly 0.8 -> green", () => {
    // Use 0.8 / 1.0 to avoid floating-point rounding (1.2/1.5 = 0.7999... in IEEE 754)
    const result = detectDecay({
      rollingSharpe30d: 0.8,
      baselineSharpe90d: 1.0, // ratio = 0.8 exactly
      consecutiveLossDays: 3,
    });
    expect(result.sharpeRatio).toBe(0.8);
    expect(result.level).toBe("green");
  });

  it("exact boundary: sharpeRatio exactly 0.5 -> yellow (not red, since < 0.5 is red)", () => {
    const result = detectDecay({
      rollingSharpe30d: 0.75,
      baselineSharpe90d: 1.5, // ratio = 0.5
      consecutiveLossDays: 3,
    });
    expect(result.sharpeRatio).toBeCloseTo(0.5, 5);
    // 0.5 is NOT < 0.5, so not red; also 0.5 < 0.8, so not green => yellow
    expect(result.level).toBe("yellow");
  });
});

// ─── assessSurvival ────────────────────────────────────────────────

describe("assessSurvival", () => {
  it("healthy + green decay -> shouldEvolve=false", () => {
    const greenDecay = mockDecaySignal({ level: "green" });
    const result = assessSurvival({
      currentDrawdown: 0.07, // healthy tier
      previousTier: "healthy",
      decaySignal: greenDecay,
    });
    expect(result.currentTier).toBe("healthy");
    expect(result.shouldEvolve).toBe(false);
    expect(result.urgent).toBe(false);
  });

  it("stressed + yellow decay -> shouldEvolve=true", () => {
    const yellowDecay = mockDecaySignal({ level: "yellow" });
    const result = assessSurvival({
      currentDrawdown: 0.12, // stressed tier
      previousTier: "stressed",
      decaySignal: yellowDecay,
    });
    expect(result.currentTier).toBe("stressed");
    expect(result.shouldEvolve).toBe(true);
    expect(result.urgent).toBe(false);
  });

  it("tier degraded (healthy -> stressed) -> shouldEvolve=true", () => {
    // Green decay but tier worsened => should still evolve
    const greenDecay = mockDecaySignal({ level: "green" });
    const result = assessSurvival({
      currentDrawdown: 0.12, // stressed tier
      previousTier: "healthy",
      decaySignal: greenDecay,
    });
    expect(result.currentTier).toBe("stressed");
    expect(result.previousTier).toBe("healthy");
    expect(result.shouldEvolve).toBe(true);
  });

  it("red decay -> urgent=true", () => {
    const redDecay = mockDecaySignal({ level: "red" });
    const result = assessSurvival({
      currentDrawdown: 0.17, // critical tier
      previousTier: "critical",
      decaySignal: redDecay,
    });
    expect(result.urgent).toBe(true);
    expect(result.shouldEvolve).toBe(true);
  });

  it("tier improved but red decay -> shouldEvolve=true (decay overrides)", () => {
    const redDecay = mockDecaySignal({ level: "red" });
    const result = assessSurvival({
      currentDrawdown: 0.07, // healthy tier — improved from stressed
      previousTier: "stressed",
      decaySignal: redDecay,
    });
    expect(result.currentTier).toBe("healthy");
    expect(result.previousTier).toBe("stressed");
    // Tier improved, but red decay still forces evolution
    expect(result.shouldEvolve).toBe(true);
    expect(result.urgent).toBe(true);
  });
});
