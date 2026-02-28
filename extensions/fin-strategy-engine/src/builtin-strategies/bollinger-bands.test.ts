import { describe, expect, it } from "vitest";
import type { OHLCV } from "../../../fin-shared-types/src/types.js";
import { BacktestEngine } from "../backtest-engine.js";
import { bollingerBands } from "../indicators.js";
import type { BacktestConfig } from "../types.js";
import { createBollingerBands } from "./bollinger-bands.js";

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

describe("Bollinger Bands strategy", () => {
  it("creates strategy with default parameters", () => {
    const strategy = createBollingerBands();
    expect(strategy.id).toBe("bollinger-bands");
    expect(strategy.parameters.period).toBe(20);
    expect(strategy.parameters.stdDev).toBe(2);
    expect(strategy.parameters.sizePct).toBe(100);
  });

  it("creates strategy with custom parameters", () => {
    const strategy = createBollingerBands({ period: 15, stdDev: 1.5, sizePct: 50 });
    expect(strategy.parameters.period).toBe(15);
    expect(strategy.parameters.stdDev).toBe(1.5);
    expect(strategy.parameters.sizePct).toBe(50);
  });

  it("buys below lower band and sells above upper band", async () => {
    // Phase 1: stable at 100 (tight bands) → dip triggers buy below lower band
    // Phase 2: stable at low price (bands contract) → spike triggers sell above upper band
    const prices: number[] = [];
    // 15 bars stable at 100 (warm-up, tight bands)
    for (let i = 0; i < 15; i++) prices.push(100);
    // Sharp dip: close drops below lower band (bands still tight from stability)
    prices.push(90, 80, 70);
    // 10 bars stable near 70 (bands contract around 70)
    for (let i = 0; i < 10; i++) prices.push(70);
    // Sharp spike: close jumps above upper band (bands tight around 70)
    prices.push(85, 100, 115, 130);

    const data = prices.map((p, i) => makeBar(i, p));
    const strategy = createBollingerBands({ period: 10, stdDev: 2, sizePct: 100 });
    const config: BacktestConfig = {
      capital: 10000,
      commissionRate: 0,
      slippageBps: 0,
      market: "crypto",
    };

    const engine = new BacktestEngine();
    const result = await engine.run(strategy, data, config);

    // Verify bands actually breach
    const closes = data.map((d) => d.close);
    const bands = bollingerBands(closes, 10, 2);

    let belowLower = false;
    let aboveUpper = false;
    for (let i = 0; i < closes.length; i++) {
      if (!Number.isNaN(bands.lower[i]) && closes[i] < bands.lower[i]) belowLower = true;
      if (!Number.isNaN(bands.upper[i]) && closes[i] > bands.upper[i]) aboveUpper = true;
    }

    expect(belowLower).toBe(true);
    expect(aboveUpper).toBe(true);
    expect(result.totalTrades).toBeGreaterThanOrEqual(1);
  });

  it("returns no trades during warm-up period", async () => {
    // Only 10 bars — not enough for BB(20)
    const data: OHLCV[] = [];
    for (let i = 0; i < 10; i++) {
      data.push(makeBar(i, 100 + i));
    }

    const strategy = createBollingerBands({ period: 20 });
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
