import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErrorBook } from "./error-book.js";
import {
  buildErrorPatterns,
  buildSuccessPatterns,
  buildTradeInsights,
  syncToMemory,
} from "./experience-sync.js";
import { SuccessBook } from "./success-book.js";
import { TradeJournal } from "./trade-journal.js";

describe("ExperienceSync", () => {
  let tempDir: string;
  let journal: TradeJournal;
  let errorBook: ErrorBook;
  let successBook: SuccessBook;
  let memoryDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "experience-sync-test-"));
    journal = new TradeJournal(join(tempDir, "state", "journal.jsonl"));
    errorBook = new ErrorBook(join(tempDir, "state", "error-book.json"));
    successBook = new SuccessBook(join(tempDir, "state", "success-book.json"));
    memoryDir = join(tempDir, "memory");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("buildTradeInsights", () => {
    it("produces empty message when no trades", () => {
      const md = buildTradeInsights(journal);
      expect(md).toContain("# Trading Insights");
      expect(md).toContain("No trades recorded yet.");
    });

    it("produces summary with trade statistics and last synced footer", () => {
      journal.append({
        id: "t-1",
        timestamp: 1708819200000,
        symbol: "BTC/USDT",
        side: "buy",
        price: 67500,
        quantity: 0.1,
        notional: 6750,
        source: "paper",
        pnl: 500,
      });
      journal.append({
        id: "t-2",
        timestamp: 1708822800000,
        symbol: "ETH/USDT",
        side: "sell",
        price: 3400,
        quantity: 1,
        notional: 3400,
        source: "paper",
        pnl: -200,
      });

      const md = buildTradeInsights(journal);
      expect(md).toContain("## Overall Summary");
      expect(md).toContain("Total trades: 2");
      expect(md).toContain("Win rate: 50.0%");
      expect(md).toContain("Total P&L:");
      expect(md).toContain("## Recent Trades");
      expect(md).toContain("BUY BTC/USDT");
      expect(md).toContain("SELL ETH/USDT");
      expect(md).toMatch(/_Last synced: \d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("buildErrorPatterns", () => {
    it("produces empty message when no patterns", () => {
      const md = buildErrorPatterns(errorBook);
      expect(md).toContain("# Trading Error Patterns");
      expect(md).toContain("No error patterns recorded yet.");
    });

    it("groups patterns by severity with constraints", () => {
      // Record a critical pattern (5 occurrences)
      for (let i = 0; i < 5; i++) {
        errorBook.record({
          id: "chasing-momentum",
          description: "Chased momentum",
          category: "entry",
          loss: 640,
          tradeId: `t-${i}`,
          symbol: "BTC/USDT",
          regime: "volatile",
          constraint: "Do not buy when RSI > 80",
        });
      }

      // Record a low severity pattern
      errorBook.record({
        id: "early-exit",
        description: "Exited too early",
        category: "exit",
        loss: 100,
        tradeId: "t-x",
        symbol: "ETH/USDT",
      });

      const md = buildErrorPatterns(errorBook);
      expect(md).toContain("## Critical");
      expect(md).toContain("**chasing-momentum**");
      expect(md).toContain("5 occurrences");
      expect(md).toContain("Do not buy when RSI > 80");
      expect(md).toContain("Symbols: BTC/USDT");
      expect(md).toContain("Regimes: volatile");
      expect(md).toContain("## Low");
      expect(md).toContain("**early-exit**");
      expect(md).toMatch(/_Last synced: \d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("buildSuccessPatterns", () => {
    it("produces empty message when no patterns", () => {
      const md = buildSuccessPatterns(successBook);
      expect(md).toContain("# Trading Success Patterns");
      expect(md).toContain("No success patterns recorded yet.");
    });

    it("groups patterns by confidence with insights", () => {
      // Proven pattern (10 occ, >$5000)
      for (let i = 0; i < 10; i++) {
        successBook.record({
          id: "trend-following",
          description: "Trend following",
          category: "entry",
          profit: 600,
          tradeId: `t-${i}`,
          symbol: "BTC/USDT",
          regime: "bull",
          insight: "BTC trend following works in bull regime",
        });
      }

      // Emerging pattern
      successBook.record({
        id: "mean-reversion",
        description: "Mean reversion",
        category: "entry",
        profit: 100,
        tradeId: "t-x",
        symbol: "ETH/USDT",
      });

      const md = buildSuccessPatterns(successBook);
      expect(md).toContain("## Proven");
      expect(md).toContain("**trend-following**");
      expect(md).toContain("10 occurrences");
      expect(md).toContain("BTC trend following works in bull regime");
      expect(md).toContain("Symbols: BTC/USDT");
      expect(md).toContain("Regimes: bull");
      expect(md).toContain("## Emerging");
      expect(md).toContain("**mean-reversion**");
      expect(md).toMatch(/_Last synced: \d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("syncToMemory", () => {
    it("creates all 3 markdown files in the memory directory", () => {
      syncToMemory(journal, errorBook, successBook, memoryDir);

      expect(existsSync(join(memoryDir, "fin-trade-insights.md"))).toBe(true);
      expect(existsSync(join(memoryDir, "fin-error-patterns.md"))).toBe(true);
      expect(existsSync(join(memoryDir, "fin-success-patterns.md"))).toBe(true);
    });

    it("writes human-readable content (not raw JSON)", () => {
      journal.append({
        id: "t-1",
        timestamp: Date.now(),
        symbol: "BTC/USDT",
        side: "buy",
        price: 67500,
        quantity: 0.1,
        notional: 6750,
        source: "paper",
        pnl: 500,
      });

      errorBook.record({
        id: "bad-entry",
        description: "Bad entry",
        category: "entry",
        loss: 200,
        tradeId: "t-err",
        symbol: "BTC/USDT",
        constraint: "Do not FOMO",
      });

      successBook.record({
        id: "good-entry",
        description: "Good entry",
        category: "entry",
        profit: 500,
        tradeId: "t-ok",
        symbol: "BTC/USDT",
        insight: "Patience pays off",
      });

      syncToMemory(journal, errorBook, successBook, memoryDir);

      const insights = readFileSync(join(memoryDir, "fin-trade-insights.md"), "utf-8");
      expect(insights).toContain("# Trading Insights");
      expect(insights).not.toContain("{"); // Not raw JSON

      const errors = readFileSync(join(memoryDir, "fin-error-patterns.md"), "utf-8");
      expect(errors).toContain("# Trading Error Patterns");
      expect(errors).toContain("Do not FOMO");

      const successes = readFileSync(join(memoryDir, "fin-success-patterns.md"), "utf-8");
      expect(successes).toContain("# Trading Success Patterns");
      expect(successes).toContain("Patience pays off");
    });

    it("handles empty data gracefully", () => {
      syncToMemory(journal, errorBook, successBook, memoryDir);

      const insights = readFileSync(join(memoryDir, "fin-trade-insights.md"), "utf-8");
      expect(insights).toContain("No trades recorded yet.");

      const errors = readFileSync(join(memoryDir, "fin-error-patterns.md"), "utf-8");
      expect(errors).toContain("No error patterns recorded yet.");

      const successes = readFileSync(join(memoryDir, "fin-success-patterns.md"), "utf-8");
      expect(successes).toContain("No success patterns recorded yet.");
    });

    it("creates memory directory if it does not exist", () => {
      const nested = join(tempDir, "deep", "nested", "memory");
      expect(existsSync(nested)).toBe(false);

      syncToMemory(journal, errorBook, successBook, nested);
      expect(existsSync(join(nested, "fin-trade-insights.md"))).toBe(true);
    });

    it("overwrites previous memory files on re-sync", () => {
      syncToMemory(journal, errorBook, successBook, memoryDir);

      let insights = readFileSync(join(memoryDir, "fin-trade-insights.md"), "utf-8");
      expect(insights).toContain("No trades recorded yet.");

      // Add a trade and re-sync
      journal.append({
        id: "t-1",
        timestamp: Date.now(),
        symbol: "BTC/USDT",
        side: "buy",
        price: 67500,
        quantity: 0.1,
        notional: 6750,
        source: "paper",
        pnl: 1000,
      });

      syncToMemory(journal, errorBook, successBook, memoryDir);

      insights = readFileSync(join(memoryDir, "fin-trade-insights.md"), "utf-8");
      expect(insights).not.toContain("No trades recorded yet.");
      expect(insights).toContain("Total trades: 1");
    });
  });
});
