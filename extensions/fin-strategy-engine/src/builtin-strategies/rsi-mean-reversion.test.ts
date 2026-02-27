import { describe, expect, it } from "vitest";
import type { OHLCV } from "../../../fin-data-bus/src/types.js";
import { BacktestEngine } from "../backtest-engine.js";
import { rsi } from "../indicators.js";
import type { BacktestConfig } from "../types.js";
import { createRsiMeanReversion } from "./rsi-mean-reversion.js";

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

describe("RSI Mean Reversion strategy", () => {
  it("creates strategy with default parameters", () => {
    const strategy = createRsiMeanReversion();
    expect(strategy.id).toBe("rsi-mean-reversion");
    expect(strategy.parameters.period).toBe(14);
    expect(strategy.parameters.oversold).toBe(30);
    expect(strategy.parameters.overbought).toBe(70);
  });

  it("creates strategy with custom parameters", () => {
    const strategy = createRsiMeanReversion({
      period: 7,
      oversold: 25,
      overbought: 75,
      sizePct: 50,
    });
    expect(strategy.parameters.period).toBe(7);
    expect(strategy.parameters.oversold).toBe(25);
    expect(strategy.parameters.overbought).toBe(75);
  });

  it("buys on oversold RSI and sells on overbought RSI", async () => {
    // Create price data that produces known RSI values:
    // Start flat, then sharp drop (RSI < 30), then sharp rise (RSI > 70)
    const prices: number[] = [];
    // 20 bars flat at 100 (RSI neutral)
    for (let i = 0; i < 20; i++) prices.push(100);
    // 5 bars dropping sharply (RSI drops toward oversold)
    prices.push(97, 93, 88, 82, 75);
    // 10 bars rising sharply (RSI rises toward overbought)
    prices.push(80, 88, 96, 105, 115, 125, 135, 145, 155, 165);

    const data = prices.map((p, i) => makeBar(i, p));
    const strategy = createRsiMeanReversion({
      period: 14,
      oversold: 30,
      overbought: 70,
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

    // Verify RSI actually crosses thresholds
    const closes = data.map((d) => d.close);
    const rsiValues = rsi(closes, 14);

    // Find first oversold bar
    let oversoldBar = -1;
    for (let i = 0; i < rsiValues.length; i++) {
      if (!Number.isNaN(rsiValues[i]!) && rsiValues[i]! < 30) {
        oversoldBar = i;
        break;
      }
    }

    // Find first overbought bar after oversold
    let overboughtBar = -1;
    for (let i = oversoldBar + 1; i < rsiValues.length; i++) {
      if (!Number.isNaN(rsiValues[i]!) && rsiValues[i]! > 70) {
        overboughtBar = i;
        break;
      }
    }

    // RSI should have crossed both thresholds
    expect(oversoldBar).toBeGreaterThan(-1);
    expect(overboughtBar).toBeGreaterThan(oversoldBar);

    // Strategy should have at least 1 trade
    expect(result.totalTrades).toBeGreaterThanOrEqual(1);
  });

  it("returns no trades during warm-up period", async () => {
    // Only 10 bars — not enough for RSI(14)
    const data: OHLCV[] = [];
    for (let i = 0; i < 10; i++) {
      data.push(makeBar(i, 100 + i));
    }

    const strategy = createRsiMeanReversion({ period: 14 });
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

  it("does not double-buy when already in position", async () => {
    // Multiple oversold readings — should only buy once
    const prices: number[] = [];
    for (let i = 0; i < 20; i++) prices.push(100);
    // Keep dropping to stay oversold
    for (let i = 0; i < 10; i++) prices.push(75 - i);

    const data = prices.map((p, i) => makeBar(i, p));
    const strategy = createRsiMeanReversion({ period: 14, oversold: 30 });
    const config: BacktestConfig = {
      capital: 10000,
      commissionRate: 0,
      slippageBps: 0,
      market: "crypto",
    };

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    // Should have at most 1 open position worth of trades
    // (the auto-close at end counts as the exit)
    const buySignals = result.trades.filter((t) => t.reason.includes("oversold"));
    expect(buySignals.length).toBeLessThanOrEqual(1);
  });
});
