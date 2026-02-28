import { describe, expect, it } from "vitest";
import {
  checkAllGates,
  checkMutationBudget,
  checkMutationCoherence,
  checkOverfitDetection,
  checkParameterDrift,
  checkWalkForwardGate,
} from "./risk-gate.ts";
import { mockGene, mockGenes } from "./test-utils.ts";

// ─── Gate 1: MutationBudget ───────────────────────────────────────

describe("checkMutationBudget", () => {
  it("passes when count is 0", () => {
    const r = checkMutationBudget(0);
    expect(r.passed).toBe(true);
    expect(r.value).toBe(0);
    expect(r.threshold).toBe(10);
  });

  it("passes when count is 9 (just under limit)", () => {
    const r = checkMutationBudget(9);
    expect(r.passed).toBe(true);
    expect(r.value).toBe(9);
  });

  it("fails when count is 10 (at limit)", () => {
    const r = checkMutationBudget(10);
    expect(r.passed).toBe(false);
    expect(r.value).toBe(10);
  });

  it("fails when count is 15 (over limit)", () => {
    const r = checkMutationBudget(15);
    expect(r.passed).toBe(false);
    expect(r.value).toBe(15);
  });
});

// ─── Gate 2: ParameterDrift ───────────────────────────────────────

describe("checkParameterDrift", () => {
  it("passes with 0 drift when genes are unchanged", () => {
    const genes = mockGenes(3);
    const r = checkParameterDrift(genes, genes);
    expect(r.passed).toBe(true);
    expect(r.value).toBe(0);
  });

  it("passes with small parameter changes", () => {
    const oldGenes = [mockGene({ id: "g1", params: { period: 14, threshold: 30 } })];
    const newGenes = [mockGene({ id: "g1", params: { period: 15, threshold: 31 } })];
    const r = checkParameterDrift(oldGenes, newGenes);
    // drift = |15-14|/14 + |31-30|/30 = 0.0714 + 0.0333 = 0.1047
    expect(r.passed).toBe(true);
    expect(r.value).toBeCloseTo(0.1047, 3);
  });

  it("fails with large parameter changes", () => {
    const oldGenes = [mockGene({ id: "g1", params: { period: 14, threshold: 30 } })];
    const newGenes = [mockGene({ id: "g1", params: { period: 28, threshold: 50 } })];
    const r = checkParameterDrift(oldGenes, newGenes);
    // drift = |28-14|/14 + |50-30|/30 = 1.0 + 0.6667 = 1.6667
    expect(r.passed).toBe(false);
    expect(r.value).toBeGreaterThan(0.3);
  });

  it("passes with empty gene lists", () => {
    const r = checkParameterDrift([], []);
    expect(r.passed).toBe(true);
    expect(r.value).toBe(0);
  });

  it("contributes 0 drift for new genes not in old set", () => {
    const oldGenes = [mockGene({ id: "g1", params: { period: 14 } })];
    const newGenes = [
      mockGene({ id: "g1", params: { period: 14 } }),
      mockGene({ id: "g-new", params: { period: 100 } }),
    ];
    const r = checkParameterDrift(oldGenes, newGenes);
    expect(r.passed).toBe(true);
    expect(r.value).toBe(0);
  });

  it("skips params where old value is 0", () => {
    const oldGenes = [mockGene({ id: "g1", params: { period: 0, threshold: 30 } })];
    const newGenes = [mockGene({ id: "g1", params: { period: 10, threshold: 30 } })];
    const r = checkParameterDrift(oldGenes, newGenes);
    // period skipped (old=0), threshold unchanged → drift = 0
    expect(r.passed).toBe(true);
    expect(r.value).toBe(0);
  });
});

// ─── Gate 3: OverfitDetection ─────────────────────────────────────

describe("checkOverfitDetection", () => {
  it("passes with normal Sharpe values", () => {
    const r = checkOverfitDetection([1.0, 1.2, 0.8]);
    expect(r.passed).toBe(true);
    expect(r.value).toBeCloseTo(1.0, 1);
  });

  it("fails with suspiciously high and consistent Sharpes", () => {
    // avg = 3.5, stdDev ≈ 0.0707, n = 4 → overfit
    const r = checkOverfitDetection([3.5, 3.4, 3.6, 3.5]);
    expect(r.passed).toBe(false);
    expect(r.value).toBeCloseTo(3.5, 1);
  });

  it("passes when Sharpe is high but variable", () => {
    // avg = 3.0, stdDev large enough → not overfit
    const r = checkOverfitDetection([4.0, 2.0, 3.5, 2.5]);
    expect(r.passed).toBe(true);
    expect(r.value).toBeCloseTo(3.0, 1);
  });

  it("passes with empty scenario list", () => {
    const r = checkOverfitDetection([]);
    expect(r.passed).toBe(true);
    expect(r.value).toBe(0);
  });

  it("passes when high Sharpe but fewer than 4 scenarios", () => {
    // avg = 3.5, stdDev tiny, but n = 3 → not enough data to confirm overfit
    const r = checkOverfitDetection([3.5, 3.5, 3.5]);
    expect(r.passed).toBe(true);
  });
});

// ─── Gate 4: MutationCoherence ────────────────────────────────────

describe("checkMutationCoherence", () => {
  it("passes with 0 consecutive rejects", () => {
    const r = checkMutationCoherence(0);
    expect(r.passed).toBe(true);
    expect(r.value).toBe(0);
    expect(r.threshold).toBe(3);
  });

  it("passes with 2 consecutive rejects", () => {
    const r = checkMutationCoherence(2);
    expect(r.passed).toBe(true);
    expect(r.value).toBe(2);
  });

  it("fails with 3 consecutive rejects (at limit)", () => {
    const r = checkMutationCoherence(3);
    expect(r.passed).toBe(false);
    expect(r.value).toBe(3);
  });

  it("fails with 5 consecutive rejects", () => {
    const r = checkMutationCoherence(5);
    expect(r.passed).toBe(false);
    expect(r.value).toBe(5);
  });
});

// ─── Gate 5: WalkForwardGate ──────────────────────────────────────

describe("checkWalkForwardGate", () => {
  it("passes with small degradation (IS=2.0, OOS=1.8)", () => {
    const r = checkWalkForwardGate(2.0, 1.8);
    expect(r.passed).toBe(true);
    // degradation = (2.0 - 1.8) / 2.0 = 0.1
    expect(r.value).toBeCloseTo(0.1, 4);
    expect(r.threshold).toBe(0.3);
  });

  it("fails with large degradation (IS=2.0, OOS=1.0)", () => {
    const r = checkWalkForwardGate(2.0, 1.0);
    expect(r.passed).toBe(false);
    // degradation = (2.0 - 1.0) / 2.0 = 0.5
    expect(r.value).toBeCloseTo(0.5, 4);
  });

  it("passes when inSampleSharpe is 0 (degradation clamped to 0)", () => {
    const r = checkWalkForwardGate(0, 1.0);
    expect(r.passed).toBe(true);
    expect(r.value).toBe(0);
  });

  it("passes when inSampleSharpe is negative", () => {
    const r = checkWalkForwardGate(-1.0, 0.5);
    expect(r.passed).toBe(true);
    expect(r.value).toBe(0);
  });

  it("passes at exact boundary (degradation = 0.3)", () => {
    // IS=10.0, OOS=7.0 → degradation = 3.0/10.0 = 0.3 (exact in IEEE 754)
    const r = checkWalkForwardGate(10.0, 7.0);
    expect(r.passed).toBe(true);
    expect(r.value).toBeCloseTo(0.3, 10);
  });
});

// ─── checkAllGates ────────────────────────────────────────────────

describe("checkAllGates", () => {
  const baseParams = {
    todayCount: 3,
    oldGenes: mockGenes(3),
    newGenes: mockGenes(3), // same genes → 0 drift
    scenarioSharpes: [1.0, 1.2, 0.8],
    consecutiveRejects: 0,
    inSampleSharpe: 2.0,
    outOfSampleSharpe: 1.8,
  };

  it("returns allPassed=true when all gates pass", () => {
    const r = checkAllGates(baseParams);
    expect(r.allPassed).toBe(true);
    expect(r.failedGate).toBeUndefined();
    expect(r.gates).toHaveLength(5);
    for (const gate of r.gates) {
      expect(gate.passed).toBe(true);
    }
  });

  it("returns allPassed=false and names first failed gate (MutationBudget)", () => {
    const r = checkAllGates({ ...baseParams, todayCount: 15 });
    expect(r.allPassed).toBe(false);
    expect(r.failedGate).toBe("MutationBudget");
  });

  it("returns allPassed=false and names first failed gate (MutationCoherence)", () => {
    const r = checkAllGates({ ...baseParams, consecutiveRejects: 5 });
    expect(r.allPassed).toBe(false);
    expect(r.failedGate).toBe("MutationCoherence");
  });

  it("identifies first failure when multiple gates fail", () => {
    const r = checkAllGates({
      ...baseParams,
      todayCount: 15, // fails MutationBudget
      consecutiveRejects: 5, // fails MutationCoherence
    });
    expect(r.allPassed).toBe(false);
    // MutationBudget is checked first
    expect(r.failedGate).toBe("MutationBudget");
  });

  it("result passes MutationRiskGateResultSchema validation (5 gates)", () => {
    const r = checkAllGates(baseParams);
    // If parse() throws, the test fails
    expect(r.gates).toHaveLength(5);
    expect(r.gates.map((g) => g.name)).toEqual([
      "MutationBudget",
      "ParameterDrift",
      "OverfitDetection",
      "MutationCoherence",
      "WalkForwardGate",
    ]);
  });

  it("correctly fails WalkForwardGate when OOS degrades significantly", () => {
    const r = checkAllGates({
      ...baseParams,
      inSampleSharpe: 2.0,
      outOfSampleSharpe: 0.5, // degradation = 0.75
    });
    expect(r.allPassed).toBe(false);
    expect(r.failedGate).toBe("WalkForwardGate");
  });
});
