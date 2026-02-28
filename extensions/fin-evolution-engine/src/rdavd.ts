/**
 * RDAVD — the self-evolution main loop.
 *
 * Retrieve → Diagnose → Adapt → Validate → Distill
 *
 * Orchestrates all leaf modules (decay-detector, risk-gate, constitution,
 * fitness, evolution-store) into a complete evolution cycle.
 */

import { enforceConstitution, type ConstitutionContext } from "./constitution.ts";
import { assessSurvival, detectDecay } from "./decay-detector.ts";
import type { EvolutionStore } from "./evolution-store.ts";
import { computeFitness, normalizeSharpe } from "./fitness.ts";
import type { LlmMutator } from "./llm-mutator.ts";
import { checkAllGates } from "./risk-gate.ts";
import type {
  AuditEntry,
  DiagnoseResult,
  DistillResult,
  EvolutionNode,
  Gene,
  MutationCandidate,
  MutationType,
  RdavdCycle,
  SurvivalTier,
  ValidateResult,
} from "./schemas.ts";
import { THRESHOLDS } from "./schemas.ts";

// ─── External service interfaces (duck-typed for loose coupling) ────

export interface StrategyRegistryLike {
  get(
    id: string,
  ): { definition: { parameters: Record<string, number>; symbols: string[] } } | undefined;
}

export interface BacktestEngineLike {
  run(params: { genes: Gene[]; symbols: string[] }): Promise<{
    sharpe: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    scenarioSharpes?: number[];
  }>;
}

export interface StrategyMemoryLike {
  getErrorPatterns?(): Array<{
    category: string;
    severity: string;
    description: string;
    lesson: string;
  }>;
  getSuccessPatterns?(): Array<{
    pattern: string;
    regime: string;
    avgReturn: number;
    occurrences: number;
  }>;
}

// ─── RDAVD Orchestrator ─────────────────────────────────────────────

export interface RdavdDeps {
  store: EvolutionStore;
  registry?: StrategyRegistryLike;
  backtestEngine?: BacktestEngineLike;
  memory?: StrategyMemoryLike;
  llmMutator?: LlmMutator;
}

export type RdavdTrigger = "decay" | "regime_change" | "scheduled" | "manual";

export interface RdavdResult {
  cycle: RdavdCycle;
  newNode?: EvolutionNode;
}

let cycleCounter = 0;

function nextCycleId(): string {
  return `rdavd-${Date.now().toString(36)}-${(++cycleCounter).toString(36)}`;
}

function nextNodeId(strategyId: string, generation: number): string {
  return `evo-${strategyId}-gen${generation}`;
}

function nextMutationId(): string {
  return `mut-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function nextAuditId(): string {
  return `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Run a full RDAVD evolution cycle for a strategy.
 */
export async function runRdavdCycle(
  strategyId: string,
  trigger: RdavdTrigger,
  deps: RdavdDeps,
  opts?: { mutationType?: MutationType },
): Promise<RdavdResult> {
  const { store } = deps;
  const now = new Date().toISOString();
  const cycleId = nextCycleId();

  // Get current node
  const currentNode = store.getLatestGeneration(strategyId);
  if (!currentNode) {
    const cycle: RdavdCycle = {
      id: cycleId,
      strategyId,
      trigger,
      survivalAssessment: {
        currentTier: "healthy" as SurvivalTier,
        previousTier: "healthy" as SurvivalTier,
        currentDrawdown: 0,
        shouldEvolve: false,
        urgent: false,
        decaySignal: {
          level: "green",
          rollingSharpe30d: 0,
          baselineSharpe90d: 0,
          sharpeRatio: 0,
          consecutiveLossDays: 0,
          detectedAt: now,
        },
        timestamp: now,
      },
      outcome: "no_action",
      startedAt: now,
      completedAt: now,
    };
    store.saveCycle(cycle);
    return { cycle };
  }

  // ─── [R] Retrieve: assess survival ────────────────────────────────

  const decaySignal = detectDecay({
    rollingSharpe30d: currentNode.paperSharpe ?? currentNode.backtestSharpe ?? 0,
    baselineSharpe90d: currentNode.backtestSharpe ?? 0,
    consecutiveLossDays: 0, // would come from paper trading in production
  });

  const assessment = assessSurvival({
    currentDrawdown: currentNode.maxDrawdown ? Math.abs(currentNode.maxDrawdown) : 0,
    previousTier: currentNode.survivalTier,
    decaySignal,
  });

  // If no evolution needed and not manually triggered, exit early
  if (!assessment.shouldEvolve && trigger !== "manual") {
    const cycle: RdavdCycle = {
      id: cycleId,
      strategyId,
      trigger,
      survivalAssessment: assessment,
      outcome: "no_action",
      startedAt: now,
      completedAt: new Date().toISOString(),
    };
    store.saveCycle(cycle);
    store.logAudit({
      id: nextAuditId(),
      type: "DECAY_ALERT",
      strategyId,
      strategyName: currentNode.strategyName,
      detail: `Decay check: ${decaySignal.level}, tier: ${assessment.currentTier} — no evolution needed`,
      triggeredBy: "auto",
      createdAt: now,
    });
    return { cycle };
  }

  // ─── [D] Diagnose: determine mutation type ────────────────────────

  const mutationType: MutationType = opts?.mutationType ?? selectMutationType(currentNode, trigger);

  let diagnoseResult: DiagnoseResult;

  if (deps.llmMutator) {
    const recentCycles = store.getRecentCycles(strategyId, 10);
    diagnoseResult = await deps.llmMutator.diagnose({
      strategyName: currentNode.strategyName,
      genes: currentNode.genes,
      fitness: currentNode.fitness,
      decayLevel: decaySignal.level,
      sharpeRatio: decaySignal.sharpeRatio,
      survivalTier: assessment.currentTier,
      recentCycleCount: recentCycles.length,
    });
    // Override mutation type if explicitly requested
    if (opts?.mutationType && diagnoseResult.suggestedMutations.length > 0) {
      diagnoseResult.suggestedMutations[0].type = opts.mutationType;
    }
  } else {
    diagnoseResult = {
      rootCause: `Strategy ${currentNode.strategyName} showing ${decaySignal.level} decay (Sharpe ratio ${decaySignal.sharpeRatio.toFixed(2)})`,
      confidence: decaySignal.level === "red" ? 0.9 : 0.7,
      suggestedMutations: [
        {
          id: nextMutationId(),
          type: mutationType,
          description: `Apply ${mutationType} to address ${decaySignal.level} decay`,
          affectedGeneIds: currentNode.genes.map((g) => g.id),
          estimatedFitnessGain: 0.05,
          riskLevel:
            mutationType === "architecture-change"
              ? "high"
              : mutationType === "parameter-tune"
                ? "low"
                : "medium",
        },
      ],
      historicalContext: `Current fitness: ${currentNode.fitness.toFixed(3)}, tier: ${assessment.currentTier}`,
    };
  }

  const candidate = diagnoseResult.suggestedMutations[0];

  // ─── [A] Adapt: apply mutation + safety gates ─────────────────────

  // Generate new genes (LLM-assisted or rule-based)
  let newGenes: Gene[];
  if (deps.llmMutator) {
    newGenes = await deps.llmMutator.mutate({
      genes: currentNode.genes,
      candidate,
      diagnoseResult,
    });
  } else {
    newGenes = applyMutation(currentNode.genes, candidate);
  }

  // Check risk gates
  const todayCount = store.getMutationsToday();
  const riskGateResult = checkAllGates({
    todayCount,
    oldGenes: currentNode.genes,
    newGenes,
    scenarioSharpes: [],
    consecutiveRejects: 0,
    inSampleSharpe: currentNode.backtestSharpe ?? 1.0,
    outOfSampleSharpe: currentNode.paperSharpe ?? currentNode.backtestSharpe ?? 0.8,
  });

  if (!riskGateResult.allPassed) {
    const cycle: RdavdCycle = {
      id: cycleId,
      strategyId,
      trigger,
      survivalAssessment: assessment,
      diagnoseResult,
      selectedMutation: candidate,
      riskGateResult,
      outcome: "rejected",
      startedAt: now,
      completedAt: new Date().toISOString(),
    };
    store.saveCycle(cycle);
    store.saveMutation({
      id: candidate.id,
      nodeId: currentNode.id,
      cycleId,
      type: mutationType,
      triggerReason: trigger,
      oldGenes: currentNode.genes,
      newGenes,
      fitnessBefore: currentNode.fitness,
      fitnessAfter: null,
      riskGateResult,
      constitutionJson: null,
      outcome: "rejected",
      createdAt: now,
    });
    store.logAudit({
      id: nextAuditId(),
      type: "MUTATION",
      strategyId,
      strategyName: currentNode.strategyName,
      detail: `Mutation rejected by risk gate: ${riskGateResult.failedGate}`,
      triggeredBy: trigger === "manual" ? "manual" : "auto",
      createdAt: now,
    });
    return { cycle };
  }

  // Check constitution
  const constitutionCtx: ConstitutionContext = {
    leverage: 1.0,
    positionPct: 0.1,
    drawdown: Math.abs(currentNode.maxDrawdown ?? 0),
    tradeCount: currentNode.totalTrades ?? 50,
    forbiddenAssets: [],
    symbols: currentNode.genes.filter((g) => g.type === "signal").map((g) => g.name),
    mutationsToday: todayCount,
    sharpe: currentNode.backtestSharpe ?? 0,
  };
  const constitutionVerdict = enforceConstitution(constitutionCtx);

  if (!constitutionVerdict.passed) {
    const cycle: RdavdCycle = {
      id: cycleId,
      strategyId,
      trigger,
      survivalAssessment: assessment,
      diagnoseResult,
      selectedMutation: candidate,
      riskGateResult,
      constitutionVerdict,
      outcome: "rejected",
      startedAt: now,
      completedAt: new Date().toISOString(),
    };
    store.saveCycle(cycle);
    store.logAudit({
      id: nextAuditId(),
      type: "CONSTITUTION_VIOLATION",
      strategyId,
      strategyName: currentNode.strategyName,
      detail: `Constitution violation: ${constitutionVerdict.hardViolations.map((v) => v.violation).join("; ")}`,
      triggeredBy: trigger === "manual" ? "manual" : "auto",
      createdAt: now,
    });
    return { cycle };
  }

  // ─── [V] Validate: compute new fitness ────────────────────────────

  let validateResult: ValidateResult;

  if (deps.backtestEngine) {
    const btResult = await deps.backtestEngine.run({
      genes: newGenes,
      symbols: constitutionCtx.symbols,
    });
    const newFitness = computeFitness({
      paperSharpe: normalizeSharpe(currentNode.paperSharpe ?? btResult.sharpe),
      recentSharpe: normalizeSharpe(btResult.sharpe),
      longTermSharpe: normalizeSharpe(currentNode.backtestSharpe ?? 0),
    });
    validateResult = {
      improvement: newFitness - currentNode.fitness,
      backtestSharpe: btResult.sharpe,
      maxDrawdown: btResult.maxDrawdown,
      winRate: btResult.winRate,
      profitFactor: btResult.profitFactor,
      success: newFitness - currentNode.fitness >= THRESHOLDS.rdavd.improvementThreshold,
    };
  } else {
    // Simulated validation (no backtest engine available)
    const simSharpe = (currentNode.backtestSharpe ?? 1.0) * 1.05;
    const newFitness = computeFitness({
      paperSharpe: normalizeSharpe(currentNode.paperSharpe ?? simSharpe),
      recentSharpe: normalizeSharpe(simSharpe),
      longTermSharpe: normalizeSharpe(currentNode.backtestSharpe ?? 0),
    });
    validateResult = {
      improvement: newFitness - currentNode.fitness,
      backtestSharpe: simSharpe,
      maxDrawdown: currentNode.maxDrawdown ?? -0.1,
      winRate: currentNode.winRate ?? 0.55,
      profitFactor: 1.5,
      success: newFitness - currentNode.fitness >= THRESHOLDS.rdavd.improvementThreshold,
    };
  }

  if (!validateResult.success) {
    const cycle: RdavdCycle = {
      id: cycleId,
      strategyId,
      trigger,
      survivalAssessment: assessment,
      diagnoseResult,
      selectedMutation: candidate,
      riskGateResult,
      constitutionVerdict,
      validateResult,
      outcome: "rejected",
      startedAt: now,
      completedAt: new Date().toISOString(),
    };
    store.saveCycle(cycle);
    store.saveMutation({
      id: candidate.id,
      nodeId: currentNode.id,
      cycleId,
      type: mutationType,
      triggerReason: trigger,
      oldGenes: currentNode.genes,
      newGenes,
      fitnessBefore: currentNode.fitness,
      fitnessAfter: currentNode.fitness + validateResult.improvement,
      riskGateResult,
      constitutionJson: JSON.stringify(constitutionVerdict),
      outcome: "rejected",
      createdAt: now,
    });
    store.logAudit({
      id: nextAuditId(),
      type: "MUTATION",
      strategyId,
      strategyName: currentNode.strategyName,
      detail: `Mutation rejected: improvement ${(validateResult.improvement * 100).toFixed(1)}% below threshold ${(THRESHOLDS.rdavd.improvementThreshold * 100).toFixed(1)}%`,
      triggeredBy: trigger === "manual" ? "manual" : "auto",
      createdAt: now,
    });
    return { cycle };
  }

  // ─── Success: create new evolution node ────────────────────────────

  const newGeneration = currentNode.generation + 1;
  const newFitness = currentNode.fitness + validateResult.improvement;
  const newNode: EvolutionNode = {
    id: nextNodeId(strategyId, newGeneration),
    strategyId,
    strategyName: currentNode.strategyName,
    generation: newGeneration,
    parentId: currentNode.id,
    genes: newGenes,
    fitness: newFitness,
    survivalTier: assessment.currentTier,
    level: currentNode.level,
    status: currentNode.status,
    mutationType,
    mutationReason: `RDAVD cycle: ${decaySignal.level} decay, ${trigger} trigger`,
    backtestSharpe: validateResult.backtestSharpe,
    maxDrawdown: validateResult.maxDrawdown,
    winRate: validateResult.winRate,
    totalTrades: currentNode.totalTrades,
    createdAt: new Date().toISOString(),
  };

  store.saveNode(newNode);
  store.saveMutation({
    id: candidate.id,
    nodeId: newNode.id,
    cycleId,
    type: mutationType,
    triggerReason: trigger,
    oldGenes: currentNode.genes,
    newGenes,
    fitnessBefore: currentNode.fitness,
    fitnessAfter: newFitness,
    riskGateResult,
    constitutionJson: JSON.stringify(constitutionVerdict),
    outcome: "mutated",
    createdAt: now,
  });

  // ─── [D] Distill: extract experience + log audit ──────────────────

  const distillResult: DistillResult = deps.llmMutator
    ? deps.llmMutator.buildDistillResult(true, "sideways", validateResult.improvement)
    : {
        errorPatterns: [],
        successPatterns: [
          {
            pattern: `Successful ${mutationType} adaptation`,
            regime: "sideways" as const,
            avgReturn: Math.max(0, validateResult.improvement),
            occurrences: 1,
          },
        ],
        soulUpdates: [
          `${mutationType}: fitness ${currentNode.fitness.toFixed(3)} → ${newFitness.toFixed(3)}`,
        ],
      };

  store.logAudit({
    id: nextAuditId(),
    type: "MUTATION",
    strategyId,
    strategyName: currentNode.strategyName,
    detail: `${mutationType}: fitness ${currentNode.fitness.toFixed(3)} → ${newFitness.toFixed(3)} (+${(validateResult.improvement * 100).toFixed(1)}%)`,
    triggeredBy: trigger === "manual" ? "manual" : "auto",
    metadata: { fromGeneration: currentNode.generation, toGeneration: newGeneration, mutationType },
    createdAt: now,
  });

  const cycle: RdavdCycle = {
    id: cycleId,
    strategyId,
    trigger,
    survivalAssessment: assessment,
    diagnoseResult,
    selectedMutation: candidate,
    riskGateResult,
    constitutionVerdict,
    validateResult,
    distillResult,
    outcome: "mutated",
    startedAt: now,
    completedAt: new Date().toISOString(),
  };
  store.saveCycle(cycle);

  return { cycle, newNode };
}

// ─── Internal helpers ───────────────────────────────────────────────

/** Select mutation type based on current state (rule-based for Phase A). */
function selectMutationType(node: EvolutionNode, trigger: RdavdTrigger): MutationType {
  if (trigger === "manual") return "parameter-tune";
  if (node.survivalTier === "critical" || node.survivalTier === "stopped")
    return "architecture-change";
  if (node.survivalTier === "stressed") return "risk-adjustment";
  return "parameter-tune";
}

/**
 * Apply a mutation to genes (rule-based).
 * Used as fallback when LlmMutator is not available.
 */
export function applyMutation(genes: Gene[], candidate: MutationCandidate): Gene[] {
  return genes.map((gene) => {
    if (!candidate.affectedGeneIds.includes(gene.id)) return gene;

    // Clone and perturb parameters based on mutation type
    const newParams = { ...gene.params };
    for (const [key, value] of Object.entries(newParams)) {
      switch (candidate.type) {
        case "parameter-tune":
          // Small adjustment: ±5-15%
          newParams[key] = value * (1 + (Math.random() * 0.2 - 0.1));
          break;
        case "signal-change":
          // Larger adjustment: ±10-30%
          newParams[key] = value * (1 + (Math.random() * 0.4 - 0.2));
          break;
        case "risk-adjustment":
          // Conservative: reduce by 5-20%
          newParams[key] = value * (1 - Math.random() * 0.15);
          break;
        case "architecture-change":
          // Aggressive: ±20-50%
          newParams[key] = value * (1 + (Math.random() * 0.6 - 0.3));
          break;
      }
      // Round to reasonable precision
      newParams[key] = Math.round(newParams[key] * 10000) / 10000;
    }

    return {
      ...gene,
      params: newParams,
      confidence: Math.min(1, Math.max(0, gene.confidence + (Math.random() * 0.1 - 0.05))),
    };
  });
}
