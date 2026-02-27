import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { TradeEntry, TradeFilter, TradeSummary } from "./types.js";

export class TradeJournal {
  constructor(private filePath: string) {}

  /** Append a trade entry to the journal (one JSON line). */
  append(entry: TradeEntry): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    appendFileSync(this.filePath, JSON.stringify(entry) + "\n");
  }

  /** Query trades matching the filter. */
  query(filter?: TradeFilter): TradeEntry[] {
    const entries = this.readAll();
    if (!filter) return entries;

    return entries.filter((e) => {
      if (filter.strategyId && e.strategyId !== filter.strategyId) return false;
      if (filter.symbol && e.symbol !== filter.symbol) return false;
      if (filter.source && e.source !== filter.source) return false;
      if (filter.side && e.side !== filter.side) return false;
      if (filter.since && e.timestamp < filter.since) return false;
      if (filter.until && e.timestamp > filter.until) return false;
      return true;
    });
  }

  /** Get the N most recent trades. */
  recent(n: number): TradeEntry[] {
    const entries = this.readAll();
    return entries.slice(-n);
  }

  /** Summarize trades for a specific strategy (or all). */
  summarize(strategyId?: string): TradeSummary {
    const trades = strategyId ? this.query({ strategyId }) : this.readAll();
    const withPnl = trades.filter((t) => t.pnl != null);

    const wins = withPnl.filter((t) => t.pnl! > 0);
    const losses = withPnl.filter((t) => t.pnl! < 0);

    const totalPnl = withPnl.reduce((sum, t) => sum + t.pnl!, 0);
    const sumWins = wins.reduce((sum, t) => sum + t.pnl!, 0);
    const sumLosses = losses.reduce((sum, t) => sum + t.pnl!, 0);

    return {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: withPnl.length > 0 ? wins.length / withPnl.length : 0,
      totalPnl,
      avgPnl: withPnl.length > 0 ? totalPnl / withPnl.length : 0,
      profitFactor: sumLosses !== 0 ? sumWins / Math.abs(sumLosses) : sumWins > 0 ? Infinity : 0,
      largestWin: wins.length > 0 ? Math.max(...wins.map((t) => t.pnl!)) : 0,
      largestLoss: losses.length > 0 ? Math.min(...losses.map((t) => t.pnl!)) : 0,
    };
  }

  /** Get total number of entries. */
  count(): number {
    return this.readAll().length;
  }

  /** Read all entries from the JSONL file. */
  private readAll(): TradeEntry[] {
    if (!existsSync(this.filePath)) return [];

    const content = readFileSync(this.filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    return lines.map((line) => JSON.parse(line) as TradeEntry);
  }
}
