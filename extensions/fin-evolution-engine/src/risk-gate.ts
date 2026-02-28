/**
 * Mutation Risk Gate — 5 safety gates that must all pass before a mutation
 * is allowed to proceed. Pure functions; no side effects.
 *
 * Gates:
 *   1. MutationBudget    — daily mutation count cap
 *   2. ParameterDrift     — cumulative parameter change limit
 *   3. OverfitDetection   — suspiciously high / consistent Sharpe
 *   4. MutationCoherence  — consecutive rejection limit
 *   5. WalkForwardGate    — in-sample vs out-of-sample degradation
 */

import {
  type Gene,
  type GateResult,
  type MutationRiskGateResult,
  MutationRiskGateResultSchema,
  THRESHOLDS,
} from "./schemas.ts";

// ─── Helpers ───────────────────────────────────────────────────────

/** Population standard deviation */
function stdDev(nums: number[]): number {
  if (nums.length === 0) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const squaredDiffs = nums.map((n) => (n - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / nums.length);
}

// ─── Gate 1: Mutation Budget ───────────────────────────────────────

/** Ensures daily mutation count stays within budget. */
export function checkMutationBudget(todayCount: number): GateResult {
  const limit = THRESHOLDS.mutationGate.maxPerDay;
  const passed = todayCount < limit;
  return {
    name: "MutationBudget",
    passed,
    reason: passed
      ? `${todayCount}/${limit} mutations today (under budget)`
      : `${todayCount}/${limit} mutations today (budget exhausted)`,
    value: todayCount,
    threshold: limit,
  };
}

// ─── Gate 2: Parameter Drift ───────────────────────────────────────

/**
 * Measures cumulative relative drift across all gene parameters.
 * For each gene in newGenes, finds its match in oldGenes by id and
 * sums |newParam - oldParam| / |oldParam| for every shared parameter.
 * New genes (no match in old) contribute 0 drift.
 * Parameters where oldParam === 0 are skipped to avoid division by zero.
 */
export function checkParameterDrift(oldGenes: Gene[], newGenes: Gene[]): GateResult {
  const limit = THRESHOLDS.mutationGate.maxParamDrift;
  const oldMap = new Map(oldGenes.map((g) => [g.id, g]));

  let cumulativeDrift = 0;
  for (const newGene of newGenes) {
    const oldGene = oldMap.get(newGene.id);
    if (!oldGene) continue; // new gene, no drift

    for (const [paramName, newVal] of Object.entries(newGene.params)) {
      const oldVal = oldGene.params[paramName];
      if (oldVal === undefined || oldVal === 0) continue;
      cumulativeDrift += Math.abs(newVal - oldVal) / Math.abs(oldVal);
    }
  }

  const passed = cumulativeDrift <= limit;
  return {
    name: "ParameterDrift",
    passed,
    reason: passed
      ? `drift ${cumulativeDrift.toFixed(4)} <= ${limit}`
      : `drift ${cumulativeDrift.toFixed(4)} > ${limit} (too much parameter change)`,
    value: cumulativeDrift,
    threshold: limit,
  };
}

// ─── Gate 3: Overfit Detection ─────────────────────────────────────

/**
 * Flags suspiciously good performance that hints at overfitting:
 *   - Average scenario Sharpe > minSharpe (2.5) AND
 *   - Standard deviation < 0.1 AND
 *   - At least 4 scenarios
 * All three conditions must hold to trigger an overfit flag.
 * Gate passes when the strategy is NOT flagged as overfit.
 */
export function checkOverfitDetection(scenarioSharpes: number[]): GateResult {
  const minSharpe = THRESHOLDS.mutationGate.minSharpe;
  const count = scenarioSharpes.length;

  if (count === 0) {
    return {
      name: "OverfitDetection",
      passed: true,
      reason: "no scenario data to evaluate",
      value: 0,
      threshold: minSharpe,
    };
  }

  const avg = scenarioSharpes.reduce((a, b) => a + b, 0) / count;
  const sd = stdDev(scenarioSharpes);

  // Overfit = suspiciously high AND suspiciously consistent AND enough data
  const overfit = avg > minSharpe && sd < 0.1 && count >= 4;
  const passed = !overfit;

  return {
    name: "OverfitDetection",
    passed,
    reason: passed
      ? `avg Sharpe ${avg.toFixed(2)}, stdDev ${sd.toFixed(4)}, n=${count} (no overfit signal)`
      : `avg Sharpe ${avg.toFixed(2)} > ${minSharpe}, stdDev ${sd.toFixed(4)} < 0.1, n=${count} (overfit detected)`,
    value: avg,
    threshold: minSharpe,
  };
}

// ─── Gate 4: Mutation Coherence ────────────────────────────────────

/**
 * If too many consecutive mutations were rejected, pause further attempts
 * to prevent thrashing.
 */
export function checkMutationCoherence(consecutiveRejects: number): GateResult {
  const limit = THRESHOLDS.mutationGate.consecutiveRejectLimit;
  const passed = consecutiveRejects < limit;
  return {
    name: "MutationCoherence",
    passed,
    reason: passed
      ? `${consecutiveRejects} consecutive rejects (under limit ${limit})`
      : `${consecutiveRejects} consecutive rejects (reached limit ${limit}, mutation paused)`,
    value: consecutiveRejects,
    threshold: limit,
  };
}

// ─── Gate 5: Walk-Forward Gate ─────────────────────────────────────

/**
 * Measures performance degradation between in-sample and out-of-sample.
 * degradation = (IS - OOS) / IS when IS > 0; 0 otherwise.
 * Gate passes when degradation is within acceptable bounds.
 */
export function checkWalkForwardGate(
  inSampleSharpe: number,
  outOfSampleSharpe: number,
): GateResult {
  const limit = THRESHOLDS.mutationGate.maxOosDegradation;

  const degradation =
    inSampleSharpe <= 0 ? 0 : (inSampleSharpe - outOfSampleSharpe) / inSampleSharpe;
  const passed = degradation <= limit;

  return {
    name: "WalkForwardGate",
    passed,
    reason: passed
      ? `OOS degradation ${(degradation * 100).toFixed(1)}% <= ${(limit * 100).toFixed(1)}%`
      : `OOS degradation ${(degradation * 100).toFixed(1)}% > ${(limit * 100).toFixed(1)}% (poor generalization)`,
    value: degradation,
    threshold: limit,
  };
}

// ─── Aggregate ─────────────────────────────────────────────────────

export interface CheckAllGatesParams {
  todayCount: number;
  oldGenes: Gene[];
  newGenes: Gene[];
  scenarioSharpes: number[];
  consecutiveRejects: number;
  inSampleSharpe: number;
  outOfSampleSharpe: number;
}

/**
 * Runs all 5 risk gates and returns a validated MutationRiskGateResult.
 * The result is parsed through MutationRiskGateResultSchema to guarantee
 * schema compliance.
 */
export function checkAllGates(params: CheckAllGatesParams): MutationRiskGateResult {
  const gates: GateResult[] = [
    checkMutationBudget(params.todayCount),
    checkParameterDrift(params.oldGenes, params.newGenes),
    checkOverfitDetection(params.scenarioSharpes),
    checkMutationCoherence(params.consecutiveRejects),
    checkWalkForwardGate(params.inSampleSharpe, params.outOfSampleSharpe),
  ];

  const allPassed = gates.every((g) => g.passed);
  const failedGate = gates.find((g) => !g.passed)?.name;

  return MutationRiskGateResultSchema.parse({
    gates,
    allPassed,
    failedGate,
  });
}
