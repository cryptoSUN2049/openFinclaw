import { describe, expect, it } from "vitest";
import type { OHLCV } from "../../../fin-shared-types/src/types.js";
import { BacktestEngine } from "../backtest-engine.js";
import type { BacktestConfig } from "../types.js";
import { createMultiTimeframeConfluence } from "./multi-timeframe-confluence.js";

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

describe("Multi-Timeframe Confluence strategy", () => {
  it("creates strategy with default parameters", () => {
    const strategy = createMultiTimeframeConfluence();
    expect(strategy.id).toBe("multi-timeframe-confluence");
    expect(strategy.name).toBe("Multi-Timeframe Confluence");
    expect(strategy.parameters.longSma).toBe(200);
    expect(strategy.parameters.mediumEma).toBe(50);
    expect(strategy.parameters.shortEma).toBe(20);
    expect(strategy.parameters.rsiPeriod).toBe(7);
    expect(strategy.parameters.rsiOversold).toBe(35);
    expect(strategy.parameters.rsiOverbought).toBe(65);
    expect(strategy.parameters.bbPeriod).toBe(10);
    expect(strategy.parameters.bbStdDev).toBe(2.0);
    expect(strategy.parameters.atrPeriod).toBe(14);
    expect(strategy.parameters.atrStopMultiplier).toBe(2.0);
    expect(strategy.parameters.atrProfitMultiplier).toBe(3.0);
    expect(strategy.parameters.maxSizePct).toBe(70);
    expect(strategy.parameters.minConfluenceScore).toBe(3);

    expect(strategy.parameterRanges).toBeDefined();
    expect(strategy.parameterRanges!.longSma).toEqual({ min: 50, max: 300, step: 50 });
    expect(strategy.parameterRanges!.minConfluenceScore).toEqual({ min: 2, max: 5, step: 1 });
  });

  it("creates strategy with custom parameters", () => {
    const strategy = createMultiTimeframeConfluence({
      longSma: 100,
      mediumEma: 30,
      shortEma: 10,
      rsiPeriod: 5,
      rsiOversold: 30,
      rsiOverbought: 70,
      bbPeriod: 15,
      bbStdDev: 1.5,
      atrPeriod: 10,
      atrStopMultiplier: 1.5,
      atrProfitMultiplier: 4.0,
      maxSizePct: 50,
      minConfluenceScore: 2,
      symbol: "ETH/USDT",
    });
    expect(strategy.parameters.longSma).toBe(100);
    expect(strategy.parameters.mediumEma).toBe(30);
    expect(strategy.parameters.shortEma).toBe(10);
    expect(strategy.parameters.rsiPeriod).toBe(5);
    expect(strategy.parameters.rsiOversold).toBe(30);
    expect(strategy.parameters.rsiOverbought).toBe(70);
    expect(strategy.parameters.bbPeriod).toBe(15);
    expect(strategy.parameters.bbStdDev).toBe(1.5);
    expect(strategy.parameters.atrPeriod).toBe(10);
    expect(strategy.parameters.atrStopMultiplier).toBe(1.5);
    expect(strategy.parameters.atrProfitMultiplier).toBe(4.0);
    expect(strategy.parameters.maxSizePct).toBe(50);
    expect(strategy.parameters.minConfluenceScore).toBe(2);
    expect(strategy.symbols).toEqual(["ETH/USDT"]);
  });

  it("returns null during warm-up period", async () => {
    // Use small params: longSma:10 needs index >= 9 for valid SMA
    // Give only 5 bars — not enough for SMA(10)
    const data = [
      makeBar(0, 100),
      makeBar(1, 101),
      makeBar(2, 102),
      makeBar(3, 103),
      makeBar(4, 104),
    ];
    const strategy = createMultiTimeframeConfluence({
      longSma: 10,
      mediumEma: 5,
      shortEma: 3,
      rsiPeriod: 3,
      bbPeriod: 3,
      bbStdDev: 2,
      atrPeriod: 3,
      minConfluenceScore: 3,
    });

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    expect(result.totalTrades).toBe(0);
  });

  it("generates buy on confluence of long-term uptrend and short-term pullback", async () => {
    // Test the onBar logic directly with a mock IndicatorLib to verify
    // the confluence scoring and buy conditions work correctly.
    const strategy = createMultiTimeframeConfluence({
      longSma: 10,
      mediumEma: 5,
      shortEma: 3,
      rsiPeriod: 3,
      rsiOversold: 35,
      rsiOverbought: 65,
      bbPeriod: 3,
      bbStdDev: 2,
      atrPeriod: 3,
      minConfluenceScore: 3,
    });

    const bar = makeBar(20, 105);
    // Mock indicators that satisfy all confluence conditions:
    // smaRising: currSma(100) > prevSma(99) AND close(105) > currSma(100) → 1
    // structure: close(105) > ema50(103) AND ema50(103) > sma(100) → 1
    // emaStack: ema20(104) > ema50(103) → 1
    // longScore = 3
    // rsiPullback: RSI(30) < 35 → 1
    // shortScore = 1
    // totalScore = 4 >= 3, RSI turning up: 30 > 25
    const mockIndicators = {
      sma: () => Array(20).fill(NaN).concat([99, 100]),
      ema: (period: number) => {
        if (period === 5) return Array(20).fill(NaN).concat([102, 103]);
        return Array(20).fill(NaN).concat([103, 104]); // shortEma
      },
      rsi: () => Array(20).fill(NaN).concat([25, 30]),
      bollingerBands: () => ({
        upper: Array(21).fill(NaN).concat([110]),
        middle: Array(21).fill(NaN).concat([105]),
        lower: Array(21).fill(NaN).concat([100]),
      }),
      atr: () => Array(20).fill(NaN).concat([1, 2]),
      macd: () => ({ macd: [], signal: [], histogram: [] }),
    };

    const memory = new Map<string, unknown>();
    const ctx = {
      portfolio: {
        equity: 10000,
        cash: 10000,
        positions: [] as {
          side: "long";
          symbol: string;
          quantity: number;
          entryPrice: number;
          currentPrice: number;
          unrealizedPnl: number;
        }[],
      },
      history: Array(22).fill(bar),
      indicators: mockIndicators,
      regime: "sideways" as const,
      memory,
      log: () => {},
    };

    const signal = await strategy.onBar(bar, ctx);
    expect(signal).not.toBeNull();
    expect(signal!.action).toBe("buy");
    expect(signal!.confidence).toBeGreaterThanOrEqual(0.3);
    expect(signal!.stopLoss).toBeDefined();
    expect(signal!.takeProfit).toBeDefined();
    expect(memory.get("entryConfluence")).toBe(4);
    expect(memory.get("partialExitDone")).toBe(false);
  });

  it("does not buy when long-term trend is down", async () => {
    const strategy = createMultiTimeframeConfluence({
      longSma: 10,
      mediumEma: 5,
      shortEma: 3,
      rsiPeriod: 3,
      rsiOversold: 35,
      rsiOverbought: 65,
      bbPeriod: 3,
      bbStdDev: 2,
      atrPeriod: 3,
      minConfluenceScore: 3,
    });

    const prices: number[] = [];

    // 15 bars declining from 120 to ~80 (SMA10 falling, price below SMA)
    for (let i = 0; i < 15; i++) prices.push(120 - i * 2.67);

    // Brief dip and partial recovery — RSI may go oversold, but longScore < 2
    // because SMA is falling and price is below SMA
    prices.push(78, 76, 75, 74, 73);
    for (let i = 0; i < 5; i++) prices.push(75 + i * 0.5);

    const data = prices.map((p, i) => makeBar(i, p));
    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    // No buy should occur: downtrend means longScore < 2
    expect(result.totalTrades).toBe(0);
  });

  it("executes partial exit on RSI overbought reversal", async () => {
    // Test partial exit logic with mock IndicatorLib.
    // Simulate: holding a position, RSI > overbought (65) and declining.
    const strategy = createMultiTimeframeConfluence({
      longSma: 10,
      mediumEma: 5,
      shortEma: 3,
      rsiPeriod: 3,
      rsiOversold: 35,
      rsiOverbought: 65,
      bbPeriod: 3,
      bbStdDev: 2,
      atrPeriod: 3,
      atrStopMultiplier: 2.0,
      atrProfitMultiplier: 3.0,
      minConfluenceScore: 3,
    });

    const bar = makeBar(25, 150);

    // Set up memory as if we entered earlier (partialExitDone = false)
    const memory = new Map<string, unknown>();
    memory.set("highestClose", 155);
    memory.set("partialExitDone", false);
    memory.set("entryConfluence", 4);

    // Mock indicators: RSI overbought (70) and declining (prevRsi=75)
    // Price still above SMA (no breakdown), no EMA collapse, no trailing stop
    const mockIndicators = {
      sma: () => Array(25).fill(NaN).concat([140, 141]),
      ema: (period: number) => {
        if (period === 5) return Array(25).fill(NaN).concat([146, 148]);
        return Array(25).fill(NaN).concat([148, 149]); // shortEma
      },
      rsi: () => Array(25).fill(NaN).concat([75, 70]), // overbought and declining
      bollingerBands: () => ({
        upper: Array(26).fill(NaN).concat([160]),
        middle: Array(26).fill(NaN).concat([145]),
        lower: Array(26).fill(NaN).concat([130]),
      }),
      atr: () => Array(25).fill(NaN).concat([3, 3]),
      macd: () => ({ macd: [], signal: [], histogram: [] }),
    };

    const ctx = {
      portfolio: {
        equity: 10000,
        cash: 5000,
        positions: [
          {
            side: "long" as const,
            symbol: "BTC/USDT",
            quantity: 1,
            entryPrice: 105,
            currentPrice: 150,
            unrealizedPnl: 45,
          },
        ],
      },
      history: Array(27).fill(bar),
      indicators: mockIndicators,
      regime: "sideways" as const,
      memory,
      log: () => {},
    };

    const signal = await strategy.onBar(bar, ctx);
    expect(signal).not.toBeNull();
    expect(signal!.action).toBe("sell");
    expect(signal!.sizePct).toBe(50);
    expect(signal!.reason).toBe("Partial exit: RSI overbought reversal");
    expect(memory.get("partialExitDone")).toBe(true);
  });
});
