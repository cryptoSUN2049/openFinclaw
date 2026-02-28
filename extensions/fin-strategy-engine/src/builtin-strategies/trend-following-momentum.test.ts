import { describe, expect, it } from "vitest";
import type { OHLCV } from "../../../fin-shared-types/src/types.js";
import { BacktestEngine } from "../backtest-engine.js";
import type { BacktestConfig } from "../types.js";
import { createTrendFollowingMomentum } from "./trend-following-momentum.js";

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

describe("Trend-Following Momentum strategy", () => {
  it("creates strategy with default parameters", () => {
    const strategy = createTrendFollowingMomentum();
    expect(strategy.id).toBe("trend-following-momentum");
    expect(strategy.name).toBe("Trend-Following Momentum");
    expect(strategy.parameters.fastEma).toBe(12);
    expect(strategy.parameters.slowEma).toBe(26);
    expect(strategy.parameters.macdFast).toBe(12);
    expect(strategy.parameters.macdSlow).toBe(26);
    expect(strategy.parameters.macdSignal).toBe(9);
    expect(strategy.parameters.rsiPeriod).toBe(14);
    expect(strategy.parameters.rsiOverbought).toBe(75);
    expect(strategy.parameters.atrPeriod).toBe(14);
    expect(strategy.parameters.atrStopMultiplier).toBe(2.0);
    expect(strategy.parameters.atrProfitMultiplier).toBe(3.0);
    expect(strategy.parameters.maxSizePct).toBe(80);

    // Verify parameterRanges exist for all numeric params
    expect(strategy.parameterRanges).toBeDefined();
    expect(strategy.parameterRanges!.fastEma).toEqual({ min: 5, max: 50, step: 1 });
    expect(strategy.parameterRanges!.slowEma).toEqual({ min: 10, max: 100, step: 2 });
    expect(strategy.parameterRanges!.atrStopMultiplier).toEqual({ min: 1.0, max: 4.0, step: 0.5 });
  });

  it("creates strategy with custom parameters", () => {
    const strategy = createTrendFollowingMomentum({
      fastEma: 8,
      slowEma: 21,
      macdFast: 8,
      macdSlow: 21,
      macdSignal: 5,
      rsiPeriod: 10,
      rsiOverbought: 70,
      atrPeriod: 10,
      atrStopMultiplier: 1.5,
      atrProfitMultiplier: 4.0,
      maxSizePct: 60,
      symbol: "ETH/USDT",
    });
    expect(strategy.parameters.fastEma).toBe(8);
    expect(strategy.parameters.slowEma).toBe(21);
    expect(strategy.parameters.macdFast).toBe(8);
    expect(strategy.parameters.macdSlow).toBe(21);
    expect(strategy.parameters.macdSignal).toBe(5);
    expect(strategy.parameters.rsiPeriod).toBe(10);
    expect(strategy.parameters.rsiOverbought).toBe(70);
    expect(strategy.parameters.atrPeriod).toBe(10);
    expect(strategy.parameters.atrStopMultiplier).toBe(1.5);
    expect(strategy.parameters.atrProfitMultiplier).toBe(4.0);
    expect(strategy.parameters.maxSizePct).toBe(60);
    expect(strategy.symbols).toEqual(["ETH/USDT"]);
  });

  it("returns null during warm-up period", async () => {
    // Only 5 bars — insufficient for EMA(26), MACD(12,26,9), RSI(14), ATR(14)
    const data = [
      makeBar(0, 100),
      makeBar(1, 101),
      makeBar(2, 102),
      makeBar(3, 103),
      makeBar(4, 104),
    ];
    const strategy = createTrendFollowingMomentum();

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    expect(result.totalTrades).toBe(0);
  });

  it("generates buy signal on EMA golden cross with MACD confirmation", async () => {
    // Use small indicator periods to trigger signals with fewer bars.
    // Phase 1: gentle decline (brings RSI low, fast EMA below slow EMA)
    // Phase 2: choppy base (RSI normalizes near 50)
    // Phase 3: gentle rise (triggers golden cross while RSI is still moderate)
    const prices: number[] = [];
    // Phase 1: decline from 120 to 106 over 15 bars
    for (let i = 0; i < 15; i++) prices.push(120 - i);
    // Phase 2: choppy base around 105
    prices.push(105, 104, 106, 103, 105, 104, 106, 104, 105, 104);
    // Phase 3: gentle rise
    for (let i = 1; i <= 15; i++) prices.push(104 + i * 0.8);

    const data = prices.map((p, i) => makeBar(i, p));
    const strategy = createTrendFollowingMomentum({
      fastEma: 3,
      slowEma: 5,
      macdFast: 3,
      macdSlow: 5,
      macdSignal: 2,
      rsiPeriod: 3,
      atrPeriod: 3,
    });

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    // The decline→chop→rise pattern should trigger at least one buy entry
    expect(result.totalTrades).toBeGreaterThanOrEqual(1);
  });

  it("does not buy when already holding long position", async () => {
    // Create prices that produce two potential golden cross signals
    // but the second should be ignored because we're already long
    const prices: number[] = [];
    // Flat baseline
    for (let i = 0; i < 15; i++) prices.push(100);
    // First rise → golden cross + buy
    for (let i = 1; i <= 10; i++) prices.push(100 + i * 3);
    // Small dip (not enough for death cross or MACD negative with small periods)
    for (let i = 0; i < 3; i++) prices.push(128);
    // Second rise → would be another buy if not already long
    for (let i = 1; i <= 10; i++) prices.push(128 + i * 3);

    const data = prices.map((p, i) => makeBar(i, p));
    const strategy = createTrendFollowingMomentum({
      fastEma: 3,
      slowEma: 5,
      macdFast: 3,
      macdSlow: 5,
      macdSignal: 2,
      rsiPeriod: 3,
      atrPeriod: 3,
      rsiOverbought: 90, // High threshold so RSI doesn't block
    });

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    // Count buy entries — there should be at most a few (not double entries)
    const buyEntries = result.trades.filter((t) => t.reason.includes("Trend-following buy"));
    // If multiple trades exist, each buy must follow a sell (no double buys)
    for (let i = 1; i < buyEntries.length; i++) {
      expect(buyEntries[i]!.entryTime).toBeGreaterThan(buyEntries[i - 1]!.exitTime);
    }
  });

  it("sets dynamic stopLoss and takeProfit on buy signals", async () => {
    // Same decline→chop→rise data that triggers a buy
    const prices: number[] = [];
    for (let i = 0; i < 15; i++) prices.push(120 - i);
    prices.push(105, 104, 106, 103, 105, 104, 106, 104, 105, 104);
    for (let i = 1; i <= 15; i++) prices.push(104 + i * 0.8);

    const data = prices.map((p, i) => makeBar(i, p));
    const strategy = createTrendFollowingMomentum({
      fastEma: 3,
      slowEma: 5,
      macdFast: 3,
      macdSlow: 5,
      macdSignal: 2,
      rsiPeriod: 3,
      atrPeriod: 3,
      atrStopMultiplier: 2.0,
      atrProfitMultiplier: 3.0,
    });

    // Run onBar manually to capture the signal with stopLoss/takeProfit
    // (BacktestEngine doesn't store these on TradeRecord)
    const memory = new Map<string, unknown>();
    let buySignal: { stopLoss?: number; takeProfit?: number; confidence: number } | null = null;

    for (let i = 0; i < data.length; i++) {
      const bar = data[i]!;
      const history = data.slice(0, i + 1);
      const closes = history.map((b) => b.close);
      const highs = history.map((b) => b.high);
      const lows = history.map((b) => b.low);

      // Import indicators inline for manual context building
      const { ema, rsi, macd, atr } = await import("../indicators.js");

      const ctx = {
        portfolio: { equity: 10000, cash: 10000, positions: [] as { side: string }[] },
        history,
        indicators: {
          sma: () => [],
          ema: (period: number) => ema(closes, period),
          rsi: (period: number) => rsi(closes, period),
          macd: (fast?: number, slow?: number, signal?: number) => macd(closes, fast, slow, signal),
          bollingerBands: () => ({ upper: [], middle: [], lower: [] }),
          atr: (period?: number) => atr(highs, lows, closes, period),
        },
        regime: "sideways" as const,
        memory,
        log: () => {},
      };

      const signal = await strategy.onBar(bar, ctx);
      if (signal && signal.action === "buy") {
        buySignal = signal;
        break;
      }
    }

    expect(buySignal).not.toBeNull();
    expect(buySignal!.stopLoss).toBeDefined();
    expect(buySignal!.takeProfit).toBeDefined();
    expect(buySignal!.stopLoss!).toBeLessThan(buySignal!.takeProfit!);
    expect(buySignal!.confidence).toBeGreaterThanOrEqual(0.3);
    expect(buySignal!.confidence).toBeLessThanOrEqual(0.95);
  });
});
