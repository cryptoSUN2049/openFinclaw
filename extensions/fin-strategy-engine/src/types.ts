import type { OHLCV, MarketRegime, MarketType } from "../../fin-data-bus/src/types.js";

export type StrategyLevel = "L0_INCUBATE" | "L1_BACKTEST" | "L2_PAPER" | "L3_LIVE" | "KILLED";
export type StrategyStatus = "running" | "paused" | "stopped";

export interface Signal {
  action: "buy" | "sell" | "close";
  symbol: string;
  sizePct: number; // position size as % of equity (0-100)
  orderType: "market" | "limit";
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  reason: string;
  confidence: number; // 0-1
}

export interface StrategyContext {
  portfolio: { equity: number; cash: number; positions: Position[] };
  history: OHLCV[];
  indicators: IndicatorLib;
  regime: MarketRegime;
  memory: Map<string, unknown>;
  log(msg: string): void;
}

export interface Position {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

export interface IndicatorLib {
  sma(period: number): number[];
  ema(period: number): number[];
  rsi(period: number): number[];
  macd(
    fast?: number,
    slow?: number,
    signal?: number,
  ): { macd: number[]; signal: number[]; histogram: number[] };
  bollingerBands(
    period?: number,
    stdDev?: number,
  ): { upper: number[]; middle: number[]; lower: number[] };
  atr(period?: number): number[];
}

export interface StrategyDefinition {
  id: string;
  name: string;
  version: string;
  markets: MarketType[];
  symbols: string[];
  timeframes: string[];
  parameters: Record<string, number>;
  parameterRanges?: Record<string, { min: number; max: number; step: number }>;
  init?(ctx: StrategyContext): Promise<void>;
  onBar(bar: OHLCV, ctx: StrategyContext): Promise<Signal | null>;
  onDayEnd?(ctx: StrategyContext): Promise<void>;
}

export interface BacktestConfig {
  capital: number;
  commissionRate: number; // e.g., 0.001
  slippageBps: number; // e.g., 5
  market: MarketType;
}

export interface TradeRecord {
  entryTime: number;
  exitTime: number;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  commission: number;
  slippage: number;
  pnl: number;
  pnlPct: number;
  reason: string;
  exitReason: string;
}

export interface BacktestResult {
  strategyId: string;
  startDate: number;
  endDate: number;
  initialCapital: number;
  finalEquity: number;
  totalReturn: number; // percentage
  sharpe: number;
  sortino: number;
  maxDrawdown: number; // negative percentage
  calmar: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  trades: TradeRecord[];
  equityCurve: number[]; // daily equity values
  dailyReturns: number[];
}

export interface WalkForwardResult {
  passed: boolean;
  windows: Array<{
    trainStart: number;
    trainEnd: number;
    testStart: number;
    testEnd: number;
    trainSharpe: number;
    testSharpe: number;
  }>;
  combinedTestSharpe: number;
  avgTrainSharpe: number;
  ratio: number; // combinedTest / avgTrain
  threshold: number; // 0.6
}

export interface StrategyRecord {
  id: string;
  name: string;
  version: string;
  level: StrategyLevel;
  status?: StrategyStatus;
  definition: StrategyDefinition;
  createdAt: number;
  updatedAt: number;
  lastBacktest?: BacktestResult;
  lastWalkForward?: WalkForwardResult;
}
