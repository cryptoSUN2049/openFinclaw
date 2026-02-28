import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "./index.js";

type RouteHandler = (
  req: unknown,
  res: {
    writeHead: (statusCode: number, headers: Record<string, string>) => void;
    end: (body: string) => void;
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

function createStrategyRecord(id: string) {
  const now = Date.now();
  return {
    id,
    name: `strategy-${id}`,
    version: "1.0.0",
    level: "L2_PAPER",
    definition: {
      id,
      name: `strategy-${id}`,
      version: "1.0.0",
      markets: ["crypto"],
      symbols: ["BTC/USDT"],
      timeframes: ["1d"],
      parameters: {},
      onBar: async () => null,
    },
    createdAt: now - 86_400_000 * 60,
    updatedAt: now,
    lastBacktest: {
      strategyId: id,
      startDate: now - 86_400_000 * 365,
      endDate: now,
      initialCapital: 10_000,
      finalEquity: 16_000,
      totalReturn: 60,
      sharpe: 1.4,
      sortino: 1.8,
      maxDrawdown: -12,
      calmar: 5.0,
      winRate: 0.56,
      profitFactor: 1.5,
      totalTrades: 120,
      trades: [],
      equityCurve: [],
      dailyReturns: [],
    },
    lastWalkForward: {
      passed: true,
      windows: [],
      combinedTestSharpe: 1.1,
      avgTrainSharpe: 1.4,
      ratio: 0.78,
      threshold: 0.6,
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
    disconnect() {
      for (const cb of listeners["close"] ?? []) cb();
    },
  };
}

describe("fin-fund-manager plugin routes", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "fin-fund-plugin-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("registers dashboard and API routes and returns valid JSON", async () => {
    const routes = new Map<string, RouteHandler>();
    const services = new Map<string, unknown>();
    const strategies = [createStrategyRecord("s1"), createStrategyRecord("s2")];

    const api = {
      id: "fin-fund-manager",
      name: "Fund Manager",
      source: "test",
      config: {
        financial: {
          fund: {
            totalCapital: 120000,
          },
        },
      },
      pluginConfig: {},
      runtime: {
        version: "test",
        services: new Map<string, unknown>([
          [
            "fin-strategy-registry",
            {
              list: vi.fn(() => strategies),
              get: vi.fn((id: string) => strategies.find((entry) => entry.id === id)),
              updateLevel: vi.fn(),
            },
          ],
        ]),
      },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      registerTool() {},
      registerHook() {},
      registerHttpHandler() {},
      registerHttpRoute(entry: { path: string; handler: RouteHandler }) {
        routes.set(entry.path, entry.handler);
      },
      registerChannel() {},
      registerGatewayMethod() {},
      registerCli() {},
      registerService(svc: { id: string; instance: unknown }) {
        services.set(svc.id, svc.instance);
      },
      registerProvider() {},
      registerCommand() {},
      resolvePath: (input: string) => join(tempDir, input),
      on() {},
    } as unknown as OpenClawPluginApi;

    plugin.register(api);

    expect(routes.has("/dashboard/fund")).toBe(true);
    expect(routes.has("/api/v1/fund/status")).toBe(true);
    expect(routes.has("/api/v1/fund/leaderboard")).toBe(true);
    expect(routes.has("/api/v1/fund/risk")).toBe(true);
    expect(routes.has("/api/v1/fund/allocations")).toBe(true);
    expect(services.has("fin-fund-manager")).toBe(true);

    const statusRes = createResponseRecorder();
    await routes.get("/api/v1/fund/status")?.({}, statusRes.res);
    const status = statusRes.read();
    expect(status.statusCode).toBe(200);
    expect(status.headers["Content-Type"]).toBe("application/json");
    const statusPayload = JSON.parse(status.body) as Record<string, unknown>;
    expect(statusPayload).toMatchObject({
      totalEquity: 120000,
      allocationCount: 0,
    });
    expect(statusPayload.byLevel).toMatchObject({
      L2_PAPER: 2,
    });

    const leaderboardRes = createResponseRecorder();
    await routes.get("/api/v1/fund/leaderboard")?.({}, leaderboardRes.res);
    const leaderboard = JSON.parse(leaderboardRes.read().body) as { total: number };
    expect(leaderboard.total).toBe(2);
  });

  it("renders dashboard route as html or json fallback", async () => {
    const routes = new Map<string, RouteHandler>();
    const api = {
      id: "fin-fund-manager",
      name: "Fund Manager",
      source: "test",
      config: {},
      pluginConfig: {},
      runtime: { version: "test", services: new Map<string, unknown>() },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      registerTool() {},
      registerHook() {},
      registerHttpHandler() {},
      registerHttpRoute(entry: { path: string; handler: RouteHandler }) {
        routes.set(entry.path, entry.handler);
      },
      registerChannel() {},
      registerGatewayMethod() {},
      registerCli() {},
      registerService() {},
      registerProvider() {},
      registerCommand() {},
      resolvePath: (input: string) => join(tempDir, input),
      on() {},
    } as unknown as OpenClawPluginApi;

    plugin.register(api);

    const dashboard = routes.get("/dashboard/fund");
    expect(dashboard).toBeDefined();
    const recorder = createResponseRecorder();
    await dashboard?.({}, recorder.res);
    const output = recorder.read();
    const contentType = output.headers["Content-Type"] ?? "";
    expect(output.statusCode).toBe(200);
    expect(contentType).toMatch(/text\/html|application\/json/);
    if (contentType.includes("text/html")) {
      expect(output.body).toContain("FinClaw Fund Dashboard");
    } else {
      const payload = JSON.parse(output.body) as Record<string, unknown>;
      expect(payload.status).toBeDefined();
    }
  });

  it("registers SSE endpoint at /api/v1/fund/stream", () => {
    const routes = new Map<string, RouteHandler>();
    const api = {
      id: "fin-fund-manager",
      name: "Fund Manager",
      source: "test",
      config: {},
      pluginConfig: {},
      runtime: { version: "test", services: new Map<string, unknown>() },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      registerTool() {},
      registerHook() {},
      registerHttpHandler() {},
      registerHttpRoute(entry: { path: string; handler: RouteHandler }) {
        routes.set(entry.path, entry.handler);
      },
      registerChannel() {},
      registerGatewayMethod() {},
      registerCli() {},
      registerService() {},
      registerProvider() {},
      registerCommand() {},
      resolvePath: (input: string) => join(tempDir, input),
      on() {},
    } as unknown as OpenClawPluginApi;

    plugin.register(api);
    expect(routes.has("/api/v1/fund/stream")).toBe(true);
  });
});

describe("fin-fund-manager SSE", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "fin-fund-sse-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function createApi() {
    const routes = new Map<
      string,
      // biome-ignore lint: SSE handlers need broader typing
      RouteHandler | ((...args: any[]) => any)
    >();
    const services = new Map<string, unknown>();
    const strategies = [createStrategyRecord("s1"), createStrategyRecord("s2")];

    const api = {
      id: "fin-fund-manager",
      name: "Fund Manager",
      source: "test",
      config: {
        financial: {
          fund: { totalCapital: 120000 },
        },
      },
      pluginConfig: {},
      runtime: {
        version: "test",
        services: new Map<string, unknown>([
          [
            "fin-strategy-registry",
            {
              list: vi.fn(() => strategies),
              get: vi.fn((id: string) => strategies.find((entry) => entry.id === id)),
              updateLevel: vi.fn(),
            },
          ],
        ]),
      },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      registerTool() {},
      registerHook() {},
      registerHttpHandler() {},
      // biome-ignore lint: SSE handlers need broader typing
      registerHttpRoute(entry: { path: string; handler: (...args: any[]) => any }) {
        routes.set(entry.path, entry.handler);
      },
      registerChannel() {},
      registerGatewayMethod() {},
      registerCli() {},
      registerService(svc: { id: string; instance: unknown }) {
        services.set(svc.id, svc.instance);
      },
      registerProvider() {},
      registerCommand() {},
      resolvePath: (input: string) => join(tempDir, input),
      on() {},
    } as unknown as OpenClawPluginApi;

    plugin.register(api);
    return { api, routes, services };
  }

  it("SSE sets correct headers", async () => {
    const { routes } = createApi();
    const stream = createStreamRecorder();
    const { req } = createMockReq();
    // biome-ignore lint: SSE handler type
    await (routes.get("/api/v1/fund/stream") as any)?.(req, stream.res);
    const output = stream.read();
    expect(output.statusCode).toBe(200);
    expect(output.headers["Content-Type"]).toBe("text/event-stream");
    expect(output.headers["Cache-Control"]).toBe("no-cache");
    expect(output.headers["Connection"]).toBe("keep-alive");
  });

  it("SSE sends initial fund data immediately", async () => {
    const { routes } = createApi();
    const stream = createStreamRecorder();
    const { req } = createMockReq();
    // biome-ignore lint: SSE handler type
    await (routes.get("/api/v1/fund/stream") as any)?.(req, stream.res);
    expect(stream.read().chunks.length).toBe(1);
    const payload = JSON.parse(stream.read().chunks[0]!.replace("data: ", "").trim());
    expect(payload).toHaveProperty("status");
    expect(payload).toHaveProperty("leaderboard");
    expect(payload).toHaveProperty("allocations");
    expect(payload).toHaveProperty("risk");
  });

  it("SSE pushes at 10s interval", async () => {
    vi.useFakeTimers();
    const { routes } = createApi();
    const stream = createStreamRecorder();
    const { req } = createMockReq();
    // biome-ignore lint: SSE handler type
    await (routes.get("/api/v1/fund/stream") as any)?.(req, stream.res);
    expect(stream.read().chunks.length).toBe(1);
    vi.advanceTimersByTime(10_000);
    expect(stream.read().chunks.length).toBe(2);
    vi.useRealTimers();
  });

  it("SSE cleans up on disconnect", async () => {
    vi.useFakeTimers();
    const { routes } = createApi();
    const stream = createStreamRecorder();
    const { req, disconnect } = createMockReq();
    // biome-ignore lint: SSE handler type
    await (routes.get("/api/v1/fund/stream") as any)?.(req, stream.res);
    disconnect();
    vi.advanceTimersByTime(30_000);
    expect(stream.read().chunks.length).toBe(1);
    vi.useRealTimers();
  });
});
