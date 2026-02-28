import { describe, expect, it } from "vitest";
import { checkPriceLimit } from "./price-limit-validator.js";

describe("checkPriceLimit", () => {
  describe("cn_a_share mainboard (+-10%)", () => {
    it("price within limit is valid", () => {
      const result = checkPriceLimit("cn_a_share", "600519.SH", 105, 100);
      expect(result.valid).toBe(true);
      expect(result.upperLimit).toBeCloseTo(110);
      expect(result.lowerLimit).toBeCloseTo(90);
    });

    it("price at upper limit boundary is valid", () => {
      const result = checkPriceLimit("cn_a_share", "600519.SH", 110, 100);
      expect(result.valid).toBe(true);
    });

    it("price exceeding upper limit is rejected", () => {
      const result = checkPriceLimit("cn_a_share", "600519.SH", 111, 100);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("10%");
    });

    it("price below lower limit is rejected", () => {
      const result = checkPriceLimit("cn_a_share", "600519.SH", 89, 100);
      expect(result.valid).toBe(false);
    });
  });

  describe("cn_a_share ChiNext/STAR (+-20%)", () => {
    it("300xxx.SZ gets 20% limit", () => {
      const result = checkPriceLimit("cn_a_share", "300001.SZ", 119, 100);
      expect(result.valid).toBe(true);
      expect(result.upperLimit).toBeCloseTo(120);
    });

    it("301xxx.SZ gets 20% limit", () => {
      const result = checkPriceLimit("cn_a_share", "301001.SZ", 121, 100);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("20%");
    });

    it("688xxx.SH gets 20% limit", () => {
      const result = checkPriceLimit("cn_a_share", "688001.SH", 115, 100);
      expect(result.valid).toBe(true);
    });

    it("689xxx.SH gets 20% limit", () => {
      const result = checkPriceLimit("cn_a_share", "689001.SH", 121, 100);
      expect(result.valid).toBe(false);
    });
  });

  describe("cn_a_share ST (+-5%)", () => {
    it("ST stock within 5% limit is valid", () => {
      const result = checkPriceLimit("cn_a_share", "000001.SZ", 104, 100, { isSt: true });
      expect(result.valid).toBe(true);
      expect(result.upperLimit).toBeCloseTo(105);
      expect(result.lowerLimit).toBeCloseTo(95);
    });

    it("ST stock exceeding 5% limit is rejected", () => {
      const result = checkPriceLimit("cn_a_share", "000001.SZ", 106, 100, { isSt: true });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("5%");
    });
  });

  describe("markets without price limits", () => {
    it("crypto has no price limit", () => {
      const result = checkPriceLimit("crypto", "BTC/USDT", 999999, 50000);
      expect(result.valid).toBe(true);
    });

    it("us_equity has no price limit", () => {
      const result = checkPriceLimit("us_equity", "AAPL", 999, 100);
      expect(result.valid).toBe(true);
    });

    it("hk_equity has no price limit", () => {
      const result = checkPriceLimit("hk_equity", "0700.HK", 999, 100);
      expect(result.valid).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("no prevClose skips check", () => {
      const result = checkPriceLimit("cn_a_share", "600519.SH", 999);
      expect(result.valid).toBe(true);
    });

    it("zero prevClose skips check", () => {
      const result = checkPriceLimit("cn_a_share", "600519.SH", 999, 0);
      expect(result.valid).toBe(true);
    });

    it("negative prevClose skips check", () => {
      const result = checkPriceLimit("cn_a_share", "600519.SH", 999, -10);
      expect(result.valid).toBe(true);
    });
  });
});
