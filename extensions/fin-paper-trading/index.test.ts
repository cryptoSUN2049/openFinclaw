import { unlinkSync } from "node:fs";
import { describe, expect, it, vi, afterAll } from "vitest";
import plugin from "./index.js";

// ---------------------------------------------------------------------------
// Metadata tests (pre-existing)
// ---------------------------------------------------------------------------

describe("fin-paper-trading plugin", () => {
  it("has correct plugin metadata", () => {
    expect(plugin.id).toBe("fin-paper-trading");
    expect(plugin.name).toBe("Paper Trading");
    expect(plugin.kind).toBe("financial");
  });

  it("registers 6 tools and 1 service", () => {
    const tools: Array<{ name: string }> = [];
    const services: Array<{ id: string }> = [];

    const api = {
      resolvePath: (p: string) => `/tmp/test-paper-plugin/${p}`,
      config: { financial: {} },
      registerTool: vi.fn((tool: Record<string, unknown>) => {
        tools.push({ name: tool.name as string });
      }),
      registerService: vi.fn((svc: Record<string, unknown>) => {
        services.push({ id: svc.id as string });
      }),
    };

    plugin.register(api as never);

    expect(services).toHaveLength(1);
    expect(services[0]!.id).toBe("fin-paper-engine");

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("fin_paper_create");
    expect(toolNames).toContain("fin_paper_order");
    expect(toolNames).toContain("fin_paper_positions");
    expect(toolNames).toContain("fin_paper_state");
    expect(toolNames).toContain("fin_paper_metrics");
    expect(toolNames).toContain("fin_paper_list");
    expect(tools).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — real PaperEngine + PaperStore backed by a temp SQLite
// ---------------------------------------------------------------------------

type ToolExecutor = (
  id: string,
  params: Record<string, unknown>,
) => Promise<{
  content: Array<{ type: string; text: string }>;
  details: unknown;
}>;

/**
 * Bootstrap a plugin instance wired to a real SQLite file.
 * Returns a map from tool name → execute function so tests can invoke
 * tools directly without going through the full OpenClaw dispatch layer.
 */
function setupPlugin(dbPath: string): Map<string, ToolExecutor> {
  const executors = new Map<string, ToolExecutor>();

  const api = {
    resolvePath: (_p: string) => dbPath,
    config: { financial: { paperTrading: { constantSlippageBps: 5, market: "crypto" } } },
    registerTool: vi.fn((tool: Record<string, unknown>, _opts: unknown) => {
      executors.set(tool.name as string, tool.execute as ToolExecutor);
    }),
    registerService: vi.fn(),
  };

  plugin.register(api as never);
  return executors;
}

describe("fin-paper-trading integration tests", () => {
  const dbPath = `/tmp/test-paper-plugin-${Date.now()}.sqlite`;
  let tools: Map<string, ToolExecutor>;

  // Shared account ID created during the test run and reused across test cases.
  let sharedAccountId: string;

  // Bootstrap the plugin once for the entire describe block so all tests
  // share the same SQLite database and can build on each other's state.
  tools = setupPlugin(dbPath);

  afterAll(() => {
    // Clean up SQLite file and WAL/SHM side-car files created by the engine.
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        unlinkSync(dbPath + suffix);
      } catch {
        // File may not exist if the test bailed early; ignore.
      }
    }
  });

  // --- fin_paper_list (empty) -----------------------------------------------

  it("fin_paper_list returns empty list when no accounts exist", async () => {
    const exec = tools.get("fin_paper_list")!;
    const result = await exec("", {});
    const details = result.details as { accounts: unknown[]; total: number };

    expect(details.total).toBe(0);
    expect(details.accounts).toHaveLength(0);
  });

  // --- fin_paper_create (valid) ---------------------------------------------

  it("fin_paper_create creates account with valid capital", async () => {
    const exec = tools.get("fin_paper_create")!;
    const result = await exec("", { name: "Integration Test Account", capital: 20_000 });
    const details = result.details as {
      message: string;
      account: { id: string; name: string; initialCapital: number; cash: number; equity: number };
    };

    expect(details.message).toContain("Integration Test Account");
    expect(details.account.name).toBe("Integration Test Account");
    expect(details.account.initialCapital).toBe(20_000);
    expect(details.account.cash).toBe(20_000);
    expect(details.account.equity).toBe(20_000);
    expect(details.account.id).toMatch(/^paper-/);

    // Capture ID for subsequent tests.
    sharedAccountId = details.account.id;
  });

  // --- fin_paper_create (invalid capital) -----------------------------------

  it("fin_paper_create rejects non-positive capital", async () => {
    const exec = tools.get("fin_paper_create")!;
    const result = await exec("", { name: "Bad Account", capital: -500 });
    const details = result.details as { error: string };

    expect(details.error).toBe("Capital must be positive");
  });

  it("fin_paper_create rejects zero capital", async () => {
    const exec = tools.get("fin_paper_create")!;
    const result = await exec("", { name: "Zero Account", capital: 0 });
    const details = result.details as { error: string };

    expect(details.error).toBe("Capital must be positive");
  });

  // --- fin_paper_list (after creation) --------------------------------------

  it("fin_paper_list returns accounts after creation", async () => {
    const exec = tools.get("fin_paper_list")!;
    const result = await exec("", {});
    const details = result.details as {
      accounts: Array<{ id: string; name: string; equity: number }>;
      total: number;
    };

    // At minimum the "Integration Test Account" must be present (bad-capital
    // ones were rejected so they were never persisted).
    expect(details.total).toBeGreaterThanOrEqual(1);
    const found = details.accounts.find((a) => a.name === "Integration Test Account");
    expect(found).toBeDefined();
    expect(found!.equity).toBe(20_000);
  });

  // --- fin_paper_order (buy) ------------------------------------------------

  it("fin_paper_order submits a buy market order and returns filled order", async () => {
    const exec = tools.get("fin_paper_order")!;
    const result = await exec("", {
      account_id: sharedAccountId,
      symbol: "BTC/USDT",
      side: "buy",
      quantity: 0.1,
      type: "market",
      current_price: 50_000,
      reason: "Integration test buy",
    });
    const details = result.details as {
      order: {
        status: string;
        fillPrice: number;
        commission: number;
        slippage: number;
        symbol: string;
        side: string;
      };
    };

    expect(details.order.status).toBe("filled");
    expect(details.order.symbol).toBe("BTC/USDT");
    expect(details.order.side).toBe("buy");
    // Buy-side slippage pushes fill price above the quoted market price.
    expect(details.order.fillPrice).toBeGreaterThan(50_000);
    expect(details.order.commission).toBeGreaterThan(0);
    expect(details.order.slippage).toBeGreaterThan(0);
  });

  // --- fin_paper_positions --------------------------------------------------

  it("fin_paper_positions shows open position after buy", async () => {
    const exec = tools.get("fin_paper_positions")!;
    const result = await exec("", { account_id: sharedAccountId });
    const details = result.details as {
      accountId: string;
      positions: Array<{ symbol: string; quantity: number; side: string }>;
      totalPositions: number;
      totalValue: number;
    };

    expect(details.accountId).toBe(sharedAccountId);
    expect(details.totalPositions).toBe(1);
    expect(details.positions[0]!.symbol).toBe("BTC/USDT");
    expect(details.positions[0]!.side).toBe("long");
    expect(details.positions[0]!.quantity).toBeCloseTo(0.1, 5);
    // Total value = quantity * currentPrice; must be positive.
    expect(details.totalValue).toBeGreaterThan(0);
  });

  // --- fin_paper_state ------------------------------------------------------

  it("fin_paper_state returns full account state with PnL fields", async () => {
    const exec = tools.get("fin_paper_state")!;
    const result = await exec("", { account_id: sharedAccountId });
    const details = result.details as {
      account: {
        id: string;
        name: string;
        initialCapital: number;
        cash: number;
        equity: number;
        positions: unknown[];
        orders: unknown[];
      };
      pnl: number;
      pnlPct: number;
    };

    expect(details.account.id).toBe(sharedAccountId);
    expect(details.account.name).toBe("Integration Test Account");
    expect(details.account.initialCapital).toBe(20_000);
    // Cash should be reduced after buying; positions hold the rest.
    expect(details.account.cash).toBeLessThan(20_000);
    expect(details.account.positions).toHaveLength(1);
    expect(details.account.orders).toHaveLength(1);
    // PnL = equity - initialCapital; commission was deducted so pnl ≤ 0.
    expect(details.pnl).toBeDefined();
    expect(typeof details.pnlPct).toBe("number");
    // pnl and pnlPct must be consistent: pnl / initialCapital * 100 ≈ pnlPct
    expect(details.pnlPct).toBeCloseTo((details.pnl / details.account.initialCapital) * 100, 5);
  });

  // --- fin_paper_metrics ----------------------------------------------------

  it("fin_paper_metrics returns decay metrics for existing account", async () => {
    const exec = tools.get("fin_paper_metrics")!;
    const result = await exec("", { account_id: sharedAccountId });
    const details = result.details as {
      metrics: {
        decayLevel: string;
        rollingSharpe7d: number;
        rollingSharpe30d: number;
        currentDrawdown: number;
        peakEquity: number;
      };
    };

    expect(details.metrics).toBeDefined();
    expect(["healthy", "warning", "degrading", "critical"]).toContain(details.metrics.decayLevel);
    expect(typeof details.metrics.rollingSharpe7d).toBe("number");
    expect(typeof details.metrics.rollingSharpe30d).toBe("number");
    expect(typeof details.metrics.currentDrawdown).toBe("number");
    // peakEquity is 0 for a fresh account with no equity snapshots recorded yet
    // (DecayDetector returns 0 when snapshots.length < MIN_DAYS and no snapshots exist).
    expect(typeof details.metrics.peakEquity).toBe("number");
    expect(details.metrics.peakEquity).toBeGreaterThanOrEqual(0);
  });

  // --- error paths ----------------------------------------------------------

  it("fin_paper_order returns error for non-existent account", async () => {
    const exec = tools.get("fin_paper_order")!;
    const result = await exec("", {
      account_id: "nonexistent-account-id",
      symbol: "BTC/USDT",
      side: "buy",
      quantity: 0.1,
      type: "market",
      current_price: 50_000,
    });
    const details = result.details as {
      order?: { status: string; reason?: string };
      error?: string;
    };

    // The engine returns a rejected order (not thrown error) for unknown accounts.
    if ("order" in details && details.order) {
      expect(details.order.status).toBe("rejected");
    } else {
      // Some implementations surface as top-level error field.
      expect(details.error).toBeDefined();
    }
  });

  it("fin_paper_positions returns error for non-existent account", async () => {
    const exec = tools.get("fin_paper_positions")!;
    const result = await exec("", { account_id: "nonexistent-account-id" });
    const details = result.details as { error: string };

    expect(details.error).toBe("Account not found");
  });

  it("fin_paper_state returns error for non-existent account", async () => {
    const exec = tools.get("fin_paper_state")!;
    const result = await exec("", { account_id: "nonexistent-account-id" });
    const details = result.details as { error: string };

    expect(details.error).toBe("Account not found");
  });

  it("fin_paper_metrics returns error for non-existent account", async () => {
    const exec = tools.get("fin_paper_metrics")!;
    const result = await exec("", { account_id: "nonexistent-account-id" });
    const details = result.details as { error: string };

    expect(details.error).toBe("Account not found");
  });

  // --- content format -------------------------------------------------------

  it("every tool wraps payload in MCP-style content array", async () => {
    const exec = tools.get("fin_paper_list")!;
    const result = await exec("", {});

    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    // Text must be valid JSON that round-trips to details.
    const parsed: unknown = JSON.parse(result.content[0]!.text);
    expect(parsed).toEqual(result.details);
  });
});
