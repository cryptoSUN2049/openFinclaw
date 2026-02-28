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

  it("large order -> proportional commission", () => {
    const small = calculateCommission(1000, "crypto");
    const large = calculateCommission(100000, "crypto");
    expect(large.commission / small.commission).toBeCloseTo(100, 1);
    expect(large.effectiveRate).toBeCloseTo(small.effectiveRate, 6);
  });

  it("zero notional -> zero commission", () => {
    const result = calculateCommission(0, "crypto");
    expect(result.commission).toBe(0);
    expect(result.effectiveRate).toBe(0);
  });

  // Extended market types
  it("us_equity commission rate", () => {
    const result = calculateCommission(100000, "us_equity");
    expect(result.commission).toBeCloseTo(50, 2); // 0.05%
  });

  it("hk_equity buy: no stamp duty", () => {
    const result = calculateCommission(100000, "hk_equity", { side: "buy" });
    expect(result.commission).toBeCloseTo(50, 2); // 0.05% commission only
  });

  it("hk_equity sell: includes stamp duty", () => {
    const result = calculateCommission(100000, "hk_equity", { side: "sell" });
    // 0.05% commission + 0.1% stamp duty = 0.15%
    expect(result.commission).toBeCloseTo(150, 2);
  });

  it("cn_a_share buy: no stamp duty", () => {
    const result = calculateCommission(100000, "cn_a_share", { side: "buy" });
    expect(result.commission).toBeCloseTo(30, 2); // 0.03%
  });

  it("cn_a_share sell: includes stamp duty", () => {
    const result = calculateCommission(100000, "cn_a_share", { side: "sell" });
    // 0.03% commission + 0.1% stamp duty = 0.13%
    expect(result.commission).toBeCloseTo(130, 2);
  });

  it("unknown market falls back to equity rates", () => {
    const result = calculateCommission(100000, "unknown_market");
    expect(result.commission).toBeCloseTo(50, 2); // equity rate
  });
});
