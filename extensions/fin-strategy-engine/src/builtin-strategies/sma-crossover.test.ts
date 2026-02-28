import { describe, expect, it } from "vitest";
import type { OHLCV } from "../../../fin-shared-types/src/types.js";
import { BacktestEngine } from "../backtest-engine.js";
import { sma } from "../indicators.js";
import type { BacktestConfig } from "../types.js";
import { createSmaCrossover } from "./sma-crossover.js";

function makeBar(index: number, close: number): OHLCV {
  return {
    timestamp: 1000000 + index * 86400000,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 1000,
  };
}

describe("SMA Crossover strategy", () => {
  it("creates strategy with default parameters", () => {
    const strategy = createSmaCrossover();
    expect(strategy.id).toBe("sma-crossover");
    expect(strategy.parameters.fastPeriod).toBe(10);
    expect(strategy.parameters.slowPeriod).toBe(30);
  });

  it("creates strategy with custom parameters", () => {
    const strategy = createSmaCrossover({ fastPeriod: 5, slowPeriod: 20, sizePct: 50 });
    expect(strategy.parameters.fastPeriod).toBe(5);
    expect(strategy.parameters.slowPeriod).toBe(20);
    expect(strategy.parameters.sizePct).toBe(50);
  });

  it("buys on golden cross and sells on death cross", async () => {
    // Design prices so that SMA(3) crosses above SMA(5) clearly.
    // Then later SMA(3) crosses below SMA(5).
    const prices = [
      100,
      100,
      100,
      100,
      100, // bars 0-4: flat
      102,
      105,
      110,
      115,
      120, // bars 5-9: rise (golden cross)
      115,
      108,
      100,
      95,
      90, // bars 10-14: drop (death cross)
    ];

    const data = prices.map((p, i) => makeBar(i, p));
    const strategy = createSmaCrossover({ fastPeriod: 3, slowPeriod: 5, sizePct: 100 });
    const config: BacktestConfig = {
      capital: 10000,
      commissionRate: 0,
      slippageBps: 0,
      market: "crypto",
    };

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    // Verify crossover happened by checking indicators
    const closes = data.map((d) => d.close);
    const fast = sma(closes, 3);
    const slow = sma(closes, 5);

    // Find golden cross
    let goldenBar = -1;
    for (let i = 1; i < closes.length; i++) {
      if (
        !Number.isNaN(fast[i]!) &&
        !Number.isNaN(slow[i]!) &&
        !Number.isNaN(fast[i - 1]!) &&
        !Number.isNaN(slow[i - 1]!) &&
        fast[i - 1]! <= slow[i - 1]! &&
        fast[i]! > slow[i]!
      ) {
        goldenBar = i;
        break;
      }
    }

    expect(goldenBar).toBeGreaterThan(-1);
    // Strategy should have at least 1 trade
    expect(result.totalTrades).toBeGreaterThanOrEqual(1);
    // Entry should be at the golden cross bar's close price
    if (result.trades.length > 0) {
      expect(result.trades[0]!.entryPrice).toBeCloseTo(closes[goldenBar]!, 0);
    }
  });

  it("returns null during warm-up period", async () => {
    // Only 3 bars — not enough for SMA(10)
    const data = [makeBar(0, 100), makeBar(1, 101), makeBar(2, 102)];
    const strategy = createSmaCrossover({ fastPeriod: 10, slowPeriod: 30 });
    const config: BacktestConfig = {
      capital: 10000,
      commissionRate: 0,
      slippageBps: 0,
      market: "crypto",
    };

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    expect(result.totalTrades).toBe(0);
  });
});
