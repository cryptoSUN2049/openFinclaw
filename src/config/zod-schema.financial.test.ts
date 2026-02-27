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

  // ── Schema boundary values ──

  describe("Schema boundary values", () => {
    describe("futuOpenDPort boundaries", () => {
      it("port 1 is valid", () => {
        const result = FinancialSchema.parse({ paperTrading: { hk: { futuOpenDPort: 1 } } });
        expect(result!.paperTrading!.hk!.futuOpenDPort).toBe(1);
      });

      it("port 65535 is valid", () => {
        const result = FinancialSchema.parse({ paperTrading: { hk: { futuOpenDPort: 65535 } } });
        expect(result!.paperTrading!.hk!.futuOpenDPort).toBe(65535);
      });

      it("port 0 rejects", () => {
        expect(() =>
          FinancialSchema.parse({ paperTrading: { hk: { futuOpenDPort: 0 } } }),
        ).toThrow();
      });

      it("port 65536 rejects", () => {
        expect(() =>
          FinancialSchema.parse({ paperTrading: { hk: { futuOpenDPort: 65536 } } }),
        ).toThrow();
      });
    });

    describe("extreme percentage combinations", () => {
      it("cashReservePct=0 + maxTotalExposurePct=100 → valid (all-in)", () => {
        const result = FinancialSchema.parse({
          fund: { cashReservePct: 0, maxTotalExposurePct: 100, maxSingleStrategyPct: 50 },
        });
        expect(result!.fund!.cashReservePct).toBe(0);
        expect(result!.fund!.maxTotalExposurePct).toBe(100);
      });

      it("cashReservePct=100 + maxTotalExposurePct=0 → valid (all-cash)", () => {
        const result = FinancialSchema.parse({
          fund: { cashReservePct: 100, maxTotalExposurePct: 0, maxSingleStrategyPct: 0 },
        });
        expect(result!.fund!.cashReservePct).toBe(100);
        expect(result!.fund!.maxTotalExposurePct).toBe(0);
      });
    });

    describe("rebalanceFrequency enum", () => {
      it("accepts daily", () => {
        const result = FinancialSchema.parse({ fund: { rebalanceFrequency: "daily" } });
        expect(result!.fund!.rebalanceFrequency).toBe("daily");
      });

      it("accepts weekly", () => {
        const result = FinancialSchema.parse({ fund: { rebalanceFrequency: "weekly" } });
        expect(result!.fund!.rebalanceFrequency).toBe("weekly");
      });

      it("accepts monthly", () => {
        const result = FinancialSchema.parse({ fund: { rebalanceFrequency: "monthly" } });
        expect(result!.fund!.rebalanceFrequency).toBe("monthly");
      });

      it("rejects invalid enum value", () => {
        expect(() => FinancialSchema.parse({ fund: { rebalanceFrequency: "hourly" } })).toThrow();
      });
    });

    describe("walkForwardInSamplePct boundaries", () => {
      it("0.5 is valid (minimum)", () => {
        const result = FinancialSchema.parse({ backtest: { walkForwardInSamplePct: 0.5 } });
        expect(result!.backtest!.walkForwardInSamplePct).toBe(0.5);
      });

      it("0.9 is valid (maximum)", () => {
        const result = FinancialSchema.parse({ backtest: { walkForwardInSamplePct: 0.9 } });
        expect(result!.backtest!.walkForwardInSamplePct).toBe(0.9);
      });

      it("0.49 rejects (below minimum)", () => {
        expect(() =>
          FinancialSchema.parse({ backtest: { walkForwardInSamplePct: 0.49 } }),
        ).toThrow();
      });

      it("0.91 rejects (above maximum)", () => {
        expect(() =>
          FinancialSchema.parse({ backtest: { walkForwardInSamplePct: 0.91 } }),
        ).toThrow();
      });
    });

    describe("cullPercentage boundaries", () => {
      it("0 is valid", () => {
        const result = FinancialSchema.parse({ evolution: { cullPercentage: 0 } });
        expect(result!.evolution!.cullPercentage).toBe(0);
      });

      it("50 is valid (maximum)", () => {
        const result = FinancialSchema.parse({ evolution: { cullPercentage: 50 } });
        expect(result!.evolution!.cullPercentage).toBe(50);
      });

      it("51 rejects (above maximum)", () => {
        expect(() => FinancialSchema.parse({ evolution: { cullPercentage: 51 } })).toThrow();
      });
    });

    describe("maxPositionPct boundaries", () => {
      it("0 is valid", () => {
        const result = FinancialSchema.parse({ trading: { maxPositionPct: 0 } });
        expect(result!.trading!.maxPositionPct).toBe(0);
      });

      it("100 is valid", () => {
        const result = FinancialSchema.parse({ trading: { maxPositionPct: 100 } });
        expect(result!.trading!.maxPositionPct).toBe(100);
      });

      it("101 rejects", () => {
        expect(() => FinancialSchema.parse({ trading: { maxPositionPct: 101 } })).toThrow();
      });
    });

    describe("all 4 exchanges accepted", () => {
      for (const exchange of ["hyperliquid", "binance", "okx", "bybit"] as const) {
        it(`accepts ${exchange}`, () => {
          const result = FinancialSchema.parse({
            exchanges: { [`${exchange}-main`]: { exchange } },
          });
          expect(result!.exchanges![`${exchange}-main`].exchange).toBe(exchange);
        });
      }
    });

    it("full valid config with ALL sections → parses", () => {
      const fullConfig = {
        trading: { enabled: true, maxAutoTradeUsd: 500, maxLeverage: 2 },
        fund: {
          cashReservePct: 20,
          maxSingleStrategyPct: 25,
          maxTotalExposurePct: 80,
          rebalanceFrequency: "daily" as const,
          totalCapital: 200000,
        },
        backtest: {
          defaultCommission: 0.002,
          defaultSlippage: 0.001,
          walkForwardWindows: 3,
          walkForwardInSamplePct: 0.6,
        },
        evolution: {
          evaluationInterval: "weekly" as const,
          cullPercentage: 30,
          mutationRate: 0.5,
          minStrategies: 5,
        },
        paperTrading: {
          defaultCapital: 50000,
          slippageModel: "constant" as const,
          constantSlippageBps: 10,
          us: { adapter: "alpaca" as const },
          hk: { adapter: "futu" as const, futuOpenDHost: "192.168.1.100", futuOpenDPort: 22222 },
          cn: {
            adapter: "openctp" as const,
            dataSource: "tushare" as const,
            tushareToken: "tok123",
          },
        },
        equity: { alpaca: { apiKeyId: "ak", apiSecretKey: "sk", paper: false } },
        commodity: { quandlApiKey: "qk" },
        exchanges: {
          "binance-test": {
            exchange: "binance" as const,
            apiKey: "key",
            secret: "sec",
            testnet: true,
          },
        },
      };

      const result = FinancialSchema.parse(fullConfig);
      expect(result).toBeDefined();
      expect(result!.trading!.enabled).toBe(true);
      expect(result!.fund!.totalCapital).toBe(200000);
      expect(result!.paperTrading!.hk!.futuOpenDPort).toBe(22222);
    });

    it("backward compatibility: undefined financial → undefined", () => {
      const result = FinancialSchema.parse(undefined);
      expect(result).toBeUndefined();
    });

    it("backward compatibility: empty object → empty object", () => {
      const result = FinancialSchema.parse({});
      expect(result).toEqual({});
    });
  });
});
