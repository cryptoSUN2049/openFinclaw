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

/** Equity market data and trading configuration. */
export type EquityConfig = {
  /** Alpaca API credentials (free paper trading). */
  alpaca?: {
    apiKeyId?: string;
    apiSecretKey?: string;
    /** Use paper trading endpoint. Default: true. */
    paper?: boolean;
  };
};

/** Commodity market data configuration. */
export type CommodityConfig = {
  /** Quandl API key for commodity data. */
  quandlApiKey?: string;
};

/** Fund-level capital allocation and risk parameters. */
export type FundConfig = {
  /** Total fund capital in USD. */
  totalCapital?: number;
  /** Minimum cash reserve percentage (0-100). Default: 30. */
  cashReservePct?: number;
  /** Maximum allocation to a single strategy (0-100). Default: 30. */
  maxSingleStrategyPct?: number;
  /** Maximum total exposure (0-100). Default: 70. */
  maxTotalExposurePct?: number;
  /** How often to rebalance. Default: "weekly". */
  rebalanceFrequency?: "daily" | "weekly" | "monthly";
};

/** Backtest engine defaults. */
export type BacktestConfig = {
  /** Default commission rate per trade. Default: 0.001. */
  defaultCommission?: number;
  /** Default slippage rate per trade. Default: 0.0005. */
  defaultSlippage?: number;
  /** Number of Walk-Forward windows. Default: 5. */
  walkForwardWindows?: number;
  /** In-sample fraction per WF window (0.5-0.9). Default: 0.7. */
  walkForwardInSamplePct?: number;
};

/** Strategy evolution parameters. */
export type EvolutionConfig = {
  /** How often to run evolution cycles. Default: "monthly". */
  evaluationInterval?: "weekly" | "monthly";
  /** Percentage of worst strategies to cull (0-50). Default: 20. */
  cullPercentage?: number;
  /** Parameter mutation probability (0-1). Default: 0.3. */
  mutationRate?: number;
  /** Minimum number of strategies to keep alive. Default: 3. */
  minStrategies?: number;
};

/** Paper trading engine configuration. */
export type PaperTradingConfig = {
  /** Default initial capital in USD. Default: 100000. */
  defaultCapital?: number;
  /** Slippage model to use. Default: "constant". */
  slippageModel?: "constant" | "volume-share";
  /** Fixed slippage in basis points (constant model). Default: 5. */
  constantSlippageBps?: number;
  /** Strategy signal check interval in seconds. Default: 10. */
  signalCheckIntervalSec?: number;
  /** Decay detection interval in seconds. Default: 300. */
  decayCheckIntervalSec?: number;
  /** Minimum days in paper before live promotion. Default: 30. */
  minDaysBeforePromotion?: number;
  /** Minimum trades in paper before live promotion. Default: 30. */
  minTradesBeforePromotion?: number;
  /** US market paper trading adapter. */
  us?: { adapter?: "alpaca" | "internal" };
  /** HK market paper trading adapter. */
  hk?: { adapter?: "futu" | "internal"; futuOpenDHost?: string; futuOpenDPort?: number };
  /** China A-share paper trading adapter. */
  cn?: {
    adapter?: "openctp" | "internal";
    dataSource?: "tushare" | "akshare";
    tushareToken?: string;
  };
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
  /** Equity market configuration (US stocks). */
  equity?: EquityConfig;
  /** Commodity market configuration. */
  commodity?: CommodityConfig;
  /** Fund-level capital allocation and risk. */
  fund?: FundConfig;
  /** Backtest engine defaults. */
  backtest?: BacktestConfig;
  /** Strategy evolution parameters. */
  evolution?: EvolutionConfig;
  /** Paper trading engine configuration. */
  paperTrading?: PaperTradingConfig;
};
