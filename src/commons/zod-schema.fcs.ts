/**
 * Zod validation schemas for FCS (FinClaw Commons Score) types.
 *
 * Mirrors types.fcs.ts with runtime validation, range constraints,
 * and strict object shapes.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Metrics schemas
// ---------------------------------------------------------------------------

export const BacktestResultSchema = z
  .object({
    period: z.string(),
    sharpeRatio: z.number(),
    maxDrawdownPct: z.number().min(0).max(100),
    totalReturnPct: z.number(),
    winRatePct: z.number().min(0).max(100),
    tradeCount: z.number().int().nonnegative(),
    verifiedAt: z.string().optional(),
    verifiedBy: z.string().optional(),
  })
  .strict();

export const ConnectorHealthSchema = z
  .object({
    uptimePct: z.number().min(0).max(100),
    avgLatencyMs: z.number().nonnegative(),
    lastCheckedAt: z.string(),
    errorRate: z.number().min(0).max(1),
  })
  .strict();

export const UsageMetricsSchema = z
  .object({
    installCount: z.number().int().nonnegative(),
    activeInstalls30d: z.number().int().nonnegative(),
    invocationCount30d: z.number().int().nonnegative(),
    lastUsedAt: z.string().optional(),
  })
  .strict();

export const SocialMetricsSchema = z
  .object({
    starCount: z.number().int().nonnegative(),
    forkCount: z.number().int().nonnegative(),
    reviewCount: z.number().int().nonnegative(),
    averageRating: z.number().min(0).max(5),
  })
  .strict();

export const QualityMetricsSchema = z
  .object({
    hasTests: z.boolean(),
    hasDocumentation: z.boolean(),
    hasCIPassedRecently: z.boolean(),
    lintScore: z.number().min(0).max(100),
    typeCheckPasses: z.boolean(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Lifecycle schemas
// ---------------------------------------------------------------------------

export const LifecycleTierSchema = z.union([
  z.literal("seedling"),
  z.literal("growing"),
  z.literal("established"),
]);

export const LifecycleStatusSchema = z.union([
  z.literal("active"),
  z.literal("degrading"),
  z.literal("archived"),
  z.literal("delisted"),
]);

export const TierHistoryEntrySchema = z
  .object({
    tier: LifecycleTierSchema,
    status: LifecycleStatusSchema,
    changedAt: z.string(),
    reason: z.string().optional(),
  })
  .strict();

export const LifecycleStateSchema = z
  .object({
    tier: LifecycleTierSchema,
    status: LifecycleStatusSchema,
    promotedAt: z.string().optional(),
    degradedAt: z.string().optional(),
    archivedAt: z.string().optional(),
    delistReason: z.string().optional(),
    tierHistory: z.array(TierHistoryEntrySchema),
  })
  .strict();

// ---------------------------------------------------------------------------
// FCS Score schemas
// ---------------------------------------------------------------------------

export const FcsBreakdownSchema = z
  .object({
    quality: z.number().min(0).max(100),
    usage: z.number().min(0).max(100),
    social: z.number().min(0).max(100),
    freshness: z.number().min(0).max(100),
  })
  .strict();

export const FcsScoreSchema = z
  .object({
    total: z.number().min(0).max(100),
    breakdown: FcsBreakdownSchema,
    calculatedAt: z.string(),
    decayApplied: z.number().min(0).max(1),
  })
  .strict();

// ---------------------------------------------------------------------------
// Author Reputation schema
// ---------------------------------------------------------------------------

export const AuthorReputationSchema = z
  .object({
    authorId: z.string(),
    totalEntries: z.number().int().nonnegative(),
    averageFcs: z.number().min(0).max(100),
    establishedCount: z.number().int().nonnegative(),
    memberSince: z.string(),
    verified: z.boolean(),
  })
  .strict();

// ---------------------------------------------------------------------------
// FCS Configuration schemas
// ---------------------------------------------------------------------------

export const FcsWeightsSchema = z
  .object({
    quality: z.number().min(0).max(1),
    usage: z.number().min(0).max(1),
    social: z.number().min(0).max(1),
    freshness: z.number().min(0).max(1),
  })
  .strict();

export const FcsTypeOverrideSchema = FcsWeightsSchema.extend({
  backtestSharpeFloor: z.number().optional(),
  backtestDrawdownCeiling: z.number().min(0).max(100).optional(),
  uptimeFloor: z.number().min(0).max(100).optional(),
  latencyCeiling: z.number().nonnegative().optional(),
}).strict();

export const AntiGamingConfigSchema = z
  .object({
    maxDailyScoreChange: z.number().positive(),
    installVelocityCap: z.number().int().positive(),
    minUniqueInstallers: z.number().int().nonnegative(),
  })
  .strict();

export const LifecycleThresholdsSchema = z
  .object({
    seedlingToGrowingThreshold: z.number().min(0).max(100),
    growingToEstablishedThreshold: z.number().min(0).max(100),
    degradationThreshold: z.number().min(0).max(100),
    archivalGracePeriodDays: z.number().int().positive(),
  })
  .strict();

export const FcsConfigSchema = z
  .object({
    version: z.number().int().positive(),
    weights: FcsWeightsSchema,
    typeOverrides: z.record(z.string(), FcsTypeOverrideSchema).optional(),
    decayHalfLifeDays: z.number().int().positive(),
    antiGaming: AntiGamingConfigSchema,
    lifecycle: LifecycleThresholdsSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Storage / Composite schemas
// ---------------------------------------------------------------------------

export const FcsEntryDataSchema = z
  .object({
    entryId: z.string(),
    score: FcsScoreSchema,
    lifecycle: LifecycleStateSchema,
    usage: UsageMetricsSchema.optional(),
    social: SocialMetricsSchema.optional(),
    quality: QualityMetricsSchema.optional(),
    backtest: BacktestResultSchema.optional(),
    connectorHealth: ConnectorHealthSchema.optional(),
  })
  .strict();

export const FcsScoresFileSchema = z
  .object({
    version: z.literal(1),
    updatedAt: z.string(),
    entries: z.record(z.string(), FcsEntryDataSchema),
  })
  .strict();

export const FcsAuthorsFileSchema = z
  .object({
    version: z.literal(1),
    updatedAt: z.string(),
    authors: z.record(z.string(), AuthorReputationSchema),
  })
  .strict();

export const FcsHistoryRecordSchema = z
  .object({
    entryId: z.string(),
    timestamp: z.string(),
    score: FcsScoreSchema,
    tier: LifecycleTierSchema,
    status: LifecycleStatusSchema,
  })
  .strict();
