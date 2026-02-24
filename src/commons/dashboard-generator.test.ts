import { describe, it, expect } from "vitest";
import { buildDashboardData } from "../../commons/dashboard/generator.js";
import type { CommonsEntryWithFcs } from "./types.fcs.js";

function makeEntry(
  overrides: Partial<CommonsEntryWithFcs> & { id: string; type: CommonsEntryWithFcs["type"] },
): CommonsEntryWithFcs {
  return {
    name: overrides.id,
    description: "test entry",
    version: "1.0.0",
    author: "test-author",
    tags: [],
    path: `skills/${overrides.id}`,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildDashboardData", () => {
  it("returns overview and entries from empty input", () => {
    const result = buildDashboardData([]);
    expect(result.overview.totalEntries).toBe(0);
    expect(result.entries).toEqual([]);
    expect(result.overview.dimensions).toHaveLength(7);
  });

  it("computes overview from entries", () => {
    const entries: CommonsEntryWithFcs[] = [
      makeEntry({ id: "s1", type: "skill" }),
      makeEntry({ id: "s2", type: "strategy" }),
      makeEntry({ id: "c1", type: "connector" }),
    ];
    const result = buildDashboardData(entries);

    expect(result.overview.totalEntries).toBe(3);
    expect(result.entries).toHaveLength(3);

    const skillDim = result.overview.dimensions.find((d) => d.type === "skill");
    expect(skillDim?.count).toBe(1);
    const stratDim = result.overview.dimensions.find((d) => d.type === "strategy");
    expect(stratDim?.count).toBe(1);
  });

  it("includes FCS data in entries passthrough", () => {
    const entries: CommonsEntryWithFcs[] = [
      makeEntry({
        id: "with-fcs",
        type: "skill",
        fcs: {
          entryId: "with-fcs",
          score: {
            total: 75,
            breakdown: { quality: 80, usage: 50, social: 60, freshness: 90 },
            calculatedAt: "2026-02-01T00:00:00Z",
            decayApplied: 0.1,
          },
          lifecycle: { tier: "established", status: "active", tierHistory: [] },
        },
      }),
    ];
    const result = buildDashboardData(entries);
    expect(result.entries[0].fcs?.score.total).toBe(75);
    expect(result.overview.lifecycleCounts.established).toBe(1);
  });

  it("handles mixed entries with and without FCS", () => {
    const entries: CommonsEntryWithFcs[] = [
      makeEntry({ id: "no-fcs", type: "skill" }),
      makeEntry({
        id: "has-fcs",
        type: "skill",
        fcs: {
          entryId: "has-fcs",
          score: {
            total: 40,
            breakdown: { quality: 40, usage: 0, social: 0, freshness: 0 },
            calculatedAt: "",
            decayApplied: 0,
          },
          lifecycle: { tier: "growing", status: "active", tierHistory: [] },
        },
      }),
    ];
    const result = buildDashboardData(entries);
    expect(result.overview.lifecycleCounts.seedling).toBe(1);
    expect(result.overview.lifecycleCounts.growing).toBe(1);
  });
});
