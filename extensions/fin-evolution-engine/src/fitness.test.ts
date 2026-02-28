import { describe, expect, it } from "vitest";
import { computeFitness, getSurvivalTier, normalizeSharpe } from "./fitness.ts";

// ─── computeFitness ─────────────────────────────────────────────────

describe("computeFitness", () => {
  it("applies correct weights (paper 50%, recent 35%, longTerm 15%)", () => {
    const result = computeFitness({
      paperSharpe: 0.8,
      recentSharpe: 0.6,
      longTermSharpe: 0.4,
    });
    // 0.8 * 0.5 + 0.6 * 0.35 + 0.4 * 0.15 = 0.4 + 0.21 + 0.06 = 0.67
    expect(result).toBeCloseTo(0.67, 5);
  });

  it("returns 0 when all inputs are zero", () => {
    const result = computeFitness({
      paperSharpe: 0,
      recentSharpe: 0,
      longTermSharpe: 0,
    });
    expect(result).toBe(0);
  });

  it("clamps high values to 1", () => {
    const result = computeFitness({
      paperSharpe: 2.0,
      recentSharpe: 2.0,
      longTermSharpe: 2.0,
    });
    // 2.0 * 0.5 + 2.0 * 0.35 + 2.0 * 0.15 = 1.0 + 0.7 + 0.3 = 2.0 → clamped to 1
    expect(result).toBe(1);
  });

  it("clamps negative inputs to 0", () => {
    const result = computeFitness({
      paperSharpe: -1.0,
      recentSharpe: -0.5,
      longTermSharpe: -2.0,
    });
    // -1.0 * 0.5 + -0.5 * 0.35 + -2.0 * 0.15 = -0.5 + -0.175 + -0.3 = -0.975 → clamped to 0
    expect(result).toBe(0);
  });

  it("handles mixed positive and negative values", () => {
    const result = computeFitness({
      paperSharpe: 0.9,
      recentSharpe: -0.2,
      longTermSharpe: 0.5,
    });
    // 0.9 * 0.5 + (-0.2) * 0.35 + 0.5 * 0.15 = 0.45 - 0.07 + 0.075 = 0.455
    expect(result).toBeCloseTo(0.455, 5);
  });

  it("returns exactly 1 when weighted sum equals 1", () => {
    const result = computeFitness({
      paperSharpe: 1.0,
      recentSharpe: 1.0,
      longTermSharpe: 1.0,
    });
    // 1.0 * 0.5 + 1.0 * 0.35 + 1.0 * 0.15 = 1.0
    expect(result).toBe(1);
  });
});

// ─── getSurvivalTier ────────────────────────────────────────────────

describe("getSurvivalTier", () => {
  it("returns 'thriving' for drawdown below 0.05", () => {
    expect(getSurvivalTier(0)).toBe("thriving");
    expect(getSurvivalTier(0.01)).toBe("thriving");
    expect(getSurvivalTier(0.049)).toBe("thriving");
  });

  it("returns 'healthy' at exact boundary 0.05", () => {
    expect(getSurvivalTier(0.05)).toBe("healthy");
  });

  it("returns 'healthy' between 0.05 and 0.10", () => {
    expect(getSurvivalTier(0.07)).toBe("healthy");
    expect(getSurvivalTier(0.099)).toBe("healthy");
  });

  it("returns 'stressed' at exact boundary 0.10", () => {
    expect(getSurvivalTier(0.1)).toBe("stressed");
  });

  it("returns 'stressed' between 0.10 and 0.15", () => {
    expect(getSurvivalTier(0.12)).toBe("stressed");
    expect(getSurvivalTier(0.149)).toBe("stressed");
  });

  it("returns 'critical' at exact boundary 0.15", () => {
    expect(getSurvivalTier(0.15)).toBe("critical");
  });

  it("returns 'critical' between 0.15 and 0.20", () => {
    expect(getSurvivalTier(0.17)).toBe("critical");
    expect(getSurvivalTier(0.199)).toBe("critical");
  });

  it("returns 'stopped' at exact boundary 0.20", () => {
    expect(getSurvivalTier(0.2)).toBe("stopped");
  });

  it("returns 'stopped' for drawdown above 0.20", () => {
    expect(getSurvivalTier(0.25)).toBe("stopped");
    expect(getSurvivalTier(0.5)).toBe("stopped");
    expect(getSurvivalTier(1.0)).toBe("stopped");
  });
});

// ─── normalizeSharpe ────────────────────────────────────────────────

describe("normalizeSharpe", () => {
  it("sharpe 3.0 maps to 1.0", () => {
    expect(normalizeSharpe(3.0)).toBe(1);
  });

  it("sharpe 1.5 maps to 0.5", () => {
    expect(normalizeSharpe(1.5)).toBe(0.5);
  });

  it("sharpe 0 maps to 0", () => {
    expect(normalizeSharpe(0)).toBe(0);
  });

  it("negative sharpe maps to 0", () => {
    expect(normalizeSharpe(-1)).toBe(0);
    expect(normalizeSharpe(-5)).toBe(0);
  });

  it("sharpe above 3.0 is clamped to 1.0", () => {
    expect(normalizeSharpe(5)).toBe(1);
    expect(normalizeSharpe(100)).toBe(1);
  });

  it("sharpe 0.75 maps to 0.25", () => {
    expect(normalizeSharpe(0.75)).toBe(0.25);
  });
});
