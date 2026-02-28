import { describe, expect, it } from "vitest";
import type { OHLCV } from "../../fin-shared-types/src/types.js";
import { BacktestEngine } from "./backtest-engine.js";
import type { BacktestConfig, Signal, StrategyContext, StrategyDefinition } from "./types.js";
import { WalkForward } from "./walk-forward.js";

function linearData(bars: number, startPrice: number, endPrice: number): OHLCV[] {
  const data: OHLCV[] = [];
  for (let i = 0; i < bars; i++) {
    const price = startPrice + ((endPrice - startPrice) * i) / (bars - 1);
    data.push({
      timestamp: 1000000 + i * 86400000,
      open: price,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 1000,
    });
  }
  return data;
}

/** Strategy that consistently buys and holds → stable returns. Stateless so it works across walk-forward windows. */
function stableStrategy(): StrategyDefinition {
  return {
    id: "stable",
    name: "Stable",
    version: "1.0",
    markets: ["crypto"],
    symbols: ["TEST"],
    timeframes: ["1d"],
    parameters: {},
    async onBar(_bar: OHLCV, ctx: StrategyContext): Promise<Signal | null> {
      // Buy if no position; fully stateless so walk-forward can reuse across windows
      if (ctx.portfolio.positions.length === 0) {
        return {
          action: "buy",
          symbol: "TEST",
          sizePct: 100,
          orderType: "market",
          reason: "enter",
          confidence: 1,
        };
      }
      return null;
    },
  };
}

/**
 * Strategy that only works on bars with indices < 30 (overfitting).
 * Buys at bar 0, sells at bar 10, but does nothing on later bars.
 */
function overfitStrategy(): StrategyDefinition {
  let barCount = 0;
  let bought = false;
  return {
    id: "overfit",
    name: "Overfit",
    version: "1.0",
    markets: ["crypto"],
    symbols: ["TEST"],
    timeframes: ["1d"],
    parameters: {},
    async onBar(_bar: OHLCV, ctx: StrategyContext): Promise<Signal | null> {
      barCount++;
      if (barCount === 1 && !bought) {
        bought = true;
        return {
          action: "buy",
          symbol: "TEST",
          sizePct: 100,
          orderType: "market",
          reason: "overfit-buy",
          confidence: 1,
        };
      }
      return null;
    },
  };
}

const engine = new BacktestEngine();
const wf = new WalkForward(engine);

describe("WalkForward", () => {
  it("validates a stable strategy on rising data → passed=true", async () => {
    // 500 bars of rising data — consistent returns across all windows
    const data = linearData(500, 100, 300);
    const config: BacktestConfig = {
      capital: 10000,
      commissionRate: 0,
      slippageBps: 0,
      market: "crypto",
    };

    const result = await wf.validate(stableStrategy(), data, config, { windows: 5 });

    expect(result.windows.length).toBe(5);
    expect(result.passed).toBe(true);
    expect(result.ratio).toBeGreaterThanOrEqual(0.6);
  });

  it("window boundaries do not overlap", async () => {
    const data = linearData(500, 100, 300);
    const config: BacktestConfig = {
      capital: 10000,
      commissionRate: 0,
      slippageBps: 0,
      market: "crypto",
    };

    const result = await wf.validate(stableStrategy(), data, config, { windows: 5 });

    for (let i = 0; i < result.windows.length; i++) {
      const w = result.windows[i]!;
      // Train ends before test starts
      expect(w.trainEnd).toBeLessThanOrEqual(w.testStart);

      // No overlap with next window
      if (i < result.windows.length - 1) {
        const next = result.windows[i + 1]!;
        expect(w.testEnd).toBeLessThanOrEqual(next.trainStart);
      }
    }
  });

  it("returns all window metrics", async () => {
    const data = linearData(200, 100, 200);
    const config: BacktestConfig = {
      capital: 10000,
      commissionRate: 0,
      slippageBps: 0,
      market: "crypto",
    };

    const result = await wf.validate(stableStrategy(), data, config, { windows: 4 });

    expect(result.windows.length).toBe(4);
    for (const w of result.windows) {
      expect(w.trainStart).toBeDefined();
      expect(w.trainEnd).toBeDefined();
      expect(w.testStart).toBeDefined();
      expect(w.testEnd).toBeDefined();
      expect(typeof w.trainSharpe).toBe("number");
      expect(typeof w.testSharpe).toBe("number");
    }
    expect(typeof result.combinedTestSharpe).toBe("number");
    expect(typeof result.avgTrainSharpe).toBe("number");
    expect(typeof result.ratio).toBe("number");
    expect(result.threshold).toBe(0.6);
  });

  it("respects custom threshold", async () => {
    const data = linearData(200, 100, 200);
    const config: BacktestConfig = {
      capital: 10000,
      commissionRate: 0,
      slippageBps: 0,
      market: "crypto",
    };

    const result = await wf.validate(stableStrategy(), data, config, {
      windows: 3,
      threshold: 0.9,
    });

    expect(result.threshold).toBe(0.9);
  });

  it("handles too-small data gracefully", async () => {
    const data = linearData(5, 100, 110);
    const config: BacktestConfig = {
      capital: 10000,
      commissionRate: 0,
      slippageBps: 0,
      market: "crypto",
    };

    const result = await wf.validate(stableStrategy(), data, config, { windows: 10 });

    expect(result.passed).toBe(false);
    expect(result.windows.length).toBe(0);
  });
});
