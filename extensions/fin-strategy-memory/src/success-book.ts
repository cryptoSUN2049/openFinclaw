import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SuccessPattern } from "./types.js";

const CONFIDENCE_ORDER = ["emerging", "confirmed", "proven"] as const;

function computeConfidence(occurrences: number, totalProfit: number): SuccessPattern["confidence"] {
  if (occurrences >= 10 && totalProfit > 5000) return "proven";
  if (occurrences >= 5 && totalProfit > 1000) return "confirmed";
  return "emerging";
}

export class SuccessBook {
  private patterns: Map<string, SuccessPattern>;

  constructor(private filePath: string) {
    this.patterns = new Map();
    this.load();
  }

  /** Record or accumulate a success pattern. */
  record(params: {
    id: string;
    description: string;
    category: SuccessPattern["category"];
    profit: number;
    tradeId: string;
    symbol: string;
    regime?: string;
    insight?: string;
  }): void {
    const existing = this.patterns.get(params.id);

    if (existing) {
      existing.occurrences += 1;
      existing.totalProfit += params.profit;
      existing.lastSeen = Date.now();
      if (!existing.tradeIds.includes(params.tradeId)) {
        existing.tradeIds.push(params.tradeId);
      }
      if (!existing.symbols.includes(params.symbol)) {
        existing.symbols.push(params.symbol);
      }
      if (params.regime && !existing.regimes.includes(params.regime)) {
        existing.regimes.push(params.regime);
      }
      if (params.insight) {
        existing.insight = params.insight;
      }
      existing.confidence = computeConfidence(existing.occurrences, existing.totalProfit);
    } else {
      const pattern: SuccessPattern = {
        id: params.id,
        description: params.description,
        category: params.category,
        occurrences: 1,
        totalProfit: params.profit,
        confidence: computeConfidence(1, params.profit),
        symbols: [params.symbol],
        regimes: params.regime ? [params.regime] : [],
        insight: params.insight,
        lastSeen: Date.now(),
        tradeIds: [params.tradeId],
      };
      this.patterns.set(params.id, pattern);
    }

    this.save();
  }

  /** Get top N success patterns by confidence + total profit. */
  topSuccesses(n?: number): SuccessPattern[] {
    const sorted = [...this.patterns.values()].sort((a, b) => {
      const confDiff =
        CONFIDENCE_ORDER.indexOf(b.confidence) - CONFIDENCE_ORDER.indexOf(a.confidence);
      if (confDiff !== 0) return confDiff;
      return b.totalProfit - a.totalProfit;
    });
    return n != null ? sorted.slice(0, n) : sorted;
  }

  /** Get insights for a specific symbol + regime. */
  getInsights(symbol?: string, regime?: string): string[] {
    const insights: string[] = [];
    for (const pattern of this.patterns.values()) {
      if (!pattern.insight) continue;
      if (symbol && !pattern.symbols.includes(symbol)) continue;
      if (regime && !pattern.regimes.includes(regime)) continue;
      insights.push(pattern.insight);
    }
    return insights;
  }

  /** Get all patterns. */
  all(): SuccessPattern[] {
    return [...this.patterns.values()];
  }

  /** Persist to disk. */
  save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const data = { patterns: [...this.patterns.values()] };
    writeFileSync(this.filePath, JSON.stringify(data, null, 2) + "\n");
  }

  /** Load from disk. */
  private load(): void {
    if (!existsSync(this.filePath)) return;

    try {
      const content = readFileSync(this.filePath, "utf-8");
      const data = JSON.parse(content) as { patterns: SuccessPattern[] };
      for (const pattern of data.patterns) {
        this.patterns.set(pattern.id, pattern);
      }
    } catch {
      // Corrupted or empty file — start fresh.
    }
  }
}
