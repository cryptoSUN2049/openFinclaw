import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EvolutionStore } from "./evolution-store.ts";
import { runRdavdCycle, type BacktestEngineLike, type RdavdDeps } from "./rdavd.ts";
import { THRESHOLDS } from "./schemas.ts";
import { mockGene, mockNode, mockRiskGateResult } from "./test-utils.ts";

let store: EvolutionStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "rdavd-test-"));
  store = new EvolutionStore(join(tmpDir, "test-rdavd.sqlite"));
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeDeps(overrides?: Partial<RdavdDeps>): RdavdDeps {
  return { store, ...overrides };
}

// Single-gene with 1 param keeps cumulative parameter drift well within the 0.3
// threshold regardless of mutation type (parameter-tune max 0.1, architecture-change max 0.3).
const SAFE_GENES = [mockGene({ params: { period: 14 } })];

// Backtest engine that returns high Sharpe → guarantees validation passes
const goodEngine: BacktestEngineLike = {
  run: async () => ({
    sharpe: 2.5,
    maxDrawdown: -0.08,
    winRate: 0.62,
    profitFactor: 2.1,
  }),
};

// ─── No existing node ───────────────────────────────────────────────

describe("RDAVD — no existing node", () => {
  it("returns no_action when strategy has no nodes", async () => {
    const result = await runRdavdCycle("nonexistent", "decay", makeDeps());
    expect(result.cycle.outcome).toBe("no_action");
    expect(result.newNode).toBeUndefined();
    const cycles = store.getRecentCycles("nonexistent", 5);
    expect(cycles).toHaveLength(1);
  });
});

// ─── Green decay (no evolution needed) ──────────────────────────────

describe("RDAVD — green decay", () => {
  it("returns no_action when decay is green and trigger is not manual", async () => {
    const node = mockNode({
      id: "evo-green-gen0",
      strategyId: "green-strat",
      genes: SAFE_GENES,
      fitness: 0.72,
      backtestSharpe: 1.5,
      paperSharpe: 1.5, // ratio 1.0 → green
      maxDrawdown: -0.04,
      survivalTier: "thriving",
    });
    store.saveNode(node);

    const result = await runRdavdCycle("green-strat", "decay", makeDeps());
    expect(result.cycle.outcome).toBe("no_action");
    expect(result.newNode).toBeUndefined();
  });

  it("logs DECAY_ALERT audit entry on no_action", async () => {
    const node = mockNode({
      id: "evo-green2-gen0",
      strategyId: "green-strat2",
      genes: SAFE_GENES,
      fitness: 0.8,
      backtestSharpe: 2.0,
      paperSharpe: 2.0,
      maxDrawdown: -0.03,
      survivalTier: "thriving",
    });
    store.saveNode(node);

    await runRdavdCycle("green-strat2", "scheduled", makeDeps());
    const audit = store.getAuditLog({ strategyId: "green-strat2" });
    expect(audit).toHaveLength(1);
    expect(audit[0].type).toBe("DECAY_ALERT");
    expect(audit[0].detail).toContain("no evolution needed");
  });
});

// ─── Manual trigger ─────────────────────────────────────────────────

describe("RDAVD — manual trigger", () => {
  it("forces evolution even with green decay", async () => {
    const node = mockNode({
      id: "evo-manual-gen0",
      strategyId: "manual-strat",
      genes: SAFE_GENES,
      fitness: 0.2,
      backtestSharpe: 1.5,
      paperSharpe: 1.5,
      maxDrawdown: -0.05,
      survivalTier: "thriving",
      totalTrades: 50,
    });
    store.saveNode(node);

    const result = await runRdavdCycle(
      "manual-strat",
      "manual",
      makeDeps({ backtestEngine: goodEngine }),
    );
    expect(result.cycle.outcome).toBe("mutated");
    expect(result.cycle.trigger).toBe("manual");
    expect(result.newNode).toBeDefined();
    expect(result.newNode!.mutationType).toBe("parameter-tune");
  });
});

// ─── Risk gate rejection ────────────────────────────────────────────

describe("RDAVD — risk gate rejection", () => {
  it("rejects when daily mutation budget is exhausted", async () => {
    const node = mockNode({
      id: "evo-budget-gen0",
      strategyId: "budget-strat",
      genes: SAFE_GENES,
      fitness: 0.3,
      backtestSharpe: 1.5,
      paperSharpe: 1.1, // ratio 0.73 → yellow → shouldEvolve
      maxDrawdown: -0.12,
      survivalTier: "stressed",
    });
    store.saveNode(node);

    // Exhaust daily mutation budget
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < THRESHOLDS.mutationGate.maxPerDay; i++) {
      store.saveMutation({
        id: `budget-mut-${i}`,
        nodeId: node.id,
        cycleId: `budget-cycle-${i}`,
        type: "parameter-tune",
        triggerReason: "test",
        oldGenes: [],
        newGenes: [],
        fitnessBefore: 0.3,
        fitnessAfter: 0.35,
        riskGateResult: mockRiskGateResult(true),
        constitutionJson: null,
        outcome: "mutated",
        createdAt: `${today}T${String(i).padStart(2, "0")}:00:00Z`,
      });
    }

    const result = await runRdavdCycle("budget-strat", "decay", makeDeps());
    expect(result.cycle.outcome).toBe("rejected");
    expect(result.newNode).toBeUndefined();
    expect(result.cycle.riskGateResult).toBeDefined();
    expect(result.cycle.riskGateResult!.allPassed).toBe(false);
    expect(result.cycle.riskGateResult!.failedGate).toBe("MutationBudget");
  });
});

// ─── Constitution rejection ─────────────────────────────────────────

describe("RDAVD — constitution rejection", () => {
  it("rejects when max drawdown halt is violated", async () => {
    const node = mockNode({
      id: "evo-const-gen0",
      strategyId: "const-strat",
      genes: SAFE_GENES,
      fitness: 0.2,
      backtestSharpe: 1.5,
      paperSharpe: 1.5, // green decay, manual forces cycle
      maxDrawdown: -0.35, // 35% → exceeds 30% halt threshold
      survivalTier: "critical",
      totalTrades: 50,
    });
    store.saveNode(node);

    // Manual trigger bypasses shouldEvolve check; constitution catches the violation
    const result = await runRdavdCycle("const-strat", "manual", makeDeps());
    expect(result.cycle.outcome).toBe("rejected");
    expect(result.newNode).toBeUndefined();

    const audit = store.getAuditLog({ strategyId: "const-strat", type: "CONSTITUTION_VIOLATION" });
    expect(audit).toHaveLength(1);
    expect(audit[0].detail).toContain("Constitution violation");
  });
});

// ─── Validation rejection ───────────────────────────────────────────

describe("RDAVD — validation rejection", () => {
  it("rejects when fitness improvement is below threshold", async () => {
    const node = mockNode({
      id: "evo-valid-gen0",
      strategyId: "valid-strat",
      genes: SAFE_GENES,
      fitness: 0.9, // very high → simulated can't improve
      backtestSharpe: 1.0,
      paperSharpe: 0.75, // ratio 0.75 → yellow → shouldEvolve
      maxDrawdown: -0.08,
      survivalTier: "healthy",
      totalTrades: 50,
    });
    store.saveNode(node);

    const result = await runRdavdCycle("valid-strat", "decay", makeDeps());
    expect(result.cycle.outcome).toBe("rejected");
    expect(result.newNode).toBeUndefined();
    expect(result.cycle.validateResult).toBeDefined();
    expect(result.cycle.validateResult!.success).toBe(false);
    expect(result.cycle.validateResult!.improvement).toBeLessThan(
      THRESHOLDS.rdavd.improvementThreshold,
    );
  });
});

// ─── Full success path ──────────────────────────────────────────────

describe("RDAVD — full success", () => {
  it("creates new node with higher fitness (backtest engine)", async () => {
    const node = mockNode({
      id: "evo-succ-gen0",
      strategyId: "succ-strat",
      genes: SAFE_GENES,
      fitness: 0.3,
      backtestSharpe: 1.5,
      paperSharpe: 1.1,
      maxDrawdown: -0.12,
      survivalTier: "stressed",
      totalTrades: 50,
    });
    store.saveNode(node);

    const result = await runRdavdCycle(
      "succ-strat",
      "decay",
      makeDeps({ backtestEngine: goodEngine }),
    );
    expect(result.cycle.outcome).toBe("mutated");
    expect(result.newNode).toBeDefined();
    expect(result.newNode!.generation).toBe(1);
    expect(result.newNode!.parentId).toBe(node.id);
    expect(result.newNode!.strategyId).toBe("succ-strat");
    expect(result.newNode!.fitness).toBeGreaterThan(node.fitness);
  });

  it("creates new node with simulated validation (no engine)", async () => {
    const node = mockNode({
      id: "evo-sim-gen0",
      strategyId: "sim-strat",
      genes: SAFE_GENES,
      fitness: 0.2,
      backtestSharpe: 1.5,
      paperSharpe: 1.1,
      maxDrawdown: -0.12,
      survivalTier: "stressed",
      totalTrades: 50,
    });
    store.saveNode(node);

    const result = await runRdavdCycle("sim-strat", "decay", makeDeps());
    expect(result.cycle.outcome).toBe("mutated");
    expect(result.newNode).toBeDefined();
    expect(result.newNode!.fitness).toBeGreaterThan(node.fitness);
  });

  it("persists new node in store", async () => {
    const node = mockNode({
      id: "evo-persist-gen0",
      strategyId: "persist-strat",
      genes: SAFE_GENES,
      fitness: 0.3,
      backtestSharpe: 1.5,
      paperSharpe: 1.1,
      maxDrawdown: -0.12,
      survivalTier: "stressed",
      totalTrades: 50,
    });
    store.saveNode(node);

    const result = await runRdavdCycle(
      "persist-strat",
      "decay",
      makeDeps({ backtestEngine: goodEngine }),
    );
    const saved = store.getNode(result.newNode!.id);
    expect(saved).toBeDefined();
    expect(saved!.generation).toBe(1);
    expect(saved!.parentId).toBe(node.id);
  });

  it("saves mutation record with correct outcome", async () => {
    const node = mockNode({
      id: "evo-mutrec-gen0",
      strategyId: "mutrec-strat",
      genes: SAFE_GENES,
      fitness: 0.3,
      backtestSharpe: 1.5,
      paperSharpe: 1.1,
      maxDrawdown: -0.12,
      survivalTier: "stressed",
      totalTrades: 50,
    });
    store.saveNode(node);

    const result = await runRdavdCycle(
      "mutrec-strat",
      "decay",
      makeDeps({ backtestEngine: goodEngine }),
    );
    const mutations = store.getMutationsByNode(result.newNode!.id);
    expect(mutations).toHaveLength(1);
    expect(mutations[0].outcome).toBe("mutated");
  });

  it("logs MUTATION audit with fitness details", async () => {
    const node = mockNode({
      id: "evo-audit-gen0",
      strategyId: "audit-strat",
      genes: SAFE_GENES,
      fitness: 0.3,
      backtestSharpe: 1.5,
      paperSharpe: 1.1,
      maxDrawdown: -0.12,
      survivalTier: "stressed",
      totalTrades: 50,
    });
    store.saveNode(node);

    await runRdavdCycle("audit-strat", "decay", makeDeps({ backtestEngine: goodEngine }));
    const audit = store.getAuditLog({ strategyId: "audit-strat", type: "MUTATION" });
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect(audit[0].detail).toContain("fitness");
    expect(audit[0].metadata).toBeDefined();
    expect(audit[0].metadata!.mutationType).toBe("risk-adjustment");
  });

  it("saves RDAVD cycle record", async () => {
    const node = mockNode({
      id: "evo-cyc-gen0",
      strategyId: "cyc-strat",
      genes: SAFE_GENES,
      fitness: 0.3,
      backtestSharpe: 1.5,
      paperSharpe: 1.1,
      maxDrawdown: -0.12,
      survivalTier: "stressed",
      totalTrades: 50,
    });
    store.saveNode(node);

    await runRdavdCycle("cyc-strat", "decay", makeDeps({ backtestEngine: goodEngine }));
    const cycles = store.getRecentCycles("cyc-strat", 5);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].outcome).toBe("mutated");
  });

  it("sets backtestSharpe from engine result on new node", async () => {
    const node = mockNode({
      id: "evo-btres-gen0",
      strategyId: "btres-strat",
      genes: SAFE_GENES,
      fitness: 0.3,
      backtestSharpe: 1.5,
      paperSharpe: 1.1,
      maxDrawdown: -0.12,
      survivalTier: "stressed",
      totalTrades: 50,
    });
    store.saveNode(node);

    const result = await runRdavdCycle(
      "btres-strat",
      "decay",
      makeDeps({ backtestEngine: goodEngine }),
    );
    expect(result.newNode!.backtestSharpe).toBe(2.5);
    expect(result.newNode!.maxDrawdown).toBe(-0.08);
    expect(result.newNode!.winRate).toBe(0.62);
  });
});

// ─── Mutation type selection ────────────────────────────────────────

describe("RDAVD — mutation type selection", () => {
  it("uses risk-adjustment for stressed tier", async () => {
    const node = mockNode({
      id: "evo-mt-stressed-gen0",
      strategyId: "mt-stressed",
      genes: SAFE_GENES,
      fitness: 0.2,
      backtestSharpe: 1.5,
      paperSharpe: 1.1,
      maxDrawdown: -0.12,
      survivalTier: "stressed",
      totalTrades: 50,
    });
    store.saveNode(node);

    const result = await runRdavdCycle(
      "mt-stressed",
      "decay",
      makeDeps({ backtestEngine: goodEngine }),
    );
    expect(result.newNode!.mutationType).toBe("risk-adjustment");
  });

  it("uses architecture-change for critical tier", async () => {
    const node = mockNode({
      id: "evo-mt-critical-gen0",
      strategyId: "mt-critical",
      genes: SAFE_GENES,
      fitness: 0.15,
      backtestSharpe: 1.5,
      paperSharpe: 1.1,
      maxDrawdown: -0.18, // 18% → critical tier
      survivalTier: "critical",
      totalTrades: 50,
    });
    store.saveNode(node);

    const result = await runRdavdCycle(
      "mt-critical",
      "decay",
      makeDeps({ backtestEngine: goodEngine }),
    );
    expect(result.newNode!.mutationType).toBe("architecture-change");
  });

  it("uses parameter-tune for manual trigger regardless of tier", async () => {
    const node = mockNode({
      id: "evo-mt-manual-gen0",
      strategyId: "mt-manual",
      genes: SAFE_GENES,
      fitness: 0.2,
      backtestSharpe: 1.5,
      paperSharpe: 1.5,
      maxDrawdown: -0.05,
      survivalTier: "thriving",
      totalTrades: 50,
    });
    store.saveNode(node);

    const result = await runRdavdCycle(
      "mt-manual",
      "manual",
      makeDeps({ backtestEngine: goodEngine }),
    );
    expect(result.newNode!.mutationType).toBe("parameter-tune");
  });

  it("uses explicit mutationType from opts", async () => {
    const node = mockNode({
      id: "evo-mt-override-gen0",
      strategyId: "mt-override",
      genes: SAFE_GENES,
      fitness: 0.2,
      backtestSharpe: 1.5,
      paperSharpe: 1.1,
      maxDrawdown: -0.12,
      survivalTier: "stressed",
      totalTrades: 50,
    });
    store.saveNode(node);

    const result = await runRdavdCycle(
      "mt-override",
      "decay",
      makeDeps({ backtestEngine: goodEngine }),
      { mutationType: "signal-change" },
    );
    expect(result.newNode!.mutationType).toBe("signal-change");
  });
});

// ─── Multi-generation evolution ─────────────────────────────────────

describe("RDAVD — multi-generation", () => {
  it("builds evolution tree across consecutive cycles", async () => {
    const node = mockNode({
      id: "evo-multi-gen0",
      strategyId: "multi-strat",
      genes: SAFE_GENES,
      fitness: 0.2,
      backtestSharpe: 1.5,
      paperSharpe: 1.1,
      maxDrawdown: -0.12,
      survivalTier: "stressed",
      totalTrades: 50,
    });
    store.saveNode(node);

    // First cycle (decay trigger, stressed → risk-adjustment)
    const r1 = await runRdavdCycle(
      "multi-strat",
      "decay",
      makeDeps({ backtestEngine: goodEngine }),
    );
    expect(r1.cycle.outcome).toBe("mutated");
    expect(r1.newNode!.generation).toBe(1);

    // Second cycle (manual trigger, to force evolution even if now green)
    const r2 = await runRdavdCycle(
      "multi-strat",
      "manual",
      makeDeps({ backtestEngine: goodEngine }),
    );
    expect(r2.cycle.outcome).toBe("mutated");
    expect(r2.newNode!.generation).toBe(2);
    expect(r2.newNode!.parentId).toBe(r1.newNode!.id);

    // Verify full tree in store
    const allNodes = store.getNodesByStrategy("multi-strat");
    expect(allNodes).toHaveLength(3);
    expect(allNodes[0].generation).toBe(0);
    expect(allNodes[1].generation).toBe(1);
    expect(allNodes[2].generation).toBe(2);
  });
});
