/**
 * FCS (FinClaw Commons Score) type definitions.
 *
 * Types for the quality scoring engine, lifecycle state machine,
 * usage/social/quality metrics, and author reputation system.
 */

import type { CommonsEntry, CommonsEntryType } from "./types.js";

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Backtest results for strategy entries. */
export type BacktestResult = {
  /** Backtest period in ISO-8601 interval format, e.g. "2024-01-01/2025-12-31". */
  period: string;
  /** Annualized Sharpe ratio. */
  sharpeRatio: number;
  /** Maximum drawdown percentage (0-100). */
  maxDrawdownPct: number;
  /** Total return percentage over the period. */
  totalReturnPct: number;
  /** Win rate percentage (0-100). */
  winRatePct: number;
  /** Number of trades executed during the backtest. */
  tradeCount: number;
  /** ISO-8601 timestamp when the backtest was verified. */
  verifiedAt?: string;
  /** Who verified the result: "automated" or an author id. */
  verifiedBy?: string;
};

/** Health metrics for connector entries. */
export type ConnectorHealth = {
  /** 30-day rolling uptime percentage (0-100). */
  uptimePct: number;
  /** Average response latency in milliseconds. */
  avgLatencyMs: number;
  /** ISO-8601 timestamp of last health check. */
  lastCheckedAt: string;
  /** Error rate as a fraction (0-1). */
  errorRate: number;
};

/** Installation and usage metrics. */
export type UsageMetrics = {
  /** Total installation count (all time). */
  installCount: number;
  /** Active installations in the last 30 days. */
  activeInstalls30d: number;
  /** Number of invocations in the last 30 days. */
  invocationCount30d: number;
  /** ISO-8601 timestamp of last usage. */
  lastUsedAt?: string;
};

/** Community/social engagement metrics. */
export type SocialMetrics = {
  /** Number of stars/likes. */
  starCount: number;
  /** Number of forks/clones. */
  forkCount: number;
  /** Number of reviews received. */
  reviewCount: number;
  /** Average review rating (0-5). */
  averageRating: number;
};

/** Code quality indicators. */
export type QualityMetrics = {
  /** Whether the entry has test coverage. */
  hasTests: boolean;
  /** Whether the entry has documentation. */
  hasDocumentation: boolean;
  /** Whether CI has passed recently. */
  hasCIPassedRecently: boolean;
  /** Lint score (0-100). */
  lintScore: number;
  /** Whether TypeScript type-checking passes. */
  typeCheckPasses: boolean;
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Growth tier reflecting maturity based on FCS score. */
export type LifecycleTier = "seedling" | "growing" | "established";

/** Current operational status of an entry. */
export type LifecycleStatus = "active" | "degrading" | "archived" | "delisted";

/** Tier history entry for tracking promotions/demotions. */
export type TierHistoryEntry = {
  tier: LifecycleTier;
  status: LifecycleStatus;
  changedAt: string;
  reason?: string;
};

/** Full lifecycle state of a commons entry. */
export type LifecycleState = {
  tier: LifecycleTier;
  status: LifecycleStatus;
  /** ISO-8601 timestamp when last promoted to a higher tier. */
  promotedAt?: string;
  /** ISO-8601 timestamp when entry entered "degrading" status. */
  degradedAt?: string;
  /** ISO-8601 timestamp when entry was archived. */
  archivedAt?: string;
  /** Reason for delisting (required when status is "delisted"). */
  delistReason?: string;
  /** History of tier/status transitions. */
  tierHistory: TierHistoryEntry[];
};

// ---------------------------------------------------------------------------
// FCS Score
// ---------------------------------------------------------------------------

/** Breakdown of the FCS score by dimension. */
export type FcsBreakdown = {
  quality: number;
  usage: number;
  social: number;
  freshness: number;
};

/** Computed FCS (FinClaw Commons Score) for an entry. */
export type FcsScore = {
  /** Overall score (0-100). */
  total: number;
  /** Per-dimension breakdown scores (each 0-100). */
  breakdown: FcsBreakdown;
  /** ISO-8601 timestamp when this score was calculated. */
  calculatedAt: string;
  /** Amount of time decay applied (0-1). */
  decayApplied: number;
};

// ---------------------------------------------------------------------------
// Author Reputation
// ---------------------------------------------------------------------------

/** Author reputation derived from their published entries. */
export type AuthorReputation = {
  authorId: string;
  /** Total number of entries published. */
  totalEntries: number;
  /** Average FCS across all entries. */
  averageFcs: number;
  /** Number of entries at "established" tier. */
  establishedCount: number;
  /** ISO-8601 date when the author first published. */
  memberSince: string;
  /** Whether the author is verified. */
  verified: boolean;
};

// ---------------------------------------------------------------------------
// FCS Configuration
// ---------------------------------------------------------------------------

/** Scoring weight configuration for FCS dimensions. */
export type FcsWeights = {
  quality: number;
  usage: number;
  social: number;
  freshness: number;
};

/** Type-specific weight overrides with additional thresholds. */
export type FcsTypeOverride = FcsWeights & {
  backtestSharpeFloor?: number;
  backtestDrawdownCeiling?: number;
  uptimeFloor?: number;
  latencyCeiling?: number;
};

/** Anti-gaming configuration. */
export type AntiGamingConfig = {
  /** Maximum FCS change allowed per day. */
  maxDailyScoreChange: number;
  /** Maximum installs per day before capping. */
  installVelocityCap: number;
  /** Minimum unique installers required for usage score. */
  minUniqueInstallers: number;
};

/** Lifecycle threshold configuration. */
export type LifecycleThresholds = {
  seedlingToGrowingThreshold: number;
  growingToEstablishedThreshold: number;
  degradationThreshold: number;
  archivalGracePeriodDays: number;
};

/** Top-level FCS configuration (stored in commons/fcs/config.json). */
export type FcsConfig = {
  version: number;
  weights: FcsWeights;
  typeOverrides: Partial<Record<CommonsEntryType, FcsTypeOverride>>;
  decayHalfLifeDays: number;
  antiGaming: AntiGamingConfig;
  lifecycle: LifecycleThresholds;
};

// ---------------------------------------------------------------------------
// Storage / Composite types
// ---------------------------------------------------------------------------

/** Per-entry FCS data stored in scores.json. */
export type FcsEntryData = {
  entryId: string;
  score: FcsScore;
  lifecycle: LifecycleState;
  usage?: UsageMetrics;
  social?: SocialMetrics;
  quality?: QualityMetrics;
  backtest?: BacktestResult;
  connectorHealth?: ConnectorHealth;
};

/** scores.json file shape. */
export type FcsScoresFile = {
  version: 1;
  updatedAt: string;
  entries: Record<string, FcsEntryData>;
};

/** authors.json file shape. */
export type FcsAuthorsFile = {
  version: 1;
  updatedAt: string;
  authors: Record<string, AuthorReputation>;
};

/** History entry appended to monthly JSONL files. */
export type FcsHistoryRecord = {
  entryId: string;
  timestamp: string;
  score: FcsScore;
  tier: LifecycleTier;
  status: LifecycleStatus;
};

/** A commons entry merged with its FCS data. */
export type CommonsEntryWithFcs = CommonsEntry & {
  fcs?: FcsEntryData;
};
