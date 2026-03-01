import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OHLCVCache } from "../ohlcv-cache.js";
import type { DataHubGateway, EquityAdapter } from "./equity-adapter.js";
import { createEquityAdapter } from "./equity-adapter.js";

function makeTushareRow(tradeDate: string, close: number): Record<string, unknown> {
  return {
    trade_date: tradeDate,
    open: close - 5,
    high: close + 5,
    low: close - 10,
    close,
    vol: 12345,
  };
}

describe("EquityAdapter", () => {
  let dir: string;
  let cache: OHLCVCache;
  let mockGateway: DataHubGateway;
  let adapter: EquityAdapter;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "equity-adapter-test-"));
    cache = new OHLCVCache(join(dir, "test.sqlite"));

    mockGateway = {
      tusharePost: vi.fn().mockResolvedValue({ success: true, data: [] }),
    };

    adapter = createEquityAdapter(cache, mockGateway);
  });

  afterEach(() => {
    cache.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("getOHLCV", () => {
    it("fetches CN stock via Tushare daily and caches result", async () => {
      (mockGateway.tusharePost as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: [
          makeTushareRow("20250228", 1800),
          makeTushareRow("20250227", 1795),
          makeTushareRow("20250226", 1790),
        ],
      });

      const result = await adapter.getOHLCV({ symbol: "600519.SH", timeframe: "1d" });

      expect(result).toHaveLength(3);
      // Should be sorted by timestamp ascending
      expect(result[0]!.close).toBe(1790);
      expect(result[2]!.close).toBe(1800);

      expect(mockGateway.tusharePost).toHaveBeenCalledWith(
        "daily",
        expect.objectContaining({ ts_code: "600519.SH" }),
        "trade_date,open,high,low,close,vol",
      );

      // Verify data was cached
      const cached = cache.query("600519.SH", "equity", "1d");
      expect(cached).toHaveLength(3);
    });

    it("routes HK stock to hk_daily API", async () => {
      (mockGateway.tusharePost as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: [makeTushareRow("20250228", 380)],
      });

      await adapter.getOHLCV({ symbol: "00700.HK", timeframe: "1d" });

      expect(mockGateway.tusharePost).toHaveBeenCalledWith(
        "hk_daily",
        expect.objectContaining({ ts_code: "00700.HK" }),
        expect.any(String),
      );
    });

    it("routes US stock to us_daily API", async () => {
      (mockGateway.tusharePost as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: [makeTushareRow("20250228", 178)],
      });

      await adapter.getOHLCV({ symbol: "AAPL", timeframe: "1d" });

      expect(mockGateway.tusharePost).toHaveBeenCalledWith(
        "us_daily",
        expect.objectContaining({ ts_code: "AAPL" }),
        expect.any(String),
      );
    });

    it("returns cached data without calling gateway", async () => {
      // Pre-populate cache
      const ts1 = new Date("2025-02-26T00:00:00Z").getTime();
      const ts2 = new Date("2025-02-27T00:00:00Z").getTime();
      cache.upsertBatch("600519.SH", "equity", "1d", [
        { timestamp: ts1, open: 1785, high: 1795, low: 1780, close: 1790, volume: 100 },
        { timestamp: ts2, open: 1790, high: 1800, low: 1785, close: 1795, volume: 100 },
      ]);

      const result = await adapter.getOHLCV({
        symbol: "600519.SH",
        timeframe: "1d",
        since: ts1,
        limit: 2,
      });

      expect(result).toHaveLength(2);
      expect(mockGateway.tusharePost).not.toHaveBeenCalled();
    });

    it("converts since timestamp to Tushare date format", async () => {
      (mockGateway.tusharePost as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: [],
      });

      const since = new Date("2025-01-15T00:00:00Z").getTime();
      await adapter.getOHLCV({ symbol: "600519.SH", timeframe: "1d", since });

      expect(mockGateway.tusharePost).toHaveBeenCalledWith(
        "daily",
        expect.objectContaining({ start_date: "20250115" }),
        expect.any(String),
      );
    });

    it("handles empty result gracefully", async () => {
      (mockGateway.tusharePost as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await adapter.getOHLCV({ symbol: "600519.SH", timeframe: "1d" });
      expect(result).toHaveLength(0);
    });

    it("propagates gateway errors", async () => {
      (mockGateway.tusharePost as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Tushare proxy error (500): internal server error"),
      );

      await expect(adapter.getOHLCV({ symbol: "600519.SH", timeframe: "1d" })).rejects.toThrow(
        "Tushare proxy error",
      );
    });

    it("maps weekly timeframe to weekly API for CN stock", async () => {
      (mockGateway.tusharePost as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: [makeTushareRow("20250228", 1800)],
      });

      await adapter.getOHLCV({ symbol: "600519.SH", timeframe: "1W" });

      expect(mockGateway.tusharePost).toHaveBeenCalledWith(
        "weekly",
        expect.any(Object),
        expect.any(String),
      );
    });
  });

  describe("getTicker", () => {
    it("returns ticker from latest daily bar", async () => {
      (mockGateway.tusharePost as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: [
          {
            trade_date: "20250228",
            open: 1795,
            high: 1810,
            low: 1790,
            close: 1805,
            vol: 50000,
            pre_close: 1795,
            pct_chg: 0.56,
          },
        ],
      });

      const ticker = await adapter.getTicker("600519.SH");

      expect(ticker.symbol).toBe("600519.SH");
      expect(ticker.market).toBe("equity");
      expect(ticker.last).toBe(1805);
      expect(ticker.changePct24h).toBe(0.56);
      expect(ticker.volume24h).toBe(50000);
    });

    it("throws when no data returned", async () => {
      (mockGateway.tusharePost as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: [],
      });

      await expect(adapter.getTicker("INVALID")).rejects.toThrow("No ticker data");
    });
  });
});
