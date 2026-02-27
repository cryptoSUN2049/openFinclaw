import { describe, it, expect } from "vitest";
import { calculateCommission } from "./commission-model.js";

describe("calculateCommission", () => {
  it("crypto taker default: 0.1%", () => {
    const result = calculateCommission(10000, "crypto", { makerTaker: "taker" });
    expect(result.commission).toBeCloseTo(10, 4);
    expect(result.effectiveRate).toBeCloseTo(0.001, 6);
  });

  it("crypto maker default: 0.08%", () => {
    const result = calculateCommission(10000, "crypto", { makerTaker: "maker" });
    expect(result.commission).toBeCloseTo(8, 4);
    expect(result.effectiveRate).toBeCloseTo(0.0008, 6);
  });

  it("crypto defaults to taker when no makerTaker specified", () => {
    const result = calculateCommission(10000, "crypto");
    expect(result.commission).toBeCloseTo(10, 4);
  });

  it("equity commission rate", () => {
    const result = calculateCommission(50000, "equity");
    expect(result.commission).toBeGreaterThan(0);
    expect(result.effectiveRate).toBeGreaterThan(0);
  });

  it("commodity commission rate", () => {
    const result = calculateCommission(25000, "commodity");
    expect(result.commission).toBeGreaterThan(0);
    expect(result.effectiveRate).toBeGreaterThan(0);
  });

  it("large order → proportional commission", () => {
    const small = calculateCommission(1000, "crypto");
    const large = calculateCommission(100000, "crypto");
    // Commission should scale linearly with notional
    expect(large.commission / small.commission).toBeCloseTo(100, 1);
    // Effective rate stays the same
    expect(large.effectiveRate).toBeCloseTo(small.effectiveRate, 6);
  });

  it("zero notional → zero commission", () => {
    const result = calculateCommission(0, "crypto");
    expect(result.commission).toBe(0);
    expect(result.effectiveRate).toBe(0);
  });
});
