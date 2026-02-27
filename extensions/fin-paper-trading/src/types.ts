export interface PaperOrder {
  id: string;
  accountId: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  quantity: number;
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  status: "pending" | "filled" | "cancelled" | "rejected";
  fillPrice?: number;
  commission?: number;
  slippage?: number;
  createdAt: number;
  filledAt?: number;
  reason?: string;
  strategyId?: string;
}

export interface PaperPosition {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  openedAt: number;
}

export interface PaperAccountState {
  id: string;
  name: string;
  initialCapital: number;
  cash: number;
  equity: number;
  positions: PaperPosition[];
  orders: PaperOrder[];
  createdAt: number;
  updatedAt: number;
}

export interface DecayState {
  rollingSharpe7d: number;
  rollingSharpe30d: number;
  sharpeMomentum: number;
  consecutiveLossDays: number;
  currentDrawdown: number;
  peakEquity: number;
  decayLevel: "healthy" | "warning" | "degrading" | "critical";
}

export interface EquitySnapshot {
  accountId: string;
  timestamp: number;
  equity: number;
  cash: number;
  positionsValue: number;
  dailyPnl: number;
  dailyPnlPct: number;
}
