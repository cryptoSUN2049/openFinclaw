import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ErrorBook } from "./error-book.js";
import type { SuccessBook } from "./success-book.js";
import type { TradeJournal } from "./trade-journal.js";
import type { ErrorPattern, SuccessPattern } from "./types.js";

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;
const CONFIDENCE_ORDER = ["proven", "confirmed", "emerging"] as const;

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function formatUsd(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function buildTradeInsights(journal: TradeJournal): string {
  const lines: string[] = ["# Trading Insights"];
  const summary = journal.summarize();

  if (summary.totalTrades === 0) {
    lines.push("", "No trades recorded yet.");
    return lines.join("\n") + "\n";
  }

  lines.push("", "## Overall Summary");
  lines.push(`- Total trades: ${summary.totalTrades}`);
  lines.push(`- Win rate: ${(summary.winRate * 100).toFixed(1)}%`);
  lines.push(`- Total P&L: ${formatUsd(summary.totalPnl)}`);
  lines.push(`- Average P&L: ${formatUsd(summary.avgPnl)}`);
  lines.push(
    `- Profit factor: ${summary.profitFactor === Infinity ? "N/A (no losses)" : summary.profitFactor.toFixed(2)}`,
  );
  lines.push(`- Largest win: ${formatUsd(summary.largestWin)}`);
  lines.push(`- Largest loss: ${formatUsd(summary.largestLoss)}`);

  // Recent trades section
  const recent = journal.recent(10);
  if (recent.length > 0) {
    lines.push("", "## Recent Trades");
    for (const t of recent) {
      const pnlStr = t.pnl != null ? ` (${formatUsd(t.pnl)})` : " (open)";
      lines.push(
        `- ${formatDate(t.timestamp)} ${t.side.toUpperCase()} ${t.symbol} @ $${t.price}${pnlStr}`,
      );
    }
  }

  // Per-strategy breakdown
  const strategyIds = new Set(
    journal
      .query()
      .map((t) => t.strategyId)
      .filter(Boolean),
  );
  if (strategyIds.size > 0) {
    lines.push("", "## By Strategy");
    for (const sid of strategyIds) {
      const s = journal.summarize(sid);
      lines.push("", `### ${sid}`);
      lines.push(
        `- Trades: ${s.totalTrades}, Win rate: ${(s.winRate * 100).toFixed(1)}%, P&L: ${formatUsd(s.totalPnl)}`,
      );
    }
  }

  lines.push("", `_Last synced: ${new Date().toISOString()}_`);
  return lines.join("\n") + "\n";
}

function buildErrorPatterns(errorBook: ErrorBook): string {
  const lines: string[] = ["# Trading Error Patterns"];
  const all = errorBook.all();

  if (all.length === 0) {
    lines.push("", "No error patterns recorded yet.");
    return lines.join("\n") + "\n";
  }

  // Group by severity
  const grouped = new Map<string, ErrorPattern[]>();
  for (const sev of SEVERITY_ORDER) {
    grouped.set(sev, []);
  }
  for (const p of all) {
    grouped.get(p.severity)!.push(p);
  }

  // Sort within each group by totalLoss desc
  for (const patterns of grouped.values()) {
    patterns.sort((a, b) => b.totalLoss - a.totalLoss);
  }

  for (const sev of SEVERITY_ORDER) {
    const patterns = grouped.get(sev)!;
    if (patterns.length === 0) continue;

    const label = sev.charAt(0).toUpperCase() + sev.slice(1);
    lines.push("", `## ${label}`);

    for (const p of patterns) {
      const constraint = p.constraint ? `: ${p.constraint}` : "";
      lines.push(
        `- **${p.id}** (${p.occurrences} occurrences, -$${Math.abs(p.totalLoss).toLocaleString("en-US")})${constraint}`,
      );
      if (p.symbols.length > 0) {
        lines.push(`  - Symbols: ${p.symbols.join(", ")}`);
      }
      if (p.regimes.length > 0) {
        lines.push(`  - Regimes: ${p.regimes.join(", ")}`);
      }
    }
  }

  lines.push("", `_Last synced: ${new Date().toISOString()}_`);
  return lines.join("\n") + "\n";
}

function buildSuccessPatterns(successBook: SuccessBook): string {
  const lines: string[] = ["# Trading Success Patterns"];
  const all = successBook.all();

  if (all.length === 0) {
    lines.push("", "No success patterns recorded yet.");
    return lines.join("\n") + "\n";
  }

  // Group by confidence
  const grouped = new Map<string, SuccessPattern[]>();
  for (const conf of CONFIDENCE_ORDER) {
    grouped.set(conf, []);
  }
  for (const p of all) {
    grouped.get(p.confidence)!.push(p);
  }

  // Sort within each group by totalProfit desc
  for (const patterns of grouped.values()) {
    patterns.sort((a, b) => b.totalProfit - a.totalProfit);
  }

  for (const conf of CONFIDENCE_ORDER) {
    const patterns = grouped.get(conf)!;
    if (patterns.length === 0) continue;

    const label = conf.charAt(0).toUpperCase() + conf.slice(1);
    lines.push("", `## ${label}`);

    for (const p of patterns) {
      const insight = p.insight ? `: ${p.insight}` : "";
      lines.push(
        `- **${p.id}** (${p.occurrences} occurrences, +$${p.totalProfit.toLocaleString("en-US")})${insight}`,
      );
      if (p.symbols.length > 0) {
        lines.push(`  - Symbols: ${p.symbols.join(", ")}`);
      }
      if (p.regimes.length > 0) {
        lines.push(`  - Regimes: ${p.regimes.join(", ")}`);
      }
    }
  }

  lines.push("", `_Last synced: ${new Date().toISOString()}_`);
  return lines.join("\n") + "\n";
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Sync synthesized markdown to the memory directory for vector indexing. */
export function syncToMemory(
  journal: TradeJournal,
  errorBook: ErrorBook,
  successBook: SuccessBook,
  memoryDir: string,
): void {
  const insightsPath = join(memoryDir, "fin-trade-insights.md");
  const errorPatternsPath = join(memoryDir, "fin-error-patterns.md");
  const successPatternsPath = join(memoryDir, "fin-success-patterns.md");

  ensureDir(insightsPath);

  writeFileSync(insightsPath, buildTradeInsights(journal));
  writeFileSync(errorPatternsPath, buildErrorPatterns(errorBook));
  writeFileSync(successPatternsPath, buildSuccessPatterns(successBook));
}

// Export builders for testing
export { buildTradeInsights, buildErrorPatterns, buildSuccessPatterns };
