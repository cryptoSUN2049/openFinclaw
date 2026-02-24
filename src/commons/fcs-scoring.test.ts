import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyAntiGaming,
  calculateAuthorReputation,
  calculateFcsScore,
  calculateFreshnessScore,
  calculateQualityScore,
  calculateSocialScore,
  calculateUsageScore,
} from "./fcs-scoring.js";
import type {
  BacktestResult,
  CommonsEntryWithFcs,
  ConnectorHealth,
  FcsConfig,
  FcsScore,
  QualityMetrics,
  SocialMetrics,
  UsageMetrics,
} from "./types.fcs.js";
import type { CommonsEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<FcsConfig>): FcsConfig {
  return {
    version: 1,
    weights: { quality: 0.4, usage: 0.2, social: 0.2, freshness: 0.2 },
    typeOverrides: {},
    decayHalfLifeDays: 90,
    antiGaming: {
      maxDailyScoreChange: 10,
      installVelocityCap: 50,
      minUniqueInstallers: 5,
    },
    lifecycle: {
      seedlingToGrowingThreshold: 30,
      growingToEstablishedThreshold: 60,
      degradationThreshold: 20,
      archivalGracePeriodDays: 30,
    },
    ...overrides,
  };
}

function makeEntry(overrides?: Partial<CommonsEntry>): CommonsEntry {
  return {
    id: "entry-1",
    name: "test-entry",
    type: "skill",
    description: "A test entry",
    version: "1.0.0",
    author: "author-1",
    tags: ["test"],
    path: "skills/test-entry",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeQuality(overrides?: Partial<QualityMetrics>): QualityMetrics {
  return {
    hasTests: true,
    hasDocumentation: true,
    hasCIPassedRecently: true,
    lintScore: 80,
    typeCheckPasses: true,
    ...overrides,
  };
}

function makeUsage(overrides?: Partial<UsageMetrics>): UsageMetrics {
  return {
    installCount: 50,
    activeInstalls30d: 25,
    invocationCount30d: 250,
    ...overrides,
  };
}

function makeSocial(overrides?: Partial<SocialMetrics>): SocialMetrics {
  return {
    starCount: 25,
    forkCount: 10,
    reviewCount: 5,
    averageRating: 4.0,
    ...overrides,
  };
}

function makeBacktest(overrides?: Partial<BacktestResult>): BacktestResult {
  return {
    period: "2024-01-01/2025-12-31",
    sharpeRatio: 1.5,
    maxDrawdownPct: 15,
    totalReturnPct: 45,
    winRatePct: 60,
    tradeCount: 200,
    ...overrides,
  };
}

function makeConnectorHealth(overrides?: Partial<ConnectorHealth>): ConnectorHealth {
  return {
    uptimePct: 99,
    avgLatencyMs: 200,
    lastCheckedAt: new Date().toISOString(),
    errorRate: 0.02,
    ...overrides,
  };
}

function makePreviousScore(overrides?: Partial<FcsScore>): FcsScore {
  return {
    total: 50,
    breakdown: { quality: 60, usage: 40, social: 30, freshness: 90 },
    calculatedAt: new Date().toISOString(),
    decayApplied: 0.95,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("calculateQualityScore", () => {
  describe("strategy with backtest", () => {
    it("scores a well-performing strategy highly", () => {
      const backtest = makeBacktest({ sharpeRatio: 2.0, maxDrawdownPct: 10, winRatePct: 70 });
      const quality = makeQuality();
      const score = calculateQualityScore("strategy", quality, backtest);
      // sharpe: clamp(2/2,0,1)*0.4 = 0.4
      // drawdown: clamp(1-10/50,0,1)*0.3 = 0.8*0.3 = 0.24
      // winRate: clamp(70/100,0,1)*0.15 = 0.105
      // generic quality component * 0.15
      expect(score).toBeGreaterThan(70);
    });

    it("penalizes high drawdown", () => {
      const lowDrawdown = makeBacktest({ maxDrawdownPct: 5 });
      const highDrawdown = makeBacktest({ maxDrawdownPct: 45 });
      const s1 = calculateQualityScore("strategy", undefined, lowDrawdown);
      const s2 = calculateQualityScore("strategy", undefined, highDrawdown);
      expect(s1).toBeGreaterThan(s2);
    });

    it("caps Sharpe contribution at 2.0", () => {
      const b1 = makeBacktest({ sharpeRatio: 2.0 });
      const b2 = makeBacktest({ sharpeRatio: 5.0 });
      const s1 = calculateQualityScore("strategy", undefined, b1);
      const s2 = calculateQualityScore("strategy", undefined, b2);
      expect(s1).toBe(s2);
    });
  });

  describe("connector with health", () => {
    it("scores a healthy connector highly", () => {
      const health = makeConnectorHealth({ uptimePct: 99.9, avgLatencyMs: 50, errorRate: 0.001 });
      const quality = makeQuality();
      const score = calculateQualityScore("connector", quality, undefined, health);
      expect(score).toBeGreaterThan(80);
    });

    it("penalizes high latency", () => {
      const fast = makeConnectorHealth({ avgLatencyMs: 100 });
      const slow = makeConnectorHealth({ avgLatencyMs: 1800 });
      const s1 = calculateQualityScore("connector", undefined, undefined, fast);
      const s2 = calculateQualityScore("connector", undefined, undefined, slow);
      expect(s1).toBeGreaterThan(s2);
    });

    it("penalizes high error rate", () => {
      const low = makeConnectorHealth({ errorRate: 0.01 });
      const high = makeConnectorHealth({ errorRate: 0.8 });
      const s1 = calculateQualityScore("connector", undefined, undefined, low);
      const s2 = calculateQualityScore("connector", undefined, undefined, high);
      expect(s1).toBeGreaterThan(s2);
    });
  });

  describe("generic quality (skill)", () => {
    it("returns 100 for perfect quality", () => {
      const quality = makeQuality({ lintScore: 100 });
      const score = calculateQualityScore("skill", quality);
      // 0.25 + 0.25 + 0.20 + 1.0*0.15 + 0.15 = 1.0
      expect(score).toBe(100);
    });

    it("returns 0 with no quality data", () => {
      expect(calculateQualityScore("skill")).toBe(0);
    });

    it("returns 0 when all metrics are false/zero", () => {
      const quality = makeQuality({
        hasTests: false,
        hasDocumentation: false,
        hasCIPassedRecently: false,
        lintScore: 0,
        typeCheckPasses: false,
      });
      expect(calculateQualityScore("persona", quality)).toBe(0);
    });

    it("scores partial quality correctly", () => {
      const quality = makeQuality({
        hasTests: true,
        hasDocumentation: false,
        hasCIPassedRecently: true,
        lintScore: 50,
        typeCheckPasses: false,
      });
      // 0.25 + 0 + 0.20 + 0.5*0.15 + 0 = 0.525
      const score = calculateQualityScore("workspace", quality);
      expect(score).toBeCloseTo(52.5, 1);
    });
  });
});

describe("calculateUsageScore", () => {
  it("returns 0 with no data", () => {
    expect(calculateUsageScore()).toBe(0);
    expect(calculateUsageScore(undefined)).toBe(0);
  });

  it("returns 100 at max values", () => {
    const usage = makeUsage({
      installCount: 100,
      activeInstalls30d: 50,
      invocationCount30d: 500,
    });
    expect(calculateUsageScore(usage)).toBe(100);
  });

  it("clamps above-max values to 100", () => {
    const usage = makeUsage({
      installCount: 10000,
      activeInstalls30d: 5000,
      invocationCount30d: 50000,
    });
    expect(calculateUsageScore(usage)).toBe(100);
  });

  it("scores mid-range values proportionally", () => {
    const usage = makeUsage({
      installCount: 50,
      activeInstalls30d: 25,
      invocationCount30d: 250,
    });
    // installs: 0.5*0.4 = 0.20, active: 0.5*0.3 = 0.15, invocations: 0.5*0.3 = 0.15
    expect(calculateUsageScore(usage)).toBe(50);
  });

  it("returns 0 with all zeros", () => {
    const usage = makeUsage({
      installCount: 0,
      activeInstalls30d: 0,
      invocationCount30d: 0,
    });
    expect(calculateUsageScore(usage)).toBe(0);
  });
});

describe("calculateSocialScore", () => {
  it("returns 0 with no data", () => {
    expect(calculateSocialScore()).toBe(0);
    expect(calculateSocialScore(undefined)).toBe(0);
  });

  it("returns 100 at max values", () => {
    const social = makeSocial({
      starCount: 50,
      forkCount: 20,
      reviewCount: 10,
      averageRating: 5,
    });
    expect(calculateSocialScore(social)).toBe(100);
  });

  it("clamps above-max values", () => {
    const social = makeSocial({
      starCount: 500,
      forkCount: 200,
      reviewCount: 100,
      averageRating: 5,
    });
    expect(calculateSocialScore(social)).toBe(100);
  });

  it("scores mid-range values proportionally", () => {
    const social = makeSocial({
      starCount: 25,
      forkCount: 10,
      reviewCount: 5,
      averageRating: 2.5,
    });
    // stars: 0.5*0.3=0.15, forks: 0.5*0.2=0.10, reviews: 0.5*0.2=0.10, rating: 0.5*0.3=0.15
    expect(calculateSocialScore(social)).toBe(50);
  });

  it("returns 0 with all zeros", () => {
    const social = makeSocial({
      starCount: 0,
      forkCount: 0,
      reviewCount: 0,
      averageRating: 0,
    });
    expect(calculateSocialScore(social)).toBe(0);
  });
});

describe("calculateFreshnessScore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-24T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns ~100 for a just-updated entry", () => {
    const config = makeConfig({ decayHalfLifeDays: 90 });
    const { score, decay } = calculateFreshnessScore("2026-02-24T12:00:00.000Z", config);
    expect(score).toBeCloseTo(100, 0);
    expect(decay).toBeCloseTo(1, 2);
  });

  it("returns ~50 after one half-life", () => {
    const config = makeConfig({ decayHalfLifeDays: 90 });
    // 90 days ago
    const { score, decay } = calculateFreshnessScore("2025-11-26T12:00:00.000Z", config);
    expect(score).toBeCloseTo(50, 0);
    expect(decay).toBeCloseTo(0.5, 1);
  });

  it("returns low score for very old entries", () => {
    const config = makeConfig({ decayHalfLifeDays: 30 });
    // 180 days ago → ~6 half-lives → 2^-6 ≈ 0.016
    const { score } = calculateFreshnessScore("2025-08-28T12:00:00.000Z", config);
    expect(score).toBeLessThan(5);
  });

  it("decays faster with shorter half-life", () => {
    const shortHL = makeConfig({ decayHalfLifeDays: 30 });
    const longHL = makeConfig({ decayHalfLifeDays: 180 });
    const date = "2026-01-24T12:00:00.000Z"; // 31 days ago
    const { score: s1 } = calculateFreshnessScore(date, shortHL);
    const { score: s2 } = calculateFreshnessScore(date, longHL);
    expect(s2).toBeGreaterThan(s1);
  });
});

describe("applyAntiGaming", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-24T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns newTotal when no previous score", () => {
    const config = makeConfig();
    expect(applyAntiGaming(80, undefined, config)).toBe(80);
  });

  it("caps upward change within 24h", () => {
    const config = makeConfig();
    const prev = makePreviousScore({
      total: 50,
      calculatedAt: "2026-02-24T06:00:00.000Z", // 6 hours ago
    });
    // Trying to jump from 50 to 75 (change of 25), max is 10
    expect(applyAntiGaming(75, prev, config)).toBe(60);
  });

  it("caps downward change within 24h", () => {
    const config = makeConfig();
    const prev = makePreviousScore({
      total: 50,
      calculatedAt: "2026-02-24T06:00:00.000Z",
    });
    // Trying to drop from 50 to 20 (change of -30), max is 10
    expect(applyAntiGaming(20, prev, config)).toBe(40);
  });

  it("allows full change after 24h", () => {
    const config = makeConfig();
    const prev = makePreviousScore({
      total: 50,
      calculatedAt: "2026-02-23T10:00:00.000Z", // 26 hours ago
    });
    expect(applyAntiGaming(80, prev, config)).toBe(80);
  });

  it("allows change within the cap", () => {
    const config = makeConfig();
    const prev = makePreviousScore({
      total: 50,
      calculatedAt: "2026-02-24T06:00:00.000Z",
    });
    // Change of 5, within the cap of 10
    expect(applyAntiGaming(55, prev, config)).toBe(55);
  });
});

describe("calculateFcsScore (end-to-end)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-24T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scores a skill entry with all data", () => {
    const entry = makeEntry({ type: "skill", updatedAt: "2026-02-24T12:00:00.000Z" });
    const config = makeConfig();
    const result = calculateFcsScore(
      entry,
      { quality: makeQuality(), usage: makeUsage(), social: makeSocial() },
      config,
    );
    expect(result.total).toBeGreaterThan(0);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.breakdown.quality).toBeGreaterThan(0);
    expect(result.breakdown.usage).toBeGreaterThan(0);
    expect(result.breakdown.social).toBeGreaterThan(0);
    expect(result.breakdown.freshness).toBeCloseTo(100, 0);
    expect(result.calculatedAt).toBeTruthy();
    expect(result.decayApplied).toBeCloseTo(1, 2);
  });

  it("scores a strategy entry with backtest data", () => {
    const entry = makeEntry({ type: "strategy", updatedAt: "2026-02-24T12:00:00.000Z" });
    const config = makeConfig();
    const result = calculateFcsScore(
      entry,
      {
        quality: makeQuality(),
        usage: makeUsage(),
        social: makeSocial(),
        backtest: makeBacktest(),
      },
      config,
    );
    expect(result.total).toBeGreaterThan(0);
    expect(result.breakdown.quality).toBeGreaterThan(0);
  });

  it("scores a connector entry with health data", () => {
    const entry = makeEntry({ type: "connector", updatedAt: "2026-02-24T12:00:00.000Z" });
    const config = makeConfig();
    const result = calculateFcsScore(
      entry,
      {
        quality: makeQuality(),
        usage: makeUsage(),
        social: makeSocial(),
        connectorHealth: makeConnectorHealth(),
      },
      config,
    );
    expect(result.total).toBeGreaterThan(0);
    expect(result.breakdown.quality).toBeGreaterThan(0);
  });

  it("uses typeOverrides when configured", () => {
    const entry = makeEntry({ type: "strategy", updatedAt: "2026-02-24T12:00:00.000Z" });
    const configDefault = makeConfig();
    const configOverride = makeConfig({
      typeOverrides: {
        strategy: { quality: 0.8, usage: 0.1, social: 0.05, freshness: 0.05 },
      },
    });
    const data = {
      quality: makeQuality(),
      usage: makeUsage(),
      social: makeSocial(),
      backtest: makeBacktest(),
    };
    const r1 = calculateFcsScore(entry, data, configDefault);
    const r2 = calculateFcsScore(entry, data, configOverride);
    // With higher quality weight and lower others, the total should differ
    expect(r1.total).not.toBeCloseTo(r2.total, 0);
  });

  it("returns zero-ish score with no data and old entry", () => {
    const entry = makeEntry({
      type: "skill",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    const config = makeConfig({ decayHalfLifeDays: 30 });
    const result = calculateFcsScore(entry, {}, config);
    expect(result.breakdown.quality).toBe(0);
    expect(result.breakdown.usage).toBe(0);
    expect(result.breakdown.social).toBe(0);
    expect(result.breakdown.freshness).toBeLessThan(1);
    expect(result.total).toBeLessThan(1);
  });

  it("applies anti-gaming to the total score", () => {
    const entry = makeEntry({ type: "skill", updatedAt: "2026-02-24T12:00:00.000Z" });
    const config = makeConfig();
    const prev = makePreviousScore({
      total: 10,
      calculatedAt: "2026-02-24T06:00:00.000Z",
    });
    const result = calculateFcsScore(
      entry,
      { quality: makeQuality({ lintScore: 100 }), usage: makeUsage(), social: makeSocial() },
      config,
      prev,
    );
    // Without anti-gaming the total would be much higher than 20, but it's capped to prev+10
    expect(result.total).toBeLessThanOrEqual(20);
  });
});

describe("calculateAuthorReputation", () => {
  it("returns empty reputation for unknown author", () => {
    const rep = calculateAuthorReputation("unknown", []);
    expect(rep.authorId).toBe("unknown");
    expect(rep.totalEntries).toBe(0);
    expect(rep.averageFcs).toBe(0);
    expect(rep.establishedCount).toBe(0);
    expect(rep.verified).toBe(false);
  });

  it("calculates average FCS across entries", () => {
    const entries: CommonsEntryWithFcs[] = [
      {
        ...makeEntry({ author: "a1", createdAt: "2025-06-01T00:00:00.000Z" }),
        fcs: {
          entryId: "e1",
          score: {
            total: 60,
            breakdown: { quality: 70, usage: 50, social: 40, freshness: 80 },
            calculatedAt: "",
            decayApplied: 1,
          },
          lifecycle: { tier: "established", status: "active", tierHistory: [] },
        },
      },
      {
        ...makeEntry({ id: "e2", author: "a1", createdAt: "2026-01-01T00:00:00.000Z" }),
        fcs: {
          entryId: "e2",
          score: {
            total: 40,
            breakdown: { quality: 50, usage: 30, social: 20, freshness: 60 },
            calculatedAt: "",
            decayApplied: 1,
          },
          lifecycle: { tier: "growing", status: "active", tierHistory: [] },
        },
      },
    ];

    const rep = calculateAuthorReputation("a1", entries);
    expect(rep.totalEntries).toBe(2);
    expect(rep.averageFcs).toBe(50);
    expect(rep.establishedCount).toBe(1);
    expect(rep.memberSince).toBe("2025-06-01T00:00:00.000Z");
  });

  it("ignores entries from other authors", () => {
    const entries: CommonsEntryWithFcs[] = [
      {
        ...makeEntry({ author: "a1" }),
        fcs: {
          entryId: "e1",
          score: {
            total: 80,
            breakdown: { quality: 80, usage: 80, social: 80, freshness: 80 },
            calculatedAt: "",
            decayApplied: 1,
          },
          lifecycle: { tier: "established", status: "active", tierHistory: [] },
        },
      },
      {
        ...makeEntry({ id: "e2", author: "a2" }),
        fcs: {
          entryId: "e2",
          score: {
            total: 20,
            breakdown: { quality: 20, usage: 20, social: 20, freshness: 20 },
            calculatedAt: "",
            decayApplied: 1,
          },
          lifecycle: { tier: "seedling", status: "active", tierHistory: [] },
        },
      },
    ];

    const rep = calculateAuthorReputation("a1", entries);
    expect(rep.totalEntries).toBe(1);
    expect(rep.averageFcs).toBe(80);
  });

  it("handles entries without FCS data gracefully", () => {
    const entries: CommonsEntryWithFcs[] = [
      { ...makeEntry({ author: "a1", createdAt: "2026-01-15T00:00:00.000Z" }) },
    ];

    const rep = calculateAuthorReputation("a1", entries);
    expect(rep.totalEntries).toBe(1);
    expect(rep.averageFcs).toBe(0);
    expect(rep.establishedCount).toBe(0);
    expect(rep.memberSince).toBe("2026-01-15T00:00:00.000Z");
  });
});

describe("edge cases", () => {
  it("clamp handles boundary values", () => {
    // Verify through quality score that clamp works at boundaries
    const backtest = makeBacktest({ sharpeRatio: 0, maxDrawdownPct: 50, winRatePct: 0 });
    const score = calculateQualityScore("strategy", undefined, backtest);
    // All zero inputs: sharpe 0, drawdown at 50 → 0, winRate 0 → total 0
    expect(score).toBe(0);
  });

  it("handles negative sharpe ratio", () => {
    const backtest = makeBacktest({ sharpeRatio: -1 });
    const score = calculateQualityScore("strategy", undefined, backtest);
    // clamp(-0.5, 0, 1) * 0.4 = 0 for sharpe component
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("handles drawdown above 50%", () => {
    const backtest = makeBacktest({ maxDrawdownPct: 80 });
    const score = calculateQualityScore("strategy", undefined, backtest);
    // clamp(1-80/50, 0, 1) = clamp(-0.6, 0, 1) = 0 for drawdown component
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("handles latency above 2000ms", () => {
    const health = makeConnectorHealth({ avgLatencyMs: 3000 });
    const score = calculateQualityScore("connector", undefined, undefined, health);
    // clamp(1-3000/2000, 0, 1) = clamp(-0.5, 0, 1) = 0 for latency component
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("strategy without backtest uses generic scoring", () => {
    const quality = makeQuality();
    const withBacktest = calculateQualityScore("strategy", quality, makeBacktest());
    const withoutBacktest = calculateQualityScore("strategy", quality);
    // Without backtest, strategy uses generic quality
    expect(withoutBacktest).not.toBe(withBacktest);
    expect(withoutBacktest).toBeGreaterThan(0);
  });

  it("connector without health uses generic scoring", () => {
    const quality = makeQuality();
    const withHealth = calculateQualityScore(
      "connector",
      quality,
      undefined,
      makeConnectorHealth(),
    );
    const withoutHealth = calculateQualityScore("connector", quality);
    expect(withoutHealth).not.toBe(withHealth);
    expect(withoutHealth).toBeGreaterThan(0);
  });
});
