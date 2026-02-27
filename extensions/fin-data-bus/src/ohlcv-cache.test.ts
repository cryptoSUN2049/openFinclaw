import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OHLCVCache } from "./ohlcv-cache.js";
import type { OHLCV } from "./types.js";

function makeBar(ts: number, close: number): OHLCV {
  return { timestamp: ts, open: close - 1, high: close + 1, low: close - 2, close, volume: 100 };
}

describe("OHLCVCache", () => {
  let dir: string;
  let cache: OHLCVCache;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ohlcv-cache-test-"));
    cache = new OHLCVCache(join(dir, "test.sqlite"));
  });

  afterEach(() => {
    cache.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes and reads back 100 rows with correct data", () => {
    const rows: OHLCV[] = [];
    for (let i = 0; i < 100; i++) {
      rows.push(makeBar(1000 + i * 3600000, 100 + i));
    }

    cache.upsertBatch("BTC/USDT", "crypto", "1h", rows);
    const result = cache.query("BTC/USDT", "crypto", "1h");

    expect(result).toHaveLength(100);
    expect(result[0]).toEqual(rows[0]);
    expect(result[99]).toEqual(rows[99]);
  });

  it("upserts duplicate timestamps without error or duplicates", () => {
    const rows = [makeBar(1000, 50), makeBar(2000, 51)];
    cache.upsertBatch("ETH/USDT", "crypto", "1h", rows);

    // Upsert with updated close price for same timestamp
    const updated = [makeBar(1000, 55)];
    updated[0]!.close = 55;
    cache.upsertBatch("ETH/USDT", "crypto", "1h", updated);

    const result = cache.query("ETH/USDT", "crypto", "1h");
    expect(result).toHaveLength(2);
    // The first bar should have the updated close price
    expect(result[0]!.close).toBe(55);
  });

  it("isolates data across timeframes", () => {
    const hourly = [makeBar(1000, 100), makeBar(2000, 101)];
    const fourHourly = [makeBar(1000, 200), makeBar(5000, 201), makeBar(9000, 202)];

    cache.upsertBatch("BTC/USDT", "crypto", "1h", hourly);
    cache.upsertBatch("BTC/USDT", "crypto", "4h", fourHourly);

    expect(cache.query("BTC/USDT", "crypto", "1h")).toHaveLength(2);
    expect(cache.query("BTC/USDT", "crypto", "4h")).toHaveLength(3);
  });

  it("returns empty array for queries with no matching data", () => {
    const result = cache.query("DOGE/USDT", "crypto", "1d");
    expect(result).toEqual([]);
  });

  it("filters by since and until", () => {
    const rows: OHLCV[] = [];
    for (let i = 0; i < 10; i++) {
      rows.push(makeBar(1000 + i * 3600000, 100 + i));
    }
    cache.upsertBatch("BTC/USDT", "crypto", "1h", rows);

    // Query with since
    const sinceResult = cache.query("BTC/USDT", "crypto", "1h", 1000 + 5 * 3600000);
    expect(sinceResult).toHaveLength(5);
    expect(sinceResult[0]!.timestamp).toBe(1000 + 5 * 3600000);

    // Query with until
    const untilResult = cache.query("BTC/USDT", "crypto", "1h", undefined, 1000 + 3 * 3600000);
    expect(untilResult).toHaveLength(4);

    // Query with both
    const rangeResult = cache.query(
      "BTC/USDT",
      "crypto",
      "1h",
      1000 + 2 * 3600000,
      1000 + 7 * 3600000,
    );
    expect(rangeResult).toHaveLength(6);
  });

  it("getRange returns earliest and latest timestamps", () => {
    const rows = [makeBar(5000, 50), makeBar(1000, 40), makeBar(9000, 60)];
    cache.upsertBatch("SOL/USDT", "crypto", "1h", rows);

    const range = cache.getRange("SOL/USDT", "crypto", "1h");
    expect(range).toEqual({ earliest: 1000, latest: 9000 });
  });

  it("getRange returns null when no data exists", () => {
    const range = cache.getRange("MISSING/USDT", "crypto", "1h");
    expect(range).toBeNull();
  });

  it("close is idempotent", () => {
    cache.close();
    // Second close should not throw
    expect(() => cache.close()).not.toThrow();
  });

  it("isolates data across symbols", () => {
    cache.upsertBatch("BTC/USDT", "crypto", "1h", [makeBar(1000, 100)]);
    cache.upsertBatch("ETH/USDT", "crypto", "1h", [makeBar(1000, 200)]);

    const btc = cache.query("BTC/USDT", "crypto", "1h");
    const eth = cache.query("ETH/USDT", "crypto", "1h");

    expect(btc).toHaveLength(1);
    expect(btc[0]!.close).toBe(100);
    expect(eth).toHaveLength(1);
    expect(eth[0]!.close).toBe(200);
  });

  it("isolates data across markets", () => {
    cache.upsertBatch("AAPL", "equity", "1d", [makeBar(1000, 150)]);
    cache.upsertBatch("AAPL", "crypto", "1d", [makeBar(1000, 50)]);

    expect(cache.query("AAPL", "equity", "1d")).toHaveLength(1);
    expect(cache.query("AAPL", "crypto", "1d")).toHaveLength(1);
    expect(cache.query("AAPL", "equity", "1d")[0]!.close).toBe(150);
  });
});
