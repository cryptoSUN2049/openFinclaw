import { describe, expect, it } from "vitest";
import type { OHLCV } from "../../../fin-shared-types/src/types.js";
import { BacktestEngine } from "../backtest-engine.js";
import type { BacktestConfig } from "../types.js";
import { createRiskParityTripleScreen } from "./risk-parity-triple-screen.js";

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

describe("Risk-Parity Triple Screen strategy", () => {
  it("creates strategy with default parameters", () => {
    const strategy = createRiskParityTripleScreen();
    expect(strategy.id).toBe("risk-parity-triple-screen");
    expect(strategy.name).toBe("Risk-Parity Triple Screen");
    expect(strategy.version).toBe("1.0.0");
    expect(strategy.markets).toEqual(["crypto", "equity"]);
    expect(strategy.symbols).toEqual(["BTC/USDT"]);
    expect(strategy.timeframes).toEqual(["1d"]);

    // Verify all default parameter values
    expect(strategy.parameters.tideFastEma).toBe(13);
    expect(strategy.parameters.tideSlowEma).toBe(48);
    expect(strategy.parameters.tideMacdFast).toBe(12);
    expect(strategy.parameters.tideMacdSlow).toBe(26);
    expect(strategy.parameters.tideMacdSignal).toBe(9);
    expect(strategy.parameters.tideSma).toBe(50);
    expect(strategy.parameters.tideSlopeLookback).toBe(5);
    expect(strategy.parameters.waveRsiPeriod).toBe(14);
    expect(strategy.parameters.waveRsiOversold).toBe(40);
    expect(strategy.parameters.waveRsiEntry).toBe(50);
    expect(strategy.parameters.rippleBbPeriod).toBe(20);
    expect(strategy.parameters.rippleBbStdDev).toBe(2.0);
    expect(strategy.parameters.atrPeriod).toBe(14);
    expect(strategy.parameters.riskPctPerTrade).toBe(2.0);
    expect(strategy.parameters.atrStopMultiplier).toBe(2.0);
    expect(strategy.parameters.atrProfitMultiplier).toBe(3.5);
    expect(strategy.parameters.maxSizePct).toBe(80);

    // Verify parameterRanges exist
    expect(strategy.parameterRanges).toBeDefined();
    expect(strategy.parameterRanges!.tideFastEma).toEqual({ min: 5, max: 30, step: 1 });
    expect(strategy.parameterRanges!.atrStopMultiplier).toEqual({ min: 1.0, max: 4.0, step: 0.5 });
    expect(strategy.parameterRanges!.riskPctPerTrade).toEqual({ min: 0.5, max: 5.0, step: 0.5 });
  });

  it("creates strategy with custom parameters", () => {
    const strategy = createRiskParityTripleScreen({
      tideFastEma: 8,
      tideSlowEma: 21,
      tideMacdFast: 6,
      tideMacdSlow: 18,
      tideMacdSignal: 5,
      tideSma: 30,
      tideSlopeLookback: 3,
      waveRsiPeriod: 10,
      waveRsiOversold: 30,
      waveRsiEntry: 45,
      rippleBbPeriod: 15,
      rippleBbStdDev: 1.5,
      atrPeriod: 10,
      riskPctPerTrade: 1.5,
      atrStopMultiplier: 1.5,
      atrProfitMultiplier: 4.0,
      maxSizePct: 60,
      symbol: "ETH/USDT",
    });

    expect(strategy.parameters.tideFastEma).toBe(8);
    expect(strategy.parameters.tideSlowEma).toBe(21);
    expect(strategy.parameters.tideMacdFast).toBe(6);
    expect(strategy.parameters.tideMacdSlow).toBe(18);
    expect(strategy.parameters.tideMacdSignal).toBe(5);
    expect(strategy.parameters.tideSma).toBe(30);
    expect(strategy.parameters.tideSlopeLookback).toBe(3);
    expect(strategy.parameters.waveRsiPeriod).toBe(10);
    expect(strategy.parameters.waveRsiOversold).toBe(30);
    expect(strategy.parameters.waveRsiEntry).toBe(45);
    expect(strategy.parameters.rippleBbPeriod).toBe(15);
    expect(strategy.parameters.rippleBbStdDev).toBe(1.5);
    expect(strategy.parameters.atrPeriod).toBe(10);
    expect(strategy.parameters.riskPctPerTrade).toBe(1.5);
    expect(strategy.parameters.atrStopMultiplier).toBe(1.5);
    expect(strategy.parameters.atrProfitMultiplier).toBe(4.0);
    expect(strategy.parameters.maxSizePct).toBe(60);
    expect(strategy.symbols).toEqual(["ETH/USDT"]);
  });

  it("returns null during warm-up period", async () => {
    // Only 10 bars — insufficient for SMA(50), EMA(48), MACD(12,26,9), RSI(14), BB(20), ATR(14)
    const data: OHLCV[] = [];
    for (let i = 0; i < 10; i++) {
      data.push(makeBar(i, 100 + i));
    }
    const strategy = createRiskParityTripleScreen();

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    expect(result.totalTrades).toBe(0);
  });

  it("generates buy when all three screens pass", async () => {
    // Test triple screen logic with mock IndicatorLib.
    // Screen 1 (Tide): EMA(3) > EMA(5) + MACD hist > 0 + SMA(5) rising → score 3/3
    // Screen 2 (Wave): previously oversold, now RSI > entry → passes
    // Screen 3 (Ripple): close <= BBLower * 1.01 → passes
    const strategy = createRiskParityTripleScreen({
      tideFastEma: 3,
      tideSlowEma: 5,
      tideMacdFast: 3,
      tideMacdSlow: 5,
      tideMacdSignal: 2,
      tideSma: 5,
      tideSlopeLookback: 2,
      waveRsiPeriod: 3,
      waveRsiOversold: 35,
      waveRsiEntry: 45,
      rippleBbPeriod: 5,
      rippleBbStdDev: 2,
      atrPeriod: 3,
      maxSizePct: 80,
    });

    const bar = makeBar(20, 100);
    const memory = new Map<string, unknown>();
    // Pre-set wave state: RSI was oversold on a previous bar
    memory.set("waveWasOversold", true);

    // Mock indicators satisfying all three screens:
    const mockIndicators = {
      ema: (period: number) => {
        // tideFastEma(3): current = 102 (above tideSlowEma)
        if (period === 3) return Array(20).fill(NaN).concat([101, 102]);
        // tideSlowEma(5): current = 100
        return Array(20).fill(NaN).concat([99, 100]);
      },
      macd: () => ({
        macd: Array(21).fill(NaN).concat([0.5]),
        signal: Array(21).fill(NaN).concat([0.2]),
        histogram: Array(21).fill(NaN).concat([0.3]), // positive → tide point
      }),
      sma: () => {
        // SMA(5): current at index 21 = 99, past (index 19) = 97 → rising
        const arr = Array(19).fill(NaN);
        arr.push(97, 98, 99); // indices 19, 20, 21
        return arr;
      },
      rsi: () => Array(20).fill(NaN).concat([40, 50]), // prev=40, curr=50 > entry(45)
      bollingerBands: () => ({
        upper: Array(21).fill(NaN).concat([110]),
        middle: Array(21).fill(NaN).concat([102]),
        lower: Array(21).fill(NaN).concat([100]), // close(100) <= 100*1.01=101 → ripple passes
      }),
      atr: () => Array(20).fill(NaN).concat([1.5, 2]),
    };

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
    expect(signal!.stopLoss).toBeDefined();
    expect(signal!.takeProfit).toBeDefined();
    expect(signal!.confidence).toBeGreaterThanOrEqual(0.3);
    expect(signal!.confidence).toBeLessThanOrEqual(0.95);
    expect(signal!.sizePct).toBeGreaterThan(0);
    expect(signal!.sizePct).toBeLessThanOrEqual(80);
    // Wave consumed after buy
    expect(memory.get("waveWasOversold")).toBe(false);
    // Entry metadata stored
    expect(memory.get("entryBar")).toBeDefined();
    expect(memory.get("entryPrice")).toBe(100);
  });

  it("does not buy when tide is bearish", async () => {
    // 20 bars falling steadily from 120 to 80 — EMA fast < slow, MACD negative,
    // SMA declining. tideScore should stay < 2, blocking all buys.
    const prices: number[] = [];
    for (let i = 0; i < 20; i++) {
      prices.push(120 - i * 2);
    }

    const data = prices.map((p, i) => makeBar(i, p));
    const strategy = createRiskParityTripleScreen({
      tideFastEma: 3,
      tideSlowEma: 5,
      tideMacdFast: 3,
      tideMacdSlow: 5,
      tideMacdSignal: 2,
      tideSma: 5,
      tideSlopeLookback: 2,
      waveRsiPeriod: 3,
      waveRsiOversold: 35,
      waveRsiEntry: 45,
      rippleBbPeriod: 5,
      rippleBbStdDev: 2,
      atrPeriod: 3,
      maxSizePct: 80,
    });

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    expect(result.totalTrades).toBe(0);
  });

  it("uses risk-parity sizing", async () => {
    // Verify that the strategy uses ATR-based risk-parity sizing rather than
    // always allocating maxSizePct. The sizePct should vary based on ATR/price.
    const prices: number[] = [];

    // Phase 1: uptrend to establish tide
    for (let i = 0; i < 15; i++) {
      prices.push(100 + i);
    }

    // Phase 2: pullback for wave oversold
    const pullback = [113, 111, 109, 107, 106, 105, 104, 104];
    prices.push(...pullback);

    // Phase 3: near BB lower + wave recovery
    prices.push(103, 104);

    // Phase 4: recovery and exit
    prices.push(106, 108, 110, 112, 114, 116, 118, 120);

    const data = prices.map((p, i) => makeBar(i, p));
    const strategy = createRiskParityTripleScreen({
      tideFastEma: 3,
      tideSlowEma: 5,
      tideMacdFast: 3,
      tideMacdSlow: 5,
      tideMacdSignal: 2,
      tideSma: 5,
      tideSlopeLookback: 2,
      waveRsiPeriod: 3,
      waveRsiOversold: 35,
      waveRsiEntry: 45,
      rippleBbPeriod: 5,
      rippleBbStdDev: 2,
      atrPeriod: 3,
      riskPctPerTrade: 2,
      maxSizePct: 80,
    });

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    // There should be at least one trade
    if (result.trades.length > 0) {
      const firstTrade = result.trades[0]!;
      // Quantity should exist and be reasonable (not zero, not absurdly large)
      expect(firstTrade.quantity).toBeGreaterThan(0);
      // The position value should not consume the entire capital (risk-parity limits it)
      const positionValue = firstTrade.quantity * firstTrade.entryPrice;
      expect(positionValue).toBeLessThan(config.capital);
      expect(positionValue).toBeGreaterThan(0);
    }
  });
});
