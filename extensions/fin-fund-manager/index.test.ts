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
});
