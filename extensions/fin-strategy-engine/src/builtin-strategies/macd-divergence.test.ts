import { describe, expect, it } from "vitest";
import type { OHLCV } from "../../../fin-data-bus/src/types.js";
import { BacktestEngine } from "../backtest-engine.js";
import { macd } from "../indicators.js";
import type { BacktestConfig } from "../types.js";
import { createMacdDivergence } from "./macd-divergence.js";

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

describe("MACD Divergence strategy", () => {
  it("creates strategy with default parameters", () => {
    const strategy = createMacdDivergence();
    expect(strategy.id).toBe("macd-divergence");
    expect(strategy.parameters.fastPeriod).toBe(12);
    expect(strategy.parameters.slowPeriod).toBe(26);
    expect(strategy.parameters.signalPeriod).toBe(9);
    expect(strategy.parameters.sizePct).toBe(100);
  });

  it("creates strategy with custom parameters", () => {
    const strategy = createMacdDivergence({
      fastPeriod: 8,
      slowPeriod: 21,
      signalPeriod: 5,
      sizePct: 50,
    });
    expect(strategy.parameters.fastPeriod).toBe(8);
    expect(strategy.parameters.slowPeriod).toBe(21);
    expect(strategy.parameters.signalPeriod).toBe(5);
    expect(strategy.parameters.sizePct).toBe(50);
  });

  it("buys on bullish histogram cross and sells on bearish cross", async () => {
    // Need: uptrend (positive histogram) → decline (negative) → recovery (positive) → decline (negative)
    // Non-linear moves so MACD actually reacts (linear = flat MACD)
    const prices: number[] = [];
    // Phase 1: accelerating rise → positive histogram
    for (let i = 0; i < 25; i++) prices.push(100 + i * i * 0.2);
    // Phase 2: sharp decline → histogram crosses to negative
    for (let i = 0; i < 15; i++) prices.push(prices[prices.length - 1] - 8 - i * 0.5);
    // Phase 3: sharp recovery → histogram crosses back to positive
    for (let i = 0; i < 15; i++) prices.push(prices[prices.length - 1] + 10 + i * 0.5);
    // Phase 4: decline again → histogram crosses back to negative
    for (let i = 0; i < 10; i++) prices.push(prices[prices.length - 1] - 10);

    const data = prices.map((p, i) => makeBar(i, p));
    const strategy = createMacdDivergence({
      fastPeriod: 8,
      slowPeriod: 17,
      signalPeriod: 5,
      sizePct: 100,
    });
    const config: BacktestConfig = {
      capital: 10000,
      commissionRate: 0,
      slippageBps: 0,
      market: "crypto",
    };

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    // Verify histogram actually crosses zero in both directions
    const closes = data.map((d) => d.close);
    const { histogram } = macd(closes, 8, 17, 5);

    let bullishCross = false;
    let bearishCross = false;
    for (let i = 1; i < histogram.length; i++) {
      if (
        !Number.isNaN(histogram[i]) &&
        !Number.isNaN(histogram[i - 1]) &&
        histogram[i - 1] < 0 &&
        histogram[i] >= 0
      ) {
        bullishCross = true;
      }
      if (
        !Number.isNaN(histogram[i]) &&
        !Number.isNaN(histogram[i - 1]) &&
        histogram[i - 1] >= 0 &&
        histogram[i] < 0
      ) {
        bearishCross = true;
      }
    }

    expect(bullishCross).toBe(true);
    expect(bearishCross).toBe(true);
    expect(result.totalTrades).toBeGreaterThanOrEqual(1);
  });

  it("returns no trades during warm-up period", async () => {
    // Only 20 bars — not enough for MACD(12,26,9)
    const data: OHLCV[] = [];
    for (let i = 0; i < 20; i++) {
      data.push(makeBar(i, 100 + i));
    }

    const strategy = createMacdDivergence({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
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
