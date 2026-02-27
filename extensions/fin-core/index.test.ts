import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
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
});
