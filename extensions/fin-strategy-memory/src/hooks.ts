import type { ErrorBook } from "./error-book.js";
import type { TradeJournal } from "./trade-journal.js";
import type { ErrorPattern, TradeEntry } from "./types.js";

// ── Types for hook events (mirrors plugin API) ──

export interface BeforePromptEvent {
  prompt: string;
  messages: unknown[];
}

export interface AfterToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

export interface BeforeToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
}

// ── Service lookup helpers ──

interface ServiceMap {
  get(id: string): unknown;
}

interface FundManagerLike {
  getState(): {
    totalCapital: number;
    allocations: Array<{ strategyId: string; capitalUsd: number; weightPct: number }>;
    lastRebalanceAt: number;
  };
  evaluateRisk(equity: number): {
    riskLevel: string;
    dailyDrawdown: number;
    todayPnl: number;
    todayPnlPct: number;
  };
  getConfig(): { totalCapital?: number };
}

interface RegistryLike {
  list(filter?: { level?: string }): Array<{ id: string; level: string }>;
}

const TRADE_TOOLS = ["fin_place_order", "fin_paper_order"];

// ── 1. before_prompt_build ──

/**
 * Build financial context string to prepend to agent conversations.
 * Returns undefined if no meaningful data is available.
 */
export function buildFinancialContext(services?: ServiceMap): string | undefined {
  if (!services) return undefined;

  const lines: string[] = ["[FinClaw Context]"];
  let hasData = false;

  // Fund status
  const fundMgr = services.get("fin-fund-manager") as FundManagerLike | undefined;
  if (fundMgr) {
    try {
      const state = fundMgr.getState();
      const equity = fundMgr.getConfig().totalCapital ?? state.totalCapital;
      const risk = fundMgr.evaluateRisk(equity);

      const pnlSign = risk.todayPnl >= 0 ? "+" : "";
      const pctSign = risk.todayPnlPct >= 0 ? "+" : "";

      // Count strategies by level
      const registry = services.get("fin-strategy-registry") as RegistryLike | undefined;
      const strategies = registry?.list() ?? [];
      const byLevel = {
        L3: strategies.filter((s) => s.level === "L3_LIVE").length,
        L2: strategies.filter((s) => s.level === "L2_PAPER").length,
        L1: strategies.filter((s) => s.level === "L1_BACKTEST").length,
      };
      const active = byLevel.L3 + byLevel.L2 + byLevel.L1;

      lines.push(
        `Fund: $${formatNumber(equity)} equity | ${pnlSign}${risk.todayPnlPct.toFixed(1)}% today | ${active} active strategies (${byLevel.L3} L3, ${byLevel.L2} L2, ${byLevel.L1} L1)`,
      );
      lines.push(`Risk: ${risk.riskLevel} (daily DD: -${risk.dailyDrawdown.toFixed(1)}%)`);
      hasData = true;
    } catch {
      // Fund manager not ready — skip
    }
  }

  // Error book top-3
  const errorBook = services.get("fin-error-book") as ErrorBook | undefined;
  if (errorBook) {
    try {
      const topErrors = errorBook.topErrors(3);
      if (topErrors.length > 0) {
        lines.push("Error Book TOP-3:");
        for (const err of topErrors) {
          const categoryUpper = err.category.toUpperCase();
          lines.push(
            `  ⚠ ${categoryUpper}: ${err.description} (${err.occurrences} occurrences, impact: -$${formatNumber(err.totalLoss)})`,
          );
        }
        hasData = true;
      }
    } catch {
      // Error book not ready — skip
    }
  }

  return hasData ? lines.join("\n") : undefined;
}

// ── 2. after_tool_call ──

/**
 * After a trade tool call, extract trade info and write to journal.
 */
export function handleTradeToolCall(event: AfterToolCallEvent, journal: TradeJournal): void {
  if (!TRADE_TOOLS.includes(event.toolName)) return;
  if (event.error) return;

  const result = event.result as Record<string, unknown> | undefined;
  const params = event.params;

  const entry: TradeEntry = {
    id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    source: event.toolName === "fin_paper_order" ? "paper" : "live",
    symbol: (params.symbol as string) ?? "UNKNOWN",
    side: (params.side as "buy" | "sell") ?? "buy",
    price: (result?.price as number) ?? (params.price as number) ?? 0,
    quantity:
      (result?.amount as number) ??
      (result?.quantity as number) ??
      (params.quantity as number) ??
      0,
    notional: 0,
    strategyId: params.strategyId as string | undefined,
    reason: (params.reason as string) ?? "manual",
    pnl: result?.pnl as number | undefined,
  };

  // Compute notional
  entry.notional = entry.price * entry.quantity;

  journal.append(entry);
}

// ── 3. before_tool_call ──

/**
 * Check error book constraints before a trade.
 * Returns warnings array if constraints match, undefined otherwise.
 */
export function checkErrorBookConstraints(
  event: BeforeToolCallEvent,
  errorBook: ErrorBook,
): string[] | undefined {
  if (!TRADE_TOOLS.includes(event.toolName)) return undefined;

  const symbol = event.params.symbol as string | undefined;
  if (!symbol) return undefined;

  const constraints = errorBook.getConstraints(symbol);
  if (constraints.length === 0) return undefined;

  return constraints;
}

// ── Helpers ──

/** Format a number with comma separators (e.g. 125430.50 → "125,430.50"). */
export function formatNumber(n: number): string {
  if (n >= 1000 || n <= -1000) {
    return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return n.toFixed(2);
}

/**
 * Get top error patterns formatted as a simple object array
 * (useful for testing without full ErrorBook).
 */
export function formatTopErrors(patterns: ErrorPattern[]): Array<{
  category: string;
  description: string;
  occurrences: number;
  impact: number;
}> {
  return patterns.map((p) => ({
    category: p.category.toUpperCase(),
    description: p.description,
    occurrences: p.occurrences,
    impact: p.totalLoss,
  }));
}
