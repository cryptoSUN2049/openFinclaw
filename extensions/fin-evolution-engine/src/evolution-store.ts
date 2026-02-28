/**
 * EvolutionStore — SQLite persistence for evolution tree, mutations, RDAVD cycles, and audit log.
 * All data shapes validated against schemas.ts.
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AuditEntry,
  AuditEntryType,
  EvolutionNode,
  MutationRiskGateResult,
  RdavdCycle,
} from "./schemas.ts";

export class EvolutionStore {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evolution_nodes (
        id TEXT PRIMARY KEY,
        strategy_id TEXT NOT NULL,
        strategy_name TEXT NOT NULL,
        generation INTEGER NOT NULL,
        parent_id TEXT,
        crossover_parent_ids TEXT,
        genes_json TEXT NOT NULL,
        fitness REAL NOT NULL,
        survival_tier TEXT NOT NULL,
        level TEXT NOT NULL,
        status TEXT,
        mutation_type TEXT,
        mutation_reason TEXT,
        backtest_sharpe REAL,
        paper_sharpe REAL,
        max_drawdown REAL,
        win_rate REAL,
        total_trades INTEGER,
        created_at TEXT NOT NULL,
        extinct_at TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mutations (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        cycle_id TEXT NOT NULL,
        type TEXT NOT NULL,
        trigger_reason TEXT NOT NULL,
        old_genes_json TEXT NOT NULL,
        new_genes_json TEXT NOT NULL,
        fitness_before REAL NOT NULL,
        fitness_after REAL,
        risk_gate_json TEXT NOT NULL,
        constitution_json TEXT,
        outcome TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rdavd_cycles (
        id TEXT PRIMARY KEY,
        strategy_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        assessment_json TEXT NOT NULL,
        regime_json TEXT,
        diagnose_json TEXT,
        validate_json TEXT,
        distill_json TEXT,
        outcome TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        strategy_id TEXT NOT NULL,
        strategy_name TEXT,
        detail TEXT NOT NULL,
        triggered_by TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      )
    `);

    // Indexes
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_nodes_strategy ON evolution_nodes (strategy_id)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_nodes_level ON evolution_nodes (level)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_mutations_node ON mutations (node_id)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_cycles_strategy ON rdavd_cycles (strategy_id)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_audit_strategy ON audit_log (strategy_id)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_log (type)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC)");
  }

  // ─── Evolution Nodes ──────────────────────────────────────────────

  saveNode(node: EvolutionNode): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO evolution_nodes
        (id, strategy_id, strategy_name, generation, parent_id, crossover_parent_ids,
         genes_json, fitness, survival_tier, level, status, mutation_type, mutation_reason,
         backtest_sharpe, paper_sharpe, max_drawdown, win_rate, total_trades,
         created_at, extinct_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      node.id,
      node.strategyId,
      node.strategyName,
      node.generation,
      node.parentId,
      node.crossoverParentIds ? JSON.stringify(node.crossoverParentIds) : null,
      JSON.stringify(node.genes),
      node.fitness,
      node.survivalTier,
      node.level,
      node.status ?? null,
      node.mutationType ?? null,
      node.mutationReason ?? null,
      node.backtestSharpe ?? null,
      node.paperSharpe ?? null,
      node.maxDrawdown ?? null,
      node.winRate ?? null,
      node.totalTrades ?? null,
      node.createdAt,
      node.extinctAt ?? null,
    );
  }

  getNode(id: string): EvolutionNode | undefined {
    const row = this.db.prepare("SELECT * FROM evolution_nodes WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToNode(row) : undefined;
  }

  getNodesByStrategy(strategyId: string): EvolutionNode[] {
    const rows = this.db
      .prepare("SELECT * FROM evolution_nodes WHERE strategy_id = ? ORDER BY generation ASC")
      .all(strategyId) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToNode(r));
  }

  getAllNodes(): EvolutionNode[] {
    const rows = this.db
      .prepare("SELECT * FROM evolution_nodes ORDER BY created_at ASC")
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToNode(r));
  }

  getActiveNodes(): EvolutionNode[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM evolution_nodes WHERE extinct_at IS NULL AND level != 'KILLED' ORDER BY fitness DESC",
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToNode(r));
  }

  markExtinct(nodeId: string, extinctAt: string): void {
    this.db
      .prepare("UPDATE evolution_nodes SET extinct_at = ?, level = 'KILLED' WHERE id = ?")
      .run(extinctAt, nodeId);
  }

  getLatestGeneration(strategyId: string): EvolutionNode | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM evolution_nodes WHERE strategy_id = ? ORDER BY generation DESC LIMIT 1",
      )
      .get(strategyId) as Record<string, unknown> | undefined;
    return row ? this.rowToNode(row) : undefined;
  }

  private rowToNode(row: Record<string, unknown>): EvolutionNode {
    return {
      id: row.id as string,
      strategyId: row.strategy_id as string,
      strategyName: row.strategy_name as string,
      generation: row.generation as number,
      parentId: (row.parent_id as string | null) ?? null,
      ...(row.crossover_parent_ids
        ? { crossoverParentIds: JSON.parse(row.crossover_parent_ids as string) as string[] }
        : {}),
      genes: JSON.parse(row.genes_json as string),
      fitness: row.fitness as number,
      survivalTier: row.survival_tier as EvolutionNode["survivalTier"],
      level: row.level as EvolutionNode["level"],
      ...(row.status ? { status: row.status as EvolutionNode["status"] } : {}),
      ...(row.mutation_type
        ? { mutationType: row.mutation_type as EvolutionNode["mutationType"] }
        : {}),
      ...(row.mutation_reason ? { mutationReason: row.mutation_reason as string } : {}),
      ...(row.backtest_sharpe != null ? { backtestSharpe: row.backtest_sharpe as number } : {}),
      ...(row.paper_sharpe != null ? { paperSharpe: row.paper_sharpe as number } : {}),
      ...(row.max_drawdown != null ? { maxDrawdown: row.max_drawdown as number } : {}),
      ...(row.win_rate != null ? { winRate: row.win_rate as number } : {}),
      ...(row.total_trades != null ? { totalTrades: row.total_trades as number } : {}),
      createdAt: row.created_at as string,
      ...(row.extinct_at ? { extinctAt: row.extinct_at as string } : {}),
    };
  }

  // ─── Mutations ────────────────────────────────────────────────────

  saveMutation(params: {
    id: string;
    nodeId: string;
    cycleId: string;
    type: string;
    triggerReason: string;
    oldGenes: unknown[];
    newGenes: unknown[];
    fitnessBefore: number;
    fitnessAfter: number | null;
    riskGateResult: MutationRiskGateResult;
    constitutionJson: string | null;
    outcome: string;
    createdAt: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO mutations
        (id, node_id, cycle_id, type, trigger_reason, old_genes_json, new_genes_json,
         fitness_before, fitness_after, risk_gate_json, constitution_json, outcome, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      params.id,
      params.nodeId,
      params.cycleId,
      params.type,
      params.triggerReason,
      JSON.stringify(params.oldGenes),
      JSON.stringify(params.newGenes),
      params.fitnessBefore,
      params.fitnessAfter,
      JSON.stringify(params.riskGateResult),
      params.constitutionJson,
      params.outcome,
      params.createdAt,
    );
  }

  getMutationsByNode(nodeId: string): Array<Record<string, unknown>> {
    return this.db
      .prepare("SELECT * FROM mutations WHERE node_id = ? ORDER BY created_at DESC")
      .all(nodeId) as Array<Record<string, unknown>>;
  }

  getMutationsToday(): number {
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const row = this.db
      .prepare("SELECT COUNT(*) as cnt FROM mutations WHERE created_at >= ?")
      .get(`${today}T00:00:00Z`) as {
      cnt: number;
    };
    return row.cnt;
  }

  // ─── RDAVD Cycles ────────────────────────────────────────────────

  saveCycle(cycle: RdavdCycle): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO rdavd_cycles
        (id, strategy_id, trigger, assessment_json, regime_json,
         diagnose_json, validate_json, distill_json, outcome, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      cycle.id,
      cycle.strategyId,
      cycle.trigger,
      JSON.stringify(cycle.survivalAssessment),
      cycle.regimeContext ? JSON.stringify(cycle.regimeContext) : null,
      cycle.diagnoseResult ? JSON.stringify(cycle.diagnoseResult) : null,
      cycle.validateResult ? JSON.stringify(cycle.validateResult) : null,
      cycle.distillResult ? JSON.stringify(cycle.distillResult) : null,
      cycle.outcome,
      cycle.startedAt,
      cycle.completedAt ?? null,
    );
  }

  getRecentCycles(strategyId: string, limit = 10): Array<Record<string, unknown>> {
    return this.db
      .prepare("SELECT * FROM rdavd_cycles WHERE strategy_id = ? ORDER BY started_at DESC LIMIT ?")
      .all(strategyId, limit) as Array<Record<string, unknown>>;
  }

  // ─── Audit Log ───────────────────────────────────────────────────

  logAudit(entry: AuditEntry): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO audit_log
        (id, type, strategy_id, strategy_name, detail, triggered_by, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      entry.id,
      entry.type,
      entry.strategyId,
      entry.strategyName ?? null,
      entry.detail,
      entry.triggeredBy,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.createdAt,
    );
  }

  getAuditLog(opts?: { strategyId?: string; type?: AuditEntryType; limit?: number }): AuditEntry[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts?.strategyId) {
      conditions.push("strategy_id = ?");
      params.push(opts.strategyId);
    }
    if (opts?.type) {
      conditions.push("type = ?");
      params.push(opts.type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts?.limit ?? 50;
    const allParams = [...params, limit] as Array<string | number>;
    const rows = this.db
      .prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...allParams) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: r.id as string,
      type: r.type as AuditEntry["type"],
      strategyId: r.strategy_id as string,
      ...(r.strategy_name ? { strategyName: r.strategy_name as string } : {}),
      detail: r.detail as string,
      triggeredBy: r.triggered_by as AuditEntry["triggeredBy"],
      ...(r.metadata_json
        ? { metadata: JSON.parse(r.metadata_json as string) as Record<string, unknown> }
        : {}),
      createdAt: r.created_at as string,
    }));
  }

  // ─── Stats Helpers ───────────────────────────────────────────────

  getNodeCountByLevel(): Record<string, number> {
    const rows = this.db
      .prepare(
        "SELECT level, COUNT(*) as cnt FROM evolution_nodes WHERE extinct_at IS NULL AND level != 'KILLED' GROUP BY level",
      )
      .all() as Array<{ level: string; cnt: number }>;
    const result: Record<string, number> = { L0: 0, L1: 0, L2: 0, L3: 0 };
    for (const r of rows) {
      const short = r.level
        .replace("_INCUBATE", "")
        .replace("_BACKTEST", "")
        .replace("_PAPER", "")
        .replace("_LIVE", "");
      result[short] = r.cnt;
    }
    return result;
  }

  getNodeCountByTier(): Record<string, number> {
    const rows = this.db
      .prepare(
        "SELECT survival_tier, COUNT(*) as cnt FROM evolution_nodes WHERE extinct_at IS NULL AND level != 'KILLED' GROUP BY survival_tier",
      )
      .all() as Array<{ survival_tier: string; cnt: number }>;
    const result: Record<string, number> = {
      thriving: 0,
      healthy: 0,
      stressed: 0,
      critical: 0,
      stopped: 0,
    };
    for (const r of rows) {
      result[r.survival_tier] = r.cnt;
    }
    return result;
  }

  getTotalMutations(): { total: number; successful: number } {
    const total = (
      this.db.prepare("SELECT COUNT(*) as cnt FROM mutations").get() as { cnt: number }
    ).cnt;
    const successful = (
      this.db.prepare("SELECT COUNT(*) as cnt FROM mutations WHERE outcome = 'mutated'").get() as {
        cnt: number;
      }
    ).cnt;
    return { total, successful };
  }

  // ─── Lifecycle ───────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
