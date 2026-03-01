import type { OHLCVCache } from "../ohlcv-cache.js";
import type { OHLCV, Ticker } from "../types.js";

/**
 * Duck-typed gateway interface matching fin-datahub-gateway service.
 * Avoids hard dependency on fin-data-hub package.
 */
export type DataHubGateway = {
  tusharePost: (
    apiName: string,
    params: Record<string, unknown>,
    fields?: string,
  ) => Promise<{ success: boolean; data: unknown[] }>;
};

export interface EquityAdapter {
  getOHLCV(params: {
    symbol: string;
    timeframe: string;
    since?: number;
    limit?: number;
  }): Promise<OHLCV[]>;
  getTicker(symbol: string): Promise<Ticker>;
}

/** Map timeframe to Tushare API name. Equity only supports daily/weekly/monthly. */
const TIMEFRAME_API: Record<string, string> = {
  "1d": "daily",
  "1W": "weekly",
  "1M": "monthly",
};

/** Detect market variant from symbol suffix. */
function detectApi(symbol: string, timeframe: string): string {
  const upper = symbol.toUpperCase();
  if (upper.endsWith(".HK")) return "hk_daily";
  if (/^[A-Z]{1,5}$/.test(upper)) return "us_daily";
  return TIMEFRAME_API[timeframe] ?? "daily";
}

/** Convert Tushare trade_date (YYYYMMDD string) → Unix ms. */
function parseTushareDate(raw: unknown): number {
  const s = String(raw);
  // YYYYMMDD → YYYY-MM-DD
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`;
  return new Date(iso).getTime();
}

/** Convert a Tushare row to our canonical OHLCV format. */
function rowToOHLCV(row: Record<string, unknown>): OHLCV {
  return {
    timestamp: parseTushareDate(row.trade_date),
    open: Number(row.open) || 0,
    high: Number(row.high) || 0,
    low: Number(row.low) || 0,
    close: Number(row.close) || 0,
    // Tushare vol is in 手 (lots of 100 shares) for CN, raw volume for HK/US
    volume: Number(row.vol) || 0,
  };
}

export function createEquityAdapter(cache: OHLCVCache, gateway: DataHubGateway): EquityAdapter {
  return {
    async getOHLCV(params) {
      const { symbol, timeframe, since, limit } = params;
      const market = "equity";

      // Check cache first
      const range = cache.getRange(symbol, market, timeframe);
      if (range) {
        if (since != null && limit != null) {
          const cached = cache.query(symbol, market, timeframe, since);
          if (cached.length >= limit) {
            return cached.slice(0, limit);
          }
        }
      }

      // Build Tushare query
      const apiName = detectApi(symbol, timeframe);
      const tsParams: Record<string, unknown> = { ts_code: symbol };
      if (since) {
        const d = new Date(since);
        tsParams.start_date = d.toISOString().slice(0, 10).replace(/-/g, "");
      }
      if (limit) tsParams.limit = limit;

      const result = await gateway.tusharePost(
        apiName,
        tsParams,
        "trade_date,open,high,low,close,vol",
      );

      const rows = (result.data as Record<string, unknown>[])
        .filter((r) => r.trade_date)
        .map(rowToOHLCV)
        .sort((a, b) => a.timestamp - b.timestamp);

      if (rows.length > 0) {
        cache.upsertBatch(symbol, market, timeframe, rows);
      }

      // Return from cache for consistency (merges with any existing data)
      if (range || rows.length > 0) {
        return cache.query(symbol, market, timeframe, since);
      }
      return rows;
    },

    async getTicker(symbol) {
      // Fetch latest daily bar as a pseudo-ticker
      const apiName = detectApi(symbol, "1d");
      const result = await gateway.tusharePost(
        apiName,
        { ts_code: symbol, limit: 1 },
        "trade_date,open,high,low,close,vol,pre_close,pct_chg",
      );

      const row = (result.data as Record<string, unknown>[])[0];
      if (!row) throw new Error(`No ticker data for ${symbol}`);

      return {
        symbol,
        market: "equity" as const,
        last: Number(row.close) || 0,
        bid: undefined,
        ask: undefined,
        volume24h: Number(row.vol) || undefined,
        changePct24h: Number(row.pct_chg) || undefined,
        timestamp: parseTushareDate(row.trade_date),
      };
    },
  };
}
