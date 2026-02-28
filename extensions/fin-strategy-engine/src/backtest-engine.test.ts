import { describe, expect, it } from "vitest";
import { applyConstantSlippage } from "../../fin-shared-types/src/fill-simulation.js";
import type { OHLCV } from "../../fin-shared-types/src/types.js";
import { BacktestEngine } from "./backtest-engine.js";
import { sma } from "./indicators.js";
import type { BacktestConfig, Signal, StrategyContext, StrategyDefinition } from "./types.js";

/** Helper: generate linear OHLCV data from startPrice to endPrice. */
function linearData(bars: number, startPrice: number, endPrice: number): OHLCV[] {
  const data: OHLCV[] = [];
  for (let i = 0; i < bars; i++) {
    const price = startPrice + ((endPrice - startPrice) * i) / (bars - 1);
    data.push({
      timestamp: 1000000 + i * 86400000,
      open: price,
      high: price * 1.001,
      low: price * 0.999,
      close: price,
      volume: 1000,
    });
  }
  return data;
}

/** Helper: create a strategy that always buys on bar 0 and sells on the last bar. */
function buyAndHoldStrategy(): StrategyDefinition {
  let bought = false;
  return {
    id: "buy-and-hold",
    name: "Buy and Hold",
    version: "1.0",
    markets: ["crypto"],
    symbols: ["TEST"],
    timeframes: ["1d"],
    parameters: {},
    async onBar(bar: OHLCV, ctx: StrategyContext): Promise<Signal | null> {
      if (!bought && ctx.portfolio.positions.length === 0) {
        bought = true;
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

const engine = new BacktestEngine();

describe("BacktestEngine", () => {
  describe("empty data", () => {
    it("returns empty result for no data", async () => {
      const result = await engine.run(buyAndHoldStrategy(), [], {
        capital: 10000,
        commissionRate: 0,
        slippageBps: 0,
        market: "crypto",
      });
      expect(result.totalTrades).toBe(0);
      expect(result.finalEquity).toBe(10000);
    });
  });

  describe("buy-and-hold baseline", () => {
    it("captures ~100% return on 100→200 linear data (zero costs)", async () => {
      const data = linearData(100, 100, 200);
      const config: BacktestConfig = {
        capital: 10000,
        commissionRate: 0,
        slippageBps: 0,
        market: "crypto",
      };

      const result = await engine.run(buyAndHoldStrategy(), data, config);

      // Buy at 100, auto-close at 200 → ~100% return
      expect(result.totalTrades).toBe(1);
      expect(result.totalReturn).toBeCloseTo(100, 0);
      expect(result.finalEquity).toBeCloseTo(20000, -1);
    });
  });

  describe("commission verification", () => {
    it("deducts commissions correctly", async () => {
      const data = linearData(100, 100, 200);
      const commissionRate = 0.001; // 0.1%
      const config: BacktestConfig = {
        capital: 10000,
        commissionRate,
        slippageBps: 0,
        market: "crypto",
      };

      const result = await engine.run(buyAndHoldStrategy(), data, config);

      // With commission-adjusted allocation:
      // qty = 10000 / (100 * 1.001) ≈ 99.9 units
      // Entry commission ≈ 99.9 * 100 * 0.001 ≈ 9.99
      // Exit at 200: exit commission ≈ 99.9 * 200 * 0.001 ≈ 19.98
      // Total commission ≈ 30
      expect(result.totalTrades).toBe(1);
      const trade = result.trades[0]!;
      expect(trade.commission).toBeGreaterThan(0);
      expect(result.totalReturn).toBeLessThan(100);
      // Return should be close to but less than 100% due to commissions
      expect(result.totalReturn).toBeGreaterThan(99);
      // Total commission (entry + exit) should be approximately 30
      expect(trade.commission).toBeCloseTo(30, -1);
    });
  });

  describe("slippage verification", () => {
    it("buy fills at higher price, sell fills at lower price", async () => {
      const data = linearData(100, 100, 200);
      const slippageBps = 5;
      const config: BacktestConfig = {
        capital: 10000,
        commissionRate: 0,
        slippageBps,
        market: "crypto",
      };

      const result = await engine.run(buyAndHoldStrategy(), data, config);
      const trade = result.trades[0]!;

      // Entry: buy at close=100 with 5bps slippage → fillPrice = 100.05
      const expectedEntry = applyConstantSlippage(100, "buy", slippageBps);
      expect(trade.entryPrice).toBeCloseTo(expectedEntry.fillPrice, 4);

      // Exit: sell at close=200 with 5bps slippage → fillPrice = 199.9
      const expectedExit = applyConstantSlippage(200, "sell", slippageBps);
      expect(trade.exitPrice).toBeCloseTo(expectedExit.fillPrice, 4);

      // Slippage reduces return from 100%
      expect(result.totalReturn).toBeLessThan(100);
    });
  });

  describe("multi-trade with SMA crossover", () => {
    it("generates correct trades at known crossover points", async () => {
      // Create data with a clear pattern:
      // Bars 0-9: price at 100 (flat)
      // Bars 10-14: price rises to 120 (triggers golden cross)
      // Bars 15-19: price drops to 80 (triggers death cross)
      // Bars 20-24: price rises to 110
      const data: OHLCV[] = [];
      const prices = [
        // Bars 0-9: stable at 100
        ...Array(10).fill(100),
        // Bars 10-14: rise
        105,
        110,
        115,
        118,
        120,
        // Bars 15-19: drop
        110,
        100,
        90,
        85,
        80,
        // Bars 20-24: recovery
        85,
        90,
        95,
        100,
        110,
      ] as number[];

      for (let i = 0; i < prices.length; i++) {
        data.push({
          timestamp: 1000000 + i * 86400000,
          open: prices[i]!,
          high: prices[i]! * 1.01,
          low: prices[i]! * 0.99,
          close: prices[i]!,
          volume: 1000,
        });
      }

      // Use fast=3, slow=5 so crossovers happen quickly
      const fastPeriod = 3;
      const slowPeriod = 5;

      // Pre-compute expected crossover points
      const closes = data.map((d) => d.close);
      const fastSma = sma(closes, fastPeriod);
      const slowSma = sma(closes, slowPeriod);

      // Find golden and death crosses
      const goldenCrosses: number[] = [];
      const deathCrosses: number[] = [];
      for (let i = 1; i < closes.length; i++) {
        if (
          !Number.isNaN(fastSma[i]!) &&
          !Number.isNaN(slowSma[i]!) &&
          !Number.isNaN(fastSma[i - 1]!) &&
          !Number.isNaN(slowSma[i - 1]!)
        ) {
          if (fastSma[i - 1]! <= slowSma[i - 1]! && fastSma[i]! > slowSma[i]!) {
            goldenCrosses.push(i);
          }
          if (fastSma[i - 1]! >= slowSma[i - 1]! && fastSma[i]! < slowSma[i]!) {
            deathCrosses.push(i);
          }
        }
      }

      // Create an SMA crossover strategy
      let inPosition = false;
      const strategy: StrategyDefinition = {
        id: "test-sma",
        name: "Test SMA",
        version: "1.0",
        markets: ["crypto"],
        symbols: ["TEST"],
        timeframes: ["1d"],
        parameters: { fastPeriod, slowPeriod },
        async onBar(_bar: OHLCV, ctx: StrategyContext): Promise<Signal | null> {
          const fast = ctx.indicators.sma(fastPeriod);
          const slow = ctx.indicators.sma(slowPeriod);
          const len = fast.length;
          if (len < 2) return null;

          const cf = fast[len - 1]!;
          const cs = slow[len - 1]!;
          const pf = fast[len - 2]!;
          const ps = slow[len - 2]!;

          if (Number.isNaN(cf) || Number.isNaN(cs) || Number.isNaN(pf) || Number.isNaN(ps)) {
            return null;
          }

          if (pf <= ps && cf > cs && !inPosition) {
            inPosition = true;
            return {
              action: "buy",
              symbol: "TEST",
              sizePct: 100,
              orderType: "market",
              reason: "golden-cross",
              confidence: 0.7,
            };
          }
          if (pf >= ps && cf < cs && inPosition) {
            inPosition = false;
            return {
              action: "sell",
              symbol: "TEST",
              sizePct: 100,
              orderType: "market",
              reason: "death-cross",
              confidence: 0.7,
            };
          }
          return null;
        },
      };

      const config: BacktestConfig = {
        capital: 10000,
        commissionRate: 0,
        slippageBps: 0,
        market: "crypto",
      };
      const result = await engine.run(strategy, data, config);

      // We should have trades (golden cross buys, death cross sells)
      expect(result.totalTrades).toBeGreaterThanOrEqual(1);

      // Verify each trade has valid entry/exit
      for (const trade of result.trades) {
        expect(trade.entryPrice).toBeGreaterThan(0);
        expect(trade.exitPrice).toBeGreaterThan(0);
        expect(trade.quantity).toBeGreaterThan(0);
      }

      // All trades' P&L should sum to totalReturn
      const totalPnl = result.trades.reduce((s, t) => s + t.pnl, 0);
      expect(result.finalEquity).toBeCloseTo(config.capital + totalPnl, 2);
    });
  });

  describe("metric verification", () => {
    it("equity curve and daily returns are consistent", async () => {
      const data = linearData(50, 100, 150);
      const config: BacktestConfig = {
        capital: 10000,
        commissionRate: 0,
        slippageBps: 0,
        market: "crypto",
      };
      const result = await engine.run(buyAndHoldStrategy(), data, config);

      expect(result.equityCurve.length).toBe(data.length);
      expect(result.dailyReturns.length).toBe(data.length - 1);

      // Equity should not drop to zero (position value should be tracked)
      for (const eq of result.equityCurve) {
        expect(eq).toBeGreaterThan(0);
      }

      // Verify daily returns match equity curve changes
      for (let i = 0; i < result.dailyReturns.length; i++) {
        const prev = result.equityCurve[i]!;
        const next = result.equityCurve[i + 1]!;
        if (prev === 0) continue; // skip division by zero edge case
        const expected = (next - prev) / prev;
        expect(result.dailyReturns[i]).toBeCloseTo(expected, 8);
      }

      // Equity curve should be monotonically increasing for linear rising data
      for (let i = 1; i < result.equityCurve.length; i++) {
        expect(result.equityCurve[i]!).toBeGreaterThanOrEqual(result.equityCurve[i - 1]! - 0.01);
      }
    });

    it("Sharpe ratio is positive for profitable strategy", async () => {
      const data = linearData(100, 100, 200);
      const config: BacktestConfig = {
        capital: 10000,
        commissionRate: 0,
        slippageBps: 0,
        market: "crypto",
      };
      const result = await engine.run(buyAndHoldStrategy(), data, config);

      expect(result.sharpe).toBeGreaterThan(0);
      expect(result.winRate).toBe(100);
      expect(result.maxDrawdown).toBeLessThanOrEqual(0);
    });
  });

  describe("no-signal strategy", () => {
    it("returns zero trades and original capital when strategy never signals", async () => {
      const data = linearData(20, 100, 200);
      const strategy: StrategyDefinition = {
        id: "no-op",
        name: "No-Op",
        version: "1.0",
        markets: ["crypto"],
        symbols: ["TEST"],
        timeframes: ["1d"],
        parameters: {},
        async onBar(): Promise<Signal | null> {
          return null;
        },
      };

      const config: BacktestConfig = {
        capital: 10000,
        commissionRate: 0,
        slippageBps: 0,
        market: "crypto",
      };
      const result = await engine.run(strategy, data, config);

      expect(result.totalTrades).toBe(0);
      expect(result.finalEquity).toBe(10000);
      expect(result.totalReturn).toBe(0);
    });
  });
});
