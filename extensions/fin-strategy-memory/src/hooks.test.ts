import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ErrorBook } from "./error-book.js";
import {
  buildFinancialContext,
  handleTradeToolCall,
  checkErrorBookConstraints,
  formatNumber,
} from "./hooks.js";
import { TradeJournal } from "./trade-journal.js";

describe("hooks", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "fin-hooks-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── buildFinancialContext ──

  describe("buildFinancialContext", () => {
    it("returns undefined when services is undefined", () => {
      expect(buildFinancialContext(undefined)).toBeUndefined();
    });

    it("returns undefined when no services are available", () => {
      const services = new Map<string, unknown>();
      expect(buildFinancialContext(services)).toBeUndefined();
    });

    it("returns context when fund-manager is available", () => {
      const services = new Map<string, unknown>();
      services.set("fin-fund-manager", {
        getState: () => ({
          totalCapital: 125430,
          allocations: [],
          lastRebalanceAt: 0,
        }),
        getConfig: () => ({ totalCapital: 125430 }),
        evaluateRisk: () => ({
          riskLevel: "normal",
          dailyDrawdown: 0.8,
          todayPnl: 2890.3,
          todayPnlPct: 2.3,
        }),
      });

      const ctx = buildFinancialContext(services);
      expect(ctx).toBeDefined();
      expect(ctx).toContain("[FinClaw Context]");
      expect(ctx).toContain("Fund:");
      expect(ctx).toContain("+2.3% today");
      expect(ctx).toContain("Risk: normal");
    });

    it("includes strategy counts from registry", () => {
      const services = new Map<string, unknown>();
      services.set("fin-fund-manager", {
        getState: () => ({ totalCapital: 100000, allocations: [], lastRebalanceAt: 0 }),
        getConfig: () => ({ totalCapital: 100000 }),
        evaluateRisk: () => ({
          riskLevel: "caution",
          dailyDrawdown: 3.5,
          todayPnl: -3500,
          todayPnlPct: -3.5,
        }),
      });
      services.set("fin-strategy-registry", {
        list: () => [
          { id: "s1", level: "L3_LIVE" },
          { id: "s2", level: "L3_LIVE" },
          { id: "s3", level: "L2_PAPER" },
          { id: "s4", level: "L1_BACKTEST" },
        ],
      });

      const ctx = buildFinancialContext(services)!;
      expect(ctx).toContain("4 active strategies");
      expect(ctx).toContain("2 L3");
      expect(ctx).toContain("1 L2");
      expect(ctx).toContain("1 L1");
    });

    it("includes error book top-3", () => {
      const services = new Map<string, unknown>();
      const errorBook = new ErrorBook(join(tempDir, "error-book.json"));

      errorBook.record({
        id: "timing-chase",
        description: "Chasing pumps in volatile regime",
        category: "timing",
        loss: 2340,
        tradeId: "t-1",
        symbol: "BTC/USDT",
        constraint: "No FOMO entries",
      });
      // Record multiple times to boost severity
      for (let i = 2; i <= 5; i++) {
        errorBook.record({
          id: "timing-chase",
          description: "Chasing pumps in volatile regime",
          category: "timing",
          loss: 100,
          tradeId: `t-${i}`,
          symbol: "BTC/USDT",
        });
      }

      services.set("fin-error-book", errorBook);

      const ctx = buildFinancialContext(services)!;
      expect(ctx).toContain("Error Book TOP-3:");
      expect(ctx).toContain("TIMING");
      expect(ctx).toContain("Chasing pumps");
    });

    it("silently skips when fund-manager throws", () => {
      const services = new Map<string, unknown>();
      services.set("fin-fund-manager", {
        getState: () => {
          throw new Error("not ready");
        },
        getConfig: () => ({}),
        evaluateRisk: () => ({}),
      });

      // Should not throw
      const ctx = buildFinancialContext(services);
      // No fund data available, only error book might produce something
      expect(ctx === undefined || typeof ctx === "string").toBe(true);
    });
  });

  // ── handleTradeToolCall ──

  describe("handleTradeToolCall", () => {
    it("ignores non-trade tools", () => {
      const journal = new TradeJournal(join(tempDir, "journal.jsonl"));
      handleTradeToolCall({ toolName: "fin_market_data", params: {}, result: {} }, journal);
      expect(journal.count()).toBe(0);
    });

    it("ignores errored tool calls", () => {
      const journal = new TradeJournal(join(tempDir, "journal.jsonl"));
      handleTradeToolCall(
        {
          toolName: "fin_place_order",
          params: { symbol: "BTC/USDT", side: "buy" },
          error: "failed",
        },
        journal,
      );
      expect(journal.count()).toBe(0);
    });

    it("writes journal entry for fin_place_order", () => {
      const journal = new TradeJournal(join(tempDir, "journal.jsonl"));
      handleTradeToolCall(
        {
          toolName: "fin_place_order",
          params: { symbol: "BTC/USDT", side: "buy", strategyId: "s-1", reason: "breakout" },
          result: { price: 67500, amount: 0.1, pnl: 500 },
        },
        journal,
      );

      expect(journal.count()).toBe(1);
      const trades = journal.query({});
      const trade = trades[0]!;
      expect(trade.source).toBe("live");
      expect(trade.symbol).toBe("BTC/USDT");
      expect(trade.side).toBe("buy");
      expect(trade.price).toBe(67500);
      expect(trade.quantity).toBe(0.1);
      expect(trade.notional).toBe(6750);
      expect(trade.strategyId).toBe("s-1");
      expect(trade.reason).toBe("breakout");
      expect(trade.pnl).toBe(500);
    });

    it("writes paper source for fin_paper_order", () => {
      const journal = new TradeJournal(join(tempDir, "journal.jsonl"));
      handleTradeToolCall(
        {
          toolName: "fin_paper_order",
          params: { symbol: "ETH/USDT", side: "sell" },
          result: { price: 3400, quantity: 1 },
        },
        journal,
      );

      const trades = journal.query({});
      expect(trades[0]!.source).toBe("paper");
    });
  });

  // ── checkErrorBookConstraints ──

  describe("checkErrorBookConstraints", () => {
    it("returns undefined for non-trade tools", () => {
      const errorBook = new ErrorBook(join(tempDir, "eb.json"));
      const result = checkErrorBookConstraints(
        { toolName: "fin_market_data", params: { symbol: "BTC/USDT" } },
        errorBook,
      );
      expect(result).toBeUndefined();
    });

    it("returns undefined when no constraints match", () => {
      const errorBook = new ErrorBook(join(tempDir, "eb.json"));
      const result = checkErrorBookConstraints(
        { toolName: "fin_place_order", params: { symbol: "BTC/USDT" } },
        errorBook,
      );
      expect(result).toBeUndefined();
    });

    it("returns undefined when no symbol provided", () => {
      const errorBook = new ErrorBook(join(tempDir, "eb.json"));
      const result = checkErrorBookConstraints(
        { toolName: "fin_place_order", params: {} },
        errorBook,
      );
      expect(result).toBeUndefined();
    });

    it("returns constraints when matching error patterns exist", () => {
      const errorBook = new ErrorBook(join(tempDir, "eb.json"));
      errorBook.record({
        id: "chase-pump",
        description: "Chasing pumps",
        category: "timing",
        loss: 1000,
        tradeId: "t-1",
        symbol: "BTC/USDT",
        constraint: "No FOMO entries on BTC",
      });

      const result = checkErrorBookConstraints(
        { toolName: "fin_place_order", params: { symbol: "BTC/USDT" } },
        errorBook,
      );

      expect(result).toBeDefined();
      expect(result).toContain("No FOMO entries on BTC");
    });

    it("returns multiple constraints", () => {
      const errorBook = new ErrorBook(join(tempDir, "eb.json"));
      errorBook.record({
        id: "p1",
        description: "d1",
        category: "timing",
        loss: 500,
        tradeId: "t-1",
        symbol: "BTC/USDT",
        constraint: "Constraint A",
      });
      errorBook.record({
        id: "p2",
        description: "d2",
        category: "sizing",
        loss: 800,
        tradeId: "t-2",
        symbol: "BTC/USDT",
        constraint: "Constraint B",
      });

      const result = checkErrorBookConstraints(
        { toolName: "fin_paper_order", params: { symbol: "BTC/USDT" } },
        errorBook,
      );

      expect(result).toHaveLength(2);
      expect(result).toContain("Constraint A");
      expect(result).toContain("Constraint B");
    });
  });

  // ── formatNumber ──

  describe("formatNumber", () => {
    it("formats large numbers with commas", () => {
      expect(formatNumber(125430.5)).toContain("125");
      expect(formatNumber(125430.5)).toContain("430");
    });

    it("formats small numbers with 2 decimals", () => {
      expect(formatNumber(42.5)).toBe("42.50");
    });
  });
});
