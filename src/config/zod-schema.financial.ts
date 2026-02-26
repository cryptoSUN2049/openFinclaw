import { z } from "zod";
import { sensitive } from "./zod-schema.sensitive.js";

const ExchangeIdSchema = z.union([
  z.literal("hyperliquid"),
  z.literal("binance"),
  z.literal("okx"),
  z.literal("bybit"),
]);

const ExchangeAccountSchema = z
  .object({
    exchange: ExchangeIdSchema,
    apiKey: z.string().optional().register(sensitive),
    secret: z.string().optional().register(sensitive),
    passphrase: z.string().optional().register(sensitive),
    testnet: z.boolean().optional(),
    subaccount: z.string().optional(),
    defaultType: z.union([z.literal("spot"), z.literal("swap"), z.literal("future")]).optional(),
  })
  .strict();

const TradingSchema = z
  .object({
    enabled: z.boolean().optional().default(false),
    maxAutoTradeUsd: z.number().nonnegative().optional().default(100),
    confirmThresholdUsd: z.number().nonnegative().optional().default(500),
    maxDailyLossUsd: z.number().nonnegative().optional().default(1000),
    maxPositionPct: z.number().min(0).max(100).optional().default(25),
    maxLeverage: z.number().positive().optional().default(1),
    allowedPairs: z.array(z.string()).optional(),
    blockedPairs: z.array(z.string()).optional(),
  })
  .strict();

const ExpertSdkSchema = z
  .object({
    apiKey: z.string().optional().register(sensitive),
    endpoint: z.string().url().optional(),
    tier: z.union([z.literal("basic"), z.literal("pro"), z.literal("enterprise")]).optional(),
  })
  .strict();

const InfoFeedSdkSchema = z
  .object({
    apiKey: z.string().optional().register(sensitive),
    endpoint: z.string().url().optional(),
  })
  .strict();

const EquitySchema = z
  .object({
    alpaca: z
      .object({
        apiKeyId: z.string().optional().register(sensitive),
        apiSecretKey: z.string().optional().register(sensitive),
        paper: z.boolean().optional().default(true),
      })
      .strict()
      .optional(),
  })
  .strict();

const CommoditySchema = z
  .object({
    quandlApiKey: z.string().optional().register(sensitive),
  })
  .strict();

const FundSchema = z
  .object({
    totalCapital: z.number().nonnegative().optional(),
    cashReservePct: z.number().min(0).max(100).optional().default(30),
    maxSingleStrategyPct: z.number().min(0).max(100).optional().default(30),
    maxTotalExposurePct: z.number().min(0).max(100).optional().default(70),
    rebalanceFrequency: z
      .union([z.literal("daily"), z.literal("weekly"), z.literal("monthly")])
      .optional()
      .default("weekly"),
  })
  .strict();

const BacktestSchema = z
  .object({
    defaultCommission: z.number().nonnegative().optional().default(0.001),
    defaultSlippage: z.number().nonnegative().optional().default(0.0005),
    walkForwardWindows: z.number().int().min(2).max(10).optional().default(5),
    walkForwardInSamplePct: z.number().min(0.5).max(0.9).optional().default(0.7),
  })
  .strict();

const EvolutionSchema = z
  .object({
    evaluationInterval: z
      .union([z.literal("weekly"), z.literal("monthly")])
      .optional()
      .default("monthly"),
    cullPercentage: z.number().min(0).max(50).optional().default(20),
    mutationRate: z.number().min(0).max(1).optional().default(0.3),
    minStrategies: z.number().int().min(1).optional().default(3),
  })
  .strict();

const PaperTradingSchema = z
  .object({
    defaultCapital: z.number().nonnegative().optional().default(100000),
    slippageModel: z
      .union([z.literal("constant"), z.literal("volume-share")])
      .optional()
      .default("constant"),
    constantSlippageBps: z.number().nonnegative().optional().default(5),
    signalCheckIntervalSec: z.number().int().min(1).optional().default(10),
    decayCheckIntervalSec: z.number().int().min(10).optional().default(300),
    minDaysBeforePromotion: z.number().int().min(1).optional().default(30),
    minTradesBeforePromotion: z.number().int().min(1).optional().default(30),
    us: z
      .object({
        adapter: z
          .union([z.literal("alpaca"), z.literal("internal")])
          .optional()
          .default("internal"),
      })
      .strict()
      .optional(),
    hk: z
      .object({
        adapter: z
          .union([z.literal("futu"), z.literal("internal")])
          .optional()
          .default("internal"),
        futuOpenDHost: z.string().optional().default("127.0.0.1"),
        futuOpenDPort: z.number().int().optional().default(11111),
      })
      .strict()
      .optional(),
    cn: z
      .object({
        adapter: z
          .union([z.literal("openctp"), z.literal("internal")])
          .optional()
          .default("internal"),
        dataSource: z
          .union([z.literal("tushare"), z.literal("akshare")])
          .optional()
          .default("akshare"),
        tushareToken: z.string().optional().register(sensitive),
      })
      .strict()
      .optional(),
  })
  .strict();

export const FinancialSchema = z
  .object({
    exchanges: z.record(z.string(), ExchangeAccountSchema).optional(),
    trading: TradingSchema.optional(),
    expertSdk: ExpertSdkSchema.optional(),
    infoFeedSdk: InfoFeedSdkSchema.optional(),
    equity: EquitySchema.optional(),
    commodity: CommoditySchema.optional(),
    fund: FundSchema.optional(),
    backtest: BacktestSchema.optional(),
    evolution: EvolutionSchema.optional(),
    paperTrading: PaperTradingSchema.optional(),
  })
  .strict()
  .optional();
