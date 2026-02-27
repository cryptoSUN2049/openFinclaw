import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErrorBook } from "./error-book.js";

describe("ErrorBook", () => {
  let tempDir: string;
  let bookPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "error-book-test-"));
    bookPath = join(tempDir, "state", "error-book.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("records a new pattern with severity=low", () => {
    const book = new ErrorBook(bookPath);
    book.record({
      id: "chasing-momentum",
      description: "Entered long when RSI > 80",
      category: "entry",
      loss: 100,
      tradeId: "t-1",
      symbol: "BTC/USDT",
      regime: "bull",
      constraint: "Do not buy when RSI > 80",
    });

    const patterns = book.all();
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.occurrences).toBe(1);
    expect(patterns[0]!.severity).toBe("low");
    expect(patterns[0]!.symbols).toEqual(["BTC/USDT"]);
    expect(patterns[0]!.constraint).toBe("Do not buy when RSI > 80");
  });

  it("auto-upgrades to high severity after 3 occurrences", () => {
    const book = new ErrorBook(bookPath);
    const base = {
      id: "chasing-momentum",
      description: "Entered long when RSI > 80",
      category: "entry" as const,
      loss: 100,
      symbol: "BTC/USDT",
    };

    book.record({ ...base, tradeId: "t-1" });
    expect(book.all()[0]!.severity).toBe("low");

    book.record({ ...base, tradeId: "t-2" });
    expect(book.all()[0]!.severity).toBe("medium");

    book.record({ ...base, tradeId: "t-3" });
    expect(book.all()[0]!.severity).toBe("high");
    expect(book.all()[0]!.occurrences).toBe(3);
    expect(book.all()[0]!.totalLoss).toBe(300);
  });

  it("auto-upgrades to critical severity after 5 occurrences", () => {
    const book = new ErrorBook(bookPath);
    const base = {
      id: "bad-sizing",
      description: "Position too large",
      category: "sizing" as const,
      loss: 50,
      symbol: "ETH/USDT",
    };

    for (let i = 0; i < 5; i++) {
      book.record({ ...base, tradeId: `t-${i}` });
    }

    const pattern = book.all()[0]!;
    expect(pattern.severity).toBe("critical");
    expect(pattern.occurrences).toBe(5);
    expect(pattern.tradeIds).toHaveLength(5);
  });

  it("auto-upgrades to critical severity when totalLoss > 5000", () => {
    const book = new ErrorBook(bookPath);
    book.record({
      id: "big-loss",
      description: "Single massive loss",
      category: "risk",
      loss: 5001,
      tradeId: "t-1",
      symbol: "BTC/USDT",
    });

    expect(book.all()[0]!.severity).toBe("critical");
  });

  it("topErrors(2) returns top 2 by severity then loss", () => {
    const book = new ErrorBook(bookPath);

    // Create patterns with different severities
    // Pattern A: 5 occurrences -> critical
    for (let i = 0; i < 5; i++) {
      book.record({
        id: "pattern-a",
        description: "Critical pattern",
        category: "entry",
        loss: 100,
        tradeId: `a-${i}`,
        symbol: "BTC/USDT",
      });
    }

    // Pattern B: 3 occurrences -> high
    for (let i = 0; i < 3; i++) {
      book.record({
        id: "pattern-b",
        description: "High pattern",
        category: "exit",
        loss: 200,
        tradeId: `b-${i}`,
        symbol: "ETH/USDT",
      });
    }

    // Pattern C: 1 occurrence -> low
    book.record({
      id: "pattern-c",
      description: "Low pattern",
      category: "timing",
      loss: 50,
      tradeId: "c-0",
      symbol: "SOL/USDT",
    });

    const top2 = book.topErrors(2);
    expect(top2).toHaveLength(2);
    expect(top2[0]!.id).toBe("pattern-a"); // critical
    expect(top2[1]!.id).toBe("pattern-b"); // high
  });

  it("getConstraints filters by symbol", () => {
    const book = new ErrorBook(bookPath);
    book.record({
      id: "p1",
      description: "D1",
      category: "entry",
      loss: 100,
      tradeId: "t-1",
      symbol: "BTC/USDT",
      constraint: "No BTC buys above 70k",
    });
    book.record({
      id: "p2",
      description: "D2",
      category: "exit",
      loss: 100,
      tradeId: "t-2",
      symbol: "ETH/USDT",
      constraint: "Wait for ETH confirmation",
    });

    const btcConstraints = book.getConstraints("BTC/USDT");
    expect(btcConstraints).toEqual(["No BTC buys above 70k"]);

    const ethConstraints = book.getConstraints("ETH/USDT");
    expect(ethConstraints).toEqual(["Wait for ETH confirmation"]);
  });

  it("getConstraints filters by regime", () => {
    const book = new ErrorBook(bookPath);
    book.record({
      id: "p1",
      description: "D1",
      category: "entry",
      loss: 100,
      tradeId: "t-1",
      symbol: "BTC/USDT",
      regime: "bear",
      constraint: "No longs in bear market",
    });
    book.record({
      id: "p2",
      description: "D2",
      category: "sizing",
      loss: 100,
      tradeId: "t-2",
      symbol: "ETH/USDT",
      regime: "bull",
      constraint: "Reduce size in bull euphoria",
    });

    const bearConstraints = book.getConstraints(undefined, "bear");
    expect(bearConstraints).toEqual(["No longs in bear market"]);
  });

  it("returns empty error book when file does not exist", () => {
    const missing = new ErrorBook(join(tempDir, "nonexistent", "missing.json"));
    expect(missing.all()).toEqual([]);
    expect(missing.topErrors(5)).toEqual([]);
    expect(missing.getConstraints()).toEqual([]);
  });

  it("persists data across instances (save + load)", () => {
    const book1 = new ErrorBook(bookPath);
    book1.record({
      id: "persist-test",
      description: "Test persistence",
      category: "risk",
      loss: 250,
      tradeId: "t-1",
      symbol: "BTC/USDT",
      regime: "sideways",
      constraint: "Check risk before trade",
    });
    book1.record({
      id: "persist-test",
      description: "Test persistence",
      category: "risk",
      loss: 300,
      tradeId: "t-2",
      symbol: "ETH/USDT",
    });

    // Create a new instance pointing to the same file
    const book2 = new ErrorBook(bookPath);
    const patterns = book2.all();
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.id).toBe("persist-test");
    expect(patterns[0]!.occurrences).toBe(2);
    expect(patterns[0]!.totalLoss).toBe(550);
    expect(patterns[0]!.symbols).toEqual(["BTC/USDT", "ETH/USDT"]);
    expect(patterns[0]!.regimes).toEqual(["sideways"]);
    expect(patterns[0]!.constraint).toBe("Check risk before trade");
  });

  it("accumulates unique symbols and regimes across records", () => {
    const book = new ErrorBook(bookPath);
    const base = {
      id: "multi-symbol",
      description: "Multi-symbol error",
      category: "entry" as const,
      loss: 100,
    };

    book.record({ ...base, tradeId: "t-1", symbol: "BTC/USDT", regime: "bull" });
    book.record({ ...base, tradeId: "t-2", symbol: "BTC/USDT", regime: "bull" }); // duplicate
    book.record({ ...base, tradeId: "t-3", symbol: "ETH/USDT", regime: "bear" });

    const pattern = book.all()[0]!;
    expect(pattern.symbols).toEqual(["BTC/USDT", "ETH/USDT"]); // no dupes
    expect(pattern.regimes).toEqual(["bull", "bear"]); // no dupes
    expect(pattern.tradeIds).toEqual(["t-1", "t-2", "t-3"]);
  });

  it("getConstraints returns all when no filters provided", () => {
    const book = new ErrorBook(bookPath);
    book.record({
      id: "p1",
      description: "D1",
      category: "entry",
      loss: 100,
      tradeId: "t-1",
      symbol: "BTC/USDT",
      constraint: "C1",
    });
    book.record({
      id: "p2",
      description: "D2",
      category: "exit",
      loss: 100,
      tradeId: "t-2",
      symbol: "ETH/USDT",
      constraint: "C2",
    });

    const all = book.getConstraints();
    expect(all).toHaveLength(2);
    expect(all).toContain("C1");
    expect(all).toContain("C2");
  });
});
