/**
 * Fitness calculator — pure functions for evolution fitness scoring.
 *
 * - computeFitness: time-decayed weighted fitness (paper 50% + recent 35% + longTerm 15%)
 * - getSurvivalTier: map drawdown to survival tier
 * - normalizeSharpe: convert raw Sharpe ratio to 0-1 scale
 *
 * All thresholds come from THRESHOLDS — no hardcoded magic numbers.
 */

import { THRESHOLDS, type SurvivalTier } from "./schemas.ts";

// ─── Helpers ──────────────────────────────────────────────────────

/** Clamp a value to [min, max] */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ─── Public API ───────────────────────────────────────────────────

export interface FitnessParams {
  paperSharpe: number;
  recentSharpe: number;
  longTermSharpe: number;
}

/**
 * Compute time-decayed weighted fitness score.
 *
 * Formula: paper * 0.5 + recent * 0.35 + longTerm * 0.15
 * Result clamped to [0, 1].
 */
export function computeFitness(params: FitnessParams): number {
  const { paperWeight, recentWeight, longTermWeight } = THRESHOLDS.fitness;
  const raw =
    params.paperSharpe * paperWeight +
    params.recentSharpe * recentWeight +
    params.longTermSharpe * longTermWeight;
  return clamp(raw, 0, 1);
}

/**
 * Map a drawdown value to its survival tier.
 *
 * Uses THRESHOLDS.tier boundaries:
 * - drawdown < 0.05 → "thriving"
 * - 0.05 <= drawdown < 0.10 → "healthy"
 * - 0.10 <= drawdown < 0.15 → "stressed"
 * - 0.15 <= drawdown < 0.20 → "critical"
 * - drawdown >= 0.20 → "stopped"
 */
export function getSurvivalTier(drawdown: number): SurvivalTier {
  const { thriving, healthy, stressed, critical } = THRESHOLDS.tier;

  if (drawdown < thriving) return "thriving";
  if (drawdown < healthy) return "healthy";
  if (drawdown < stressed) return "stressed";
  if (drawdown < critical) return "critical";
  return "stopped";
}

/**
 * Normalize a raw Sharpe ratio to the 0-1 scale.
 *
 * A Sharpe of 3.0 maps to 1.0; negative Sharpe maps to 0.
 * Formula: clamp(sharpe / 3.0, 0, 1)
 */
export function normalizeSharpe(sharpe: number): number {
  return clamp(sharpe / 3.0, 0, 1);
}
