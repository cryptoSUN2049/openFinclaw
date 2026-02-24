import { describe, it, expect } from "vitest";
import { computeCommonsOverview } from "./dashboard-data.js";
import type { CommonsEntryWithFcs } from "./types.fcs.js";

function makeEntry(
  overrides: Partial<CommonsEntryWithFcs> & { id: string; type: CommonsEntryWithFcs["type"] },
): CommonsEntryWithFcs {
  return {
    name: overrides.id,
    description: "test",
    version: "1.0.0",
    author: "alice",
    tags: [],
    path: `skills/${overrides.id}`,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    ...overrides,
  };
}

describe("computeCommonsOverview", () => {
  it("handles empty entries", () => {
    const overview = computeCommonsOverview([]);
    expect(overview.totalEntries).toBe(0);
    expect(overview.dimensions).toHaveLength(7);
    for (const dim of overview.dimensions) {
      expect(dim.count).toBe(0);
    }
    expect(overview.lifecycleCounts).toEqual({ seedling: 0, growing: 0, established: 0 });
    expect(overview.topContributors).toEqual([]);
    expect(overview.recentActivity).toEqual([]);
  });

  it("counts entries per dimension", () => {
    const entries: CommonsEntryWithFcs[] = [
      makeEntry({ id: "s1", type: "skill" }),
      makeEntry({ id: "s2", type: "skill" }),
      makeEntry({ id: "c1", type: "connector" }),
      makeEntry({ id: "w1", type: "workspace" }),
    ];
    const overview = computeCommonsOverview(entries);

    expect(overview.totalEntries).toBe(4);
    const skillDim = overview.dimensions.find((d) => d.type === "skill");
    expect(skillDim?.count).toBe(2);
    const connDim = overview.dimensions.find((d) => d.type === "connector");
    expect(connDim?.count).toBe(1);
    const wsDim = overview.dimensions.find((d) => d.type === "workspace");
    expect(wsDim?.count).toBe(1);
    const stratDim = overview.dimensions.find((d) => d.type === "strategy");
    expect(stratDim?.count).toBe(0);
  });

  it("counts lifecycle tiers", () => {
    const entries: CommonsEntryWithFcs[] = [
      makeEntry({
        id: "a",
        type: "skill",
        fcs: {
          entryId: "a",
          score: {
            total: 40,
            breakdown: { quality: 40, usage: 0, social: 0, freshness: 0 },
            calculatedAt: "",
            decayApplied: 0,
          },
          lifecycle: { tier: "growing", status: "active", tierHistory: [] },
        },
      }),
      makeEntry({
        id: "b",
        type: "skill",
        fcs: {
          entryId: "b",
          score: {
            total: 70,
            breakdown: { quality: 70, usage: 0, social: 0, freshness: 0 },
            calculatedAt: "",
            decayApplied: 0,
          },
          lifecycle: { tier: "established", status: "active", tierHistory: [] },
        },
      }),
      makeEntry({ id: "c", type: "skill" }), // no fcs → seedling
    ];
    const overview = computeCommonsOverview(entries);
    expect(overview.lifecycleCounts).toEqual({ seedling: 1, growing: 1, established: 1 });
  });

  it("computes top contributors", () => {
    const entries: CommonsEntryWithFcs[] = [
      makeEntry({ id: "a1", type: "skill", author: "alice" }),
      makeEntry({ id: "a2", type: "strategy", author: "alice" }),
      makeEntry({ id: "b1", type: "skill", author: "bob" }),
    ];
    const overview = computeCommonsOverview(entries);
    expect(overview.topContributors[0].author).toBe("alice");
    expect(overview.topContributors[0].count).toBe(2);
    expect(overview.topContributors[0].types).toContain("skill");
    expect(overview.topContributors[0].types).toContain("strategy");
    expect(overview.topContributors[1].author).toBe("bob");
    expect(overview.topContributors[1].count).toBe(1);
  });

  it("returns recent activity sorted by updatedAt descending", () => {
    const entries: CommonsEntryWithFcs[] = [
      makeEntry({ id: "old", type: "skill", updatedAt: "2026-01-01T00:00:00Z" }),
      makeEntry({ id: "new", type: "skill", updatedAt: "2026-02-20T00:00:00Z" }),
      makeEntry({ id: "mid", type: "skill", updatedAt: "2026-02-10T00:00:00Z" }),
    ];
    const overview = computeCommonsOverview(entries);
    expect(overview.recentActivity[0].id).toBe("new");
    expect(overview.recentActivity[1].id).toBe("mid");
    expect(overview.recentActivity[2].id).toBe("old");
  });

  it("limits recent activity to 10 entries", () => {
    const entries: CommonsEntryWithFcs[] = Array.from({ length: 15 }, (_, i) =>
      makeEntry({
        id: `e${i}`,
        type: "skill",
        updatedAt: `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      }),
    );
    const overview = computeCommonsOverview(entries);
    expect(overview.recentActivity).toHaveLength(10);
  });

  it("computes per-dimension top contributors", () => {
    const entries: CommonsEntryWithFcs[] = [
      makeEntry({ id: "a1", type: "skill", author: "alice" }),
      makeEntry({ id: "a2", type: "skill", author: "alice" }),
      makeEntry({ id: "b1", type: "skill", author: "bob" }),
    ];
    const overview = computeCommonsOverview(entries);
    const skillDim = overview.dimensions.find((d) => d.type === "skill");
    expect(skillDim?.topContributors[0]).toEqual({ author: "alice", count: 2 });
  });

  it("computes average FCS for contributors", () => {
    const entries: CommonsEntryWithFcs[] = [
      makeEntry({
        id: "a1",
        type: "skill",
        author: "alice",
        fcs: {
          entryId: "a1",
          score: {
            total: 80,
            breakdown: { quality: 80, usage: 0, social: 0, freshness: 0 },
            calculatedAt: "",
            decayApplied: 0,
          },
          lifecycle: { tier: "established", status: "active", tierHistory: [] },
        },
      }),
      makeEntry({
        id: "a2",
        type: "skill",
        author: "alice",
        fcs: {
          entryId: "a2",
          score: {
            total: 60,
            breakdown: { quality: 60, usage: 0, social: 0, freshness: 0 },
            calculatedAt: "",
            decayApplied: 0,
          },
          lifecycle: { tier: "growing", status: "active", tierHistory: [] },
        },
      }),
    ];
    const overview = computeCommonsOverview(entries);
    expect(overview.topContributors[0].averageFcs).toBe(70);
  });
});
