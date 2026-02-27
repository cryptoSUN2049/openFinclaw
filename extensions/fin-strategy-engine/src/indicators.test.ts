import { describe, it, expect } from "vitest";
import { sma, ema, rsi, macd, bollingerBands, atr } from "./indicators.js";

/** Helper: check relative error is within tolerance. */
function expectClose(actual: number, expected: number, tolerance = 0.0001) {
  if (expected === 0) {
    expect(Math.abs(actual)).toBeLessThan(tolerance);
  } else {
    expect(Math.abs((actual - expected) / expected)).toBeLessThan(tolerance);
  }
}

describe("sma", () => {
  it("computes simple moving average for a basic sequence", () => {
    const result = sma([1, 2, 3, 4, 5], 3);
    expect(result).toHaveLength(5);
    expect(result[0]).toBeNaN();
    expect(result[1]).toBeNaN();
    expectClose(result[2], 2);
    expectClose(result[3], 3);
    expectClose(result[4], 4);
  });

  it("returns empty array for empty input", () => {
    expect(sma([], 3)).toEqual([]);
  });

  it("returns all NaN when period > data length", () => {
    const result = sma([1, 2, 3], 5);
    expect(result).toHaveLength(3);
    result.forEach((v) => expect(v).toBeNaN());
  });

  it("period=1 returns the input values", () => {
    const data = [10, 20, 30];
    const result = sma(data, 1);
    expect(result).toEqual(data);
  });
});

describe("ema", () => {
  it("period=1 returns same as input", () => {
    const data = [10, 20, 30, 40];
    const result = ema(data, 1);
    expect(result).toEqual(data);
  });

  it("computes EMA for a known sequence", () => {
    // EMA(10): multiplier = 2/(10+1) = 0.1818...
    // Seed with SMA of first 10 values
    const data = [
      22.27, 22.19, 22.08, 22.17, 22.18, 22.13, 22.23, 22.43, 22.24, 22.29, 22.15, 22.39, 22.38,
      22.61, 23.36,
    ];
    const result = ema(data, 10);
    expect(result).toHaveLength(15);
    // First 9 should be NaN
    for (let i = 0; i < 9; i++) {
      expect(result[i]).toBeNaN();
    }
    // Index 9 = SMA of first 10 = (22.27+22.19+22.08+22.17+22.18+22.13+22.23+22.43+22.24+22.29)/10 = 22.221
    expectClose(result[9], 22.221);
    // Index 10: EMA = 22.15*0.1818 + 22.221*(1-0.1818) = 22.2081...
    expectClose(result[10], 22.2081, 0.001);
  });

  it("returns empty for empty input", () => {
    expect(ema([], 3)).toEqual([]);
  });

  it("all NaN when period > data length", () => {
    const result = ema([1, 2], 5);
    result.forEach((v) => expect(v).toBeNaN());
  });
});

describe("rsi", () => {
  it("all up moves → RSI near 100", () => {
    const data = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const result = rsi(data, 14);
    const lastValid = result.filter((v) => !Number.isNaN(v));
    expect(lastValid.length).toBeGreaterThan(0);
    lastValid.forEach((v) => expect(v).toBeCloseTo(100, 0));
  });

  it("all down moves → RSI near 0", () => {
    const data = [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
    const result = rsi(data, 14);
    const lastValid = result.filter((v) => !Number.isNaN(v));
    expect(lastValid.length).toBeGreaterThan(0);
    lastValid.forEach((v) => expect(v).toBeCloseTo(0, 0));
  });

  it("known sequence produces values in 0-100 range", () => {
    const data = [
      44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28,
      46.28, 46.0, 46.03, 46.41, 46.22, 45.64,
    ];
    const result = rsi(data, 14);
    const valid = result.filter((v) => !Number.isNaN(v));
    valid.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });

  it("returns NaN for insufficient data", () => {
    const result = rsi([1, 2, 3], 14);
    result.forEach((v) => expect(v).toBeNaN());
  });
});

describe("macd", () => {
  it("uses default parameters 12/26/9", () => {
    // Generate 50 data points
    const data = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.5) * 10);
    const result = macd(data);
    expect(result.macd).toHaveLength(50);
    expect(result.signal).toHaveLength(50);
    expect(result.histogram).toHaveLength(50);
  });

  it("histogram = macd - signal", () => {
    const data = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 3);
    const result = macd(data);
    for (let i = 0; i < result.histogram.length; i++) {
      if (!Number.isNaN(result.macd[i]) && !Number.isNaN(result.signal[i])) {
        expectClose(result.histogram[i], result.macd[i] - result.signal[i], 0.0001);
      }
    }
  });

  it("custom parameters produce valid output", () => {
    const data = Array.from({ length: 40 }, (_, i) => 50 + i);
    const result = macd(data, 5, 10, 3);
    expect(result.macd).toHaveLength(40);
    // Valid MACD values should appear after slow period
    const validMacd = result.macd.filter((v) => !Number.isNaN(v));
    expect(validMacd.length).toBeGreaterThan(0);
  });

  it("returns all NaN for insufficient data", () => {
    const result = macd([1, 2, 3]);
    result.macd.forEach((v) => expect(v).toBeNaN());
  });
});

describe("bollingerBands", () => {
  it("middle band equals SMA", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const bb = bollingerBands(data, 20, 2);
    const smaResult = sma(data, 20);
    for (let i = 0; i < data.length; i++) {
      if (!Number.isNaN(smaResult[i])) {
        expectClose(bb.middle[i], smaResult[i]);
      }
    }
  });

  it("bands are symmetric around middle", () => {
    const data = [20, 21, 22, 19, 18, 20, 22, 24, 23, 21, 20, 19, 21, 23, 22, 20, 21, 22, 20, 19];
    const bb = bollingerBands(data, 20, 2);
    for (let i = 0; i < data.length; i++) {
      if (!Number.isNaN(bb.middle[i])) {
        const upperDiff = bb.upper[i] - bb.middle[i];
        const lowerDiff = bb.middle[i] - bb.lower[i];
        expectClose(upperDiff, lowerDiff);
      }
    }
  });

  it("upper > middle > lower for non-constant data", () => {
    const data = [20, 21, 22, 19, 18, 20, 22, 24, 23, 21, 20, 19, 21, 23, 22, 20, 21, 22, 20, 19];
    const bb = bollingerBands(data, 20, 2);
    for (let i = 0; i < data.length; i++) {
      if (!Number.isNaN(bb.middle[i])) {
        expect(bb.upper[i]).toBeGreaterThan(bb.middle[i]);
        expect(bb.middle[i]).toBeGreaterThan(bb.lower[i]);
      }
    }
  });

  it("returns NaN for insufficient data", () => {
    const bb = bollingerBands([1, 2], 20, 2);
    bb.upper.forEach((v) => expect(v).toBeNaN());
    bb.middle.forEach((v) => expect(v).toBeNaN());
    bb.lower.forEach((v) => expect(v).toBeNaN());
  });
});

describe("atr", () => {
  it("all same price → ATR = 0", () => {
    const price = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    const result = atr(price, price, price, 14);
    const valid = result.filter((v) => !Number.isNaN(v));
    valid.forEach((v) => expectClose(v, 0));
  });

  it("computes ATR for known OHLC data", () => {
    // Simple test: highs always 2 above close, lows always 2 below close
    const closes = [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62];
    const highs = closes.map((c) => c + 2);
    const lows = closes.map((c) => c - 2);
    const result = atr(highs, lows, closes, 14);
    // True range for each bar (after first): max(H-L, |H-prevC|, |L-prevC|)
    // H-L = 4, |H-prevC| = |c+2 - (c-1)| = 3, |L-prevC| = |c-2 - (c-1)| = 3
    // So TR = 4 for each bar
    const valid = result.filter((v) => !Number.isNaN(v));
    expect(valid.length).toBeGreaterThan(0);
    valid.forEach((v) => expectClose(v, 4, 0.01));
  });

  it("returns correct length and has NaN for warm-up period", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const highs = closes.map((c) => c + 1);
    const lows = closes.map((c) => c - 1);
    const result = atr(highs, lows, closes, 14);
    expect(result).toHaveLength(30);
    // First 14 values should be NaN (need 14 periods of TR + first bar has no prev close)
    for (let i = 0; i < 14; i++) {
      expect(result[i]).toBeNaN();
    }
  });
});
