import { describe, expect, it } from "vitest";
import { FinancialSchema } from "./zod-schema.financial.js";

describe("FinancialSchema", () => {
  it("parses empty object", () => {
    const result = FinancialSchema.parse({});
    expect(result).toEqual({});
  });

  it("parses undefined as undefined", () => {
    const result = FinancialSchema.parse(undefined);
    expect(result).toBeUndefined();
  });

  describe("trading defaults", () => {
    it("applies defaults when trading is empty object", () => {
      const result = FinancialSchema.parse({ trading: {} });
      expect(result!.trading!.enabled).toBe(false);
      expect(result!.trading!.maxAutoTradeUsd).toBe(100);
      expect(result!.trading!.confirmThresholdUsd).toBe(500);
      expect(result!.trading!.maxDailyLossUsd).toBe(1000);
      expect(result!.trading!.maxPositionPct).toBe(25);
      expect(result!.trading!.maxLeverage).toBe(1);
    });

    it("preserves explicit values", () => {
      const result = FinancialSchema.parse({
        trading: { enabled: true, maxAutoTradeUsd: 500, maxLeverage: 3 },
      });
      expect(result!.trading!.enabled).toBe(true);
      expect(result!.trading!.maxAutoTradeUsd).toBe(500);
      expect(result!.trading!.maxLeverage).toBe(3);
    });
  });

  describe("fund defaults", () => {
    it("applies defaults when fund is empty object", () => {
      const result = FinancialSchema.parse({ fund: {} });
      expect(result!.fund!.cashReservePct).toBe(30);
      expect(result!.fund!.maxSingleStrategyPct).toBe(30);
      expect(result!.fund!.maxTotalExposurePct).toBe(70);
      expect(result!.fund!.rebalanceFrequency).toBe("weekly");
    });
  });

  describe("backtest defaults", () => {
    it("applies defaults when backtest is empty object", () => {
      const result = FinancialSchema.parse({ backtest: {} });
      expect(result!.backtest!.defaultCommission).toBe(0.001);
      expect(result!.backtest!.defaultSlippage).toBe(0.0005);
      expect(result!.backtest!.walkForwardWindows).toBe(5);
      expect(result!.backtest!.walkForwardInSamplePct).toBe(0.7);
    });
  });

  describe("evolution defaults", () => {
    it("applies defaults when evolution is empty object", () => {
      const result = FinancialSchema.parse({ evolution: {} });
      expect(result!.evolution!.evaluationInterval).toBe("monthly");
      expect(result!.evolution!.cullPercentage).toBe(20);
      expect(result!.evolution!.mutationRate).toBe(0.3);
      expect(result!.evolution!.minStrategies).toBe(3);
    });
  });

  describe("paperTrading defaults", () => {
    it("applies defaults when paperTrading is empty object", () => {
      const result = FinancialSchema.parse({ paperTrading: {} });
      expect(result!.paperTrading!.defaultCapital).toBe(100000);
      expect(result!.paperTrading!.slippageModel).toBe("constant");
      expect(result!.paperTrading!.constantSlippageBps).toBe(5);
      expect(result!.paperTrading!.signalCheckIntervalSec).toBe(10);
      expect(result!.paperTrading!.decayCheckIntervalSec).toBe(300);
      expect(result!.paperTrading!.minDaysBeforePromotion).toBe(30);
      expect(result!.paperTrading!.minTradesBeforePromotion).toBe(30);
    });
  });

  describe("validation rejections", () => {
    it("rejects negative capital in fund", () => {
      expect(() => FinancialSchema.parse({ fund: { totalCapital: -100 } })).toThrow();
    });

    it("rejects invalid exchange id", () => {
      expect(() =>
        FinancialSchema.parse({
          exchanges: { test: { exchange: "invalid_exchange" } },
        }),
      ).toThrow();
    });

    it("rejects walkForwardWindows below 2", () => {
      expect(() => FinancialSchema.parse({ backtest: { walkForwardWindows: 1 } })).toThrow();
    });

    it("rejects walkForwardWindows above 10", () => {
      expect(() => FinancialSchema.parse({ backtest: { walkForwardWindows: 11 } })).toThrow();
    });

    it("rejects mutation rate above 1", () => {
      expect(() => FinancialSchema.parse({ evolution: { mutationRate: 1.5 } })).toThrow();
    });

    it("rejects unknown fields (strict mode)", () => {
      expect(() => FinancialSchema.parse({ unknownField: "value" })).toThrow();
    });
  });

  describe("exchange config", () => {
    it("parses valid exchange config", () => {
      const result = FinancialSchema.parse({
        exchanges: {
          "binance-main": {
            exchange: "binance",
            apiKey: "key",
            secret: "secret",
            testnet: true,
            defaultType: "spot",
          },
        },
      });
      const ex = result!.exchanges!["binance-main"];
      expect(ex.exchange).toBe("binance");
      expect(ex.testnet).toBe(true);
    });
  });
});
