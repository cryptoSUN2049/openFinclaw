/**
 * CLI formatting for FCS (FinClaw Commons Score) output.
 *
 * Provides score bars, lifecycle badges, and formatted displays
 * for FCS-related CLI commands.
 */

import type { FcsEntryData, LifecycleTier, LifecycleStatus } from "../commons/types.fcs.js";
import type { CommonsEntry } from "../commons/types.js";
import { renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";

// ---------------------------------------------------------------------------
// Emoji / Badge constants
// ---------------------------------------------------------------------------

const TIER_BADGE: Record<LifecycleTier, string> = {
  seedling: "🌱 Seedling",
  growing: "🌿 Growing",
  established: "🌳 Established",
};

const STATUS_BADGE: Record<LifecycleStatus, string> = {
  active: "Active",
  degrading: "Degrading",
  archived: "Archived",
  delisted: "Delisted",
};

// ---------------------------------------------------------------------------
// Score bar rendering
// ---------------------------------------------------------------------------

/** Render an ASCII score bar with percentage label. */
export function renderScoreBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);

  let colorFn: (s: string) => string;
  if (score >= 65) {
    colorFn = theme.success;
  } else if (score >= 30) {
    colorFn = theme.warn;
  } else {
    colorFn = theme.error;
  }

  return `${colorFn(bar)} ${score.toFixed(1)}`;
}

/** Format lifecycle tier+status as a colored badge. */
export function formatLifecycleBadge(tier: LifecycleTier, status: LifecycleStatus): string {
  const tierStr = TIER_BADGE[tier];

  let statusColorFn: (s: string) => string;
  switch (status) {
    case "active":
      statusColorFn = theme.success;
      break;
    case "degrading":
      statusColorFn = theme.warn;
      break;
    case "archived":
      statusColorFn = theme.muted;
      break;
    case "delisted":
      statusColorFn = theme.error;
      break;
  }

  return `${tierStr} ${statusColorFn(`(${STATUS_BADGE[status]})`)}`;
}

// ---------------------------------------------------------------------------
// Score detail view
// ---------------------------------------------------------------------------

export type FcsScoreDisplayOptions = {
  json?: boolean;
  history?: boolean;
};

/** Format detailed FCS score display for a single entry. */
export function formatFcsScore(
  entry: CommonsEntry,
  fcs: FcsEntryData,
  opts: FcsScoreDisplayOptions,
): string {
  if (opts.json) {
    return JSON.stringify({ entry: entry.id, ...fcs }, null, 2);
  }

  const lines: string[] = [];
  const { score, lifecycle } = fcs;

  lines.push(`${theme.heading("FCS Score")} ${theme.muted(`— ${entry.id}`)}`);
  lines.push("");
  lines.push(`  ${theme.muted("Total:")}     ${renderScoreBar(score.total)}`);
  lines.push(`  ${theme.muted("Quality:")}   ${renderScoreBar(score.breakdown.quality)}`);
  lines.push(`  ${theme.muted("Usage:")}     ${renderScoreBar(score.breakdown.usage)}`);
  lines.push(`  ${theme.muted("Social:")}    ${renderScoreBar(score.breakdown.social)}`);
  lines.push(`  ${theme.muted("Freshness:")} ${renderScoreBar(score.breakdown.freshness)}`);
  lines.push("");
  lines.push(
    `  ${theme.muted("Lifecycle:")}  ${formatLifecycleBadge(lifecycle.tier, lifecycle.status)}`,
  );
  lines.push(`  ${theme.muted("Calculated:")} ${score.calculatedAt}`);

  if (score.decayApplied > 0) {
    lines.push(`  ${theme.muted("Decay:")}      ${(score.decayApplied * 100).toFixed(1)}%`);
  }

  // Type-specific metrics
  if (fcs.backtest) {
    lines.push("");
    lines.push(`  ${theme.heading("Backtest Results:")}`);
    lines.push(`    ${theme.muted("Period:")}      ${fcs.backtest.period}`);
    lines.push(`    ${theme.muted("Sharpe:")}      ${fcs.backtest.sharpeRatio.toFixed(2)}`);
    lines.push(`    ${theme.muted("Max DD:")}      ${fcs.backtest.maxDrawdownPct.toFixed(1)}%`);
    lines.push(`    ${theme.muted("Return:")}      ${fcs.backtest.totalReturnPct.toFixed(1)}%`);
    lines.push(`    ${theme.muted("Win Rate:")}    ${fcs.backtest.winRatePct.toFixed(1)}%`);
    lines.push(`    ${theme.muted("Trades:")}      ${fcs.backtest.tradeCount}`);
  }

  if (fcs.connectorHealth) {
    lines.push("");
    lines.push(`  ${theme.heading("Connector Health:")}`);
    lines.push(`    ${theme.muted("Uptime:")}      ${fcs.connectorHealth.uptimePct.toFixed(1)}%`);
    lines.push(
      `    ${theme.muted("Latency:")}     ${fcs.connectorHealth.avgLatencyMs.toFixed(0)}ms`,
    );
    lines.push(
      `    ${theme.muted("Error Rate:")}  ${(fcs.connectorHealth.errorRate * 100).toFixed(1)}%`,
    );
    lines.push(`    ${theme.muted("Last Check:")}  ${fcs.connectorHealth.lastCheckedAt}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Lifecycle detail view
// ---------------------------------------------------------------------------

export type LifecycleDisplayOptions = {
  json?: boolean;
};

/** Format lifecycle state display for a single entry. */
export function formatLifecycleState(
  entry: CommonsEntry,
  fcs: FcsEntryData,
  opts: LifecycleDisplayOptions,
): string {
  if (opts.json) {
    return JSON.stringify({ entry: entry.id, lifecycle: fcs.lifecycle }, null, 2);
  }

  const { lifecycle } = fcs;
  const lines: string[] = [];

  lines.push(`${theme.heading("Lifecycle")} ${theme.muted(`— ${entry.id}`)}`);
  lines.push("");
  lines.push(
    `  ${theme.muted("Status:")} ${formatLifecycleBadge(lifecycle.tier, lifecycle.status)}`,
  );

  if (lifecycle.promotedAt) {
    lines.push(`  ${theme.muted("Last Promotion:")} ${lifecycle.promotedAt}`);
  }
  if (lifecycle.degradedAt) {
    lines.push(`  ${theme.muted("Degraded Since:")} ${lifecycle.degradedAt}`);
  }
  if (lifecycle.archivedAt) {
    lines.push(`  ${theme.muted("Archived At:")} ${lifecycle.archivedAt}`);
  }
  if (lifecycle.delistReason) {
    lines.push(`  ${theme.muted("Delist Reason:")} ${theme.error(lifecycle.delistReason)}`);
  }

  if (lifecycle.tierHistory.length > 0) {
    lines.push("");
    lines.push(`  ${theme.heading("History:")}`);

    const tableWidth = Math.max(50, (process.stdout.columns ?? 100) - 4);
    const rows = lifecycle.tierHistory.map((h) => ({
      Tier: TIER_BADGE[h.tier],
      Status: h.status,
      Date: h.changedAt,
      Reason: h.reason ?? "",
    }));
    const columns = [
      { key: "Tier", header: "Tier", minWidth: 16 },
      { key: "Status", header: "Status", minWidth: 10 },
      { key: "Date", header: "Date", minWidth: 20 },
      { key: "Reason", header: "Reason", minWidth: 10, flex: true },
    ];
    lines.push(renderTable({ width: tableWidth, columns, rows }).trimEnd());
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// FCS column for list view
// ---------------------------------------------------------------------------

/** Format a compact FCS score for table cells. */
export function formatFcsCompact(fcs?: FcsEntryData): string {
  if (!fcs) {
    return theme.muted("—");
  }
  const score = fcs.score.total;
  const tier = TIER_BADGE[fcs.lifecycle.tier];

  let colorFn: (s: string) => string;
  if (score >= 65) {
    colorFn = theme.success;
  } else if (score >= 30) {
    colorFn = theme.warn;
  } else {
    colorFn = theme.error;
  }

  return `${colorFn(score.toFixed(0))} ${tier}`;
}
