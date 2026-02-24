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
  })
  .strict();

const TradingSchema = z
  .object({
    enabled: z.boolean().default(false).optional(),
    maxAutoTradeUsd: z.number().nonnegative().default(100).optional(),
    confirmThresholdUsd: z.number().nonnegative().default(500).optional(),
    maxDailyLossUsd: z.number().nonnegative().default(1000).optional(),
    maxPositionPct: z.number().min(0).max(100).default(25).optional(),
    maxLeverage: z.number().positive().default(1).optional(),
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

export const FinancialSchema = z
  .object({
    exchanges: z.record(z.string(), ExchangeAccountSchema).optional(),
    trading: TradingSchema.optional(),
    expertSdk: ExpertSdkSchema.optional(),
    infoFeedSdk: InfoFeedSdkSchema.optional(),
  })
  .strict()
  .optional();
