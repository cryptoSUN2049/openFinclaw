/** A single trade record in the journal. */
export interface TradeEntry {
  id: string;
  timestamp: number;
  strategyId?: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  notional: number;
  commission?: number;
  slippage?: number;
  pnl?: number;
  reason?: string;
  source: "live" | "paper" | "backtest";
  regime?: string;
  tags?: string[];
}

/** Query filter for the trade journal. */
export interface TradeFilter {
  strategyId?: string;
  symbol?: string;
  source?: "live" | "paper" | "backtest";
  side?: "buy" | "sell";
  since?: number;
  until?: number;
}

/** Summary statistics for a set of trades. */
export interface TradeSummary {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  profitFactor: number;
  largestWin: number;
  largestLoss: number;
}

/** An error pattern in the error book. */
export interface ErrorPattern {
  id: string;
  description: string;
  category: "entry" | "exit" | "sizing" | "timing" | "risk";
  occurrences: number;
  totalLoss: number;
  severity: "low" | "medium" | "high" | "critical";
  symbols: string[];
  regimes: string[];
  constraint?: string;
  lastSeen: number;
  tradeIds: string[];
}

/** A success pattern in the success book. */
export interface SuccessPattern {
  id: string;
  description: string;
  category: "entry" | "exit" | "sizing" | "timing" | "risk";
  occurrences: number;
  totalProfit: number;
  confidence: "emerging" | "confirmed" | "proven";
  symbols: string[];
  regimes: string[];
  insight?: string;
  lastSeen: number;
  tradeIds: string[];
}
