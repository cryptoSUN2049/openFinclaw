import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ErrorPattern } from "./types.js";

const SEVERITY_ORDER = ["low", "medium", "high", "critical"] as const;

function computeSeverity(occurrences: number, totalLoss: number): ErrorPattern["severity"] {
  if (occurrences >= 5 || totalLoss > 5000) return "critical";
  if (occurrences >= 3 || totalLoss > 2000) return "high";
  if (occurrences >= 2 || totalLoss > 500) return "medium";
  return "low";
}

export class ErrorBook {
  private patterns: Map<string, ErrorPattern>;

  constructor(private filePath: string) {
    this.patterns = new Map();
    this.load();
  }

  /** Record or accumulate an error pattern. */
  record(params: {
    id: string;
    description: string;
    category: ErrorPattern["category"];
    loss: number;
    tradeId: string;
    symbol: string;
    regime?: string;
    constraint?: string;
  }): void {
    const existing = this.patterns.get(params.id);

    if (existing) {
      existing.occurrences += 1;
      existing.totalLoss += params.loss;
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
      if (params.constraint) {
        existing.constraint = params.constraint;
      }
      existing.severity = computeSeverity(existing.occurrences, existing.totalLoss);
    } else {
      const pattern: ErrorPattern = {
        id: params.id,
        description: params.description,
        category: params.category,
        occurrences: 1,
        totalLoss: params.loss,
        severity: computeSeverity(1, params.loss),
        symbols: [params.symbol],
        regimes: params.regime ? [params.regime] : [],
        constraint: params.constraint,
        lastSeen: Date.now(),
        tradeIds: [params.tradeId],
      };
      this.patterns.set(params.id, pattern);
    }

    this.save();
  }

  /** Get top N error patterns by severity + total loss. */
  topErrors(n?: number): ErrorPattern[] {
    const sorted = [...this.patterns.values()].sort((a, b) => {
      const sevDiff = SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity);
      if (sevDiff !== 0) return sevDiff;
      return b.totalLoss - a.totalLoss;
    });
    return n != null ? sorted.slice(0, n) : sorted;
  }

  /** Get constraints for a specific symbol + regime. */
  getConstraints(symbol?: string, regime?: string): string[] {
    const constraints: string[] = [];
    for (const pattern of this.patterns.values()) {
      if (!pattern.constraint) continue;
      if (symbol && !pattern.symbols.includes(symbol)) continue;
      if (regime && !pattern.regimes.includes(regime)) continue;
      constraints.push(pattern.constraint);
    }
    return constraints;
  }

  /** Get all patterns. */
  all(): ErrorPattern[] {
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
      const data = JSON.parse(content) as { patterns: ErrorPattern[] };
      for (const pattern of data.patterns) {
        this.patterns.set(pattern.id, pattern);
      }
    } catch {
      // Corrupted or empty file — start fresh.
    }
  }
}
