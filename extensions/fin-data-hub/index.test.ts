import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "./index.js";

type Tool = {
  execute: (id: string, params: Record<string, unknown>) => Promise<unknown>;
};

function parseResult(result: unknown): Record<string, unknown> {
  return JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text) as Record<
    string,
    unknown
  >;
}

function createFakeApi(pluginConfig: Record<string, unknown>): {
  api: OpenClawPluginApi;
  tools: Map<string, Tool>;
  services: Map<string, unknown>;
} {
  const tools = new Map<string, Tool>();
  const services = new Map<string, unknown>();
  const api = {
    id: "fin-data-hub",
    name: "openFinclaw-DataHub",
    source: "test",
    config: {},
    pluginConfig,
    runtime: { version: "test", services: new Map() },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    registerTool(tool: { name: string; execute: Tool["execute"] }) {
      tools.set(tool.name, tool);
    },
    registerHook() {},
    registerHttpHandler() {},
    registerHttpRoute() {},
    registerChannel() {},
    registerGatewayMethod() {},
    registerCli() {},
    registerService(svc: { id: string; instance: unknown }) {
      services.set(svc.id, svc.instance);
    },
    registerProvider() {},
    registerCommand() {},
    resolvePath: (p: string) => p,
    on() {},
  } as unknown as OpenClawPluginApi;

  return { api, tools, services };
}

describe("fin-data-hub plugin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("registers all 7 tools", () => {
    const { api, tools } = createFakeApi({});
    plugin.register(api);
    expect(tools.size).toBe(7);
    expect([...tools.keys()].sort()).toEqual([
      "fin_crypto",
      "fin_derivatives",
      "fin_index",
      "fin_macro",
      "fin_market",
      "fin_query",
      "fin_stock",
    ]);
  });

  it("returns stub output when no API key is set", async () => {
    vi.stubEnv("TUSHARE_PROXY_API_KEY", "");
    vi.stubEnv("FIN_DATA_HUB_API_KEY", "");

    const { api, tools } = createFakeApi({});
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_stock")!.execute("call-1", {
        symbol: "600519.SH",
        query_type: "quote",
      }),
    );
    expect(result.success).toBe(true);
    const inner = result.result as { data?: unknown[] };
    expect(inner.data).toBeDefined();
    expect((inner.data![0] as { _stub?: boolean })._stub).toBe(true);
  });

  it("returns stub output in explicit stub mode", async () => {
    const { api, tools } = createFakeApi({ mode: "stub" });
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_stock")!.execute("call-1b", {
        symbol: "600519.SH",
        query_type: "quote",
      }),
    );
    expect(result.success).toBe(true);
    const inner = result.result as { data?: unknown[] };
    expect((inner.data![0] as { _stub?: boolean })._stub).toBe(true);
  });

  it("validates required params — fin_stock", async () => {
    const { api, tools } = createFakeApi({});
    plugin.register(api);

    const result = parseResult(await tools.get("fin_stock")!.execute("call-3", {}));
    expect(String(result.error)).toContain("required");
  });

  it("validates required params — fin_query", async () => {
    const { api, tools } = createFakeApi({});
    plugin.register(api);

    const result = parseResult(await tools.get("fin_query")!.execute("call-3b", {}));
    expect(String(result.error)).toContain("required");
  });

  it("calls Tushare proxy in live mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: [{ close: 1800.5 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({
      mode: "live",
      tushareApiKey: "test-key",
      tushareProxyUrl: "https://proxy.example.com",
    });
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_stock")!.execute("call-4", {
        symbol: "600519.SH",
        query_type: "quote",
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://proxy.example.com/api/tushare");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("test-key");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.api_name).toBe("daily");
    expect(body.params).toEqual({ ts_code: "600519.SH" });

    expect(result.success).toBe(true);
    expect(result.market).toBe("cn");
    expect(result.api_name).toBe("daily");
  });

  it("routes HK stock to hk_daily", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: [{ close: 380.2 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({
      mode: "live",
      tushareApiKey: "test-key",
      tushareProxyUrl: "https://proxy.example.com",
    });
    plugin.register(api);

    await tools.get("fin_stock")!.execute("call-hk", {
      symbol: "00700.HK",
      query_type: "historical",
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body.api_name).toBe("hk_daily");
    expect(body.params).toEqual({ ts_code: "00700.HK" });
  });

  it("routes US stock to us_daily", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: [{ close: 178.3 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({
      mode: "live",
      tushareApiKey: "test-key",
      tushareProxyUrl: "https://proxy.example.com",
    });
    plugin.register(api);

    await tools.get("fin_stock")!.execute("call-us", {
      symbol: "AAPL",
      query_type: "quote",
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body.api_name).toBe("us_daily");
    expect(body.params).toEqual({ ts_code: "AAPL" });
  });

  it("reads configuration from env vars", async () => {
    vi.stubEnv("TUSHARE_PROXY_URL", "https://env-proxy.example.com");
    vi.stubEnv("TUSHARE_PROXY_API_KEY", "env-key");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: [{ value: 3.5 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({});
    plugin.register(api);

    await tools.get("fin_macro")!.execute("call-5", { indicator: "cpi" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://env-proxy.example.com/api/tushare");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("env-key");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.api_name).toBe("cn_cpi");
  });

  it("reads legacy env vars (FIN_DATA_HUB_*)", async () => {
    vi.stubEnv("FIN_DATA_HUB_ENDPOINT", "https://legacy-proxy.example.com");
    vi.stubEnv("FIN_DATA_HUB_API_KEY", "legacy-key");
    vi.stubEnv("FIN_DATA_HUB_MODE", "live");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({});
    plugin.register(api);

    await tools.get("fin_index")!.execute("call-legacy", {
      symbol: "000300.SH",
      query_type: "index_historical",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://legacy-proxy.example.com/api/tushare");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("legacy-key");
  });

  it("every tool wraps payload in MCP-style content array", async () => {
    vi.stubEnv("TUSHARE_PROXY_API_KEY", "");
    vi.stubEnv("FIN_DATA_HUB_API_KEY", "");

    const { api, tools } = createFakeApi({});
    plugin.register(api);

    for (const [name, tool] of tools) {
      const minParams: Record<string, unknown> = {};
      if (name === "fin_stock") {
        minParams.symbol = "TEST";
        minParams.query_type = "quote";
      } else if (name === "fin_query") {
        minParams.api_name = "daily";
      } else if (name === "fin_macro") {
        minParams.indicator = "cpi";
      } else if (name === "fin_crypto") {
        minParams.query_type = "ticker";
      } else if (name === "fin_market") {
        minParams.query_type = "top_list";
      } else if (name === "fin_index") {
        minParams.symbol = "000300.SH";
        minParams.query_type = "index_historical";
      } else if (name === "fin_derivatives") {
        minParams.symbol = "IF2501.CFX";
        minParams.query_type = "futures_info";
      }

      const raw = (await tool.execute("mcp-check", minParams)) as {
        content: Array<{ type: string; text: string }>;
      };
      expect(Array.isArray(raw.content), `${name} content is not an array`).toBe(true);
      expect(raw.content[0]!.type).toBe("text");
      expect(() => JSON.parse(raw.content[0]!.text)).not.toThrow();
    }
  });

  it("handles Tushare proxy HTTP errors gracefully", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ success: false, error: "internal server error" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({
      mode: "live",
      tushareApiKey: "test-key",
      tushareProxyUrl: "https://proxy.example.com",
    });
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_market")!.execute("call-err", {
        query_type: "top_list",
      }),
    );
    expect(String(result.error)).toContain("500");
  });

  it("handles Tushare query failure (success: false)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: false, error: "api_name not found" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({
      mode: "live",
      tushareApiKey: "test-key",
      tushareProxyUrl: "https://proxy.example.com",
    });
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_query")!.execute("call-fail", {
        api_name: "nonexistent_api",
      }),
    );
    expect(String(result.error)).toContain("api_name not found");
  });

  it("converts date params to Tushare format (YYYYMMDD)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({
      mode: "live",
      tushareApiKey: "test-key",
      tushareProxyUrl: "https://proxy.example.com",
    });
    plugin.register(api);

    await tools.get("fin_stock")!.execute("call-date", {
      symbol: "600519.SH",
      query_type: "historical",
      start_date: "2025-01-01",
      end_date: "2025-12-31",
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    const params = body.params as Record<string, unknown>;
    expect(params.start_date).toBe("20250101");
    expect(params.end_date).toBe("20251231");
  });

  it("fin_query passes api_name and params directly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: [{ ts_code: "600519.SH" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({
      mode: "live",
      tushareApiKey: "test-key",
      tushareProxyUrl: "https://proxy.example.com",
    });
    plugin.register(api);

    await tools.get("fin_query")!.execute("call-raw", {
      api_name: "income",
      params: { ts_code: "600519.SH", period: "20241231" },
      fields: "ts_code,ann_date,revenue,net_income",
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body.api_name).toBe("income");
    expect(body.params).toEqual({ ts_code: "600519.SH", period: "20241231" });
    expect(body.fields).toBe("ts_code,ann_date,revenue,net_income");
  });

  it("registers fin-datahub-gateway service", () => {
    const { api, services } = createFakeApi({});
    plugin.register(api);

    expect(services.has("fin-datahub-gateway")).toBe(true);
    const gateway = services.get("fin-datahub-gateway") as {
      tusharePost: Function;
      config: unknown;
    };
    expect(typeof gateway.tusharePost).toBe("function");
    expect(gateway.config).toBeDefined();
  });

  it("fin_crypto returns stub with redirect message", async () => {
    const { api, tools } = createFakeApi({ mode: "live", tushareApiKey: "key" });
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_crypto")!.execute("call-crypto", {
        query_type: "ohlcv",
        symbol: "BTC/USDT",
      }),
    );
    expect(result.success).toBe(true);
    const inner = result.result as { _stub: boolean; message: string };
    expect(inner._stub).toBe(true);
    expect(inner.message).toContain("fin-data-bus");
  });

  it("derivatives routes to correct Tushare API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({
      mode: "live",
      tushareApiKey: "test-key",
      tushareProxyUrl: "https://proxy.example.com",
    });
    plugin.register(api);

    await tools.get("fin_derivatives")!.execute("call-deriv", {
      symbol: "IF2501.CFX",
      query_type: "futures_holding",
      trade_date: "2025-02-28",
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body.api_name).toBe("fut_holding");
    const params = body.params as Record<string, unknown>;
    expect(params.ts_code).toBe("IF2501.CFX");
    expect(params.trade_date).toBe("20250228");
  });
});
