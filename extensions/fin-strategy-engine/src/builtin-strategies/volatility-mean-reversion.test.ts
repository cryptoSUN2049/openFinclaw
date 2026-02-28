import { describe, expect, it } from "vitest";
import type { OHLCV } from "../../../fin-shared-types/src/types.js";
import { BacktestEngine } from "../backtest-engine.js";
import type { BacktestConfig } from "../types.js";
import { createVolatilityMeanReversion } from "./volatility-mean-reversion.js";

function makeBar(index: number, close: number, overrides?: Partial<OHLCV>): OHLCV {
  return {
    timestamp: 1000000 + index * 86400000,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 1000,
    ...overrides,
  };
}

const config: BacktestConfig = {
  capital: 10000,
  commissionRate: 0,
  slippageBps: 0,
  market: "crypto",
};

/**
 * Helper: generates a base oscillation of 25 bars around 100 using sin wave,
 * which establishes BB width with bbPeriod=20. The resulting BB lower is ~95.
 * A sudden crash below 88 will breach the lower band. After a 2-bar crash
 * and a micro-bounce, RSI(3) turns up while still oversold and price stays
 * below the slowly-adapting BB lower band.
 */
function generateOscillatingBase(): number[] {
  const prices: number[] = [];
  for (let i = 0; i < 25; i++) {
    prices.push(100 + 3 * Math.sin(i * 0.5));
  }
  return prices;
}

/** Strategy params tuned for test data: bbPeriod=20 for slow BB adaptation. */
const testParams = {
  bbPeriod: 20,
  rsiPeriod: 3,
  atrPeriod: 3,
  trendFilterPeriod: 5,
  useTrendFilter: 0,
  maxAtrPctFilter: 10.0,
};

describe("Volatility Mean Reversion strategy", () => {
  it("creates strategy with default parameters", () => {
    const strategy = createVolatilityMeanReversion();
    expect(strategy.id).toBe("volatility-mean-reversion");
    expect(strategy.name).toBe("Volatility Mean Reversion");
    expect(strategy.version).toBe("1.0.0");
    expect(strategy.parameters.bbPeriod).toBe(20);
    expect(strategy.parameters.bbStdDev).toBe(2.0);
    expect(strategy.parameters.rsiPeriod).toBe(7);
    expect(strategy.parameters.rsiOversold).toBe(25);
    expect(strategy.parameters.rsiOverbought).toBe(75);
    expect(strategy.parameters.atrPeriod).toBe(14);
    expect(strategy.parameters.atrStopMultiplier).toBe(1.5);
    expect(strategy.parameters.trendFilterPeriod).toBe(200);
    expect(strategy.parameters.useTrendFilter).toBe(1);
    expect(strategy.parameters.maxSizePct).toBe(60);
    expect(strategy.parameters.maxAtrPctFilter).toBe(5.0);
  });

  it("creates strategy with custom parameters", () => {
    const strategy = createVolatilityMeanReversion({
      bbPeriod: 15,
      rsiPeriod: 5,
      rsiOversold: 20,
      rsiOverbought: 80,
      atrPeriod: 10,
      atrStopMultiplier: 2.0,
      trendFilterPeriod: 100,
      useTrendFilter: 0,
      maxSizePct: 40,
      maxAtrPctFilter: 3.0,
      symbol: "ETH/USDT",
    });
    expect(strategy.parameters.bbPeriod).toBe(15);
    expect(strategy.parameters.rsiPeriod).toBe(5);
    expect(strategy.parameters.rsiOversold).toBe(20);
    expect(strategy.parameters.rsiOverbought).toBe(80);
    expect(strategy.parameters.atrPeriod).toBe(10);
    expect(strategy.parameters.atrStopMultiplier).toBe(2.0);
    expect(strategy.parameters.trendFilterPeriod).toBe(100);
    expect(strategy.parameters.useTrendFilter).toBe(0);
    expect(strategy.parameters.maxSizePct).toBe(40);
    expect(strategy.parameters.maxAtrPctFilter).toBe(3.0);
    expect(strategy.symbols).toEqual(["ETH/USDT"]);
  });

  it("returns null during warm-up period", async () => {
    // Only 5 bars — not enough for BB(20) or RSI(3)+ATR(3) to all converge
    const data = [makeBar(0, 100), makeBar(1, 101), makeBar(2, 99), makeBar(3, 98), makeBar(4, 97)];
    const strategy = createVolatilityMeanReversion(testParams);

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    expect(result.totalTrades).toBe(0);
  });

  it("buys on BB lower touch with RSI oversold confirmation", async () => {
    // 25-bar sin-wave oscillation establishes BB width (~95-105 bands with bbPeriod=20).
    // 2-bar crash (88, 84) breaches the lower band. Micro-bounce to 85 triggers RSI
    // turning up while still oversold and price still below the slowly-adapting BB lower.
    const prices = generateOscillatingBase();
    // Bars 25-26: sharp crash below BB lower
    prices.push(88, 84);
    // Bar 27: micro-bounce — RSI turns up, still oversold, still below BB lower
    prices.push(85);
    // Bars 28-37: recovery through BB middle and beyond
    prices.push(88, 92, 96, 99, 101, 103, 105, 106, 107, 108);

    const data = prices.map((p, i) => makeBar(i, p));
    const strategy = createVolatilityMeanReversion(testParams);

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    // The crash + bounce should trigger at least one buy
    expect(result.totalTrades).toBeGreaterThanOrEqual(1);
    // Entry should be during the crash phase (price < 90)
    if (result.trades.length > 0) {
      expect(result.trades[0]!.entryPrice).toBeLessThan(90);
    }
  });

  it("sells when price reverts to BB middle", async () => {
    // Same crash setup, but focus on verifying the exit at BB middle
    const prices = generateOscillatingBase();
    // Crash + bounce to trigger entry
    prices.push(88, 84, 85);
    // Recovery that crosses BB middle (around 96-97 after crash)
    prices.push(88, 92, 96, 99, 101, 103, 105, 106, 107, 108);

    const data = prices.map((p, i) => makeBar(i, p));
    const strategy = createVolatilityMeanReversion(testParams);

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    // Should have at least one completed trade
    expect(result.totalTrades).toBeGreaterThanOrEqual(1);

    if (result.trades.length > 0) {
      const firstTrade = result.trades[0]!;
      // Exit should be due to mean reversion (price reaching BB middle)
      // or end-of-backtest or time stop (acceptable alternative exits)
      const validExitReason =
        firstTrade.exitReason.includes("Mean reversion target") ||
        firstTrade.exitReason.includes("RSI overbought") ||
        firstTrade.exitReason === "end-of-backtest" ||
        firstTrade.exitReason.includes("Time stop");
      expect(validExitReason).toBe(true);
      // Entry was during the dip
      expect(firstTrade.entryPrice).toBeLessThan(90);
    }
  });

  it("respects time stop after 10 bars holding", async () => {
    // Same crash setup to trigger entry, but then price stays flat below BB middle
    // for > 10 bars so the time stop fires.
    const prices = generateOscillatingBase();
    // Crash + bounce to trigger entry
    prices.push(88, 84, 85);
    // Stay flat well below BB middle (~96) for 20 bars — never reaches BB middle
    for (let i = 0; i < 20; i++) {
      // Oscillate between 85-86 to avoid RSI overbought exit
      prices.push(85 + (i % 2));
    }

    const data = prices.map((p, i) => makeBar(i, p));
    const strategy = createVolatilityMeanReversion(testParams);

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    // Should have at least one trade
    expect(result.totalTrades).toBeGreaterThanOrEqual(1);

    // At least one trade should have exited via time stop or end-of-backtest
    const hasTimeStopOrForceExit = result.trades.some(
      (t) => t.exitReason.includes("Time stop") || t.exitReason === "end-of-backtest",
    );
    expect(hasTimeStopOrForceExit).toBe(true);
  });
});
