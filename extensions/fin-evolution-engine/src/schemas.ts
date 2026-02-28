/**
 * fin-evolution-engine — Zod Schema Anchor (Single Source of Truth)
 *
 * Contract-Anchor pattern: ALL types in this extension are derived from
 * these Zod schemas via `z.infer`. No hand-written interfaces.
 *
 * Sections:
 *   1. Shared Enums (compatible with existing fin-* types)
 *   2. Gene Model
 *   3. Evolution Tree
 *   4. Survival & Decay
 *   5. Market Regime
 *   6. Mutation & Risk Gates
 *   7. Constitution
 *   8. RDAVD Cycle
 *   9. Audit Log
 *  10. API Request / Response
 *  11. SSE Events
 *  12. SQLite Row Shapes
 *  13. Dashboard View Models
 */

import { z } from "zod";

// ─── 1. Shared Enums ───────────────────────────────────────────────

/** Strategy lifecycle level — same values as fin-strategy-engine StrategyLevel */
export const StrategyLevelSchema = z.enum([
  "L0_INCUBATE",
  "L1_BACKTEST",
  "L2_PAPER",
  "L3_LIVE",
  "KILLED",
]);
export type StrategyLevel = z.infer<typeof StrategyLevelSchema>;

/** Short form for UI display: "L0" | "L1" | "L2" | "L3" */
export const StrategyLevelShortSchema = z.enum(["L0", "L1", "L2", "L3"]);
export type StrategyLevelShort = z.infer<typeof StrategyLevelShortSchema>;

export const StrategyStatusSchema = z.enum(["running", "paused", "stopped"]);
export type StrategyStatus = z.infer<typeof StrategyStatusSchema>;

/** Market regime — compatible with fin-data-bus MarketRegime + "crash" & "recovery" from design docs */
export const MarketRegimeSchema = z.enum([
  "bull",
  "bear",
  "sideways",
  "volatile",
  "crash",
  "recovery",
]);
export type MarketRegime = z.infer<typeof MarketRegimeSchema>;

// ─── 2. Gene Model ─────────────────────────────────────────────────

/** Gene type: what role this gene plays in the strategy */
export const GeneTypeSchema = z.enum(["signal", "filter", "sizing", "exit"]);
export type GeneType = z.infer<typeof GeneTypeSchema>;

/**
 * Gene — minimal mutable unit of a strategy.
 * Produces {direction, confidence} for the GeneComposer.
 */
export const GeneSchema = z
  .object({
    id: z.string(),
    name: z.string(), // e.g. "RSI_Oversold", "MACD_Cross"
    type: GeneTypeSchema,
    params: z.record(z.string(), z.number()), // e.g. {period: 14, threshold: 30}
    direction: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type Gene = z.infer<typeof GeneSchema>;

/** GeneComposer output — weighted combination of all genes */
export const GeneComposerResultSchema = z
  .object({
    norm: z.number().min(-1).max(1), // normalized weighted sum
    threshold: z.number().default(0.3), // signal activation threshold
    signal: z.enum(["BUY", "SELL", "HOLD"]),
    strength: z.number().min(0).max(1), // |norm| if active
    geneIds: z.array(z.string()), // which genes contributed
    weights: z.record(z.string(), z.number()), // per-gene weight
  })
  .strict();
export type GeneComposerResult = z.infer<typeof GeneComposerResultSchema>;

// ─── 3. Evolution Tree ─────────────────────────────────────────────

/** Survival tier — based on drawdown thresholds */
export const SurvivalTierSchema = z.enum([
  "thriving", // drawdown < 5%
  "healthy", // 5% <= dd < 10%
  "stressed", // 10% <= dd < 15%
  "critical", // 15% <= dd < 20%
  "stopped", // dd >= 20%
]);
export type SurvivalTier = z.infer<typeof SurvivalTierSchema>;

/** Mutation type — ordered by escalation severity */
export const MutationTypeSchema = z.enum([
  "parameter-tune", // lightest: adjust existing params
  "signal-change", // swap/add/remove signal genes
  "risk-adjustment", // change sizing/exit genes
  "architecture-change", // restructure gene composition
]);
export type MutationType = z.infer<typeof MutationTypeSchema>;

/**
 * EvolutionNode — one generation of a strategy in the evolution tree.
 * The tree is a DAG: nodes have parentId (single parent) or
 * crossoverParentIds (two parents for crossover).
 */
export const EvolutionNodeSchema = z
  .object({
    id: z.string(), // "evo-<strategyId>-gen<N>"
    strategyId: z.string(),
    strategyName: z.string(),
    generation: z.number().int().nonnegative(),
    parentId: z.string().nullable(), // null for generation 0
    crossoverParentIds: z.array(z.string()).optional(), // for crossover nodes
    genes: z.array(GeneSchema),
    fitness: z.number(), // time-decayed: paper 50% + recent 35% + long 15%
    survivalTier: SurvivalTierSchema,
    level: StrategyLevelSchema,
    status: StrategyStatusSchema.optional(),
    mutationType: MutationTypeSchema.optional(), // what mutation created this node
    mutationReason: z.string().optional(), // why mutation was triggered
    backtestSharpe: z.number().optional(),
    paperSharpe: z.number().optional(),
    maxDrawdown: z.number().optional(),
    winRate: z.number().optional(),
    totalTrades: z.number().int().optional(),
    createdAt: z.string().datetime(),
    extinctAt: z.string().datetime().optional(),
  })
  .strict();
export type EvolutionNode = z.infer<typeof EvolutionNodeSchema>;

/** Gene diff between two generations */
export const GeneDiffSchema = z
  .object({
    geneId: z.string(),
    geneName: z.string(),
    paramName: z.string(),
    oldValue: z.number(),
    newValue: z.number(),
    changePercent: z.number(), // (new - old) / old * 100
    impact: z.enum(["positive", "negative", "neutral"]),
  })
  .strict();
export type GeneDiff = z.infer<typeof GeneDiffSchema>;

// ─── 4. Survival & Decay ───────────────────────────────────────────

export const DecayLevelSchema = z.enum(["green", "yellow", "red"]);
export type DecayLevel = z.infer<typeof DecayLevelSchema>;

/** Decay signal — measures strategy health degradation */
export const DecaySignalSchema = z
  .object({
    level: DecayLevelSchema,
    rollingSharpe30d: z.number(), // 30-day annualized Sharpe
    baselineSharpe90d: z.number(), // 90-day annualized Sharpe
    sharpeRatio: z.number(), // rolling / baseline
    consecutiveLossDays: z.number().int().nonnegative(),
    detectedAt: z.string().datetime(),
  })
  .strict();
export type DecaySignal = z.infer<typeof DecaySignalSchema>;

/** Survival assessment — full health check output */
export const SurvivalAssessmentSchema = z
  .object({
    currentTier: SurvivalTierSchema,
    previousTier: SurvivalTierSchema,
    currentDrawdown: z.number().min(0).max(1), // decimal 0-1
    shouldEvolve: z.boolean(),
    urgent: z.boolean(), // red decay signal
    decaySignal: DecaySignalSchema,
    timestamp: z.string().datetime(),
  })
  .strict();
export type SurvivalAssessment = z.infer<typeof SurvivalAssessmentSchema>;

// ─── 5. Market Regime ───────────────────────────────────────────────

/** Regime detection context — output of RegimeDetector */
export const RegimeContextSchema = z
  .object({
    regime: MarketRegimeSchema,
    confidence: z.number().min(0).max(1),
    indicators: z
      .object({
        ma50: z.number(),
        ma200: z.number(),
        atr: z.number(),
        atrRatio: z.number(), // current / mean
        volume: z.number(),
        macdCross: z.enum(["bullish", "bearish", "neutral"]),
      })
      .strict(),
    suggestedMutationType: MutationTypeSchema,
    detectedAt: z.string().datetime(),
  })
  .strict();
export type RegimeContext = z.infer<typeof RegimeContextSchema>;

// ─── 6. Mutation & Risk Gates ──────────────────────────────────────

/** Mutation candidate — proposed by Diagnose step in RDAVD */
export const MutationCandidateSchema = z
  .object({
    id: z.string(),
    type: MutationTypeSchema,
    description: z.string(),
    affectedGeneIds: z.array(z.string()),
    estimatedFitnessGain: z.number(),
    riskLevel: z.enum(["low", "medium", "high"]),
  })
  .strict();
export type MutationCandidate = z.infer<typeof MutationCandidateSchema>;

/** Individual gate result in the MutationRiskGate */
export const GateResultSchema = z
  .object({
    name: z.string(), // e.g. "MutationBudget", "ParameterDrift"
    passed: z.boolean(),
    reason: z.string(),
    value: z.number().optional(), // measured value for display
    threshold: z.number().optional(), // limit value for display
  })
  .strict();
export type GateResult = z.infer<typeof GateResultSchema>;

/** Full MutationRiskGate result — 5 safety gates */
export const MutationRiskGateResultSchema = z
  .object({
    gates: z.array(GateResultSchema).length(5),
    allPassed: z.boolean(),
    failedGate: z.string().optional(), // name of first failure
  })
  .strict();
export type MutationRiskGateResult = z.infer<typeof MutationRiskGateResultSchema>;

// ─── 7. Constitution ────────────────────────────────────────────────

export const ConstitutionRuleIdSchema = z.enum([
  "max_leverage",
  "max_position_pct",
  "max_drawdown_halt",
  "min_trade_count",
  "forbidden_assets",
  "max_mutation_frequency",
  "min_sharpe_floor",
  "overfit_detection",
]);
export type ConstitutionRuleId = z.infer<typeof ConstitutionRuleIdSchema>;

export const ConstitutionRuleSchema = z
  .object({
    id: ConstitutionRuleIdSchema,
    name: z.string(),
    severity: z.enum(["hard", "soft"]),
    description: z.string(),
  })
  .strict();
export type ConstitutionRule = z.infer<typeof ConstitutionRuleSchema>;

/** Verdict from Constitution Enforcer */
export const ConstitutionVerdictSchema = z
  .object({
    passed: z.boolean(),
    hardViolations: z.array(
      z
        .object({
          ruleId: ConstitutionRuleIdSchema,
          violation: z.string(),
        })
        .strict(),
    ),
    softWarnings: z.array(
      z
        .object({
          ruleId: ConstitutionRuleIdSchema,
          warning: z.string(),
        })
        .strict(),
    ),
    checkedAt: z.string().datetime(),
  })
  .strict();
export type ConstitutionVerdict = z.infer<typeof ConstitutionVerdictSchema>;

// ─── 8. RDAVD Cycle ────────────────────────────────────────────────

/** Diagnose result — LLM analysis output */
export const DiagnoseResultSchema = z
  .object({
    rootCause: z.string(),
    confidence: z.number().min(0).max(1),
    suggestedMutations: z.array(MutationCandidateSchema),
    historicalContext: z.string(),
  })
  .strict();
export type DiagnoseResult = z.infer<typeof DiagnoseResultSchema>;

/** Validate result — backtest outcome for proposed mutation */
export const ValidateResultSchema = z
  .object({
    improvement: z.number(), // fitness delta (target >= 0.05)
    backtestSharpe: z.number(),
    maxDrawdown: z.number(),
    winRate: z.number(),
    profitFactor: z.number(),
    walkForwardRatio: z.number().optional(), // OOS/IS ratio
    success: z.boolean(), // improvement >= threshold
  })
  .strict();
export type ValidateResult = z.infer<typeof ValidateResultSchema>;

/** Distill result — experience extraction */
export const DistillResultSchema = z
  .object({
    errorPatterns: z.array(
      z
        .object({
          category: z.enum(["timing", "sizing", "risk", "signal", "execution"]),
          severity: z.enum(["low", "medium", "high", "critical"]),
          description: z.string(),
          lesson: z.string(),
        })
        .strict(),
    ),
    successPatterns: z.array(
      z
        .object({
          pattern: z.string(),
          regime: MarketRegimeSchema,
          avgReturn: z.number(),
          occurrences: z.number().int(),
        })
        .strict(),
    ),
    soulUpdates: z.array(z.string()), // new patterns for SOUL.md
  })
  .strict();
export type DistillResult = z.infer<typeof DistillResultSchema>;

/** Full RDAVD cycle record */
export const RdavdCycleSchema = z
  .object({
    id: z.string(),
    strategyId: z.string(),
    trigger: z.enum(["decay", "regime_change", "scheduled", "manual"]),
    survivalAssessment: SurvivalAssessmentSchema,
    regimeContext: RegimeContextSchema.optional(),
    diagnoseResult: DiagnoseResultSchema.optional(),
    selectedMutation: MutationCandidateSchema.optional(),
    riskGateResult: MutationRiskGateResultSchema.optional(),
    validateResult: ValidateResultSchema.optional(),
    distillResult: DistillResultSchema.optional(),
    constitutionVerdict: ConstitutionVerdictSchema.optional(),
    outcome: z.enum(["mutated", "rejected", "no_action", "error"]),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
  })
  .strict();
export type RdavdCycle = z.infer<typeof RdavdCycleSchema>;

// ─── 9. Audit Log ──────────────────────────────────────────────────

export const AuditEntryTypeSchema = z.enum([
  "MUTATION",
  "PROMOTION",
  "DEMOTION",
  "EXTINCTION",
  "CROSSOVER",
  "REGIME_CHANGE",
  "CONSTITUTION_VIOLATION",
  "DECAY_ALERT",
  "MANUAL_ACTION",
]);
export type AuditEntryType = z.infer<typeof AuditEntryTypeSchema>;

export const AuditEntrySchema = z
  .object({
    id: z.string(),
    type: AuditEntryTypeSchema,
    strategyId: z.string(),
    strategyName: z.string().optional(),
    detail: z.string(),
    triggeredBy: z.enum(["auto", "manual", "survival_pressure", "scheduled"]),
    metadata: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

// ─── 10. API Request / Response ────────────────────────────────────

/** GET /api/v1/finance/evolution/stats */
export const EvolutionStatsResponseSchema = z
  .object({
    totalStrategies: z.number().int(),
    activeStrategies: z.number().int(),
    extinctStrategies: z.number().int(),
    survivalRate: z.number(), // active / total
    avgFitness: z.number(),
    bestFitness: z.number(),
    bestStrategyId: z.string().optional(),
    bestStrategyName: z.string().optional(),
    totalMutations: z.number().int(),
    successfulMutations: z.number().int(),
    mutationSuccessRate: z.number(), // successful / total
    currentRegime: MarketRegimeSchema.optional(),
    byLevel: z.record(StrategyLevelShortSchema, z.number().int()),
    bySurvivalTier: z.record(SurvivalTierSchema, z.number().int()),
  })
  .strict();
export type EvolutionStatsResponse = z.infer<typeof EvolutionStatsResponseSchema>;

/** GET /api/v1/finance/evolution/tree */
export const EvolutionTreeResponseSchema = z
  .object({
    nodes: z.array(EvolutionNodeSchema),
    edges: z.array(
      z
        .object({
          from: z.string(), // parent node id
          to: z.string(), // child node id
          type: z.enum(["mutation", "crossover", "promotion", "demotion"]),
        })
        .strict(),
    ),
    stats: EvolutionStatsResponseSchema,
  })
  .strict();
export type EvolutionTreeResponse = z.infer<typeof EvolutionTreeResponseSchema>;

/** GET /api/v1/finance/evolution/strategy/:id */
export const StrategyEvolutionResponseSchema = z
  .object({
    strategyId: z.string(),
    strategyName: z.string(),
    currentNode: EvolutionNodeSchema,
    history: z.array(EvolutionNodeSchema), // all generations, ordered
    recentCycles: z.array(RdavdCycleSchema), // last N RDAVD cycles
    geneDiffs: z.array(GeneDiffSchema), // latest gen vs previous
    auditLog: z.array(AuditEntrySchema),
  })
  .strict();
export type StrategyEvolutionResponse = z.infer<typeof StrategyEvolutionResponseSchema>;

/** POST /api/v1/finance/evolution/mutate */
export const MutateRequestSchema = z
  .object({
    strategyId: z.string(),
    mutationType: MutationTypeSchema.optional(), // auto-select if omitted
    reason: z.string().optional(),
  })
  .strict();
export type MutateRequest = z.infer<typeof MutateRequestSchema>;

export const MutateResponseSchema = z
  .object({
    success: z.boolean(),
    newNodeId: z.string().optional(),
    riskGateResult: MutationRiskGateResultSchema.optional(),
    constitutionVerdict: ConstitutionVerdictSchema.optional(),
    error: z.string().optional(),
  })
  .strict();
export type MutateResponse = z.infer<typeof MutateResponseSchema>;

/** POST /api/v1/finance/evolution/promote */
export const PromoteRequestSchema = z
  .object({
    strategyId: z.string(),
    targetLevel: StrategyLevelSchema,
  })
  .strict();
export type PromoteRequest = z.infer<typeof PromoteRequestSchema>;

/** POST /api/v1/finance/evolution/kill */
export const KillRequestSchema = z
  .object({
    strategyId: z.string(),
    reason: z.string().optional(),
  })
  .strict();
export type KillRequest = z.infer<typeof KillRequestSchema>;

// ─── 11. SSE Events ────────────────────────────────────────────────

export const EvolutionEventTypeSchema = z.enum([
  "mutation_started",
  "mutation_completed",
  "mutation_rejected",
  "promotion",
  "demotion",
  "extinction",
  "crossover",
  "fitness_update",
  "regime_change",
  "decay_alert",
  "constitution_violation",
  "rdavd_cycle_start",
  "rdavd_cycle_end",
]);
export type EvolutionEventType = z.infer<typeof EvolutionEventTypeSchema>;

/** SSE event payload for /api/v1/finance/evolution/stream */
export const EvolutionSSEEventSchema = z
  .object({
    type: EvolutionEventTypeSchema,
    strategyId: z.string().optional(),
    strategyName: z.string().optional(),
    detail: z.string(),
    data: z.record(z.string(), z.unknown()).optional(), // type-specific payload
    timestamp: z.string().datetime(),
  })
  .strict();
export type EvolutionSSEEvent = z.infer<typeof EvolutionSSEEventSchema>;

// ─── 12. SQLite Row Shapes ─────────────────────────────────────────

/** Row shape for `evolution_nodes` table */
export const EvolutionNodeRowSchema = z.object({
  id: z.string(),
  strategy_id: z.string(),
  strategy_name: z.string(),
  generation: z.number().int(),
  parent_id: z.string().nullable(),
  crossover_parent_ids: z.string().nullable(), // JSON array
  genes_json: z.string(), // JSON of Gene[]
  fitness: z.number(),
  survival_tier: z.string(),
  level: z.string(),
  status: z.string().nullable(),
  mutation_type: z.string().nullable(),
  mutation_reason: z.string().nullable(),
  backtest_sharpe: z.number().nullable(),
  paper_sharpe: z.number().nullable(),
  max_drawdown: z.number().nullable(),
  win_rate: z.number().nullable(),
  total_trades: z.number().nullable(),
  created_at: z.string(),
  extinct_at: z.string().nullable(),
});
export type EvolutionNodeRow = z.infer<typeof EvolutionNodeRowSchema>;

/** Row shape for `mutations` table */
export const MutationRowSchema = z.object({
  id: z.string(),
  node_id: z.string(), // FK → evolution_nodes.id
  cycle_id: z.string(), // FK → rdavd_cycles.id
  type: z.string(),
  trigger_reason: z.string(),
  old_genes_json: z.string(),
  new_genes_json: z.string(),
  fitness_before: z.number(),
  fitness_after: z.number().nullable(),
  risk_gate_json: z.string(), // JSON of MutationRiskGateResult
  constitution_json: z.string().nullable(), // JSON of ConstitutionVerdict
  outcome: z.string(), // "mutated" | "rejected" | "error"
  created_at: z.string(),
});
export type MutationRow = z.infer<typeof MutationRowSchema>;

/** Row shape for `audit_log` table */
export const AuditLogRowSchema = z.object({
  id: z.string(),
  type: z.string(),
  strategy_id: z.string(),
  strategy_name: z.string().nullable(),
  detail: z.string(),
  triggered_by: z.string(),
  metadata_json: z.string().nullable(),
  created_at: z.string(),
});
export type AuditLogRow = z.infer<typeof AuditLogRowSchema>;

// ─── 13. Dashboard View Models ─────────────────────────────────────

/** Data injected into evolution-dashboard.html via __EVO_DATA__ placeholder */
export const EvolutionDashboardDataSchema = z
  .object({
    stats: EvolutionStatsResponseSchema,
    tree: z.object({
      nodes: z.array(EvolutionNodeSchema),
      edges: z.array(
        z.object({
          from: z.string(),
          to: z.string(),
          type: z.enum(["mutation", "crossover", "promotion", "demotion"]),
        }),
      ),
    }),
    recentAudit: z.array(AuditEntrySchema),
    currentRegime: RegimeContextSchema.optional(),
  })
  .strict();
export type EvolutionDashboardData = z.infer<typeof EvolutionDashboardDataSchema>;

// ─── Thresholds & Constants ────────────────────────────────────────

/** All tunable thresholds in one place for easy adjustment */
export const THRESHOLDS = {
  /** Survival tier drawdown boundaries */
  tier: {
    thriving: 0.05,
    healthy: 0.1,
    stressed: 0.15,
    critical: 0.2,
  },
  /** Decay detection */
  decay: {
    rollingWindowDays: 30,
    baselineWindowDays: 90,
    yellowRatio: 0.8,
    redRatio: 0.5,
    consecutiveLossYellow: 5,
    consecutiveLossRed: 10,
  },
  /** RDAVD cycle */
  rdavd: {
    improvementThreshold: 0.05,
    retryLimit: 3,
  },
  /** Mutation risk gates */
  mutationGate: {
    maxPerDay: 10,
    maxParamDrift: 0.3,
    minSharpe: 2.5,
    consecutiveRejectLimit: 3,
    maxOosDegradation: 0.3,
  },
  /** Constitution rules */
  constitution: {
    maxLeverage: 3.0,
    maxPositionPct: 0.25,
    maxDrawdownHalt: 0.3,
    minTradeCount: 30,
    minSharpeFloor: -1.0,
    overfitSharpeMin: 3.0,
    overfitStdDevMax: 0.1,
    overfitScenarioCount: 4,
  },
  /** Fitness weights (time-decayed) */
  fitness: {
    paperWeight: 0.5,
    recentWeight: 0.35,
    longTermWeight: 0.15,
  },
  /** Mutation escalation: consecutive rejections before escalating */
  escalation: {
    rejectionsBeforeEscalate: 3,
  },
} as const;
