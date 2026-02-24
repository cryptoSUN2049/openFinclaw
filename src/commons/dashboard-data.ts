/**
 * Dashboard data aggregation for FinClaw Commons.
 *
 * Computes overview statistics, dimension breakdowns, contributor
 * leaderboards, and recent activity from the merged commons index.
 */

import type { CommonsEntryWithFcs, LifecycleTier } from "./types.fcs.js";
import type { CommonsEntryType } from "./types.js";

/** Per-dimension statistics. */
export type DimensionStats = {
  type: CommonsEntryType;
  count: number;
  seedling: number;
  growing: number;
  established: number;
  topContributors: { author: string; count: number }[];
};

/** Contributor summary across dimensions. */
export type ContributorSummary = {
  author: string;
  count: number;
  averageFcs: number;
  types: CommonsEntryType[];
};

/** High-level commons ecosystem overview. */
export type CommonsOverview = {
  totalEntries: number;
  dimensions: DimensionStats[];
  topContributors: ContributorSummary[];
  recentActivity: CommonsEntryWithFcs[];
  lifecycleCounts: { seedling: number; growing: number; established: number };
};

const ALL_DIMENSIONS: CommonsEntryType[] = [
  "skill",
  "strategy",
  "connector",
  "persona",
  "workspace",
  "knowledge-pack",
  "compliance-ruleset",
];

/** Compute a full overview of the commons ecosystem. */
export function computeCommonsOverview(entries: CommonsEntryWithFcs[]): CommonsOverview {
  const dimensions = ALL_DIMENSIONS.map((type) => computeDimensionStats(type, entries));

  const lifecycleCounts = { seedling: 0, growing: 0, established: 0 };
  for (const entry of entries) {
    const tier = entry.fcs?.lifecycle?.tier ?? "seedling";
    lifecycleCounts[tier]++;
  }

  const topContributors = computeTopContributors(entries);

  const recentActivity = [...entries]
    .toSorted((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  return {
    totalEntries: entries.length,
    dimensions,
    topContributors,
    recentActivity,
    lifecycleCounts,
  };
}

/** Compute statistics for a single dimension/type. */
function computeDimensionStats(
  type: CommonsEntryType,
  entries: CommonsEntryWithFcs[],
): DimensionStats {
  const typeEntries = entries.filter((e) => e.type === type);

  const tierCounts: Record<LifecycleTier, number> = { seedling: 0, growing: 0, established: 0 };
  for (const entry of typeEntries) {
    const tier = entry.fcs?.lifecycle?.tier ?? "seedling";
    tierCounts[tier]++;
  }

  // Count contributions per author for this type
  const authorCounts = new Map<string, number>();
  for (const entry of typeEntries) {
    authorCounts.set(entry.author, (authorCounts.get(entry.author) ?? 0) + 1);
  }
  const topContributors = [...authorCounts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([author, count]) => ({ author, count }));

  return {
    type,
    count: typeEntries.length,
    seedling: tierCounts.seedling,
    growing: tierCounts.growing,
    established: tierCounts.established,
    topContributors,
  };
}

/** Compute top contributors across all dimensions. */
function computeTopContributors(entries: CommonsEntryWithFcs[]): ContributorSummary[] {
  const authorData = new Map<
    string,
    { count: number; fcsSum: number; types: Set<CommonsEntryType> }
  >();

  for (const entry of entries) {
    const existing = authorData.get(entry.author) ?? { count: 0, fcsSum: 0, types: new Set() };
    existing.count++;
    existing.fcsSum += entry.fcs?.score?.total ?? 0;
    existing.types.add(entry.type);
    authorData.set(entry.author, existing);
  }

  return [...authorData.entries()]
    .toSorted((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([author, data]) => ({
      author,
      count: data.count,
      averageFcs: data.count > 0 ? Math.round((data.fcsSum / data.count) * 10) / 10 : 0,
      types: [...data.types],
    }));
}
