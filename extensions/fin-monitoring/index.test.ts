import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "./index.js";

type Tool = {
  execute: (id: string, params: Record<string, unknown>) => Promise<unknown>;
};

type Service = {
  id: string;
  start: () => void;
  stop?: () => void;
  instance?: unknown;
};

function parseResult(result: unknown): Record<string, unknown> {
  const text = (result as { content: Array<{ text: string }> }).content[0]!.text;
  return JSON.parse(text) as Record<string, unknown>;
}

function createFakeApi(options?: {
  withDataProvider?: boolean;
  pluginConfig?: Record<string, unknown>;
}): {
  api: OpenClawPluginApi;
  tools: Map<string, Tool>;
  services: Map<string, Service>;
  dataProvider: { getTicker: ReturnType<typeof vi.fn> };
  logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
} {
  const tools = new Map<string, Tool>();
  const services = new Map<string, Service>();
  const runtimeServices = new Map<string, unknown>();
  const dataProvider = {
    getTicker: vi.fn(),
  };
  if (options?.withDataProvider !== false) {
    runtimeServices.set("fin-data-provider", dataProvider);
  }

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
  };

  const api = {
    id: "fin-monitoring",
    name: "Financial Monitoring",
    source: "test",
    config: {},
    pluginConfig: options?.pluginConfig ?? {},
    runtime: {
      version: "test",
      services: runtimeServices,
    },
    logger: { ...logger, error() {}, debug() {} },
    registerTool(tool: { name: string; execute: Tool["execute"] }) {
      tools.set(tool.name, tool);
    },
    registerService(svc: Service) {
      services.set(svc.id, svc);
      runtimeServices.set(svc.id, svc.instance ?? svc);
    },
    registerHook() {},
    registerHttpHandler() {},
    registerHttpRoute() {},
    registerChannel() {},
    registerGatewayMethod() {},
    registerCli() {},
    registerProvider() {},
    registerCommand() {},
    resolvePath: (p: string) => p,
    on() {},
  } as unknown as OpenClawPluginApi;

  return { api, tools, services, dataProvider, logger };
}

describe("fin-monitoring plugin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("registers tools and services", () => {
    const { api, tools, services } = createFakeApi();
    plugin.register(api);

    expect(services.has("fin-alert-engine")).toBe(true);
    expect(services.has("fin-monitoring-scheduler")).toBe(true);
    expect(tools.has("fin_set_alert")).toBe(true);
    expect(tools.has("fin_list_alerts")).toBe(true);
    expect(tools.has("fin_remove_alert")).toBe(true);
    expect(tools.has("fin_monitor_run_checks")).toBe(true);
  });

  it("runs alert lifecycle and triggers via manual checks", async () => {
    const { api, tools, dataProvider } = createFakeApi();
    plugin.register(api);
    dataProvider.getTicker.mockResolvedValue({ last: 101 });

    const setResult = parseResult(
      await tools.get("fin_set_alert")!.execute("call-1", {
        kind: "price_above",
        symbol: "BTC/USDT",
        price: 100,
      }),
    );
    expect(setResult.status).toBe("active");

    const listBefore = parseResult(await tools.get("fin_list_alerts")!.execute("call-2", {}));
    expect(listBefore.total).toBe(1);
    expect(listBefore.active).toBe(1);

    const run = parseResult(await tools.get("fin_monitor_run_checks")!.execute("call-3", {}));
    expect(run.checkedAlerts).toBe(1);
    expect(run.checkedSymbols).toBe(1);
    expect(run.triggeredCount).toBe(1);

    const listAfter = parseResult(await tools.get("fin_list_alerts")!.execute("call-4", {}));
    expect(listAfter.triggered).toBe(1);

    const alertId = (setResult.id as string) ?? "";
    const remove = parseResult(
      await tools.get("fin_remove_alert")!.execute("call-5", {
        id: alertId,
      }),
    );
    expect(remove.removed).toBe(true);
  });

  it("returns actionable error when data provider is unavailable", async () => {
    const { api, tools } = createFakeApi({ withDataProvider: false });
    plugin.register(api);

    await tools.get("fin_set_alert")!.execute("call-1", {
      kind: "price_above",
      symbol: "BTC/USDT",
      price: 120,
    });
    const run = parseResult(await tools.get("fin_monitor_run_checks")!.execute("call-2", {}));
    expect(String(run.error)).toContain("fin-data-provider service unavailable");
  });

  it("starts scheduler with polling and stops cleanly", async () => {
    vi.stubEnv("FIN_MONITORING_POLL_INTERVAL_MS", "10000");
    vi.stubEnv("FIN_MONITORING_RUN_ON_START", "0");
    const { api, services, dataProvider, logger } = createFakeApi();
    plugin.register(api);

    dataProvider.getTicker.mockResolvedValue({ last: 150 });
    await toolsSetupAlert(services);

    const scheduler = services.get("fin-monitoring-scheduler");
    expect(scheduler).toBeDefined();

    scheduler?.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(dataProvider.getTicker).toHaveBeenCalledTimes(3);

    scheduler?.stop?.();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(dataProvider.getTicker).toHaveBeenCalledTimes(3);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("can disable scheduler via env vars", async () => {
    vi.stubEnv("FIN_MONITORING_AUTO_EVALUATE", "0");
    vi.stubEnv("FIN_MONITORING_POLL_INTERVAL_MS", "10000");
    const { api, services, dataProvider } = createFakeApi();
    plugin.register(api);
    dataProvider.getTicker.mockResolvedValue({ last: 150 });
    await toolsSetupAlert(services);

    const scheduler = services.get("fin-monitoring-scheduler");
    scheduler?.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(dataProvider.getTicker).toHaveBeenCalledTimes(0);
  });
});

async function toolsSetupAlert(services: Map<string, Service>): Promise<void> {
  const engine = services.get("fin-alert-engine")?.instance as {
    addAlert: (
      condition:
        | { kind: "price_above"; symbol: string; price: number }
        | { kind: "price_below"; symbol: string; price: number },
    ) => string;
  };
  engine.addAlert({ kind: "price_above", symbol: "BTC/USDT", price: 999 });
}
