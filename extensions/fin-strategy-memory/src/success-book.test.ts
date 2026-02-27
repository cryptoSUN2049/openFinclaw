import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SuccessBook } from "./success-book.js";

describe("SuccessBook", () => {
  let tempDir: string;
  let bookPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "success-book-test-"));
    bookPath = join(tempDir, "state", "success-book.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("records a new pattern with confidence=emerging", () => {
    const book = new SuccessBook(bookPath);
    book.record({
      id: "trend-following-bull",
      description: "Trend following in bull regime",
      category: "entry",
      profit: 500,
      tradeId: "t-1",
      symbol: "BTC/USDT",
      regime: "bull",
      insight: "BTC trend following works best with ATR filter",
    });

    const patterns = book.all();
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.occurrences).toBe(1);
    expect(patterns[0]!.confidence).toBe("emerging");
    expect(patterns[0]!.symbols).toEqual(["BTC/USDT"]);
    expect(patterns[0]!.insight).toBe("BTC trend following works best with ATR filter");
  });

  it("auto-upgrades to confirmed after 5 occurrences and >$1000 profit", () => {
    const book = new SuccessBook(bookPath);
    const base = {
      id: "mean-reversion",
      description: "Mean reversion on oversold",
      category: "entry" as const,
      profit: 300,
      symbol: "ETH/USDT",
    };

    for (let i = 0; i < 5; i++) {
      book.record({ ...base, tradeId: `t-${i}` });
    }

    const pattern = book.all()[0]!;
    expect(pattern.occurrences).toBe(5);
    expect(pattern.totalProfit).toBe(1500);
    expect(pattern.confidence).toBe("confirmed");
  });

  it("auto-upgrades to proven after 10 occurrences and >$5000 profit", () => {
    const book = new SuccessBook(bookPath);
    const base = {
      id: "breakout-strategy",
      description: "Volume breakout",
      category: "entry" as const,
      profit: 600,
      symbol: "BTC/USDT",
    };

    for (let i = 0; i < 10; i++) {
      book.record({ ...base, tradeId: `t-${i}` });
    }

    const pattern = book.all()[0]!;
    expect(pattern.occurrences).toBe(10);
    expect(pattern.totalProfit).toBe(6000);
    expect(pattern.confidence).toBe("proven");
  });

  it("stays emerging if occurrences high but profit low", () => {
    const book = new SuccessBook(bookPath);
    const base = {
      id: "scalping",
      description: "Scalping micro moves",
      category: "entry" as const,
      profit: 10,
      symbol: "BTC/USDT",
    };

    // 5 occurrences but only $50 total profit — needs both conditions
    for (let i = 0; i < 5; i++) {
      book.record({ ...base, tradeId: `t-${i}` });
    }

    expect(book.all()[0]!.confidence).toBe("emerging");
  });

  it("topSuccesses(2) returns top 2 by confidence then profit", () => {
    const book = new SuccessBook(bookPath);

    // Pattern A: proven (10 occ, $6000)
    for (let i = 0; i < 10; i++) {
      book.record({
        id: "pattern-a",
        description: "Proven pattern",
        category: "entry",
        profit: 600,
        tradeId: `a-${i}`,
        symbol: "BTC/USDT",
      });
    }

    // Pattern B: confirmed (5 occ, $1500)
    for (let i = 0; i < 5; i++) {
      book.record({
        id: "pattern-b",
        description: "Confirmed pattern",
        category: "exit",
        profit: 300,
        tradeId: `b-${i}`,
        symbol: "ETH/USDT",
      });
    }

    // Pattern C: emerging (1 occ, $100)
    book.record({
      id: "pattern-c",
      description: "Emerging pattern",
      category: "timing",
      profit: 100,
      tradeId: "c-0",
      symbol: "SOL/USDT",
    });

    const top2 = book.topSuccesses(2);
    expect(top2).toHaveLength(2);
    expect(top2[0]!.id).toBe("pattern-a"); // proven
    expect(top2[1]!.id).toBe("pattern-b"); // confirmed
  });

  it("getInsights filters by symbol", () => {
    const book = new SuccessBook(bookPath);
    book.record({
      id: "p1",
      description: "D1",
      category: "entry",
      profit: 100,
      tradeId: "t-1",
      symbol: "BTC/USDT",
      insight: "BTC loves breakouts",
    });
    book.record({
      id: "p2",
      description: "D2",
      category: "exit",
      profit: 100,
      tradeId: "t-2",
      symbol: "ETH/USDT",
      insight: "ETH mean reversion works",
    });

    expect(book.getInsights("BTC/USDT")).toEqual(["BTC loves breakouts"]);
    expect(book.getInsights("ETH/USDT")).toEqual(["ETH mean reversion works"]);
  });

  it("getInsights filters by regime", () => {
    const book = new SuccessBook(bookPath);
    book.record({
      id: "p1",
      description: "D1",
      category: "entry",
      profit: 100,
      tradeId: "t-1",
      symbol: "BTC/USDT",
      regime: "bull",
      insight: "Go long in bull",
    });
    book.record({
      id: "p2",
      description: "D2",
      category: "sizing",
      profit: 100,
      tradeId: "t-2",
      symbol: "ETH/USDT",
      regime: "bear",
      insight: "Small size in bear",
    });

    expect(book.getInsights(undefined, "bull")).toEqual(["Go long in bull"]);
  });

  it("returns empty success book when file does not exist", () => {
    const missing = new SuccessBook(join(tempDir, "nonexistent", "missing.json"));
    expect(missing.all()).toEqual([]);
    expect(missing.topSuccesses(5)).toEqual([]);
    expect(missing.getInsights()).toEqual([]);
  });

  it("persists data across instances (save + load)", () => {
    const book1 = new SuccessBook(bookPath);
    book1.record({
      id: "persist-test",
      description: "Test persistence",
      category: "risk",
      profit: 250,
      tradeId: "t-1",
      symbol: "BTC/USDT",
      regime: "sideways",
      insight: "Works in sideways",
    });
    book1.record({
      id: "persist-test",
      description: "Test persistence",
      category: "risk",
      profit: 300,
      tradeId: "t-2",
      symbol: "ETH/USDT",
    });

    const book2 = new SuccessBook(bookPath);
    const patterns = book2.all();
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.id).toBe("persist-test");
    expect(patterns[0]!.occurrences).toBe(2);
    expect(patterns[0]!.totalProfit).toBe(550);
    expect(patterns[0]!.symbols).toEqual(["BTC/USDT", "ETH/USDT"]);
    expect(patterns[0]!.regimes).toEqual(["sideways"]);
    expect(patterns[0]!.insight).toBe("Works in sideways");
  });

  it("accumulates unique symbols and regimes across records", () => {
    const book = new SuccessBook(bookPath);
    const base = {
      id: "multi-symbol",
      description: "Multi-symbol success",
      category: "entry" as const,
      profit: 100,
    };

    book.record({ ...base, tradeId: "t-1", symbol: "BTC/USDT", regime: "bull" });
    book.record({ ...base, tradeId: "t-2", symbol: "BTC/USDT", regime: "bull" }); // duplicate
    book.record({ ...base, tradeId: "t-3", symbol: "ETH/USDT", regime: "bear" });

    const pattern = book.all()[0]!;
    expect(pattern.symbols).toEqual(["BTC/USDT", "ETH/USDT"]);
    expect(pattern.regimes).toEqual(["bull", "bear"]);
    expect(pattern.tradeIds).toEqual(["t-1", "t-2", "t-3"]);
  });

  it("getInsights returns all when no filters provided", () => {
    const book = new SuccessBook(bookPath);
    book.record({
      id: "p1",
      description: "D1",
      category: "entry",
      profit: 100,
      tradeId: "t-1",
      symbol: "BTC/USDT",
      insight: "I1",
    });
    book.record({
      id: "p2",
      description: "D2",
      category: "exit",
      profit: 100,
      tradeId: "t-2",
      symbol: "ETH/USDT",
      insight: "I2",
    });

    const all = book.getInsights();
    expect(all).toHaveLength(2);
    expect(all).toContain("I1");
    expect(all).toContain("I2");
  });
});
