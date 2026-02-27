import { describe, it, expect } from "vitest";
import {
  mean,
  stdDev,
  sharpeRatio,
  sortinoRatio,
  maxDrawdown,
  calmarRatio,
  profitFactor,
  winRate,
} from "./stats.js";

function expectClose(actual: number, expected: number, tolerance = 0.0001) {
  if (expected === 0) {
    expect(Math.abs(actual)).toBeLessThan(tolerance);
  } else {
    expect(Math.abs((actual - expected) / expected)).toBeLessThan(tolerance);
  }
}

describe("mean", () => {
  it("computes arithmetic mean", () => {
    expectClose(mean([1, 2, 3, 4, 5]), 3);
  });

  it("returns NaN for empty array", () => {
    expect(mean([])).toBeNaN();
  });

  it("handles single value", () => {
    expectClose(mean([42]), 42);
  });

  it("handles negative values", () => {
    expectClose(mean([-10, 10]), 0);
  });
});

describe("stdDev", () => {
  it("computes sample standard deviation by default", () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] → mean=5, sample var=4.571..., sample sd=2.138...
    expectClose(stdDev([2, 4, 4, 4, 5, 5, 7, 9]), 2.13809, 0.001);
  });

  it("computes population standard deviation when specified", () => {
    // Population var = 4, pop sd = 2.0
    expectClose(stdDev([2, 4, 4, 4, 5, 5, 7, 9], true), 2.0, 0.001);
  });

  it("returns 0 for constant values", () => {
    expectClose(stdDev([5, 5, 5, 5]), 0);
  });

  it("returns NaN for empty array", () => {
    expect(stdDev([])).toBeNaN();
  });

  it("returns 0 for single value (population)", () => {
    expectClose(stdDev([5], true), 0);
  });
});

describe("sharpeRatio", () => {
  it("positive returns → Sharpe > 0", () => {
    const returns = [0.01, 0.02, 0.015, 0.01, 0.025, 0.02, 0.01, 0.015, 0.02, 0.01, 0.015, 0.02];
    const sr = sharpeRatio(returns);
    expect(sr).toBeGreaterThan(0);
  });

  it("constant returns → Infinity (zero stddev)", () => {
    const returns = [0.01, 0.01, 0.01, 0.01];
    const sr = sharpeRatio(returns);
    expect(sr).toBe(Infinity);
  });

  it("negative excess returns → Sharpe < 0", () => {
    const returns = [-0.01, -0.02, -0.015, -0.01];
    const sr = sharpeRatio(returns, 0);
    expect(sr).toBeLessThan(0);
  });

  it("annualizes by default (sqrt(252) factor)", () => {
    const returns = [0.01, 0.02, 0.015, 0.01, 0.025];
    const annualized = sharpeRatio(returns, 0, true);
    const nonAnnualized = sharpeRatio(returns, 0, false);
    expectClose(annualized, nonAnnualized * Math.sqrt(252), 0.001);
  });

  it("respects custom risk-free rate", () => {
    const returns = [0.05, 0.06, 0.04, 0.05, 0.07];
    const sr1 = sharpeRatio(returns, 0, false);
    const sr2 = sharpeRatio(returns, 0.03, false);
    expect(sr1).toBeGreaterThan(sr2);
  });
});

describe("sortinoRatio", () => {
  it("no downside deviation → Infinity", () => {
    const returns = [0.01, 0.02, 0.03, 0.04];
    const sr = sortinoRatio(returns, 0);
    expect(sr).toBe(Infinity);
  });

  it("all negative → negative Sortino", () => {
    const returns = [-0.01, -0.02, -0.03, -0.04];
    const sr = sortinoRatio(returns, 0);
    expect(sr).toBeLessThan(0);
  });

  it("mixed returns produce finite ratio", () => {
    const returns = [0.02, -0.01, 0.03, -0.02, 0.01];
    const sr = sortinoRatio(returns, 0);
    expect(Number.isFinite(sr)).toBe(true);
    expect(sr).toBeGreaterThan(0);
  });
});

describe("maxDrawdown", () => {
  it("computes drawdown from peak to trough", () => {
    const equity = [100, 110, 90, 95];
    const result = maxDrawdown(equity);
    // Max drawdown: from 110 to 90 = -18.18%
    expectClose(result.maxDD, -18.1818, 0.01);
    expect(result.peak).toBe(110);
    expect(result.trough).toBe(90);
    expect(result.peakIndex).toBe(1);
    expect(result.troughIndex).toBe(2);
  });

  it("monotonic up → maxDD = 0", () => {
    const equity = [100, 110, 120, 130];
    const result = maxDrawdown(equity);
    expectClose(result.maxDD, 0);
  });

  it("monotonic down → full drawdown", () => {
    const equity = [100, 80, 60, 40];
    const result = maxDrawdown(equity);
    // From 100 to 40 = -60%
    expectClose(result.maxDD, -60, 0.01);
    expect(result.peakIndex).toBe(0);
    expect(result.troughIndex).toBe(3);
  });

  it("finds the worst drawdown among multiple dips", () => {
    const equity = [100, 95, 110, 80, 120, 100];
    const result = maxDrawdown(equity);
    // Worst: 110 → 80 = -27.27%
    expectClose(result.maxDD, -27.2727, 0.01);
    expect(result.peak).toBe(110);
    expect(result.trough).toBe(80);
  });

  it("handles single value", () => {
    const result = maxDrawdown([100]);
    expectClose(result.maxDD, 0);
  });
});

describe("calmarRatio", () => {
  it("computes annualized return / abs(maxDrawdown)", () => {
    // 20% return, -10% drawdown → Calmar = 2.0
    expectClose(calmarRatio(0.2, -0.1), 2.0);
  });

  it("zero drawdown → Infinity", () => {
    expect(calmarRatio(0.15, 0)).toBe(Infinity);
  });

  it("negative return with drawdown → negative ratio", () => {
    expect(calmarRatio(-0.1, -0.2)).toBeLessThan(0);
  });
});

describe("profitFactor", () => {
  it("no losses → Infinity", () => {
    expect(profitFactor([100, 200, 50], [])).toBe(Infinity);
  });

  it("no wins → 0", () => {
    expect(profitFactor([], [100, 200])).toBe(0);
  });

  it("equal wins and losses → 1", () => {
    expectClose(profitFactor([100], [100]), 1);
  });

  it("computes sum(wins) / sum(abs(losses))", () => {
    // Wins: 100+200=300, Losses: -50+-100=-150 → abs=150 → PF=2
    expectClose(profitFactor([100, 200], [-50, -100]), 2);
  });
});

describe("winRate", () => {
  it("3 wins, 2 losses → 60%", () => {
    const trades = [{ pnl: 10 }, { pnl: -5 }, { pnl: 20 }, { pnl: 15 }, { pnl: -8 }];
    expectClose(winRate(trades), 60);
  });

  it("all wins → 100%", () => {
    expectClose(winRate([{ pnl: 10 }, { pnl: 5 }]), 100);
  });

  it("all losses → 0%", () => {
    expectClose(winRate([{ pnl: -10 }, { pnl: -5 }]), 0);
  });

  it("empty trades → NaN", () => {
    expect(winRate([])).toBeNaN();
  });

  it("zero pnl counts as non-win", () => {
    expectClose(winRate([{ pnl: 0 }, { pnl: 10 }]), 50);
  });
});
