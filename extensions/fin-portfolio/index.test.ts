import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import finPortfolioPlugin from "./index.js";

function createMockExchange() {
  return {
    fetchBalance: vi.fn(),
    fetchPositions: vi.fn(),
    fetchClosedOrders: vi.fn(),
    fetchTicker: vi.fn(),
  };
}

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

function createFakeApi(registry: ReturnType<typeof createMockRegistry> | null) {
  const tools = new Map<
    string,
    { execute: (id: string, params: Record<string, unknown>) => Promise<unknown> }
  >();
  const services = new Map<string, unknown>();
  if (registry) {
    services.set("fin-exchange-registry", registry);
  }

  const api = {
    id: "fin-portfolio",
    name: "Portfolio",
    source: "test",
    config: {},
    pluginConfig: {},
    runtime: { version: "test", services },
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

describe("fin-portfolio plugin", () => {
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
    finPortfolioPlugin.register(api);
  });

  describe("fin_exchange_balance", () => {
    it("returns balances for a specific exchange", async () => {
      mockExchange.fetchBalance.mockResolvedValue({
        total: { BTC: 1.5, USDT: 25000, ETH: 10, DOGE: 0 },
        free: { BTC: 1.0, USDT: 20000, ETH: 8, DOGE: 0 },
        used: { BTC: 0.5, USDT: 5000, ETH: 2, DOGE: 0 },
      });

      const tool = tools.get("fin_exchange_balance")!;
      const result = parseResult(
        await tool.execute("call-1", { exchange: "test-binance" }),
      ) as Record<string, unknown>;

      expect(result.exchange).toBe("test-binance");
      expect(result.totalStablecoinUsd).toBe(25000);

      const balances = result.balances as Array<Record<string, unknown>>;
      // DOGE with 0 balance should be filtered out
      expect(balances.length).toBe(3);
      // Should be sorted by total descending
      expect(balances[0]).toMatchObject({ currency: "USDT", total: 25000 });
    });

    it("handles exchange with no balances", async () => {
      mockExchange.fetchBalance.mockResolvedValue({
        total: {},
        free: {},
        used: {},
      });

      const tool = tools.get("fin_exchange_balance")!;
      const result = parseResult(
        await tool.execute("call-2", { exchange: "test-binance" }),
      ) as Record<string, unknown>;

      expect((result.balances as unknown[]).length).toBe(0);
      expect(result.totalStablecoinUsd).toBe(0);
    });

    it("returns error on auth failure", async () => {
      mockExchange.fetchBalance.mockRejectedValue(new Error("AuthenticationError"));

      const tool = tools.get("fin_exchange_balance")!;
      const result = parseResult(
        await tool.execute("call-3", { exchange: "test-binance" }),
      ) as Record<string, unknown>;

      expect(result.error).toContain("AuthenticationError");
    });
  });

  describe("fin_portfolio_view", () => {
    it("aggregates balances across all exchanges", async () => {
      const registry2 = createMockRegistry([
        { id: "binance-main", exchange: "binance", testnet: false },
        { id: "okx-main", exchange: "okx", testnet: false },
      ]);
      const { api, tools: t2 } = createFakeApi(registry2);
      finPortfolioPlugin.register(api);

      const binance = registry2._instances.get("binance-main")!;
      const okx = registry2._instances.get("okx-main")!;

      binance.fetchBalance.mockResolvedValue({
        total: { BTC: 1.0, USDT: 10000 },
        free: { BTC: 1.0, USDT: 10000 },
        used: {},
      });
      okx.fetchBalance.mockResolvedValue({
        total: { ETH: 5, USDC: 5000 },
        free: { ETH: 5, USDC: 5000 },
        used: {},
      });

      const tool = t2.get("fin_portfolio_view")!;
      const result = parseResult(await tool.execute("call-4", {})) as Record<string, unknown>;

      expect(result.exchangeCount).toBe(2);
      expect(result.totalEstimateUsd).toBe(15000); // 10000 USDT + 5000 USDC

      const aggregated = result.aggregatedAssets as Array<Record<string, unknown>>;
      expect(aggregated.some((a) => a.currency === "BTC" && a.total === 1.0)).toBe(true);
      expect(aggregated.some((a) => a.currency === "ETH" && a.total === 5)).toBe(true);
    });

    it("continues when one exchange fails", async () => {
      const registry2 = createMockRegistry([
        { id: "binance-main", exchange: "binance", testnet: false },
        { id: "broken-ex", exchange: "okx", testnet: false },
      ]);
      const { api, tools: t2 } = createFakeApi(registry2);
      finPortfolioPlugin.register(api);

      registry2._instances.get("binance-main")!.fetchBalance.mockResolvedValue({
        total: { USDT: 5000 },
        free: { USDT: 5000 },
        used: {},
      });
      registry2._instances
        .get("broken-ex")!
        .fetchBalance.mockRejectedValue(new Error("Connection timeout"));

      const tool = t2.get("fin_portfolio_view")!;
      const result = parseResult(await tool.execute("call-5", {})) as Record<string, unknown>;

      // Should still return results from working exchange
      expect(result.totalEstimateUsd).toBe(5000);
      expect(result.exchangeCount).toBe(2);
    });
  });

  describe("fin_positions", () => {
    it("returns open positions", async () => {
      mockExchange.fetchPositions.mockResolvedValue([
        {
          symbol: "BTC/USDT",
          side: "long",
          contracts: 0.5,
          entryPrice: 65000,
          markPrice: 67500,
          unrealizedPnl: 1250,
          leverage: 3,
          liquidationPrice: 55000,
          marginMode: "cross",
          percentage: 5.77,
        },
        {
          symbol: "ETH/USDT",
          side: "short",
          contracts: 0,
          entryPrice: 3500,
          markPrice: 3400,
          unrealizedPnl: 0,
          leverage: 1,
          liquidationPrice: null,
          marginMode: "isolated",
          percentage: 0,
        },
      ]);

      const tool = tools.get("fin_positions")!;
      const result = parseResult(await tool.execute("call-6", {})) as Record<string, unknown>;

      // Should filter out zero-size positions
      expect(result.count).toBe(1);
      const positions = result.positions as Array<Record<string, unknown>>;
      expect(positions[0]).toMatchObject({
        symbol: "BTC/USDT",
        side: "long",
        contracts: 0.5,
        entryPrice: 65000,
        markPrice: 67500,
        unrealizedPnl: 1250,
      });
    });

    it("filters by symbol", async () => {
      mockExchange.fetchPositions.mockResolvedValue([]);

      const tool = tools.get("fin_positions")!;
      await tool.execute("call-7", { symbol: "BTC/USDT" });

      expect(mockExchange.fetchPositions).toHaveBeenCalledWith(["BTC/USDT"]);
    });

    it("filters by exchange", async () => {
      mockExchange.fetchPositions.mockResolvedValue([]);

      const tool = tools.get("fin_positions")!;
      const result = parseResult(
        await tool.execute("call-8", { exchange: "test-binance" }),
      ) as Record<string, unknown>;

      expect(result.exchange).toBe("test-binance");
      expect(registry.getInstance).toHaveBeenCalledWith("test-binance");
    });
  });

  describe("fin_order_history", () => {
    it("returns closed orders sorted by timestamp", async () => {
      mockExchange.fetchClosedOrders.mockResolvedValue([
        {
          id: "order-1",
          symbol: "BTC/USDT",
          side: "buy",
          type: "limit",
          amount: 0.1,
          price: 65000,
          cost: 6500,
          filled: 0.1,
          status: "closed",
          datetime: "2026-02-24T10:00:00Z",
        },
        {
          id: "order-2",
          symbol: "ETH/USDT",
          side: "sell",
          type: "market",
          amount: 2,
          average: 3400,
          cost: 6800,
          filled: 2,
          status: "closed",
          datetime: "2026-02-24T12:00:00Z",
        },
      ]);

      const tool = tools.get("fin_order_history")!;
      const result = parseResult(await tool.execute("call-9", {})) as Record<string, unknown>;

      expect(result.count).toBe(2);
      const orders = result.orders as Array<Record<string, unknown>>;
      // Sorted by timestamp descending — order-2 should be first
      expect(orders[0]!.orderId).toBe("order-2");
      expect(orders[1]!.orderId).toBe("order-1");
    });

    it("passes since parameter as milliseconds", async () => {
      mockExchange.fetchClosedOrders.mockResolvedValue([]);

      const tool = tools.get("fin_order_history")!;
      await tool.execute("call-10", {
        since: "2026-01-01T00:00:00Z",
        limit: 10,
      });

      expect(mockExchange.fetchClosedOrders).toHaveBeenCalledWith(
        undefined,
        new Date("2026-01-01T00:00:00Z").getTime(),
        10,
      );
    });

    it("respects limit parameter", async () => {
      const manyOrders = Array.from({ length: 100 }, (_, i) => ({
        id: `order-${i}`,
        symbol: "BTC/USDT",
        side: "buy",
        type: "limit",
        amount: 0.01,
        price: 65000,
        cost: 650,
        filled: 0.01,
        status: "closed",
        datetime: `2026-02-${String(24 - Math.floor(i / 10)).padStart(2, "0")}T${String(i % 10).padStart(2, "0")}:00:00Z`,
      }));
      mockExchange.fetchClosedOrders.mockResolvedValue(manyOrders);

      const tool = tools.get("fin_order_history")!;
      const result = parseResult(await tool.execute("call-11", { limit: 5 })) as Record<
        string,
        unknown
      >;

      expect((result.orders as unknown[]).length).toBe(5);
    });
  });

  describe("fin_portfolio_history", () => {
    it("returns current snapshot with placeholder note", async () => {
      mockExchange.fetchBalance.mockResolvedValue({
        total: { USDT: 10000, BTC: 0.5 },
        free: { USDT: 10000, BTC: 0.5 },
        used: {},
      });

      const tool = tools.get("fin_portfolio_history")!;
      const result = parseResult(await tool.execute("call-12", {})) as Record<string, unknown>;

      expect(result.period).toBe("1m");
      expect(result.currency).toBe("USD");
      const snapshot = result.currentSnapshot as Record<string, unknown>;
      expect(snapshot.estimateUsd).toBe(10000);
      expect(result.note).toContain("Historical snapshots require persistent storage");
    });
  });

  describe("error scenarios", () => {
    it("returns error when no exchanges configured", async () => {
      const emptyRegistry = createMockRegistry([]);
      const { api, tools: emptyTools } = createFakeApi(emptyRegistry);
      finPortfolioPlugin.register(api);

      const tool = emptyTools.get("fin_portfolio_view")!;
      const result = parseResult(await tool.execute("err-1", {})) as Record<string, unknown>;

      expect(result.error).toContain("No exchanges configured");
    });

    it("returns error when registry not available", async () => {
      const { api, tools: noRegTools } = createFakeApi(null);
      finPortfolioPlugin.register(api);

      const tool = noRegTools.get("fin_exchange_balance")!;
      const result = parseResult(await tool.execute("err-2", { exchange: "test" })) as Record<
        string,
        unknown
      >;

      expect(result.error).toContain("exchange registry unavailable");
    });
  });
});
