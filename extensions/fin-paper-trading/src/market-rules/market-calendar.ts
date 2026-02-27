import type { MarketType } from "../../../fin-data-bus/src/types.js";

/** Check if a market is currently open. Phase 1: only crypto (always open). */
export function isMarketOpen(market: MarketType, _timestamp?: number): boolean {
  if (market === "crypto") return true;
  // Phase 2 placeholders
  if (market === "equity") return false;
  if (market === "commodity") return false;
  return false;
}

/** Resolve symbol to a market type via simple heuristic. */
export function resolveMarket(symbol: string): MarketType {
  // Symbols containing "/" are crypto pairs (e.g. BTC/USDT)
  if (symbol.includes("/")) return "crypto";
  // Phase 2: stock tickers like AAPL → equity
  return "equity";
}

/** Get the canonical timezone for a market. */
export function getMarketTimezone(market: MarketType): string {
  const tzMap: Record<MarketType, string> = {
    crypto: "UTC",
    equity: "America/New_York",
    commodity: "America/Chicago",
  };
  return tzMap[market] ?? "UTC";
}
