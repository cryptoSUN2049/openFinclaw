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

  describe("fund cross-field validation", () => {
    it("rejects cashReservePct + maxTotalExposurePct > 100", () => {
      expect(() =>
        FinancialSchema.parse({ fund: { cashReservePct: 80, maxTotalExposurePct: 30 } }),
      ).toThrow("exceeds 100%");
    });

    it("rejects maxSingleStrategyPct > maxTotalExposurePct", () => {
      expect(() =>
        FinancialSchema.parse({
          fund: { maxSingleStrategyPct: 50, maxTotalExposurePct: 40, cashReservePct: 20 },
        }),
      ).toThrow("exceeds maxTotalExposurePct");
    });

    it("accepts valid fund percentages", () => {
      const result = FinancialSchema.parse({
        fund: { cashReservePct: 30, maxTotalExposurePct: 70, maxSingleStrategyPct: 30 },
      });
      expect(result!.fund!.cashReservePct).toBe(30);
      expect(result!.fund!.maxTotalExposurePct).toBe(70);
    });
  });

  describe("equity config", () => {
    it("applies alpaca paper default", () => {
      const result = FinancialSchema.parse({ equity: { alpaca: {} } });
      expect(result!.equity!.alpaca!.paper).toBe(true);
    });

    it("allows explicit alpaca config", () => {
      const result = FinancialSchema.parse({
        equity: { alpaca: { apiKeyId: "key", apiSecretKey: "secret", paper: false } },
      });
      expect(result!.equity!.alpaca!.paper).toBe(false);
    });
  });

  describe("commodity config", () => {
    it("parses valid commodity config", () => {
      const result = FinancialSchema.parse({ commodity: { quandlApiKey: "test-key" } });
      expect(result!.commodity!.quandlApiKey).toBe("test-key");
    });

    it("parses empty commodity config", () => {
      const result = FinancialSchema.parse({ commodity: {} });
      expect(result!.commodity).toEqual({});
    });
  });

  describe("paperTrading adapter configs", () => {
    it("applies US adapter default", () => {
      const result = FinancialSchema.parse({ paperTrading: { us: {} } });
      expect(result!.paperTrading!.us!.adapter).toBe("internal");
    });

    it("applies HK adapter defaults", () => {
      const result = FinancialSchema.parse({ paperTrading: { hk: {} } });
      expect(result!.paperTrading!.hk!.adapter).toBe("internal");
      expect(result!.paperTrading!.hk!.futuOpenDHost).toBe("127.0.0.1");
      expect(result!.paperTrading!.hk!.futuOpenDPort).toBe(11111);
    });

    it("rejects invalid futuOpenDPort (out of range)", () => {
      expect(() =>
        FinancialSchema.parse({ paperTrading: { hk: { futuOpenDPort: 70000 } } }),
      ).toThrow();
    });

    it("rejects negative futuOpenDPort", () => {
      expect(() =>
        FinancialSchema.parse({ paperTrading: { hk: { futuOpenDPort: -1 } } }),
      ).toThrow();
    });

    it("applies CN adapter defaults", () => {
      const result = FinancialSchema.parse({ paperTrading: { cn: {} } });
      expect(result!.paperTrading!.cn!.adapter).toBe("internal");
      expect(result!.paperTrading!.cn!.dataSource).toBe("akshare");
    });

    it("allows explicit CN tushare config", () => {
      const result = FinancialSchema.parse({
        paperTrading: { cn: { adapter: "openctp", dataSource: "tushare", tushareToken: "tok" } },
      });
      expect(result!.paperTrading!.cn!.adapter).toBe("openctp");
      expect(result!.paperTrading!.cn!.dataSource).toBe("tushare");
    });

    it("rejects invalid adapter value", () => {
      expect(() =>
        FinancialSchema.parse({ paperTrading: { us: { adapter: "invalid" } } }),
      ).toThrow();
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
