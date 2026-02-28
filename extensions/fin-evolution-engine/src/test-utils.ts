/**
 * Test utilities — mock data generators validated against Zod schemas.
 * Every mock passes schema.parse() by construction.
 */

import {
  type AuditEntry,
  AuditEntrySchema,
  type ConstitutionVerdict,
  ConstitutionVerdictSchema,
  type DecaySignal,
  DecaySignalSchema,
  type DiagnoseResult,
  DiagnoseResultSchema,
  type DistillResult,
  DistillResultSchema,
  type EvolutionDashboardData,
  EvolutionDashboardDataSchema,
  type EvolutionNode,
  EvolutionNodeSchema,
  type EvolutionSSEEvent,
  EvolutionSSEEventSchema,
  type EvolutionStatsResponse,
  EvolutionStatsResponseSchema,
  type Gene,
  GeneSchema,
  type MutationCandidate,
  MutationCandidateSchema,
  type MutationRiskGateResult,
  MutationRiskGateResultSchema,
  type RdavdCycle,
  RdavdCycleSchema,
  type RegimeContext,
  RegimeContextSchema,
  type SurvivalAssessment,
  SurvivalAssessmentSchema,
  type ValidateResult,
  ValidateResultSchema,
} from "./schemas.ts";

const NOW = "2026-02-28T12:00:00Z";

// ─── Gene ──────────────────────────────────────────────────────────

export function mockGene(overrides?: Partial<Gene>): Gene {
  return GeneSchema.parse({
    id: "gene-rsi-1",
    name: "RSI_Oversold",
    type: "signal",
    params: { period: 14, threshold: 30 },
    direction: 1,
    confidence: 0.8,
    ...overrides,
  });
}

export function mockGenes(count = 3): Gene[] {
  const templates: Partial<Gene>[] = [
    {
      id: "gene-rsi-1",
      name: "RSI_Oversold",
      type: "signal",
      params: { period: 14, threshold: 30 },
      direction: 1,
      confidence: 0.8,
    },
    {
      id: "gene-macd-1",
      name: "MACD_Cross",
      type: "signal",
      params: { fast: 12, slow: 26, signal: 9 },
      direction: 1,
      confidence: 0.7,
    },
    {
      id: "gene-atr-1",
      name: "ATR_Sizing",
      type: "sizing",
      params: { period: 14, multiplier: 1.5 },
      direction: 0,
      confidence: 0.6,
    },
    {
      id: "gene-bb-1",
      name: "BB_Filter",
      type: "filter",
      params: { period: 20, stddev: 2 },
      direction: 0,
      confidence: 0.5,
    },
    {
      id: "gene-trail-1",
      name: "TrailingStop",
      type: "exit",
      params: { atrMultiple: 2.5 },
      direction: 0,
      confidence: 0.9,
    },
  ];
  return templates.slice(0, count).map((t) => mockGene(t));
}

// ─── EvolutionNode ─────────────────────────────────────────────────

export function mockNode(overrides?: Partial<EvolutionNode>): EvolutionNode {
  return EvolutionNodeSchema.parse({
    id: "evo-strat-a-gen0",
    strategyId: "strat-a",
    strategyName: "RSI Momentum Alpha",
    generation: 0,
    parentId: null,
    genes: mockGenes(3),
    fitness: 0.72,
    survivalTier: "healthy",
    level: "L2_PAPER",
    status: "running",
    createdAt: NOW,
    ...overrides,
  });
}

export function mockNodeTree(size = 4): EvolutionNode[] {
  const root = mockNode({
    id: "evo-strat-a-gen0",
    generation: 0,
    parentId: null,
    fitness: 0.5,
    survivalTier: "stressed",
  });
  const gen1 = mockNode({
    id: "evo-strat-a-gen1",
    generation: 1,
    parentId: root.id,
    fitness: 0.62,
    survivalTier: "healthy",
    mutationType: "parameter-tune",
  });
  const gen2 = mockNode({
    id: "evo-strat-a-gen2",
    generation: 2,
    parentId: gen1.id,
    fitness: 0.72,
    survivalTier: "healthy",
    mutationType: "signal-change",
  });
  const gen3 = mockNode({
    id: "evo-strat-a-gen3",
    generation: 3,
    parentId: gen2.id,
    fitness: 0.81,
    survivalTier: "thriving",
    mutationType: "parameter-tune",
    level: "L3_LIVE",
  });
  return [root, gen1, gen2, gen3].slice(0, size);
}

// ─── DecaySignal ───────────────────────────────────────────────────

export function mockDecaySignal(overrides?: Partial<DecaySignal>): DecaySignal {
  return DecaySignalSchema.parse({
    level: "green",
    rollingSharpe30d: 1.2,
    baselineSharpe90d: 1.5,
    sharpeRatio: 0.8,
    consecutiveLossDays: 2,
    detectedAt: NOW,
    ...overrides,
  });
}

// ─── SurvivalAssessment ────────────────────────────────────────────

export function mockSurvivalAssessment(
  overrides?: Partial<SurvivalAssessment>,
): SurvivalAssessment {
  return SurvivalAssessmentSchema.parse({
    currentTier: "healthy",
    previousTier: "healthy",
    currentDrawdown: 0.07,
    shouldEvolve: false,
    urgent: false,
    decaySignal: mockDecaySignal(),
    timestamp: NOW,
    ...overrides,
  });
}

// ─── RegimeContext ──────────────────────────────────────────────────

export function mockRegimeContext(overrides?: Partial<RegimeContext>): RegimeContext {
  return RegimeContextSchema.parse({
    regime: "bull",
    confidence: 0.85,
    indicators: {
      ma50: 68500,
      ma200: 62000,
      atr: 1200,
      atrRatio: 1.1,
      volume: 2500000,
      macdCross: "bullish",
    },
    suggestedMutationType: "parameter-tune",
    detectedAt: NOW,
    ...overrides,
  });
}

// ─── MutationCandidate ─────────────────────────────────────────────

export function mockMutationCandidate(overrides?: Partial<MutationCandidate>): MutationCandidate {
  return MutationCandidateSchema.parse({
    id: "mut-001",
    type: "parameter-tune",
    description: "Adjust RSI threshold from 30 to 25",
    affectedGeneIds: ["gene-rsi-1"],
    estimatedFitnessGain: 0.08,
    riskLevel: "low",
    ...overrides,
  });
}

// ─── MutationRiskGateResult ────────────────────────────────────────

export function mockRiskGateResult(allPassed = true): MutationRiskGateResult {
  return MutationRiskGateResultSchema.parse({
    gates: [
      { name: "MutationBudget", passed: true, reason: "8/10 remaining", value: 8, threshold: 10 },
      {
        name: "ParameterDrift",
        passed: true,
        reason: "drift 0.12 < 0.30",
        value: 0.12,
        threshold: 0.3,
      },
      {
        name: "OverfitDetection",
        passed: true,
        reason: "Sharpe 1.8 < 2.5",
        value: 1.8,
        threshold: 2.5,
      },
      {
        name: "MutationCoherence",
        passed: true,
        reason: "0 consecutive rejects",
        value: 0,
        threshold: 3,
      },
      {
        name: "WalkForwardGate",
        passed: allPassed,
        reason: allPassed ? "degradation 0.15 < 0.30" : "degradation 0.45 > 0.30",
        value: allPassed ? 0.15 : 0.45,
        threshold: 0.3,
      },
    ],
    allPassed,
    failedGate: allPassed ? undefined : "WalkForwardGate",
  });
}

// ─── ConstitutionVerdict ───────────────────────────────────────────

export function mockConstitutionVerdict(passed = true): ConstitutionVerdict {
  return ConstitutionVerdictSchema.parse({
    passed,
    hardViolations: passed
      ? []
      : [{ ruleId: "max_leverage", violation: "Leverage 4.0 exceeds max 3.0" }],
    softWarnings: [],
    checkedAt: NOW,
  });
}

// ─── ValidateResult ────────────────────────────────────────────────

export function mockValidateResult(success = true): ValidateResult {
  return ValidateResultSchema.parse({
    improvement: success ? 0.08 : -0.02,
    backtestSharpe: success ? 1.6 : 0.9,
    maxDrawdown: success ? -0.12 : -0.28,
    winRate: success ? 0.58 : 0.42,
    profitFactor: success ? 1.8 : 0.85,
    walkForwardRatio: 0.78,
    success,
  });
}

// ─── RdavdCycle ────────────────────────────────────────────────────

export function mockRdavdCycle(overrides?: Partial<RdavdCycle>): RdavdCycle {
  return RdavdCycleSchema.parse({
    id: "rdavd-001",
    strategyId: "strat-a",
    trigger: "decay",
    survivalAssessment: mockSurvivalAssessment({
      shouldEvolve: true,
      currentTier: "stressed",
      currentDrawdown: 0.12,
    }),
    regimeContext: mockRegimeContext(),
    outcome: "mutated",
    startedAt: NOW,
    completedAt: "2026-02-28T12:05:00Z",
    ...overrides,
  });
}

// ─── AuditEntry ────────────────────────────────────────────────────

export function mockAuditEntry(overrides?: Partial<AuditEntry>): AuditEntry {
  return AuditEntrySchema.parse({
    id: "audit-001",
    type: "MUTATION",
    strategyId: "strat-a",
    strategyName: "RSI Momentum Alpha",
    detail: "Parameter-tune: RSI threshold 30→25, fitness +0.08",
    triggeredBy: "auto",
    createdAt: NOW,
    ...overrides,
  });
}

export function mockAuditLog(count = 5): AuditEntry[] {
  const types = ["MUTATION", "PROMOTION", "EXTINCTION", "CROSSOVER", "DECAY_ALERT"] as const;
  return types.slice(0, count).map((type, i) =>
    mockAuditEntry({
      id: `audit-${String(i + 1).padStart(3, "0")}`,
      type,
      detail: `${type} event for strat-a`,
      createdAt: `2026-02-28T${String(12 - i).padStart(2, "0")}:00:00Z`,
    }),
  );
}

// ─── SSE Event ─────────────────────────────────────────────────────

export function mockSSEEvent(overrides?: Partial<EvolutionSSEEvent>): EvolutionSSEEvent {
  return EvolutionSSEEventSchema.parse({
    type: "mutation_completed",
    strategyId: "strat-a",
    strategyName: "RSI Momentum Alpha",
    detail: "Parameter-tune completed, fitness 0.72 → 0.80",
    timestamp: NOW,
    ...overrides,
  });
}

// ─── Stats ─────────────────────────────────────────────────────────

export function mockStats(overrides?: Partial<EvolutionStatsResponse>): EvolutionStatsResponse {
  return EvolutionStatsResponseSchema.parse({
    totalStrategies: 16,
    activeStrategies: 12,
    extinctStrategies: 4,
    survivalRate: 0.75,
    avgFitness: 0.65,
    bestFitness: 0.92,
    bestStrategyId: "strat-a",
    bestStrategyName: "RSI Momentum Alpha",
    totalMutations: 42,
    successfulMutations: 28,
    mutationSuccessRate: 0.667,
    currentRegime: "bull",
    byLevel: { L0: 3, L1: 5, L2: 3, L3: 1 },
    bySurvivalTier: { thriving: 2, healthy: 6, stressed: 3, critical: 1, stopped: 0 },
    ...overrides,
  });
}

// ─── DiagnoseResult ────────────────────────────────────────────────

export function mockDiagnoseResult(overrides?: Partial<DiagnoseResult>): DiagnoseResult {
  return DiagnoseResultSchema.parse({
    rootCause: "Strategy showing yellow decay (Sharpe ratio 0.72)",
    confidence: 0.7,
    suggestedMutations: [mockMutationCandidate()],
    historicalContext: "Current fitness: 0.450, tier: stressed",
    ...overrides,
  });
}

// ─── DistillResult ─────────────────────────────────────────────────

export function mockDistillResult(success = true): DistillResult {
  return DistillResultSchema.parse({
    errorPatterns: success
      ? []
      : [
          {
            category: "signal",
            severity: "medium",
            description: "Mutation failed with improvement -2.0%",
            lesson: "Consider less aggressive parameter changes",
          },
        ],
    successPatterns: success
      ? [
          {
            pattern: "Successful bull regime adaptation",
            regime: "bull",
            avgReturn: 0.08,
            occurrences: 1,
          },
        ]
      : [],
    soulUpdates: success
      ? ["Adapted successfully in bull regime with 8.0% improvement"]
      : ["Failed mutation in bear regime — review parameter bounds"],
  });
}

// ─── Dashboard Data ────────────────────────────────────────────────

export function mockDashboardData(
  overrides?: Partial<EvolutionDashboardData>,
): EvolutionDashboardData {
  const nodes = mockNodeTree(4);
  return EvolutionDashboardDataSchema.parse({
    stats: mockStats(),
    tree: {
      nodes,
      edges: [
        { from: nodes[0].id, to: nodes[1].id, type: "mutation" },
        { from: nodes[1].id, to: nodes[2].id, type: "mutation" },
        { from: nodes[2].id, to: nodes[3].id, type: "promotion" },
      ],
    },
    recentAudit: mockAuditLog(5),
    currentRegime: mockRegimeContext(),
    ...overrides,
  });
}
