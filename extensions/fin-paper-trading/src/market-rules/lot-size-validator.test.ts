import { describe, expect, it } from "vitest";
import { validateLotSize } from "./lot-size-validator.js";

describe("validateLotSize", () => {
  describe("crypto - no restrictions", () => {
    it("any buy quantity is valid", () => {
      expect(validateLotSize("crypto", "buy", 0.001).valid).toBe(true);
      expect(validateLotSize("crypto", "buy", 123.456).valid).toBe(true);
    });

    it("any sell quantity is valid", () => {
      expect(validateLotSize("crypto", "sell", 0.0001).valid).toBe(true);
    });
  });

  describe("us_equity - minLot 1, buy not enforced", () => {
    it("fractional buy is valid (not enforced)", () => {
      expect(validateLotSize("us_equity", "buy", 1.5).valid).toBe(true);
    });

    it("integer buy is valid", () => {
      expect(validateLotSize("us_equity", "buy", 10).valid).toBe(true);
    });

    it("fractional sell is valid (not enforced)", () => {
      expect(validateLotSize("us_equity", "sell", 1.5).valid).toBe(true);
    });
  });

  describe("cn_a_share - 100 lot, buy enforced, sell not", () => {
    it("buy 100 is valid", () => {
      expect(validateLotSize("cn_a_share", "buy", 100).valid).toBe(true);
    });

    it("buy 200 is valid", () => {
      expect(validateLotSize("cn_a_share", "buy", 200).valid).toBe(true);
    });

    it("buy 150 is rejected", () => {
      const result = validateLotSize("cn_a_share", "buy", 150);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("multiple of 100");
    });

    it("buy 50 is rejected", () => {
      const result = validateLotSize("cn_a_share", "buy", 50);
      expect(result.valid).toBe(false);
    });

    it("sell any quantity is valid (not enforced)", () => {
      expect(validateLotSize("cn_a_share", "sell", 50).valid).toBe(true);
      expect(validateLotSize("cn_a_share", "sell", 150).valid).toBe(true);
    });
  });

  describe("hk_equity - 100 lot, buy enforced", () => {
    it("buy 100 is valid", () => {
      expect(validateLotSize("hk_equity", "buy", 100).valid).toBe(true);
    });

    it("buy 300 is valid", () => {
      expect(validateLotSize("hk_equity", "buy", 300).valid).toBe(true);
    });

    it("buy 50 is rejected", () => {
      const result = validateLotSize("hk_equity", "buy", 50);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("multiple of 100");
    });

    it("sell any quantity is valid (not enforced)", () => {
      expect(validateLotSize("hk_equity", "sell", 50).valid).toBe(true);
    });
  });
});
