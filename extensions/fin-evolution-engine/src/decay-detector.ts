/**
 * Decay detector — pure functions for strategy health monitoring.
 *
 * - detectDecay: compare rolling vs baseline Sharpe + consecutive loss days
 *   to produce a traffic-light DecaySignal (green / yellow / red).
 * - assessSurvival: combine drawdown tier + decay signal to decide whether
 *   the strategy should enter an RDAVD evolution cycle.
 *
 * All thresholds come from THRESHOLDS — no hardcoded magic numbers.
 */

import { getSurvivalTier } from "./fitness.ts";
import {
  THRESHOLDS,
  type DecaySignal,
  type DecayLevel,
  DecaySignalSchema,
  type SurvivalAssessment,
  SurvivalAssessmentSchema,
  type SurvivalTier,
} from "./schemas.ts";

// ─── Tier Ordering (best → worst) ──────────────────────────────────

/** Numeric rank for each survival tier; higher = worse. */
const TIER_RANK: Record<SurvivalTier, number> = {
  thriving: 0,
  healthy: 1,
  stressed: 2,
  critical: 3,
  stopped: 4,
};

// ─── detectDecay ───────────────────────────────────────────────────

export interface DetectDecayParams {
  rollingSharpe30d: number;
  baselineSharpe90d: number;
  consecutiveLossDays: number;
}

/**
 * Evaluate strategy decay by comparing recent (30d) Sharpe to baseline
 * (90d) Sharpe and checking consecutive loss days.
 *
 * Level logic:
 * - "green": sharpeRatio >= yellowRatio (0.8) AND lossDays < yellow threshold (5)
 * - "red":   sharpeRatio <  redRatio   (0.5) OR  lossDays >= red threshold (10)
 * - "yellow": everything in between
 */
export function detectDecay(params: DetectDecayParams): DecaySignal {
  const { rollingSharpe30d, baselineSharpe90d, consecutiveLossDays } = params;

  // Handle division by zero: if baseline is 0, ratio collapses to 0
  const sharpeRatio = baselineSharpe90d === 0 ? 0 : rollingSharpe30d / baselineSharpe90d;

  let level: DecayLevel;

  const isRed =
    sharpeRatio < THRESHOLDS.decay.redRatio ||
    consecutiveLossDays >= THRESHOLDS.decay.consecutiveLossRed;

  const isGreen =
    sharpeRatio >= THRESHOLDS.decay.yellowRatio &&
    consecutiveLossDays < THRESHOLDS.decay.consecutiveLossYellow;

  if (isRed) {
    level = "red";
  } else if (isGreen) {
    level = "green";
  } else {
    level = "yellow";
  }

  return DecaySignalSchema.parse({
    level,
    rollingSharpe30d,
    baselineSharpe90d,
    sharpeRatio,
    consecutiveLossDays,
    detectedAt: new Date().toISOString(),
  });
}

// ─── assessSurvival ────────────────────────────────────────────────

export interface AssessSurvivalParams {
  currentDrawdown: number;
  previousTier: SurvivalTier;
  decaySignal: DecaySignal;
}

/**
 * Full survival assessment — decides whether the strategy should
 * enter an evolution cycle.
 *
 * shouldEvolve triggers when:
 * - decay signal is yellow or red, OR
 * - current tier is worse than previous tier (degradation)
 *
 * urgent is set when decay signal is red.
 */
export function assessSurvival(params: AssessSurvivalParams): SurvivalAssessment {
  const { currentDrawdown, previousTier, decaySignal } = params;

  const currentTier = getSurvivalTier(currentDrawdown);

  const tierDegraded = TIER_RANK[currentTier] > TIER_RANK[previousTier];
  const decayActive = decaySignal.level === "yellow" || decaySignal.level === "red";

  const shouldEvolve = decayActive || tierDegraded;
  const urgent = decaySignal.level === "red";

  return SurvivalAssessmentSchema.parse({
    currentTier,
    previousTier,
    currentDrawdown,
    shouldEvolve,
    urgent,
    decaySignal,
    timestamp: new Date().toISOString(),
  });
}
