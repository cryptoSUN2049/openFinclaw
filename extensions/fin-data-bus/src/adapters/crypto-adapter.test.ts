import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OHLCVCache } from "../ohlcv-cache.js";
import type { CcxtExchange, CryptoAdapter } from "./crypto-adapter.js";
import { createCryptoAdapter } from "./crypto-adapter.js";

function makeCcxtCandle(
  ts: number,
  close: number,
): [number, number, number, number, number, number] {
  return [ts, close - 1, close + 1, close - 2, close, 100];
}

describe("CryptoAdapter", () => {
  let dir: string;
  let cache: OHLCVCache;
  let mockExchange: CcxtExchange;
  let getExchange: ReturnType<typeof vi.fn<(id?: string) => Promise<CcxtExchange>>>;
  let adapter: CryptoAdapter;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "crypto-adapter-test-"));
    cache = new OHLCVCache(join(dir, "test.sqlite"));

    mockExchange = {
      fetchTicker: vi.fn(),
      fetchOHLCV: vi.fn(),
    };
    getExchange = vi.fn().mockResolvedValue(mockExchange);

    adapter = createCryptoAdapter(cache, getExchange, "binance");
  });

  afterEach(() => {
    cache.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("getOHLCV", () => {
    it("fetches from CCXT on cache miss and stores in cache", async () => {
      const candles = [
        makeCcxtCandle(1000, 50),
        makeCcxtCandle(2000, 51),
        makeCcxtCandle(3000, 52),
      ];
      (mockExchange.fetchOHLCV as ReturnType<typeof vi.fn>).mockResolvedValue(candles);

      const result = await adapter.getOHLCV({ symbol: "BTC/USDT", timeframe: "1h" });

      expect(result).toHaveLength(3);
      expect(result[0]!.timestamp).toBe(1000);
      expect(result[0]!.close).toBe(50);
      expect(mockExchange.fetchOHLCV).toHaveBeenCalledOnce();

      // Verify data was cached
      const cached = cache.query("BTC/USDT", "crypto", "1h");
      expect(cached).toHaveLength(3);
    });

    it("returns cached data without calling CCXT when cache is complete", async () => {
      // Pre-populate cache
      const rows = [
        { timestamp: 1000, open: 49, high: 51, low: 48, close: 50, volume: 100 },
        { timestamp: 2000, open: 50, high: 52, low: 49, close: 51, volume: 100 },
      ];
      cache.upsertBatch("BTC/USDT", "crypto", "1h", rows);

      const result = await adapter.getOHLCV({
        symbol: "BTC/USDT",
        timeframe: "1h",
        since: 1000,
        limit: 2,
      });

      expect(result).toHaveLength(2);
      expect(mockExchange.fetchOHLCV).not.toHaveBeenCalled();
    });

    it("fetches missing range from CCXT on partial cache hit", async () => {
      // Pre-populate partial cache
      cache.upsertBatch("ETH/USDT", "crypto", "1h", [
        { timestamp: 1000, open: 49, high: 51, low: 48, close: 50, volume: 100 },
        { timestamp: 2000, open: 50, high: 52, low: 49, close: 51, volume: 100 },
      ]);

      // CCXT returns new data after the cached range
      (mockExchange.fetchOHLCV as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeCcxtCandle(3000, 52),
        makeCcxtCandle(4000, 53),
      ]);

      const result = await adapter.getOHLCV({
        symbol: "ETH/USDT",
        timeframe: "1h",
      });

      // Should have combined old + new data
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(mockExchange.fetchOHLCV).toHaveBeenCalledOnce();
    });

    it("throws meaningful error on CCXT failure", async () => {
      (mockExchange.fetchOHLCV as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("ExchangeNotAvailable: binance is down"),
      );

      await expect(adapter.getOHLCV({ symbol: "BTC/USDT", timeframe: "1h" })).rejects.toThrow(
        "ExchangeNotAvailable: binance is down",
      );
    });

    it("uses explicit exchangeId when provided", async () => {
      const otherExchange: CcxtExchange = {
        fetchTicker: vi.fn(),
        fetchOHLCV: vi
          .fn<CcxtExchange["fetchOHLCV"]>()
          .mockResolvedValue([makeCcxtCandle(1000, 50)]),
      };
      getExchange.mockResolvedValue(otherExchange);

      await adapter.getOHLCV({ symbol: "BTC/USDT", timeframe: "1h", exchangeId: "okx" });

      expect(getExchange).toHaveBeenCalledWith("okx");
    });

    it("passes limit to CCXT", async () => {
      (mockExchange.fetchOHLCV as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeCcxtCandle(1000, 50),
      ]);

      await adapter.getOHLCV({ symbol: "BTC/USDT", timeframe: "4h", limit: 10 });

      expect(mockExchange.fetchOHLCV).toHaveBeenCalledWith("BTC/USDT", "4h", undefined, 10);
    });
  });

  describe("getTicker", () => {
    it("returns a formatted Ticker from CCXT data", async () => {
      (mockExchange.fetchTicker as ReturnType<typeof vi.fn>).mockResolvedValue({
        last: 67500,
        bid: 67490,
        ask: 67510,
        quoteVolume: 1_500_000_000,
        percentage: 1.8,
        timestamp: 1708819200000,
      });

      const ticker = await adapter.getTicker("BTC/USDT");

      expect(ticker.symbol).toBe("BTC/USDT");
      expect(ticker.market).toBe("crypto");
      expect(ticker.last).toBe(67500);
      expect(ticker.bid).toBe(67490);
      expect(ticker.ask).toBe(67510);
      expect(ticker.volume24h).toBe(1_500_000_000);
      expect(ticker.changePct24h).toBe(1.8);
      expect(ticker.timestamp).toBe(1708819200000);
    });

    it("throws on CCXT failure", async () => {
      (mockExchange.fetchTicker as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("BadSymbol: BTC/XXX"),
      );

      await expect(adapter.getTicker("BTC/XXX")).rejects.toThrow("BadSymbol: BTC/XXX");
    });

    it("uses explicit exchangeId", async () => {
      const otherExchange: CcxtExchange = {
        fetchTicker: vi.fn<CcxtExchange["fetchTicker"]>().mockResolvedValue({
          last: 100,
          timestamp: Date.now(),
        }),
        fetchOHLCV: vi.fn(),
      };
      getExchange.mockResolvedValue(otherExchange);

      await adapter.getTicker("BTC/USDT", "okx");

      expect(getExchange).toHaveBeenCalledWith("okx");
    });
  });
});
