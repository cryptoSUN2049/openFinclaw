import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import finTradingPlugin from "./index.js";

// Mock ccxt-bridge to avoid real CCXT import
vi.mock("./src/ccxt-bridge.js", () => ({
  CcxtBridge: class MockCcxtBridge {
    constructor(public exchange: unknown) {}
    async placeOrder(params: Record<string, unknown>) {
      const ex = this.exchange as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return ex.createOrder(
        params.symbol,
        params.type,
        params.side,
        params.amount,
        params.price,
        params.params,
      );
    }
    async cancelOrder(id: string, symbol: string) {
      const ex = this.exchange as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return ex.cancelOrder(id, symbol);
    }
    async fetchPositions(symbol?: string) {
      const ex = this.exchange as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return ex.fetchPositions(symbol ? [symbol] : undefined);
    }
    async fetchBalance() {
      const ex = this.exchange as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return ex.fetchBalance();
    }
    async fetchTicker(symbol: string) {
      const ex = this.exchange as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return ex.fetchTicker(symbol);
    }
    async fetchOrder(orderId: string, symbol: string) {
      const ex = this.exchange as Record<string, (...args: unknown[]) => Promise<unknown>>;
      return ex.fetchOrder(orderId, symbol);
    }
  },
}));

function createMockExchange() {
  return {
    createOrder: vi.fn(),
    cancelOrder: vi.fn(),
    fetchPositions: vi.fn(),
    fetchBalance: vi.fn(),
    fetchTicker: vi.fn(),
    fetchOrder: vi.fn(),
  };
}

function createMockRiskController(
  overrides: Partial<{
    enabled: boolean;
    tier: "auto" | "confirm" | "reject";
    reason?: string;
  }> = {},
) {
  return {
    evaluate: vi.fn(() => ({
      tier: overrides.tier ?? "auto",
      reason: overrides.reason,
    })),
    recordLoss: vi.fn(),
  };
}

function createFakeApi(
  exchangeInstance: ReturnType<typeof createMockExchange>,
  riskController?: ReturnType<typeof createMockRiskController>,
) {
  const tools = new Map<
    string,
    { execute: (id: string, params: Record<string, unknown>) => Promise<unknown> }
  >();
  const services = new Map<string, unknown>();

  services.set("fin-exchange-registry", {
    getInstance: vi.fn(async () => exchangeInstance),
    listExchanges: vi.fn(() => [{ id: "test-ex", exchange: "binance", testnet: false }]),
  });

  if (riskController) {
    services.set("fin-risk-controller", riskController);
  }

  const api = {
    id: "fin-trading",
    name: "Trading",
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

function parseResult(result: unknown): Record<string, unknown> {
  const res = result as { content: Array<{ text: string }> };
  return JSON.parse(res.content[0]!.text);
}

describe("fin-trading plugin — risk control", () => {
  let mockExchange: ReturnType<typeof createMockExchange>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExchange = createMockExchange();
    mockExchange.fetchOrder.mockResolvedValue({ side: "buy", type: "limit" });
  });

  describe("fin_place_order with risk controller", () => {
    it("auto-executes when risk tier is auto", async () => {
      const riskCtrl = createMockRiskController({ tier: "auto" });
      const { api, tools } = createFakeApi(mockExchange, riskCtrl);
      finTradingPlugin.register(api);

      mockExchange.fetchTicker.mockResolvedValue({ last: 67500 });
      mockExchange.createOrder.mockResolvedValue({
        id: "order-123",
        symbol: "BTC/USDT",
        status: "open",
      });

      const tool = tools.get("fin_place_order")!;
      const result = parseResult(
        await tool.execute("call-1", {
          exchange: "test-ex",
          symbol: "BTC/USDT",
          side: "buy",
          type: "market",
          amount: 0.001,
        }),
      );

      expect(result.success).toBe(true);
      expect(result.order).toBeDefined();
      expect(riskCtrl.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          exchange: "test-ex",
          symbol: "BTC/USDT",
          side: "buy",
          type: "market",
          amount: 0.001,
        }),
        67500 * 0.001, // estimated USD value
      );
    });

    it("returns confirmation prompt when risk tier is confirm", async () => {
      const riskCtrl = createMockRiskController({
        tier: "confirm",
        reason: "Trade value $5000 exceeds auto-trade limit ($500).",
      });
      const { api, tools } = createFakeApi(mockExchange, riskCtrl);
      finTradingPlugin.register(api);

      mockExchange.fetchTicker.mockResolvedValue({ last: 67500 });

      const tool = tools.get("fin_place_order")!;
      const result = parseResult(
        await tool.execute("call-2", {
          exchange: "test-ex",
          symbol: "BTC/USDT",
          side: "buy",
          type: "market",
          amount: 0.1,
        }),
      );

      expect(result.success).toBe(false);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.reason).toContain("exceeds auto-trade limit");
      // Should NOT have placed the order
      expect(mockExchange.createOrder).not.toHaveBeenCalled();
    });

    it("rejects order when risk tier is reject", async () => {
      const riskCtrl = createMockRiskController({
        tier: "reject",
        reason: "Daily loss limit reached.",
      });
      const { api, tools } = createFakeApi(mockExchange, riskCtrl);
      finTradingPlugin.register(api);

      mockExchange.fetchTicker.mockResolvedValue({ last: 67500 });

      const tool = tools.get("fin_place_order")!;
      const result = parseResult(
        await tool.execute("call-3", {
          exchange: "test-ex",
          symbol: "BTC/USDT",
          side: "buy",
          type: "market",
          amount: 1,
        }),
      );

      expect(result.success).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.reason).toContain("Daily loss limit");
      expect(mockExchange.createOrder).not.toHaveBeenCalled();
    });

    it("proceeds without risk check when no risk controller available", async () => {
      const { api, tools } = createFakeApi(mockExchange);
      finTradingPlugin.register(api);

      mockExchange.createOrder.mockResolvedValue({
        id: "order-456",
        status: "filled",
      });

      const tool = tools.get("fin_place_order")!;
      const result = parseResult(
        await tool.execute("call-4", {
          exchange: "test-ex",
          symbol: "BTC/USDT",
          side: "buy",
          type: "market",
          amount: 1,
        }),
      );

      expect(result.success).toBe(true);
      expect(mockExchange.createOrder).toHaveBeenCalled();
    });
  });

  describe("fin_modify_order with risk controller", () => {
    it("rejects modification when risk tier is reject", async () => {
      const riskCtrl = createMockRiskController({
        tier: "reject",
        reason: "Trade value too large.",
      });
      const { api, tools } = createFakeApi(mockExchange, riskCtrl);
      finTradingPlugin.register(api);

      mockExchange.fetchTicker.mockResolvedValue({ last: 67500 });

      const tool = tools.get("fin_modify_order")!;
      const result = parseResult(
        await tool.execute("call-5", {
          exchange: "test-ex",
          orderId: "order-123",
          symbol: "BTC/USDT",
          amount: 10,
        }),
      );

      expect(result.success).toBe(false);
      expect(result.rejected).toBe(true);
      expect(mockExchange.cancelOrder).not.toHaveBeenCalled();
    });

    it("preserves original side/type when replacing an order", async () => {
      const { api, tools } = createFakeApi(mockExchange);
      finTradingPlugin.register(api);

      mockExchange.fetchOrder.mockResolvedValue({ side: "sell", type: "limit" });
      mockExchange.cancelOrder.mockResolvedValue({ id: "order-123", status: "cancelled" });
      mockExchange.createOrder.mockResolvedValue({ id: "order-124", status: "open" });

      const tool = tools.get("fin_modify_order")!;
      const result = parseResult(
        await tool.execute("call-6", {
          exchange: "test-ex",
          orderId: "order-123",
          symbol: "BTC/USDT",
          amount: 2,
          price: 64000,
        }),
      );

      expect(result.success).toBe(true);
      expect(mockExchange.createOrder).toHaveBeenCalledWith(
        "BTC/USDT",
        "limit",
        "sell",
        2,
        64000,
        undefined,
      );
    });
  });

  describe("fin_cancel_order", () => {
    it("cancels an order successfully", async () => {
      const { api, tools } = createFakeApi(mockExchange);
      finTradingPlugin.register(api);

      mockExchange.cancelOrder.mockResolvedValue({ id: "order-123", status: "cancelled" });

      const tool = tools.get("fin_cancel_order")!;
      const result = parseResult(
        await tool.execute("call-7", {
          exchange: "test-ex",
          orderId: "order-123",
          symbol: "BTC/USDT",
        }),
      );

      expect(result.success).toBe(true);
    });
  });
});
