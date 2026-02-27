import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "./index.js";

type RouteHandler = (
  req: unknown,
  res: {
    writeHead: (statusCode: number, headers: Record<string, string>) => void;
    end: (body: string) => void;
    write?: (chunk: string) => boolean;
  },
) => Promise<void> | void;

function createResponseRecorder() {
  let statusCode = 0;
  let headers: Record<string, string> = {};
  let body = "";
  return {
    res: {
      writeHead(status: number, nextHeaders: Record<string, string>) {
        statusCode = status;
        headers = nextHeaders;
      },
      end(nextBody: string) {
        body = nextBody;
      },
    },
    read() {
      return { statusCode, headers, body };
    },
  };
}

/** Create a streaming response recorder (for SSE endpoints). */
function createStreamRecorder() {
  let statusCode = 0;
  let headers: Record<string, string> = {};
  const chunks: string[] = [];
  return {
    res: {
      writeHead(status: number, nextHeaders: Record<string, string>) {
        statusCode = status;
        headers = nextHeaders;
      },
      write(chunk: string) {
        chunks.push(chunk);
        return true;
      },
      end() {},
    },
    read() {
      return { statusCode, headers, chunks };
    },
  };
}

/** Create a mock request with `on("close", cb)` for SSE disconnect simulation. */
function createMockReq() {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    req: {
      on(event: string, cb: () => void) {
        listeners[event] = listeners[event] ?? [];
        listeners[event].push(cb);
      },
    },
    /** Simulate client disconnect. */
    disconnect() {
      for (const cb of listeners["close"] ?? []) cb();
    },
  };
}

function createFakeApi(): {
  api: OpenClawPluginApi;
  services: Map<string, unknown>;
  routes: Map<string, RouteHandler>;
} {
  const services = new Map<string, unknown>();
  const routes = new Map<string, RouteHandler>();
  const api = {
    id: "fin-core",
    name: "Financial Core",
    source: "test",
    config: {
      financial: {
        exchanges: {
          "main-binance": {
            exchange: "binance",
            apiKey: "k",
            secret: "s",
            testnet: true,
          },
        },
        trading: {
          enabled: true,
          maxAutoTradeUsd: 220,
          confirmThresholdUsd: 900,
          maxDailyLossUsd: 1800,
          maxPositionPct: 35,
          maxLeverage: 2,
        },
      },
      plugins: {
        entries: {
          "fin-core": { enabled: true },
          "fin-data-bus": { enabled: true },
          "fin-monitoring": { enabled: false },
        },
      },
    },
    pluginConfig: {},
    runtime: { services, version: "test" },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    registerTool: vi.fn(),
    registerHook: vi.fn(),
    registerHttpHandler: vi.fn(),
    registerHttpRoute: vi.fn((entry: { path: string; handler: RouteHandler }) => {
      routes.set(entry.path, entry.handler);
    }),
    registerChannel: vi.fn(),
    registerGatewayMethod: vi.fn(),
    registerCli: vi.fn(),
    registerService: vi.fn((svc: { id: string; instance?: unknown }) => {
      services.set(svc.id, svc.instance ?? svc);
    }),
    registerProvider: vi.fn(),
    registerCommand: vi.fn(),
    resolvePath: (input: string) => input,
    on: vi.fn(),
  } as unknown as OpenClawPluginApi;

  return { api, services, routes };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Inject mock fin-* services into the runtime so gatherTradingData() can aggregate. */
function injectMockTradingServices(services: Map<string, unknown>) {
  const mockAccount = {
    id: "paper-1",
    name: "Test Account",
    initialCapital: 10000,
    cash: 5000,
    equity: 12500,
    positions: [
      {
        symbol: "BTC/USDT",
        side: "long",
        quantity: 0.5,
        entryPrice: 40000,
        currentPrice: 45000,
        unrealizedPnl: 2500,
      },
    ],
    orders: [
      {
        id: "o-1",
        symbol: "BTC/USDT",
        side: "buy",
        type: "market",
        quantity: 0.5,
        fillPrice: 40000,
        commission: 0.04,
        status: "filled",
        strategyId: "sma-1",
        createdAt: Date.now() - 3600_000,
        filledAt: Date.now() - 3600_000,
      },
    ],
  };

  services.set("fin-paper-engine", {
    listAccounts: () => [{ id: "paper-1", name: "Test Account", equity: 12500 }],
    getAccountState: (id: string) => (id === "paper-1" ? mockAccount : null),
    getSnapshots: () => [
      {
        timestamp: Date.now() - 86400_000,
        equity: 10000,
        cash: 10000,
        positionsValue: 0,
        dailyPnl: 0,
        dailyPnlPct: 0,
      },
      {
        timestamp: Date.now(),
        equity: 12500,
        cash: 5000,
        positionsValue: 7500,
        dailyPnl: 250,
        dailyPnlPct: 2.5,
      },
    ],
    getOrders: () => mockAccount.orders,
  });

  services.set("fin-strategy-registry", {
    list: () => [
      {
        id: "sma-1",
        name: "SMA Crossover",
        level: "L2_PAPER",
        lastBacktest: {
          totalReturn: 15.5,
          sharpe: 1.23,
          sortino: 1.8,
          maxDrawdown: 8.2,
          winRate: 55,
          profitFactor: 1.45,
          totalTrades: 42,
          finalEquity: 11550,
          initialCapital: 10000,
          strategyId: "sma-1",
        },
      },
    ],
  });

  services.set("fin-fund-manager", {
    getState: () => ({
      allocations: [{ strategyId: "sma-1", capitalUsd: 8000, weightPct: 80 }],
      totalCapital: 10000,
    }),
  });
}

describe("fin-core plugin", () => {
  it("registers core services and preloads configured exchanges", () => {
    const { api, services } = createFakeApi();
    plugin.register(api);

    const registry = services.get("fin-exchange-registry") as {
      listExchanges: () => Array<{ id: string; exchange: string; testnet: boolean }>;
    };

    expect(registry).toBeDefined();
    expect(registry.listExchanges()).toEqual([
      {
        id: "main-binance",
        exchange: "binance",
        testnet: true,
      },
    ]);
    expect(services.has("fin-risk-controller")).toBe(true);
  });

  it("serves finance config API with sanitized payload", async () => {
    const { api, routes } = createFakeApi();
    plugin.register(api);

    const route = routes.get("/api/v1/finance/config");
    expect(route).toBeDefined();

    const recorder = createResponseRecorder();
    await route?.({}, recorder.res);
    const output = recorder.read();

    expect(output.statusCode).toBe(200);
    expect(output.headers["Content-Type"]).toBe("application/json");
    const payload = JSON.parse(output.body) as Record<string, unknown>;
    expect(payload).toMatchObject({
      exchanges: [
        {
          id: "main-binance",
          exchange: "binance",
          testnet: true,
        },
      ],
      trading: {
        enabled: true,
        maxAutoTradeUsd: 220,
        confirmThresholdUsd: 900,
        maxDailyLossUsd: 1800,
        maxPositionPct: 35,
        maxLeverage: 2,
      },
    });

    const plugins = payload.plugins as { total: number; enabled: number; entries: unknown[] };
    expect(plugins.total).toBeGreaterThan(0);
    expect(plugins.enabled).toBeGreaterThan(0);
    expect(plugins.entries.length).toBeGreaterThan(0);
  });

  it("renders finance dashboard route", async () => {
    const { api, routes } = createFakeApi();
    plugin.register(api);

    const route = routes.get("/dashboard/finance");
    expect(route).toBeDefined();

    const recorder = createResponseRecorder();
    await route?.({}, recorder.res);
    const output = recorder.read();

    expect(output.statusCode).toBe(200);
    expect(output.headers["Content-Type"]).toContain("text/html");
    expect(output.body).toContain("Finance Dashboard");
    expect(output.body).toContain("Finance Plugin Matrix");
  });

  // ── SSE Endpoint Tests ──

  it("SSE endpoint sets correct response headers", async () => {
    const { api, routes } = createFakeApi();
    plugin.register(api);

    const route = routes.get("/api/v1/finance/trading/stream");
    expect(route).toBeDefined();

    const stream = createStreamRecorder();
    const { req } = createMockReq();
    await route?.(req, stream.res);

    const output = stream.read();
    expect(output.statusCode).toBe(200);
    expect(output.headers["Content-Type"]).toBe("text/event-stream");
    expect(output.headers["Cache-Control"]).toBe("no-cache");
    expect(output.headers["Connection"]).toBe("keep-alive");
  });

  it("SSE endpoint sends initial data immediately on connection", async () => {
    const { api, routes } = createFakeApi();
    plugin.register(api);

    const route = routes.get("/api/v1/finance/trading/stream");
    const stream = createStreamRecorder();
    const { req } = createMockReq();
    await route?.(req, stream.res);

    const output = stream.read();
    // Should have at least one chunk (the immediate push)
    expect(output.chunks.length).toBeGreaterThanOrEqual(1);

    // First chunk must be SSE-formatted
    const first = output.chunks[0]!;
    expect(first).toMatch(/^data: \{.*\}\n\n$/);

    // Parse the JSON payload
    const payload = JSON.parse(first.replace("data: ", "").trim());
    expect(payload).toHaveProperty("summary");
    expect(payload).toHaveProperty("positions");
    expect(payload).toHaveProperty("orders");
    expect(payload).toHaveProperty("snapshots");
    expect(payload).toHaveProperty("strategies");
    expect(payload).toHaveProperty("backtests");
    expect(payload).toHaveProperty("allocations");
  });

  it("SSE endpoint pushes periodic updates via setInterval", async () => {
    vi.useFakeTimers();

    const { api, routes } = createFakeApi();
    plugin.register(api);

    const route = routes.get("/api/v1/finance/trading/stream");
    const stream = createStreamRecorder();
    const { req } = createMockReq();
    await route?.(req, stream.res);

    // After initial push, advance 10 seconds
    expect(stream.read().chunks.length).toBe(1);

    vi.advanceTimersByTime(10_000);
    expect(stream.read().chunks.length).toBe(2);

    vi.advanceTimersByTime(10_000);
    expect(stream.read().chunks.length).toBe(3);

    // All chunks are valid SSE data frames
    for (const chunk of stream.read().chunks) {
      expect(chunk).toMatch(/^data: \{.*\}\n\n$/);
    }

    vi.useRealTimers();
  });

  it("SSE endpoint cleans up interval on client disconnect", async () => {
    vi.useFakeTimers();

    const { api, routes } = createFakeApi();
    plugin.register(api);

    const route = routes.get("/api/v1/finance/trading/stream");
    const stream = createStreamRecorder();
    const { req, disconnect } = createMockReq();
    await route?.(req, stream.res);

    expect(stream.read().chunks.length).toBe(1);

    // Simulate client disconnect
    disconnect();

    // After disconnect, advancing timers should NOT produce new chunks
    vi.advanceTimersByTime(30_000);
    expect(stream.read().chunks.length).toBe(1);

    vi.useRealTimers();
  });

  // ── Trading Data Aggregation Tests ──

  it("gatherTradingData() aggregates data from paper engine, strategy registry, and fund manager", async () => {
    const { api, services, routes } = createFakeApi();
    plugin.register(api);
    injectMockTradingServices(services);

    // Call the REST endpoint which uses gatherTradingData()
    const route = routes.get("/api/v1/finance/trading");
    expect(route).toBeDefined();

    const recorder = createResponseRecorder();
    await route?.({}, recorder.res);
    const output = recorder.read();

    expect(output.statusCode).toBe(200);
    const data = JSON.parse(output.body) as Record<string, unknown>;

    // Summary
    const summary = data.summary as Record<string, unknown>;
    expect(summary.totalEquity).toBe(12500);
    expect(summary.positionCount).toBe(1);
    expect(summary.strategyCount).toBe(1);
    expect(summary.avgSharpe).toBeCloseTo(1.23, 2);

    // Positions
    const positions = data.positions as Array<Record<string, unknown>>;
    expect(positions).toHaveLength(1);
    expect(positions[0]!.symbol).toBe("BTC/USDT");
    expect(positions[0]!.unrealizedPnl).toBe(2500);

    // Orders
    const orders = data.orders as Array<Record<string, unknown>>;
    expect(orders).toHaveLength(1);
    expect(orders[0]!.status).toBe("filled");

    // Snapshots sorted by timestamp
    const snapshots = data.snapshots as Array<Record<string, unknown>>;
    expect(snapshots).toHaveLength(2);
    expect((snapshots[0] as { timestamp: number }).timestamp).toBeLessThan(
      (snapshots[1] as { timestamp: number }).timestamp,
    );

    // Strategies
    const strategies = data.strategies as Array<Record<string, unknown>>;
    expect(strategies).toHaveLength(1);
    expect(strategies[0]!.name).toBe("SMA Crossover");
    expect(strategies[0]!.sharpe).toBe(1.23);

    // Allocations
    const alloc = data.allocations as Record<string, unknown>;
    expect(alloc.totalAllocated).toBe(8000);
    expect(alloc.cashReserve).toBe(2000);
    expect(alloc.totalCapital).toBe(10000);
  });

  it("gatherTradingData() returns safe defaults when no services are available", async () => {
    const { api, routes } = createFakeApi();
    plugin.register(api);
    // Don't inject any mock services — simulates fresh startup

    const route = routes.get("/api/v1/finance/trading");
    const recorder = createResponseRecorder();
    await route?.({}, recorder.res);
    const data = JSON.parse(recorder.read().body) as Record<string, unknown>;

    const summary = data.summary as Record<string, unknown>;
    expect(summary.totalEquity).toBe(0);
    expect(summary.positionCount).toBe(0);
    expect(summary.strategyCount).toBe(0);
    expect(data.positions).toEqual([]);
    expect(data.orders).toEqual([]);
  });

  // ── SSE with Real Trading Data ──

  it("SSE endpoint includes aggregated trading data from mock services", async () => {
    const { api, services, routes } = createFakeApi();
    plugin.register(api);
    injectMockTradingServices(services);

    const route = routes.get("/api/v1/finance/trading/stream");
    const stream = createStreamRecorder();
    const { req } = createMockReq();
    await route?.(req, stream.res);

    const first = stream.read().chunks[0]!;
    const payload = JSON.parse(first.replace("data: ", "").trim()) as Record<string, unknown>;
    const summary = payload.summary as Record<string, unknown>;

    expect(summary.totalEquity).toBe(12500);
    expect(summary.positionCount).toBe(1);
    expect((payload.strategies as unknown[]).length).toBe(1);
  });

  // ── Trading Dashboard Route Tests ──

  it("trading dashboard route serves HTML with CSS and data injected", async () => {
    const { api, services, routes } = createFakeApi();
    plugin.register(api);
    injectMockTradingServices(services);

    const route = routes.get("/dashboard/trading");
    expect(route).toBeDefined();

    const recorder = createResponseRecorder();
    await route?.({}, recorder.res);
    const output = recorder.read();

    expect(output.statusCode).toBe(200);
    expect(output.headers["Content-Type"]).toContain("text/html");

    // HTML contains key structural elements
    expect(output.body).toContain("OpenFinClaw Trading Dashboard");
    expect(output.body).toContain("updateDashboard");
    expect(output.body).toContain("EventSource");
    expect(output.body).toContain("/api/v1/finance/trading/stream");

    // CSS is injected (the placeholder is replaced)
    expect(output.body).not.toContain("/*__TRADING_CSS__*/");

    // Data is injected (the placeholder is replaced with real JSON)
    expect(output.body).not.toContain("/*__TRADING_DATA__*/{}");
    expect(output.body).toContain('"totalEquity"');
  });

  it("trading dashboard HTML contains all 7 panels", async () => {
    const { api, routes } = createFakeApi();
    plugin.register(api);

    const route = routes.get("/dashboard/trading");
    const recorder = createResponseRecorder();
    await route?.({}, recorder.res);
    const html = recorder.read().body;

    // Panel 1: Hero
    expect(html).toContain('id="hero-equity"');
    expect(html).toContain('id="hero-pnl"');
    expect(html).toContain('id="hero-positions"');
    expect(html).toContain('id="hero-sharpe"');

    // Panel 2: Equity chart
    expect(html).toContain('id="equity-chart"');

    // Panel 3: Allocation chart
    expect(html).toContain('id="alloc-chart"');

    // Panel 4: Positions table
    expect(html).toContain('id="positions-table"');

    // Panel 5: Strategy cards
    expect(html).toContain('id="strategy-grid"');

    // Panel 6: Orders table
    expect(html).toContain('id="orders-table"');

    // Panel 7: Backtest table
    expect(html).toContain('id="backtest-table"');
  });

  it("trading dashboard JS has SSE with fetch polling fallback", async () => {
    const { api, routes } = createFakeApi();
    plugin.register(api);

    const route = routes.get("/dashboard/trading");
    const recorder = createResponseRecorder();
    await route?.({}, recorder.res);
    const html = recorder.read().body;

    // SSE connection logic
    expect(html).toContain("startSSE");
    expect(html).toContain("EventSource");
    expect(html).toContain("es.onmessage");
    expect(html).toContain("es.onerror");

    // Polling fallback
    expect(html).toContain("startPolling");
    expect(html).toContain('fetch("/api/v1/finance/trading")');

    // Chart persistence (update without recreation)
    expect(html).toContain('equityChart.update("none")');
    expect(html).toContain('allocChart.update("none")');

    // NOT the old reload pattern
    expect(html).not.toContain("location.reload");
  });

  // ── Finance Dashboard HTML Validation ──

  it("finance dashboard has CSS injection placeholder and renders config data", async () => {
    const { api, routes } = createFakeApi();
    plugin.register(api);

    const route = routes.get("/dashboard/finance");
    const recorder = createResponseRecorder();
    await route?.({}, recorder.res);
    const html = recorder.read().body;

    // CSS injected (placeholder replaced)
    expect(html).not.toContain("/*__FINANCE_CSS__*/");

    // Data injected
    expect(html).not.toContain("/*__FINANCE_DATA__*/{}");

    // Key sections present
    expect(html).toContain("renderSummary");
    expect(html).toContain("renderTrading");
    expect(html).toContain("renderExchanges");
    expect(html).toContain("renderPlugins");
  });

  // ── Route Registration Completeness ──

  it("registers all expected HTTP routes", () => {
    const { api, routes } = createFakeApi();
    plugin.register(api);

    const expectedRoutes = [
      "/api/v1/finance/config",
      "/api/v1/finance/trading",
      "/api/v1/finance/trading/stream",
      "/dashboard/finance",
      "/dashboard/trading",
    ];

    for (const path of expectedRoutes) {
      expect(routes.has(path), `route ${path} should be registered`).toBe(true);
    }
  });
});
