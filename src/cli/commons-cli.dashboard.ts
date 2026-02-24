/**
 * CLI Dashboard for FinClaw Commons.
 *
 * Renders a terminal-based overview with ASCII bar charts,
 * lifecycle overview, contributor leaderboard, and recent activity.
 */

import type {
  CommonsOverview,
  DimensionStats,
  ContributorSummary,
} from "../commons/dashboard-data.js";
import type { CommonsEntryWithFcs } from "../commons/types.fcs.js";
import { renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";
import { formatFcsCompact } from "./commons-cli.fcs.format.js";

const TYPE_EMOJI: Record<string, string> = {
  skill: "🛠",
  strategy: "📊",
  connector: "🔌",
  persona: "🎭",
  workspace: "📁",
  "knowledge-pack": "📚",
  "compliance-ruleset": "📋",
};

const TYPE_LABELS: Record<string, string> = {
  skill: "Skills",
  strategy: "Strategies",
  connector: "Connectors",
  persona: "Personas",
  workspace: "Workspaces",
  "knowledge-pack": "Knowledge Packs",
  "compliance-ruleset": "Compliance Rulesets",
};

export type DashboardOptions = {
  json?: boolean;
  compact?: boolean;
};

/** Render the full CLI dashboard. */
export function formatDashboard(overview: CommonsOverview, opts: DashboardOptions): string {
  if (opts.json) {
    return JSON.stringify(overview, null, 2);
  }

  const lines: string[] = [];

  lines.push(theme.heading("FinClaw Commons Dashboard"));
  lines.push(theme.muted(`Total entries: ${overview.totalEntries}`));
  lines.push("");

  // Section 1: Dimension bar chart
  lines.push(renderDimensionChart(overview.dimensions));
  lines.push("");

  // Section 2: Lifecycle overview
  lines.push(renderLifecycleOverview(overview.lifecycleCounts));
  lines.push("");

  if (!opts.compact) {
    // Section 3: Leaderboard
    if (overview.topContributors.length > 0) {
      lines.push(renderLeaderboard(overview.topContributors));
      lines.push("");
    }

    // Section 4: Recent activity
    if (overview.recentActivity.length > 0) {
      lines.push(renderRecentActivity(overview.recentActivity));
    }
  }

  return lines.join("\n");
}

/** Render ASCII horizontal bar chart for 7 dimensions. */
function renderDimensionChart(dimensions: DimensionStats[]): string {
  const lines: string[] = [];
  lines.push(theme.heading("7-Dimension Contribution Overview"));

  const maxCount = Math.max(1, ...dimensions.map((d) => d.count));
  const termWidth = process.stdout.columns ?? 100;
  const labelWidth = 22; // longest label + padding
  const barMaxWidth = Math.max(10, termWidth - labelWidth - 10);

  for (const dim of dimensions) {
    const emoji = TYPE_EMOJI[dim.type] ?? "📦";
    const label = `${emoji} ${TYPE_LABELS[dim.type] ?? dim.type}`;
    const paddedLabel = label.padEnd(labelWidth);
    const barWidth = Math.round((dim.count / maxCount) * barMaxWidth);
    const bar = barWidth > 0 ? "█".repeat(barWidth) : "";
    lines.push(`  ${paddedLabel}${theme.accent(bar)}  ${dim.count}`);
  }

  return lines.join("\n");
}

/** Render lifecycle tier overview with counts. */
function renderLifecycleOverview(counts: {
  seedling: number;
  growing: number;
  established: number;
}): string {
  const lines: string[] = [];
  lines.push(theme.heading("Entry Lifecycle"));

  const maxCount = Math.max(1, counts.seedling, counts.growing, counts.established);
  const termWidth = process.stdout.columns ?? 100;
  const barMaxWidth = Math.max(5, termWidth - 30);

  const tiers = [
    { emoji: "🌱", label: "Seedling", count: counts.seedling, color: theme.warn },
    { emoji: "🌿", label: "Growing", count: counts.growing, color: theme.info },
    { emoji: "🌳", label: "Established", count: counts.established, color: theme.success },
  ];

  for (const tier of tiers) {
    const paddedLabel = `  ${tier.emoji} ${tier.label}`.padEnd(20);
    const barWidth = Math.round((tier.count / maxCount) * barMaxWidth);
    const bar = barWidth > 0 ? "█".repeat(barWidth) : "";
    lines.push(`${paddedLabel}${String(tier.count).padStart(3)}  ${tier.color(bar)}`);
  }

  return lines.join("\n");
}

/** Render contributor leaderboard table. */
function renderLeaderboard(contributors: ContributorSummary[]): string {
  const lines: string[] = [];
  lines.push(theme.heading("Top Contributors"));

  const tableWidth = Math.max(60, (process.stdout.columns ?? 100) - 1);
  const rows = contributors.map((c, i) => ({
    Rank: `#${i + 1}`,
    Contributor: theme.command(c.author),
    Entries: String(c.count),
    "FCS Avg": c.averageFcs > 0 ? c.averageFcs.toFixed(1) : "—",
    "Top Dimension": c.types[0] ?? "—",
  }));

  const columns = [
    { key: "Rank", header: "Rank", minWidth: 6 },
    { key: "Contributor", header: "Contributor", minWidth: 14, flex: true },
    { key: "Entries", header: "Entries", minWidth: 8 },
    { key: "FCS Avg", header: "FCS Avg", minWidth: 8 },
    { key: "Top Dimension", header: "Top Dimension", minWidth: 14 },
  ];

  lines.push(renderTable({ width: tableWidth, columns, rows }).trimEnd());
  return lines.join("\n");
}

/** Render recent activity feed. */
function renderRecentActivity(entries: CommonsEntryWithFcs[]): string {
  const lines: string[] = [];
  lines.push(theme.heading("Recent Activity"));

  const tableWidth = Math.max(60, (process.stdout.columns ?? 100) - 1);
  const rows = entries.map((e) => {
    const emoji = TYPE_EMOJI[e.type] ?? "📦";
    return {
      Type: `${emoji} ${e.type}`,
      ID: theme.command(e.id),
      FCS: formatFcsCompact(e.fcs),
      Updated: e.updatedAt.slice(0, 10),
      Author: theme.muted(e.author),
    };
  });

  const columns = [
    { key: "Type", header: "Type", minWidth: 12 },
    { key: "ID", header: "ID", minWidth: 16, flex: true },
    { key: "FCS", header: "FCS", minWidth: 18 },
    { key: "Updated", header: "Updated", minWidth: 12 },
    { key: "Author", header: "Author", minWidth: 10 },
  ];

  lines.push(renderTable({ width: tableWidth, columns, rows }).trimEnd());
  return lines.join("\n");
}
