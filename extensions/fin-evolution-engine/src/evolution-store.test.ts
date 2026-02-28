import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EvolutionStore } from "./evolution-store.ts";
import {
  mockAuditEntry,
  mockNode,
  mockNodeTree,
  mockRdavdCycle,
  mockRiskGateResult,
} from "./test-utils.ts";

let store: EvolutionStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "evo-store-"));
  store = new EvolutionStore(join(tmpDir, "test-evolution.sqlite"));
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("EvolutionStore — nodes", () => {
  it("saves and retrieves a node by id", () => {
    const node = mockNode();
    store.saveNode(node);
    const retrieved = store.getNode(node.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(node.id);
    expect(retrieved!.strategyId).toBe(node.strategyId);
    expect(retrieved!.fitness).toBe(node.fitness);
    expect(retrieved!.genes).toHaveLength(node.genes.length);
    expect(retrieved!.genes[0].name).toBe(node.genes[0].name);
  });

  it("returns undefined for non-existent node", () => {
    expect(store.getNode("no-such-id")).toBeUndefined();
  });

  it("saves and retrieves nodes by strategy", () => {
    const nodes = mockNodeTree(4);
    for (const n of nodes) store.saveNode(n);
    const retrieved = store.getNodesByStrategy("strat-a");
    expect(retrieved).toHaveLength(4);
    expect(retrieved[0].generation).toBe(0);
    expect(retrieved[3].generation).toBe(3);
  });

  it("getAllNodes returns all nodes ordered by created_at", () => {
    const nodes = mockNodeTree(3);
    for (const n of nodes) store.saveNode(n);
    const all = store.getAllNodes();
    expect(all).toHaveLength(3);
  });

  it("getActiveNodes excludes extinct and KILLED", () => {
    const n1 = mockNode({ id: "n1", fitness: 0.8 });
    const n2 = mockNode({
      id: "n2",
      fitness: 0.6,
      extinctAt: "2026-02-28T15:00:00Z",
      level: "KILLED",
    });
    const n3 = mockNode({ id: "n3", fitness: 0.7 });
    store.saveNode(n1);
    store.saveNode(n2);
    store.saveNode(n3);
    const active = store.getActiveNodes();
    expect(active).toHaveLength(2);
    expect(active[0].id).toBe("n1"); // higher fitness first
    expect(active[1].id).toBe("n3");
  });

  it("markExtinct sets extinct_at and level=KILLED", () => {
    const node = mockNode({ id: "evo-kill" });
    store.saveNode(node);
    store.markExtinct("evo-kill", "2026-02-28T18:00:00Z");
    const retrieved = store.getNode("evo-kill");
    expect(retrieved!.extinctAt).toBe("2026-02-28T18:00:00Z");
    expect(retrieved!.level).toBe("KILLED");
  });

  it("getLatestGeneration returns highest generation", () => {
    const nodes = mockNodeTree(4);
    for (const n of nodes) store.saveNode(n);
    const latest = store.getLatestGeneration("strat-a");
    expect(latest).toBeDefined();
    expect(latest!.generation).toBe(3);
  });

  it("upserts node on conflict", () => {
    const node = mockNode({ id: "upsert-test", fitness: 0.5 });
    store.saveNode(node);
    store.saveNode({ ...node, fitness: 0.9 });
    const retrieved = store.getNode("upsert-test");
    expect(retrieved!.fitness).toBe(0.9);
  });

  it("handles optional fields (crossoverParentIds, status, mutationType)", () => {
    const node = mockNode({
      id: "full-node",
      crossoverParentIds: ["parent-a", "parent-b"],
      status: "paused",
      mutationType: "signal-change",
      mutationReason: "Decay detected",
      backtestSharpe: 1.5,
      paperSharpe: 1.2,
      maxDrawdown: -0.15,
      winRate: 0.58,
      totalTrades: 120,
    });
    store.saveNode(node);
    const retrieved = store.getNode("full-node")!;
    expect(retrieved.crossoverParentIds).toEqual(["parent-a", "parent-b"]);
    expect(retrieved.status).toBe("paused");
    expect(retrieved.mutationType).toBe("signal-change");
    expect(retrieved.mutationReason).toBe("Decay detected");
    expect(retrieved.backtestSharpe).toBe(1.5);
    expect(retrieved.paperSharpe).toBe(1.2);
    expect(retrieved.maxDrawdown).toBe(-0.15);
    expect(retrieved.winRate).toBe(0.58);
    expect(retrieved.totalTrades).toBe(120);
  });
});

describe("EvolutionStore — mutations", () => {
  it("saves and retrieves mutations by node", () => {
    store.saveMutation({
      id: "mut-001",
      nodeId: "evo-n1",
      cycleId: "rdavd-001",
      type: "parameter-tune",
      triggerReason: "Decay detected",
      oldGenes: [{ id: "g1", params: { period: 14 } }],
      newGenes: [{ id: "g1", params: { period: 10 } }],
      fitnessBefore: 0.5,
      fitnessAfter: 0.62,
      riskGateResult: mockRiskGateResult(true),
      constitutionJson: null,
      outcome: "mutated",
      createdAt: "2026-02-28T12:00:00Z",
    });
    const muts = store.getMutationsByNode("evo-n1");
    expect(muts).toHaveLength(1);
    expect(muts[0].type).toBe("parameter-tune");
    expect(muts[0].outcome).toBe("mutated");
  });

  it("getMutationsToday counts today's mutations", () => {
    const today = new Date().toISOString().slice(0, 10);
    store.saveMutation({
      id: "mut-today-1",
      nodeId: "n1",
      cycleId: "c1",
      type: "parameter-tune",
      triggerReason: "test",
      oldGenes: [],
      newGenes: [],
      fitnessBefore: 0.5,
      fitnessAfter: 0.6,
      riskGateResult: mockRiskGateResult(true),
      constitutionJson: null,
      outcome: "mutated",
      createdAt: `${today}T10:00:00Z`,
    });
    store.saveMutation({
      id: "mut-old",
      nodeId: "n1",
      cycleId: "c2",
      type: "parameter-tune",
      triggerReason: "test",
      oldGenes: [],
      newGenes: [],
      fitnessBefore: 0.5,
      fitnessAfter: 0.6,
      riskGateResult: mockRiskGateResult(true),
      constitutionJson: null,
      outcome: "mutated",
      createdAt: "2025-01-01T10:00:00Z",
    });
    expect(store.getMutationsToday()).toBe(1);
  });
});

describe("EvolutionStore — RDAVD cycles", () => {
  it("saves and retrieves cycles", () => {
    const cycle = mockRdavdCycle();
    store.saveCycle(cycle);
    const recent = store.getRecentCycles("strat-a", 5);
    expect(recent).toHaveLength(1);
    expect(recent[0].strategy_id).toBe("strat-a");
    expect(recent[0].outcome).toBe("mutated");
  });
});

describe("EvolutionStore — audit log", () => {
  it("logs and retrieves audit entries", () => {
    const entry = mockAuditEntry();
    store.logAudit(entry);
    const log = store.getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].id).toBe(entry.id);
    expect(log[0].type).toBe("MUTATION");
    expect(log[0].strategyId).toBe("strat-a");
  });

  it("filters by strategyId", () => {
    store.logAudit(mockAuditEntry({ id: "a1", strategyId: "strat-a" }));
    store.logAudit(mockAuditEntry({ id: "a2", strategyId: "strat-b" }));
    const logA = store.getAuditLog({ strategyId: "strat-a" });
    expect(logA).toHaveLength(1);
    expect(logA[0].strategyId).toBe("strat-a");
  });

  it("filters by type", () => {
    store.logAudit(mockAuditEntry({ id: "a1", type: "MUTATION" }));
    store.logAudit(mockAuditEntry({ id: "a2", type: "PROMOTION" }));
    store.logAudit(mockAuditEntry({ id: "a3", type: "MUTATION" }));
    const mutations = store.getAuditLog({ type: "MUTATION" });
    expect(mutations).toHaveLength(2);
  });

  it("respects limit", () => {
    for (let i = 0; i < 10; i++) {
      store.logAudit(
        mockAuditEntry({
          id: `a${i}`,
          createdAt: `2026-02-28T${String(i).padStart(2, "0")}:00:00Z`,
        }),
      );
    }
    const limited = store.getAuditLog({ limit: 3 });
    expect(limited).toHaveLength(3);
    // Should be most recent first
    expect(limited[0].id).toBe("a9");
  });

  it("handles metadata", () => {
    store.logAudit(
      mockAuditEntry({ id: "with-meta", metadata: { fitness: 0.85, fromLevel: "L2" } }),
    );
    const log = store.getAuditLog();
    expect(log[0].metadata).toEqual({ fitness: 0.85, fromLevel: "L2" });
  });
});

describe("EvolutionStore — stats helpers", () => {
  it("getNodeCountByLevel counts active nodes by level", () => {
    store.saveNode(mockNode({ id: "n1", level: "L0_INCUBATE" }));
    store.saveNode(mockNode({ id: "n2", level: "L1_BACKTEST" }));
    store.saveNode(mockNode({ id: "n3", level: "L1_BACKTEST" }));
    store.saveNode(mockNode({ id: "n4", level: "L2_PAPER" }));
    store.saveNode(mockNode({ id: "n5", level: "KILLED", extinctAt: "2026-02-28T18:00:00Z" }));
    const counts = store.getNodeCountByLevel();
    expect(counts).toEqual({ L0: 1, L1: 2, L2: 1, L3: 0 });
  });

  it("getNodeCountByTier counts active nodes by survival tier", () => {
    store.saveNode(mockNode({ id: "n1", survivalTier: "thriving" }));
    store.saveNode(mockNode({ id: "n2", survivalTier: "healthy" }));
    store.saveNode(mockNode({ id: "n3", survivalTier: "healthy" }));
    store.saveNode(mockNode({ id: "n4", survivalTier: "stressed" }));
    const counts = store.getNodeCountByTier();
    expect(counts.thriving).toBe(1);
    expect(counts.healthy).toBe(2);
    expect(counts.stressed).toBe(1);
    expect(counts.critical).toBe(0);
    expect(counts.stopped).toBe(0);
  });

  it("getTotalMutations counts total and successful", () => {
    store.saveMutation({
      id: "m1",
      nodeId: "n1",
      cycleId: "c1",
      type: "parameter-tune",
      triggerReason: "test",
      oldGenes: [],
      newGenes: [],
      fitnessBefore: 0.5,
      fitnessAfter: 0.6,
      riskGateResult: mockRiskGateResult(true),
      constitutionJson: null,
      outcome: "mutated",
      createdAt: "2026-02-28T12:00:00Z",
    });
    store.saveMutation({
      id: "m2",
      nodeId: "n1",
      cycleId: "c2",
      type: "signal-change",
      triggerReason: "test",
      oldGenes: [],
      newGenes: [],
      fitnessBefore: 0.5,
      fitnessAfter: null,
      riskGateResult: mockRiskGateResult(false),
      constitutionJson: null,
      outcome: "rejected",
      createdAt: "2026-02-28T13:00:00Z",
    });
    const stats = store.getTotalMutations();
    expect(stats.total).toBe(2);
    expect(stats.successful).toBe(1);
  });
});
