/** Supported centralized exchanges. */
export type ExchangeId = "hyperliquid" | "binance" | "okx" | "bybit";

/** Credentials and connection settings for a single exchange account. */
export type ExchangeAccountConfig = {
  /** Exchange identifier. */
  exchange: ExchangeId;
  /** API key for the exchange account. */
  apiKey?: string;
  /** API secret for the exchange account. */
  secret?: string;
  /** Passphrase (required by some exchanges, e.g. OKX). */
  passphrase?: string;
  /** Connect to the exchange's testnet instead of production. Default: false. */
  testnet?: boolean;
  /** Sub-account name (exchange-specific). */
  subaccount?: string;
  /** Default market type (spot, swap, future). Default: "spot". */
  defaultType?: "spot" | "swap" | "future";
};

/** Trading risk limits and behavioral controls. */
export type TradingConfig = {
  /** Master switch for automated trading. Default: false. */
  enabled?: boolean;
  /** Maximum USD notional for a single auto-executed trade. Default: 100. */
  maxAutoTradeUsd?: number;
  /** Trades above this USD notional require explicit user confirmation. Default: 500. */
  confirmThresholdUsd?: number;
  /** Maximum cumulative realized loss (USD) before auto-trading halts for the day. Default: 1000. */
  maxDailyLossUsd?: number;
  /** Maximum position size as a percentage of account equity (0-100). Default: 25. */
  maxPositionPct?: number;
  /** Maximum leverage the agent may use. Default: 1 (no leverage). */
  maxLeverage?: number;
  /** If set, only these trading pairs are allowed. */
  allowedPairs?: string[];
  /** If set, these trading pairs are never traded. */
  blockedPairs?: string[];
};

/** Expert SDK connection settings. */
export type ExpertSdkConfig = {
  /** API key for the Expert SDK. */
  apiKey?: string;
  /** Expert SDK endpoint URL. */
  endpoint?: string;
  /** Subscription tier. Default: "basic". */
  tier?: "basic" | "pro" | "enterprise";
};

/** Info Feed SDK connection settings. */
export type InfoFeedSdkConfig = {
  /** API key for the Info Feed SDK. */
  apiKey?: string;
  /** Info Feed SDK endpoint URL. */
  endpoint?: string;
};

/** Top-level financial configuration section. */
export type FinancialConfig = {
  /** Named exchange accounts (key = user-chosen alias). */
  exchanges?: Record<string, ExchangeAccountConfig>;
  /** Trading risk limits and behavior. */
  trading?: TradingConfig;
  /** Expert SDK integration. */
  expertSdk?: ExpertSdkConfig;
  /** Info Feed SDK integration. */
  infoFeedSdk?: InfoFeedSdkConfig;
};
