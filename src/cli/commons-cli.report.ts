/**
 * Static Markdown report generator for FinClaw Commons.
 *
 * Generates a Markdown file with shields.io badges, dimension tables,
 * contributor leaderboards, and recent activity — suitable for embedding
 * in README.md or publishing as a standalone document.
 */

import type { CommonsOverview, ContributorSummary } from "../commons/dashboard-data.js";
import type { CommonsEntryWithFcs } from "../commons/types.fcs.js";

const BADGE_COLOR = "FF5A2D"; // LOBSTER_PALETTE accent

const TYPE_LABELS: Record<string, string> = {
  skill: "Skills",
  strategy: "Strategies",
  connector: "Connectors",
  persona: "Personas",
  workspace: "Workspaces",
  "knowledge-pack": "Knowledge Packs",
  "compliance-ruleset": "Compliance Rulesets",
};

const TYPE_EMOJI: Record<string, string> = {
  skill: "🛠",
  strategy: "📊",
  connector: "🔌",
  persona: "🎭",
  workspace: "📁",
  "knowledge-pack": "📚",
  "compliance-ruleset": "📋",
};

const TIER_LABEL: Record<string, string> = {
  seedling: "🌱 Seedling",
  growing: "🌿 Growing",
  established: "🌳 Established",
};

export type ReportOptions = {
  badges?: boolean;
};

/** Generate a full Markdown report from commons overview data. */
export function generateMarkdownReport(
  overview: CommonsOverview,
  opts: ReportOptions = {},
): string {
  const lines: string[] = [];
  const showBadges = opts.badges !== false;

  // Title
  lines.push("# FinClaw Commons Report");
  lines.push("");

  // Badges
  if (showBadges) {
    lines.push(renderBadges(overview));
    lines.push("");
  }

  // Dimension table
  lines.push("## 7-Dimension Overview");
  lines.push("");
  lines.push(renderDimensionTable(overview));
  lines.push("");

  // Lifecycle summary
  lines.push("## Lifecycle Distribution");
  lines.push("");
  lines.push(renderLifecycleTable(overview));
  lines.push("");

  // Leaderboard
  if (overview.topContributors.length > 0) {
    lines.push("## Top Contributors");
    lines.push("");
    lines.push(renderContributorTable(overview.topContributors));
    lines.push("");
  }

  // Recent activity
  if (overview.recentActivity.length > 0) {
    lines.push("## Recent Activity");
    lines.push("");
    lines.push(renderActivityTable(overview.recentActivity));
    lines.push("");
  }

  // Footer
  lines.push("---");
  lines.push(`*Generated at ${new Date().toISOString()} by FinClaw Commons*`);
  lines.push("");

  return lines.join("\n");
}

function renderBadges(overview: CommonsOverview): string {
  const badges: string[] = [];

  const totalBadge = `![Total Entries](https://img.shields.io/badge/entries-${overview.totalEntries}-${BADGE_COLOR})`;
  badges.push(totalBadge);

  for (const dim of overview.dimensions) {
    if (dim.count > 0) {
      const label = encodeURIComponent(TYPE_LABELS[dim.type] ?? dim.type);
      badges.push(
        `![${TYPE_LABELS[dim.type]}](https://img.shields.io/badge/${label}-${dim.count}-${BADGE_COLOR})`,
      );
    }
  }

  return badges.join(" ");
}

function renderDimensionTable(overview: CommonsOverview): string {
  const lines: string[] = [];
  lines.push("| Dimension | Count | 🌱 Seedling | 🌿 Growing | 🌳 Established |");
  lines.push("|-----------|------:|------------:|----------:|--------------:|");

  for (const dim of overview.dimensions) {
    const emoji = TYPE_EMOJI[dim.type] ?? "📦";
    const label = `${emoji} ${TYPE_LABELS[dim.type] ?? dim.type}`;
    lines.push(
      `| ${label} | ${dim.count} | ${dim.seedling} | ${dim.growing} | ${dim.established} |`,
    );
  }

  return lines.join("\n");
}

function renderLifecycleTable(overview: CommonsOverview): string {
  const { seedling, growing, established } = overview.lifecycleCounts;
  const total = seedling + growing + established;

  const lines: string[] = [];
  lines.push("| Tier | Count | Percentage |");
  lines.push("|------|------:|-----------:|");
  lines.push(
    `| 🌱 Seedling | ${seedling} | ${total > 0 ? ((seedling / total) * 100).toFixed(0) : 0}% |`,
  );
  lines.push(
    `| 🌿 Growing | ${growing} | ${total > 0 ? ((growing / total) * 100).toFixed(0) : 0}% |`,
  );
  lines.push(
    `| 🌳 Established | ${established} | ${total > 0 ? ((established / total) * 100).toFixed(0) : 0}% |`,
  );

  return lines.join("\n");
}

function renderContributorTable(contributors: ContributorSummary[]): string {
  const lines: string[] = [];
  lines.push("| Rank | Contributor | Entries | FCS Avg | Top Dimension |");
  lines.push("|-----:|------------|--------:|--------:|---------------|");

  contributors.forEach((c, i) => {
    const fcs = c.averageFcs > 0 ? c.averageFcs.toFixed(1) : "—";
    const topType = c.types[0] ? (TYPE_LABELS[c.types[0]] ?? c.types[0]) : "—";
    lines.push(`| ${i + 1} | ${c.author} | ${c.count} | ${fcs} | ${topType} |`);
  });

  return lines.join("\n");
}

function renderActivityTable(entries: CommonsEntryWithFcs[]): string {
  const lines: string[] = [];
  lines.push("| Type | ID | FCS | Tier | Updated | Author |");
  lines.push("|------|----|----|------|---------|--------|");

  for (const e of entries) {
    const emoji = TYPE_EMOJI[e.type] ?? "📦";
    const fcs = e.fcs?.score?.total?.toFixed(0) ?? "—";
    const tier = e.fcs?.lifecycle?.tier ? (TIER_LABEL[e.fcs.lifecycle.tier] ?? "—") : "—";
    lines.push(
      `| ${emoji} ${e.type} | ${e.id} | ${fcs} | ${tier} | ${e.updatedAt.slice(0, 10)} | ${e.author} |`,
    );
  }

  return lines.join("\n");
}
