import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TradeJournal } from "./trade-journal.js";
import type { TradeEntry } from "./types.js";

function makeTrade(overrides: Partial<TradeEntry> = {}): TradeEntry {
  return {
    id: `trade-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    symbol: "BTC/USDT",
    side: "buy",
    price: 67500,
    quantity: 0.1,
    notional: 6750,
    source: "paper",
    ...overrides,
  };
}

describe("TradeJournal", () => {
  let tempDir: string;
  let journalPath: string;
  let journal: TradeJournal;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "trade-journal-test-"));
    journalPath = join(tempDir, "state", "journal.jsonl");
    journal = new TradeJournal(journalPath);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("appends entries and queries all with data integrity", () => {
    const entries: TradeEntry[] = [];
    for (let i = 0; i < 10; i++) {
      const entry = makeTrade({ id: `t-${i}`, timestamp: 1000 + i });
      entries.push(entry);
      journal.append(entry);
    }

    const result = journal.query();
    expect(result).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(result[i]!.id).toBe(`t-${i}`);
      expect(result[i]!.timestamp).toBe(1000 + i);
      expect(result[i]!.symbol).toBe("BTC/USDT");
    }
  });

  it("filters by strategyId", () => {
    journal.append(makeTrade({ id: "a1", strategyId: "alpha" }));
    journal.append(makeTrade({ id: "b1", strategyId: "beta" }));
    journal.append(makeTrade({ id: "a2", strategyId: "alpha" }));
    journal.append(makeTrade({ id: "c1" }));

    const result = journal.query({ strategyId: "alpha" });
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("a1");
    expect(result[1]!.id).toBe("a2");
  });

  it("filters by symbol", () => {
    journal.append(makeTrade({ id: "btc1", symbol: "BTC/USDT" }));
    journal.append(makeTrade({ id: "eth1", symbol: "ETH/USDT" }));
    journal.append(makeTrade({ id: "btc2", symbol: "BTC/USDT" }));

    const result = journal.query({ symbol: "ETH/USDT" });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("eth1");
  });

  it("filters by time range (since/until)", () => {
    journal.append(makeTrade({ id: "t1", timestamp: 1000 }));
    journal.append(makeTrade({ id: "t2", timestamp: 2000 }));
    journal.append(makeTrade({ id: "t3", timestamp: 3000 }));
    journal.append(makeTrade({ id: "t4", timestamp: 4000 }));
    journal.append(makeTrade({ id: "t5", timestamp: 5000 }));

    const result = journal.query({ since: 2000, until: 4000 });
    expect(result).toHaveLength(3);
    expect(result.map((t) => t.id)).toEqual(["t2", "t3", "t4"]);
  });

  it("filters by source and side", () => {
    journal.append(makeTrade({ id: "l1", source: "live", side: "buy" }));
    journal.append(makeTrade({ id: "p1", source: "paper", side: "sell" }));
    journal.append(makeTrade({ id: "l2", source: "live", side: "sell" }));

    expect(journal.query({ source: "live" })).toHaveLength(2);
    expect(journal.query({ side: "sell" })).toHaveLength(2);
    expect(journal.query({ source: "live", side: "sell" })).toHaveLength(1);
  });

  it("recent(n) returns last n entries in chronological order", () => {
    for (let i = 0; i < 10; i++) {
      journal.append(makeTrade({ id: `t-${i}`, timestamp: 1000 + i }));
    }

    const result = journal.recent(3);
    expect(result).toHaveLength(3);
    expect(result[0]!.id).toBe("t-7");
    expect(result[1]!.id).toBe("t-8");
    expect(result[2]!.id).toBe("t-9");
  });

  it("summarize() computes correct statistics", () => {
    // 3 wins, 2 losses, 1 open (no pnl)
    journal.append(makeTrade({ pnl: 500, strategyId: "s1" }));
    journal.append(makeTrade({ pnl: -200, strategyId: "s1" }));
    journal.append(makeTrade({ pnl: 300, strategyId: "s1" }));
    journal.append(makeTrade({ pnl: -100, strategyId: "s1" }));
    journal.append(makeTrade({ pnl: 1000, strategyId: "s1" }));
    journal.append(makeTrade({ strategyId: "s1" })); // open, no pnl

    const summary = journal.summarize("s1");
    expect(summary.totalTrades).toBe(6);
    expect(summary.wins).toBe(3);
    expect(summary.losses).toBe(2);
    expect(summary.winRate).toBeCloseTo(0.6);
    expect(summary.totalPnl).toBe(1500);
    expect(summary.avgPnl).toBe(300);
    // profitFactor = sum(wins) / abs(sum(losses)) = 1800 / 300 = 6
    expect(summary.profitFactor).toBe(6);
    expect(summary.largestWin).toBe(1000);
    expect(summary.largestLoss).toBe(-200);
  });

  it("returns empty results when file does not exist", () => {
    const missing = new TradeJournal(join(tempDir, "nonexistent.jsonl"));
    expect(missing.query()).toEqual([]);
    expect(missing.count()).toBe(0);
    expect(missing.recent(5)).toEqual([]);

    const summary = missing.summarize();
    expect(summary.totalTrades).toBe(0);
    expect(summary.winRate).toBe(0);
    expect(summary.profitFactor).toBe(0);
  });

  it("handles empty file gracefully", () => {
    const { mkdirSync } = require("node:fs");
    const { dirname } = require("node:path");
    mkdirSync(dirname(journalPath), { recursive: true });
    writeFileSync(journalPath, "", "utf-8");

    expect(journal.query()).toEqual([]);
    expect(journal.count()).toBe(0);
  });

  it("summarize() handles all-wins scenario (profitFactor = Infinity)", () => {
    journal.append(makeTrade({ pnl: 100 }));
    journal.append(makeTrade({ pnl: 200 }));

    const summary = journal.summarize();
    expect(summary.profitFactor).toBe(Infinity);
  });

  it("summarize() handles all-losses scenario (profitFactor = 0)", () => {
    journal.append(makeTrade({ pnl: -100 }));
    journal.append(makeTrade({ pnl: -200 }));

    const summary = journal.summarize();
    expect(summary.profitFactor).toBe(0);
    expect(summary.largestLoss).toBe(-200);
  });

  it("count() returns correct number", () => {
    expect(journal.count()).toBe(0);
    journal.append(makeTrade());
    journal.append(makeTrade());
    journal.append(makeTrade());
    expect(journal.count()).toBe(3);
  });
});
