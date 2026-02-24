import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import finMarketDataPlugin from "./index.js";

// --- Mock exchange instance ---
function createMockExchange() {
  return {
    fetchTicker: vi.fn(),
    fetchOHLCV: vi.fn(),
    fetchOrderBook: vi.fn(),
    fetchTickers: vi.fn(),
  };
}

// --- Mock registry ---
function createMockRegistry(
  exchanges: Array<{ id: string; exchange: string; testnet: boolean }> = [],
) {
  const instances = new Map<string, ReturnType<typeof createMockExchange>>();
  for (const ex of exchanges) {
    instances.set(ex.id, createMockExchange());
  }
  return {
    listExchanges: vi.fn(() => exchanges),
    getInstance: vi.fn(async (id: string) => {
      const inst = instances.get(id);
      if (!inst) throw new Error(`Exchange "${id}" not configured.`);
      return inst;
    }),
    _instances: instances,
  };
}

// --- Fake plugin API ---
function createFakeApi(registry: ReturnType<typeof createMockRegistry> | null): {
  api: OpenClawPluginApi;
  tools: Map<
    string,
    { execute: (id: string, params: Record<string, unknown>) => Promise<unknown> }
  >;
} {
  const tools = new Map<
    string,
    { execute: (id: string, params: Record<string, unknown>) => Promise<unknown> }
  >();
  const services = new Map<string, unknown>();
  if (registry) {
    services.set("fin-exchange-registry", registry);
  }

  const api = {
    id: "fin-market-data",
    name: "Market Data",
    source: "test",
    config: {},
    pluginConfig: {},
    runtime: {
      version: "test",
      services,
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    registerTool(tool: {
      name: string;
      execute: (id: string, params: Record<string, unknown>) => Promise<unknown>;
    }) {
      tools.set(tool.name, tool);
    },
    registerHook() {},
    registerHttpHandler() {},
    registerHttpRoute() {},
    registerChannel() {},
    registerGatewayMethod() {},
    registerCli() {},
    registerService() {},
    registerProvider() {},
    registerCommand() {},
    resolvePath: (p: string) => p,
    on() {},
  } as unknown as OpenClawPluginApi;

  return { api, tools };
}

function parseResult(result: unknown): unknown {
  const res = result as { content: Array<{ text: string }> };
  return JSON.parse(res.content[0]!.text);
}

describe("fin-market-data plugin", () => {
  let registry: ReturnType<typeof createMockRegistry>;
  let tools: Map<
    string,
    { execute: (id: string, params: Record<string, unknown>) => Promise<unknown> }
  >;
  let mockExchange: ReturnType<typeof createMockExchange>;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = createMockRegistry([{ id: "test-binance", exchange: "binance", testnet: false }]);
    mockExchange = registry._instances.get("test-binance")!;
    const { api, tools: t } = createFakeApi(registry);
    tools = t;
    finMarketDataPlugin.register(api);
  });

  describe("fin_market_price", () => {
    it("returns current price and OHLCV candles", async () => {
      mockExchange.fetchTicker.mockResolvedValue({
        last: 67500.5,
        change: 1200,
        percentage: 1.81,
        high: 68000,
        low: 66200,
        quoteVolume: 1_500_000_000,
      });
      mockExchange.fetchOHLCV.mockResolvedValue([
        [1708819200000, 67000, 67800, 66900, 67500, 1500],
        [1708822800000, 67500, 68000, 67200, 67800, 1200],
      ]);

      const tool = tools.get("fin_market_price")!;
      const result = parseResult(
        await tool.execute("call-1", {
          symbol: "BTC/USDT",
          timeframe: "1h",
          limit: 2,
        }),
      );

      expect(result).toMatchObject({
        symbol: "BTC/USDT",
        exchange: "test-binance",
        price: 67500.5,
        changePct24h: 1.81,
        timeframe: "1h",
      });
      const r = result as { candles: unknown[] };
      expect(r.candles).toHaveLength(2);
      expect(r.candles[0]).toMatchObject({
        open: 67000,
        high: 67800,
        low: 66900,
        close: 67500,
        volume: 1500,
      });

      expect(mockExchange.fetchTicker).toHaveBeenCalledWith("BTC/USDT");
      expect(mockExchange.fetchOHLCV).toHaveBeenCalledWith("BTC/USDT", "1h", undefined, 2);
    });

    it("uses default exchange when not specified", async () => {
      mockExchange.fetchTicker.mockResolvedValue({ last: 67500 });
      mockExchange.fetchOHLCV.mockResolvedValue([]);

      const tool = tools.get("fin_market_price")!;
      await tool.execute("call-2", { symbol: "BTC/USDT" });

      expect(registry.getInstance).toHaveBeenCalledWith("test-binance");
    });

    it("uses explicit exchange when specified", async () => {
      mockExchange.fetchTicker.mockResolvedValue({ last: 67500 });
      mockExchange.fetchOHLCV.mockResolvedValue([]);

      const tool = tools.get("fin_market_price")!;
      await tool.execute("call-3", { symbol: "BTC/USDT", exchange: "test-binance" });

      expect(registry.getInstance).toHaveBeenCalledWith("test-binance");
    });

    it("returns error for CCXT failures", async () => {
      mockExchange.fetchTicker.mockRejectedValue(new Error("Network error"));

      const tool = tools.get("fin_market_price")!;
      const result = parseResult(await tool.execute("call-4", { symbol: "BTC/USDT" }));

      expect(result).toMatchObject({ error: "Network error" });
    });
  });

  describe("fin_ticker_info", () => {
    it("returns detailed ticker info", async () => {
      mockExchange.fetchTicker.mockResolvedValue({
        last: 3400.25,
        bid: 3400.0,
        ask: 3400.5,
        high: 3500,
        low: 3300,
        open: 3350,
        close: 3400.25,
        baseVolume: 250_000,
        quoteVolume: 850_000_000,
        change: 50.25,
        percentage: 1.5,
        vwap: 3380.5,
        datetime: "2026-02-24T12:00:00Z",
      });

      const tool = tools.get("fin_ticker_info")!;
      const result = parseResult(await tool.execute("call-5", { symbol: "ETH/USDT" }));

      expect(result).toMatchObject({
        symbol: "ETH/USDT",
        exchange: "test-binance",
        last: 3400.25,
        bid: 3400.0,
        ask: 3400.5,
        high24h: 3500,
        low24h: 3300,
        volume24h: 250_000,
        quoteVolume24h: 850_000_000,
        change24h: 50.25,
        changePct24h: 1.5,
        vwap: 3380.5,
        timestamp: "2026-02-24T12:00:00Z",
      });
    });

    it("returns error on auth failure", async () => {
      mockExchange.fetchTicker.mockRejectedValue(new Error("AuthenticationError: Invalid API key"));

      const tool = tools.get("fin_ticker_info")!;
      const result = parseResult(await tool.execute("call-6", { symbol: "ETH/USDT" }));

      expect(result).toMatchObject({ error: "AuthenticationError: Invalid API key" });
    });
  });

  describe("fin_orderbook", () => {
    it("returns bids, asks, and spread info", async () => {
      mockExchange.fetchOrderBook.mockResolvedValue({
        bids: [
          [67500, 1.5],
          [67490, 2.0],
          [67480, 3.0],
        ],
        asks: [
          [67510, 1.2],
          [67520, 2.5],
          [67530, 1.8],
        ],
        timestamp: 1708819200000,
      });

      const tool = tools.get("fin_orderbook")!;
      const result = parseResult(
        await tool.execute("call-7", {
          symbol: "BTC/USDT",
          limit: 3,
        }),
      ) as Record<string, unknown>;

      expect(result.symbol).toBe("BTC/USDT");
      expect(result.exchange).toBe("test-binance");
      expect(result.spread).toBe(10);
      expect(result.spreadPct).toBeCloseTo(0.0148, 3);
      expect((result.bids as unknown[]).length).toBe(3);
      expect((result.asks as unknown[]).length).toBe(3);
      expect(result.bidDepthUsd).toBeGreaterThan(0);
      expect(result.askDepthUsd).toBeGreaterThan(0);

      expect(mockExchange.fetchOrderBook).toHaveBeenCalledWith("BTC/USDT", 3);
    });

    it("handles empty orderbook", async () => {
      mockExchange.fetchOrderBook.mockResolvedValue({
        bids: [],
        asks: [],
        timestamp: null,
      });

      const tool = tools.get("fin_orderbook")!;
      const result = parseResult(
        await tool.execute("call-8", {
          symbol: "RARE/USDT",
        }),
      ) as Record<string, unknown>;

      expect(result.spread).toBeNull();
      expect(result.spreadPct).toBeNull();
      expect((result.bids as unknown[]).length).toBe(0);
      expect((result.asks as unknown[]).length).toBe(0);
    });
  });

  describe("fin_market_overview", () => {
    it("returns sorted tickers with summary stats", async () => {
      mockExchange.fetchTickers.mockResolvedValue({
        "BTC/USDT": {
          symbol: "BTC/USDT",
          last: 67500,
          change: 1200,
          percentage: 1.8,
          quoteVolume: 1_500_000_000,
          high: 68000,
          low: 66200,
        },
        "ETH/USDT": {
          symbol: "ETH/USDT",
          last: 3400,
          change: -50,
          percentage: -1.5,
          quoteVolume: 800_000_000,
          high: 3500,
          low: 3300,
        },
        "SOL/USDT": {
          symbol: "SOL/USDT",
          last: 145,
          change: 5,
          percentage: 3.5,
          quoteVolume: 200_000_000,
          high: 150,
          low: 140,
        },
      });

      const tool = tools.get("fin_market_overview")!;

      // Default sort by volume
      const result = parseResult(await tool.execute("call-9", {})) as Record<string, unknown>;
      expect(result.totalTickers).toBe(3);
      expect((result.summary as Record<string, unknown>).gainers).toBe(2);
      expect((result.summary as Record<string, unknown>).losers).toBe(1);

      const tickers = result.tickers as Array<{ symbol: string; volume24h: number }>;
      expect(tickers[0]!.symbol).toBe("BTC/USDT");
      expect(tickers[0]!.volume24h).toBe(1_500_000_000);

      // Sort by change
      const changeResult = parseResult(
        await tool.execute("call-10", { sort_by: "change" }),
      ) as Record<string, unknown>;
      const changeTickers = changeResult.tickers as Array<{ symbol: string }>;
      expect(changeTickers[0]!.symbol).toBe("SOL/USDT");
    });

    it("respects limit parameter", async () => {
      mockExchange.fetchTickers.mockResolvedValue({
        "BTC/USDT": {
          symbol: "BTC/USDT",
          last: 67500,
          percentage: 1.8,
          quoteVolume: 1_500_000_000,
        },
        "ETH/USDT": { symbol: "ETH/USDT", last: 3400, percentage: -1.5, quoteVolume: 800_000_000 },
        "SOL/USDT": { symbol: "SOL/USDT", last: 145, percentage: 3.5, quoteVolume: 200_000_000 },
      });

      const tool = tools.get("fin_market_overview")!;
      const result = parseResult(await tool.execute("call-11", { limit: 1 })) as Record<
        string,
        unknown
      >;
      expect((result.tickers as unknown[]).length).toBe(1);
    });
  });

  describe("error scenarios", () => {
    it("returns friendly error when no exchanges configured", async () => {
      const emptyRegistry = createMockRegistry([]);
      const { api, tools: emptyTools } = createFakeApi(emptyRegistry);
      finMarketDataPlugin.register(api);

      const tool = emptyTools.get("fin_market_price")!;
      const result = parseResult(
        await tool.execute("call-err-1", {
          symbol: "BTC/USDT",
        }),
      ) as Record<string, unknown>;

      expect(result.error).toContain("No exchanges configured");
      expect(result.error).toContain("openfinclaw exchange add");
    });

    it("returns error when fin-core not loaded", async () => {
      const { api, tools: noRegistryTools } = createFakeApi(null);
      finMarketDataPlugin.register(api);

      const tool = noRegistryTools.get("fin_market_price")!;
      const result = parseResult(
        await tool.execute("call-err-2", {
          symbol: "BTC/USDT",
        }),
      ) as Record<string, unknown>;

      expect(result.error).toContain("exchange registry unavailable");
    });

    it("returns error for unknown exchange id", async () => {
      const tool = tools.get("fin_market_price")!;
      const result = parseResult(
        await tool.execute("call-err-3", {
          symbol: "BTC/USDT",
          exchange: "nonexistent",
        }),
      ) as Record<string, unknown>;

      expect(result.error).toContain("nonexistent");
    });
  });
});
