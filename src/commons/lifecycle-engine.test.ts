import { describe, it, expect } from "vitest";
import {
  createInitialLifecycle,
  evaluateLifecycle,
  checkDegradationSignals,
  delistEntry,
  restoreEntry,
  type LifecycleEntryData,
} from "./lifecycle-engine.js";
import type { LifecycleState, LifecycleThresholds } from "./types.fcs.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const defaultThresholds: LifecycleThresholds = {
  seedlingToGrowingThreshold: 30,
  growingToEstablishedThreshold: 65,
  degradationThreshold: 20,
  archivalGracePeriodDays: 90,
};

function makeEntryData(overrides: Partial<LifecycleEntryData> = {}): LifecycleEntryData {
  return { updatedAt: new Date().toISOString(), ...overrides };
}

function makeActiveState(tier: LifecycleState["tier"] = "seedling"): LifecycleState {
  return {
    tier,
    status: "active",
    tierHistory: [{ tier, status: "active", changedAt: new Date().toISOString(), reason: "test" }],
  };
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// createInitialLifecycle
// ---------------------------------------------------------------------------

describe("createInitialLifecycle", () => {
  it("returns seedling + active with initial history entry", () => {
    const state = createInitialLifecycle();
    expect(state.tier).toBe("seedling");
    expect(state.status).toBe("active");
    expect(state.tierHistory).toHaveLength(1);
    expect(state.tierHistory[0].tier).toBe("seedling");
    expect(state.tierHistory[0].status).toBe("active");
    expect(state.tierHistory[0].reason).toBe("Initial publish");
  });
});

// ---------------------------------------------------------------------------
// Tier promotions
// ---------------------------------------------------------------------------

describe("tier promotions", () => {
  it("promotes seedling → growing at FCS ≥ 30", () => {
    const state = makeActiveState("seedling");
    const result = evaluateLifecycle(
      state,
      30,
      "skill",
      makeEntryData({
        usage: {
          installCount: 10,
          activeInstalls30d: 5,
          invocationCount30d: 10,
          lastUsedAt: new Date().toISOString(),
        },
      }),
      defaultThresholds,
    );
    expect(result.tier).toBe("growing");
    expect(result.status).toBe("active");
    expect(result.promotedAt).toBeDefined();
  });

  it("promotes growing → established at FCS ≥ 65", () => {
    const state = makeActiveState("growing");
    const result = evaluateLifecycle(
      state,
      65,
      "skill",
      makeEntryData({
        usage: {
          installCount: 100,
          activeInstalls30d: 50,
          invocationCount30d: 200,
          lastUsedAt: new Date().toISOString(),
        },
      }),
      defaultThresholds,
    );
    expect(result.tier).toBe("established");
    expect(result.status).toBe("active");
  });

  it("does not promote when FCS is below threshold", () => {
    const state = makeActiveState("seedling");
    const result = evaluateLifecycle(
      state,
      29,
      "skill",
      makeEntryData({
        usage: {
          installCount: 10,
          activeInstalls30d: 5,
          invocationCount30d: 10,
          lastUsedAt: new Date().toISOString(),
        },
      }),
      defaultThresholds,
    );
    expect(result.tier).toBe("seedling");
  });

  it("records tier promotions in history", () => {
    const state = makeActiveState("seedling");
    const result = evaluateLifecycle(
      state,
      30,
      "skill",
      makeEntryData({
        usage: {
          installCount: 10,
          activeInstalls30d: 5,
          invocationCount30d: 10,
          lastUsedAt: new Date().toISOString(),
        },
      }),
      defaultThresholds,
    );
    const promoEntry = result.tierHistory.find((h) => h.reason === "Promoted to growing");
    expect(promoEntry).toBeDefined();
    expect(promoEntry!.tier).toBe("growing");
  });
});

// ---------------------------------------------------------------------------
// Degradation
// ---------------------------------------------------------------------------

describe("degradation", () => {
  it("degrades when FCS drops below threshold", () => {
    const state = makeActiveState("growing");
    const result = evaluateLifecycle(
      state,
      15,
      "skill",
      makeEntryData({
        usage: {
          installCount: 10,
          activeInstalls30d: 5,
          invocationCount30d: 10,
          lastUsedAt: new Date().toISOString(),
        },
      }),
      defaultThresholds,
    );
    expect(result.status).toBe("degrading");
    expect(result.degradedAt).toBeDefined();
  });

  it("degrades when type-specific signal fires", () => {
    const state = makeActiveState("growing");
    const data = makeEntryData({
      backtest: {
        period: "2024-01-01/2025-01-01",
        sharpeRatio: -0.5,
        maxDrawdownPct: 10,
        totalReturnPct: -5,
        winRatePct: 40,
        tradeCount: 50,
      },
    });
    const result = evaluateLifecycle(state, 50, "strategy", data, defaultThresholds);
    expect(result.status).toBe("degrading");
  });
});

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

describe("recovery", () => {
  it("recovers from degrading → active when FCS ≥ 30", () => {
    const state: LifecycleState = {
      tier: "growing",
      status: "degrading",
      degradedAt: daysAgo(5),
      tierHistory: [
        { tier: "growing", status: "degrading", changedAt: daysAgo(5), reason: "test" },
      ],
    };
    const result = evaluateLifecycle(
      state,
      35,
      "skill",
      makeEntryData({
        usage: {
          installCount: 10,
          activeInstalls30d: 5,
          invocationCount30d: 10,
          lastUsedAt: new Date().toISOString(),
        },
      }),
      defaultThresholds,
    );
    expect(result.status).toBe("active");
    expect(result.degradedAt).toBeUndefined();
  });

  it("does not recover if degradation signals still active", () => {
    const state: LifecycleState = {
      tier: "growing",
      status: "degrading",
      degradedAt: daysAgo(5),
      tierHistory: [
        { tier: "growing", status: "degrading", changedAt: daysAgo(5), reason: "test" },
      ],
    };
    const data = makeEntryData({
      connectorHealth: {
        uptimePct: 50,
        avgLatencyMs: 100,
        lastCheckedAt: new Date().toISOString(),
        errorRate: 0.02,
      },
    });
    const result = evaluateLifecycle(state, 35, "connector", data, defaultThresholds);
    // Should remain degrading because uptime < 80.
    expect(result.status).toBe("degrading");
  });
});

// ---------------------------------------------------------------------------
// Archival
// ---------------------------------------------------------------------------

describe("archival", () => {
  it("archives after grace period expires", () => {
    const state: LifecycleState = {
      tier: "seedling",
      status: "degrading",
      degradedAt: daysAgo(91),
      tierHistory: [
        { tier: "seedling", status: "degrading", changedAt: daysAgo(91), reason: "test" },
      ],
    };
    const result = evaluateLifecycle(
      state,
      10,
      "skill",
      makeEntryData({
        usage: {
          installCount: 0,
          activeInstalls30d: 0,
          invocationCount30d: 0,
          lastUsedAt: daysAgo(100),
        },
      }),
      defaultThresholds,
    );
    expect(result.status).toBe("archived");
    expect(result.archivedAt).toBeDefined();
  });

  it("does not archive before grace period", () => {
    const state: LifecycleState = {
      tier: "seedling",
      status: "degrading",
      degradedAt: daysAgo(30),
      tierHistory: [
        { tier: "seedling", status: "degrading", changedAt: daysAgo(30), reason: "test" },
      ],
    };
    const result = evaluateLifecycle(
      state,
      10,
      "skill",
      makeEntryData({
        usage: {
          installCount: 0,
          activeInstalls30d: 0,
          invocationCount30d: 0,
          lastUsedAt: daysAgo(100),
        },
      }),
      defaultThresholds,
    );
    expect(result.status).toBe("degrading");
  });
});

// ---------------------------------------------------------------------------
// delistEntry
// ---------------------------------------------------------------------------

describe("delistEntry", () => {
  it("sets status to delisted with reason", () => {
    const state = makeActiveState("established");
    const result = delistEntry(state, "Regulatory violation");
    expect(result.status).toBe("delisted");
    expect(result.delistReason).toBe("Regulatory violation");
  });

  it("records delist in history", () => {
    const state = makeActiveState("seedling");
    const result = delistEntry(state, "DMCA takedown");
    const entry = result.tierHistory.find((h) => h.reason?.startsWith("Delisted:"));
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("delisted");
  });

  it("can delist from any status", () => {
    const degrading: LifecycleState = {
      tier: "growing",
      status: "degrading",
      degradedAt: daysAgo(10),
      tierHistory: [],
    };
    const result = delistEntry(degrading, "Fraud");
    expect(result.status).toBe("delisted");
  });
});

// ---------------------------------------------------------------------------
// restoreEntry
// ---------------------------------------------------------------------------

describe("restoreEntry", () => {
  it("restores archived entry to seedling + active", () => {
    const archived: LifecycleState = {
      tier: "growing",
      status: "archived",
      archivedAt: daysAgo(10),
      tierHistory: [
        { tier: "growing", status: "archived", changedAt: daysAgo(10), reason: "test" },
      ],
    };
    const result = restoreEntry(archived, 35, 30);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("seedling");
    expect(result!.status).toBe("active");
    expect(result!.archivedAt).toBeUndefined();
  });

  it("returns null if FCS is below minimum", () => {
    const archived: LifecycleState = {
      tier: "growing",
      status: "archived",
      archivedAt: daysAgo(10),
      tierHistory: [],
    };
    const result = restoreEntry(archived, 20, 30);
    expect(result).toBeNull();
  });

  it("preserves tier history on restore", () => {
    const archived: LifecycleState = {
      tier: "established",
      status: "archived",
      archivedAt: daysAgo(10),
      tierHistory: [
        { tier: "seedling", status: "active", changedAt: daysAgo(200), reason: "Initial publish" },
        {
          tier: "established",
          status: "archived",
          changedAt: daysAgo(10),
          reason: "Grace expired",
        },
      ],
    };
    const result = restoreEntry(archived, 40, 30);
    expect(result).not.toBeNull();
    // Original 2 entries + 1 new "Restored" entry.
    expect(result!.tierHistory).toHaveLength(3);
    expect(result!.tierHistory[2].reason).toBe("Restored");
  });
});

// ---------------------------------------------------------------------------
// Delisted entries don't auto-change
// ---------------------------------------------------------------------------

describe("delisted entries", () => {
  it("does not change delisted entries automatically", () => {
    const delisted: LifecycleState = {
      tier: "growing",
      status: "delisted",
      delistReason: "Compliance",
      tierHistory: [],
    };
    const result = evaluateLifecycle(
      delisted,
      90,
      "skill",
      makeEntryData({
        usage: {
          installCount: 100,
          activeInstalls30d: 50,
          invocationCount30d: 200,
          lastUsedAt: new Date().toISOString(),
        },
      }),
      defaultThresholds,
    );
    expect(result.status).toBe("delisted");
    expect(result.tier).toBe("growing");
  });
});

// ---------------------------------------------------------------------------
// Archived entries don't auto-change
// ---------------------------------------------------------------------------

describe("archived entries", () => {
  it("does not change archived entries automatically", () => {
    const archived: LifecycleState = {
      tier: "seedling",
      status: "archived",
      archivedAt: daysAgo(10),
      tierHistory: [],
    };
    const result = evaluateLifecycle(archived, 80, "skill", makeEntryData(), defaultThresholds);
    expect(result.status).toBe("archived");
  });
});

// ---------------------------------------------------------------------------
// checkDegradationSignals — per-type
// ---------------------------------------------------------------------------

describe("checkDegradationSignals", () => {
  describe("strategy", () => {
    it("detects negative Sharpe ratio", () => {
      const data = makeEntryData({
        backtest: {
          period: "2024-01-01/2025-01-01",
          sharpeRatio: -0.2,
          maxDrawdownPct: 20,
          totalReturnPct: -3,
          winRatePct: 45,
          tradeCount: 100,
        },
      });
      const result = checkDegradationSignals("strategy", data);
      expect(result.shouldDegrade).toBe(true);
      expect(result.reason).toBe("Negative Sharpe ratio");
    });

    it("detects excessive drawdown", () => {
      const data = makeEntryData({
        backtest: {
          period: "2024-01-01/2025-01-01",
          sharpeRatio: 1.2,
          maxDrawdownPct: 55,
          totalReturnPct: 10,
          winRatePct: 55,
          tradeCount: 80,
        },
      });
      const result = checkDegradationSignals("strategy", data);
      expect(result.shouldDegrade).toBe(true);
      expect(result.reason).toBe("Excessive drawdown (>50%)");
    });

    it("detects stale backtest (via verifiedAt)", () => {
      const data = makeEntryData({
        backtest: {
          period: "2024-01-01/2025-01-01",
          sharpeRatio: 1.0,
          maxDrawdownPct: 15,
          totalReturnPct: 20,
          winRatePct: 60,
          tradeCount: 100,
          verifiedAt: daysAgo(200),
        },
      });
      const result = checkDegradationSignals("strategy", data);
      expect(result.shouldDegrade).toBe(true);
      expect(result.reason).toBe("No backtest update in 180 days");
    });

    it("detects stale strategy with no backtest data", () => {
      const data = makeEntryData({ updatedAt: daysAgo(200) });
      const result = checkDegradationSignals("strategy", data);
      expect(result.shouldDegrade).toBe(true);
      expect(result.reason).toBe("No backtest update in 180 days");
    });

    it("no degradation for healthy strategy", () => {
      const data = makeEntryData({
        backtest: {
          period: "2024-01-01/2025-01-01",
          sharpeRatio: 1.5,
          maxDrawdownPct: 15,
          totalReturnPct: 25,
          winRatePct: 60,
          tradeCount: 200,
          verifiedAt: daysAgo(30),
        },
      });
      const result = checkDegradationSignals("strategy", data);
      expect(result.shouldDegrade).toBe(false);
    });
  });

  describe("connector", () => {
    it("detects low uptime", () => {
      const data = makeEntryData({
        connectorHealth: {
          uptimePct: 75,
          avgLatencyMs: 100,
          lastCheckedAt: new Date().toISOString(),
          errorRate: 0.01,
        },
      });
      const result = checkDegradationSignals("connector", data);
      expect(result.shouldDegrade).toBe(true);
      expect(result.reason).toBe("Low uptime (<80%)");
    });

    it("detects high error rate", () => {
      const data = makeEntryData({
        connectorHealth: {
          uptimePct: 95,
          avgLatencyMs: 100,
          lastCheckedAt: new Date().toISOString(),
          errorRate: 0.15,
        },
      });
      const result = checkDegradationSignals("connector", data);
      expect(result.shouldDegrade).toBe(true);
      expect(result.reason).toBe("High error rate (>10%)");
    });

    it("detects no health check in 30 days", () => {
      const data = makeEntryData({
        connectorHealth: {
          uptimePct: 99,
          avgLatencyMs: 50,
          lastCheckedAt: daysAgo(35),
          errorRate: 0.01,
        },
      });
      const result = checkDegradationSignals("connector", data);
      expect(result.shouldDegrade).toBe(true);
      expect(result.reason).toBe("No health check in 30 days");
    });

    it("no degradation for healthy connector", () => {
      const data = makeEntryData({
        connectorHealth: {
          uptimePct: 99,
          avgLatencyMs: 50,
          lastCheckedAt: new Date().toISOString(),
          errorRate: 0.01,
        },
      });
      const result = checkDegradationSignals("connector", data);
      expect(result.shouldDegrade).toBe(false);
    });
  });

  describe("skill", () => {
    it("detects zero invocations for 90+ days", () => {
      const data = makeEntryData({
        usage: {
          installCount: 10,
          activeInstalls30d: 5,
          invocationCount30d: 0,
          lastUsedAt: daysAgo(100),
        },
      });
      const result = checkDegradationSignals("skill", data);
      expect(result.shouldDegrade).toBe(true);
      expect(result.reason).toBe("No invocations in 90 days");
    });

    it("detects zero active installs", () => {
      const data = makeEntryData({
        usage: { installCount: 10, activeInstalls30d: 0, invocationCount30d: 0 },
      });
      const result = checkDegradationSignals("skill", data);
      expect(result.shouldDegrade).toBe(true);
      expect(result.reason).toBe("Zero active installations");
    });

    it("no degradation for active skill", () => {
      const data = makeEntryData({
        usage: {
          installCount: 50,
          activeInstalls30d: 20,
          invocationCount30d: 100,
          lastUsedAt: new Date().toISOString(),
        },
      });
      const result = checkDegradationSignals("skill", data);
      expect(result.shouldDegrade).toBe(false);
    });
  });

  describe("knowledge-pack", () => {
    it("detects stale content (>365 days)", () => {
      const data = makeEntryData({ updatedAt: daysAgo(400) });
      const result = checkDegradationSignals("knowledge-pack", data);
      expect(result.shouldDegrade).toBe(true);
      expect(result.reason).toBe("Not updated in 365 days");
    });

    it("no degradation for fresh knowledge-pack", () => {
      const data = makeEntryData({ updatedAt: daysAgo(100) });
      const result = checkDegradationSignals("knowledge-pack", data);
      expect(result.shouldDegrade).toBe(false);
    });
  });

  describe("compliance-ruleset", () => {
    it("detects stale regulatory references (>365 days)", () => {
      const data = makeEntryData({ updatedAt: daysAgo(400) });
      const result = checkDegradationSignals("compliance-ruleset", data);
      expect(result.shouldDegrade).toBe(true);
      expect(result.reason).toBe("Regulatory references may be outdated");
    });

    it("no degradation for fresh compliance-ruleset", () => {
      const data = makeEntryData({ updatedAt: daysAgo(200) });
      const result = checkDegradationSignals("compliance-ruleset", data);
      expect(result.shouldDegrade).toBe(false);
    });
  });

  describe("persona", () => {
    it("detects no installations in 180 days", () => {
      const data = makeEntryData({
        usage: {
          installCount: 5,
          activeInstalls30d: 0,
          invocationCount30d: 0,
          lastUsedAt: daysAgo(200),
        },
      });
      const result = checkDegradationSignals("persona", data);
      expect(result.shouldDegrade).toBe(true);
      expect(result.reason).toBe("No installations in 180 days");
    });

    it("no degradation for active persona", () => {
      const data = makeEntryData({
        usage: {
          installCount: 20,
          activeInstalls30d: 5,
          invocationCount30d: 10,
          lastUsedAt: new Date().toISOString(),
        },
      });
      const result = checkDegradationSignals("persona", data);
      expect(result.shouldDegrade).toBe(false);
    });
  });

  describe("workspace", () => {
    it("detects no installations in 180 days", () => {
      const data = makeEntryData({
        usage: {
          installCount: 3,
          activeInstalls30d: 0,
          invocationCount30d: 0,
          lastUsedAt: daysAgo(200),
        },
      });
      const result = checkDegradationSignals("workspace", data);
      expect(result.shouldDegrade).toBe(true);
      expect(result.reason).toBe("No installations in 180 days");
    });

    it("no degradation for active workspace", () => {
      const data = makeEntryData({
        usage: {
          installCount: 10,
          activeInstalls30d: 3,
          invocationCount30d: 5,
          lastUsedAt: new Date().toISOString(),
        },
      });
      const result = checkDegradationSignals("workspace", data);
      expect(result.shouldDegrade).toBe(false);
    });
  });
});
