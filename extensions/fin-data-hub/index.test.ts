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
} {
  const tools = new Map<string, Tool>();
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
    registerService() {},
    registerProvider() {},
    registerCommand() {},
    resolvePath: (p: string) => p,
    on() {},
  } as unknown as OpenClawPluginApi;

  return { api, tools };
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

  it("returns explicit stub output in default mode", async () => {
    const { api, tools } = createFakeApi({});
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_stock")!.execute("call-1", {
        symbol: "600519.SH",
        query_type: "quote",
      }),
    );
    expect(result.success).toBe(true);
    const details = result.result as { status?: unknown; mode?: unknown };
    expect(details.status).toBe("stub");
    expect(details.mode).toBe("stub");
  });

  it("returns config error in live mode when endpoint is missing", async () => {
    const { api, tools } = createFakeApi({ mode: "live" });
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_stock")!.execute("call-2", {
        symbol: "600519.SH",
        query_type: "historical",
      }),
    );
    expect(String(result.error)).toContain("endpoint not configured");
  });

  it("validates required params", async () => {
    const { api, tools } = createFakeApi({});
    plugin.register(api);

    const result = parseResult(await tools.get("fin_stock")!.execute("call-3", {}));
    expect(String(result.error)).toContain("required");
  });

  it("calls remote gateway in live mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ records: [{ close: 1800.5 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({
      mode: "live",
      apiKey: "test-token",
      endpoint: "https://data.example.com",
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
    expect(url).toBe("https://data.example.com/v1/stock");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-token");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.symbol).toBe("600519.SH");
    expect(body.query_type).toBe("quote");

    expect(result.success).toBe(true);
    const payload = result.result as { status?: unknown; mode?: unknown; data?: unknown };
    expect(payload.status).toBe("ok");
    expect(payload.mode).toBe("live");
    expect(payload.data).toEqual({ records: [{ close: 1800.5 }] });
  });

  it("reads configuration from env vars", async () => {
    vi.stubEnv("FIN_DATA_HUB_MODE", "live");
    vi.stubEnv("FIN_DATA_HUB_API_KEY", "env-token");
    vi.stubEnv("FIN_DATA_HUB_ENDPOINT", "https://data-env.example.com");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({});
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_macro")!.execute("call-5", { indicator: "cpi" }),
    );
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://data-env.example.com/v1/macro");
    expect(result.success).toBe(true);
  });

  it("every tool wraps payload in MCP-style content array", async () => {
    const { api, tools } = createFakeApi({});
    plugin.register(api);

    for (const [name, tool] of tools) {
      const minParams: Record<string, unknown> = {};
      if (name === "fin_stock") {
        minParams.symbol = "TEST";
        minParams.query_type = "quote";
      } else if (name === "fin_query") {
        minParams.source = "china_equity";
        minParams.endpoint = "/test";
      } else if (name === "fin_macro") {
        minParams.indicator = "cpi";
      } else if (name === "fin_crypto") {
        minParams.query_type = "ticker";
      } else if (name === "fin_market") {
        minParams.query_type = "top_list";
      } else if (name === "fin_index") {
        minParams.query_type = "index_historical";
      } else if (name === "fin_derivatives") {
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

  it("handles gateway HTTP errors gracefully", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: "internal server error" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({
      mode: "live",
      endpoint: "https://data.example.com",
    });
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_crypto")!.execute("call-err", {
        query_type: "coin_global",
      }),
    );
    expect(String(result.error)).toContain("500");
  });
});
