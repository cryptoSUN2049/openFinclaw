import { describe, expect, it } from "vitest";
import { RegimeDetector } from "./regime-detector.js";
import type { OHLCV } from "./types.js";

const detector = new RegimeDetector();

/** Generate N bars of consistently rising data. */
function risingBars(n: number, startClose = 100, stepPct = 0.5): OHLCV[] {
  const bars: OHLCV[] = [];
  let close = startClose;
  for (let i = 0; i < n; i++) {
    const open = close;
    close = open * (1 + stepPct / 100);
    bars.push({
      timestamp: i * 3600000,
      open,
      high: close * 1.002,
      low: open * 0.998,
      close,
      volume: 1000,
    });
  }
  return bars;
}

/**
 * Generate N bars of falling data. Starts flat/rising for the first part, then
 * transitions to a steady decline. Keeps total drawdown under 30% so crisis
 * doesn't trigger, but ensures SMA(50) < SMA(200) and close < SMA(50).
 */
function fallingBars(n: number): OHLCV[] {
  const bars: OHLCV[] = [];
  // Phase 1 (first 150 bars): slight rise to establish a higher SMA(200)
  let close = 200;
  for (let i = 0; i < 150; i++) {
    close = 200 + (i / 150) * 10; // Rise gently to ~210
    bars.push({
      timestamp: i * 3600000,
      open: close + 0.1,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000,
    });
  }
  // Phase 2 (remaining bars): steady decline, keeping drawdown < 30%
  const peak = close;
  for (let i = 150; i < n; i++) {
    const progress = (i - 150) / (n - 150);
    close = peak * (1 - 0.2 * progress); // Drop to ~80% of peak = 20% drawdown
    bars.push({
      timestamp: i * 3600000,
      open: close + 0.2,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000,
    });
  }
  return bars;
}

/** Generate flat/sideways bars oscillating within a tight range. */
function sidewaysBars(n: number, center = 100): OHLCV[] {
  const bars: OHLCV[] = [];
  for (let i = 0; i < n; i++) {
    // Oscillate +/- 0.1% from center
    const delta = (i % 2 === 0 ? 1 : -1) * center * 0.001;
    const close = center + delta;
    bars.push({
      timestamp: i * 3600000,
      open: center - delta,
      high: center + Math.abs(delta) * 1.5,
      low: center - Math.abs(delta) * 1.5,
      close,
      volume: 1000,
    });
  }
  return bars;
}

/** Generate data with a severe drawdown from peak. */
function crisisBars(n: number): OHLCV[] {
  const bars: OHLCV[] = [];
  // First half: rise to a peak
  const half = Math.floor(n / 2);
  let close = 100;
  for (let i = 0; i < half; i++) {
    close = 100 + (i / half) * 100; // Rise to 200
    bars.push({
      timestamp: i * 3600000,
      open: close - 0.5,
      high: close + 0.5,
      low: close - 1,
      close,
      volume: 1000,
    });
  }
  // Second half: crash from 200 to 120 (40% drawdown from peak ~200)
  const peak = close;
  for (let i = half; i < n; i++) {
    const progress = (i - half) / (n - half);
    close = peak * (1 - 0.42 * progress); // Drop to ~58% of peak = 42% drawdown
    bars.push({
      timestamp: i * 3600000,
      open: close + 1,
      high: close + 2,
      low: close - 1,
      close,
      volume: 2000,
    });
  }
  return bars;
}

/** Generate highly volatile bars with large ATR relative to price. */
function volatileBars(n: number): OHLCV[] {
  const bars: OHLCV[] = [];
  let close = 100;
  for (let i = 0; i < n; i++) {
    // Random direction but large swings (>5% range per bar)
    const direction = i % 3 === 0 ? 1 : i % 3 === 1 ? -1 : 0.5;
    const swing = close * 0.06; // 6% swing
    const open = close;
    const high = open + swing;
    const low = open - swing;
    close = open + direction * swing * 0.3;
    bars.push({
      timestamp: i * 3600000,
      open,
      high,
      low,
      close,
      volume: 1000,
    });
  }
  return bars;
}

describe("RegimeDetector", () => {
  it("detects bull regime from consistently rising data", () => {
    const bars = risingBars(300);
    expect(detector.detect(bars)).toBe("bull");
  });

  it("detects bear regime from consistently falling data", () => {
    const bars = fallingBars(300);
    expect(detector.detect(bars)).toBe("bear");
  });

  it("detects crisis from data with >30% drawdown", () => {
    const bars = crisisBars(300);
    expect(detector.detect(bars)).toBe("crisis");
  });

  it("detects volatile regime from high ATR% data", () => {
    const bars = volatileBars(300);
    expect(detector.detect(bars)).toBe("volatile");
  });

  it("detects sideways from flat data", () => {
    const bars = sidewaysBars(300);
    expect(detector.detect(bars)).toBe("sideways");
  });

  it("returns sideways for fewer than 200 bars", () => {
    const bars = risingBars(50);
    expect(detector.detect(bars)).toBe("sideways");
  });

  it("returns sideways for empty input", () => {
    expect(detector.detect([])).toBe("sideways");
  });

  it("handles exactly 200 bars (minimum threshold)", () => {
    const bars = risingBars(200);
    const result = detector.detect(bars);
    // With exactly 200 bars, SMA(200) has only 1 data point — should still produce a valid result
    expect(["bull", "bear", "sideways", "volatile", "crisis"]).toContain(result);
  });
});
