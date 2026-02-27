import { describe, it, expect } from "vitest";
import { applyConstantSlippage } from "./constant-slippage.js";

describe("applyConstantSlippage", () => {
  it("buy → price increases by slippage", () => {
    const result = applyConstantSlippage(100, "buy", 10);
    // 10 bps = 0.10%
    expect(result.fillPrice).toBeCloseTo(100.1, 4);
    expect(result.slippageCost).toBeCloseTo(0.1, 4);
  });

  it("sell → price decreases by slippage", () => {
    const result = applyConstantSlippage(100, "sell", 10);
    expect(result.fillPrice).toBeCloseTo(99.9, 4);
    expect(result.slippageCost).toBeCloseTo(0.1, 4);
  });

  it("zero slippage → fillPrice equals price", () => {
    const result = applyConstantSlippage(50000, "buy", 0);
    expect(result.fillPrice).toBe(50000);
    expect(result.slippageCost).toBe(0);
  });

  it("large slippage applies correctly", () => {
    // 100 bps = 1%
    const result = applyConstantSlippage(200, "buy", 100);
    expect(result.fillPrice).toBeCloseTo(202, 4);
    expect(result.slippageCost).toBeCloseTo(2, 4);
  });

  it("slippage cost is always positive regardless of side", () => {
    const buyResult = applyConstantSlippage(100, "buy", 5);
    const sellResult = applyConstantSlippage(100, "sell", 5);
    expect(buyResult.slippageCost).toBeGreaterThan(0);
    expect(sellResult.slippageCost).toBeGreaterThan(0);
  });
});
