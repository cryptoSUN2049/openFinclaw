/**
 * FCS (FinClaw Commons Score) scoring engine.
 *
 * Calculates composite quality scores for commons entries based on
 * code quality, usage, social engagement, and freshness dimensions.
 */

import type {
  AuthorReputation,
  BacktestResult,
  CommonsEntryWithFcs,
  ConnectorHealth,
  FcsConfig,
  FcsScore,
  FcsWeights,
  QualityMetrics,
  SocialMetrics,
  UsageMetrics,
} from "./types.fcs.js";
import type { CommonsEntry, CommonsEntryType } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Weight resolution
// ---------------------------------------------------------------------------

/** Resolve weights for an entry type, falling back to default config weights. */
function getWeights(entryType: CommonsEntryType, config: FcsConfig): FcsWeights {
  const override = config.typeOverrides[entryType];
  if (override) {
    return {
      quality: override.quality,
      usage: override.usage,
      social: override.social,
      freshness: override.freshness,
    };
  }
  return config.weights;
}

// ---------------------------------------------------------------------------
// Quality score (0-100)
// ---------------------------------------------------------------------------

function calculateGenericQuality(quality: QualityMetrics): number {
  let score = 0;
  if (quality.hasTests) {
    score += 0.25;
  }
  if (quality.hasDocumentation) {
    score += 0.25;
  }
  if (quality.hasCIPassedRecently) {
    score += 0.2;
  }
  score += clamp(quality.lintScore / 100, 0, 1) * 0.15;
  if (quality.typeCheckPasses) {
    score += 0.15;
  }
  return score;
}

export function calculateQualityScore(
  entryType: CommonsEntryType,
  quality?: QualityMetrics,
  backtest?: BacktestResult,
  connectorHealth?: ConnectorHealth,
): number {
  // Strategy with backtest data
  if (entryType === "strategy" && backtest) {
    let score = 0;
    score += clamp(backtest.sharpeRatio / 2.0, 0, 1) * 0.4;
    score += clamp(1 - backtest.maxDrawdownPct / 50, 0, 1) * 0.3;
    score += clamp(backtest.winRatePct / 100, 0, 1) * 0.15;
    // Code quality component (15%)
    if (quality) {
      score += calculateGenericQuality(quality) * 0.15;
    }
    return score * 100;
  }

  // Connector with health data
  if (entryType === "connector" && connectorHealth) {
    let score = 0;
    score += clamp(connectorHealth.uptimePct / 100, 0, 1) * 0.4;
    score += clamp(1 - connectorHealth.avgLatencyMs / 2000, 0, 1) * 0.25;
    score += clamp(1 - connectorHealth.errorRate, 0, 1) * 0.2;
    // Code quality component (15%)
    if (quality) {
      score += calculateGenericQuality(quality) * 0.15;
    }
    return score * 100;
  }

  // Generic quality for all other types (or strategy/connector without special data)
  if (!quality) {
    return 0;
  }
  return calculateGenericQuality(quality) * 100;
}

// ---------------------------------------------------------------------------
// Usage score (0-100)
// ---------------------------------------------------------------------------

export function calculateUsageScore(usage?: UsageMetrics): number {
  if (!usage) {
    return 0;
  }
  const installs = clamp(usage.installCount / 100, 0, 1) * 0.4;
  const active = clamp(usage.activeInstalls30d / 50, 0, 1) * 0.3;
  const invocations = clamp(usage.invocationCount30d / 500, 0, 1) * 0.3;
  return (installs + active + invocations) * 100;
}

// ---------------------------------------------------------------------------
// Social score (0-100)
// ---------------------------------------------------------------------------

export function calculateSocialScore(social?: SocialMetrics): number {
  if (!social) {
    return 0;
  }
  const stars = clamp(social.starCount / 50, 0, 1) * 0.3;
  const forks = clamp(social.forkCount / 20, 0, 1) * 0.2;
  const reviews = clamp(social.reviewCount / 10, 0, 1) * 0.2;
  const rating = (social.averageRating / 5) * 0.3;
  return (stars + forks + reviews + rating) * 100;
}

// ---------------------------------------------------------------------------
// Freshness score (0-100)
// ---------------------------------------------------------------------------

export function calculateFreshnessScore(
  updatedAt: string,
  config: FcsConfig,
): { score: number; decay: number } {
  const daysSinceUpdate = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  const decay = Math.exp((-Math.LN2 * daysSinceUpdate) / config.decayHalfLifeDays);
  return { score: decay * 100, decay };
}

// ---------------------------------------------------------------------------
// Anti-gaming
// ---------------------------------------------------------------------------

export function applyAntiGaming(
  newTotal: number,
  previousScore: FcsScore | undefined,
  config: FcsConfig,
): number {
  if (!previousScore) {
    return newTotal;
  }

  const hoursSinceLast =
    (Date.now() - new Date(previousScore.calculatedAt).getTime()) / (1000 * 60 * 60);
  if (hoursSinceLast >= 24) {
    return newTotal;
  }

  const maxChange = config.antiGaming.maxDailyScoreChange;
  const change = newTotal - previousScore.total;
  const clamped = clamp(change, -maxChange, maxChange);
  return previousScore.total + clamped;
}

// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------

export function calculateFcsScore(
  entry: CommonsEntry,
  data: {
    usage?: UsageMetrics;
    social?: SocialMetrics;
    quality?: QualityMetrics;
    backtest?: BacktestResult;
    connectorHealth?: ConnectorHealth;
  },
  config: FcsConfig,
  previousScore?: FcsScore,
): FcsScore {
  const weights = getWeights(entry.type, config);

  const quality = calculateQualityScore(
    entry.type,
    data.quality,
    data.backtest,
    data.connectorHealth,
  );
  const usage = calculateUsageScore(data.usage);
  const social = calculateSocialScore(data.social);
  const { score: freshness, decay } = calculateFreshnessScore(entry.updatedAt, config);

  const rawTotal =
    quality * weights.quality +
    usage * weights.usage +
    social * weights.social +
    freshness * weights.freshness;

  const total = applyAntiGaming(rawTotal, previousScore, config);

  return {
    total,
    breakdown: { quality, usage, social, freshness },
    calculatedAt: new Date().toISOString(),
    decayApplied: decay,
  };
}

// ---------------------------------------------------------------------------
// Author reputation
// ---------------------------------------------------------------------------

export function calculateAuthorReputation(
  authorId: string,
  entries: CommonsEntryWithFcs[],
): AuthorReputation {
  const authorEntries = entries.filter((e) => e.author === authorId);

  if (authorEntries.length === 0) {
    return {
      authorId,
      totalEntries: 0,
      averageFcs: 0,
      establishedCount: 0,
      memberSince: new Date().toISOString(),
      verified: false,
    };
  }

  const scores = authorEntries.map((e) => e.fcs?.score.total ?? 0);
  const averageFcs = scores.reduce((a, b) => a + b, 0) / scores.length;

  const establishedCount = authorEntries.filter(
    (e) => e.fcs?.lifecycle.tier === "established",
  ).length;

  const memberSince = authorEntries.reduce((earliest, e) => {
    return e.createdAt < earliest ? e.createdAt : earliest;
  }, authorEntries[0].createdAt);

  return {
    authorId,
    totalEntries: authorEntries.length,
    averageFcs,
    establishedCount,
    memberSince,
    verified: false,
  };
}
