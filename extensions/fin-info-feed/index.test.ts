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
    id: "fin-info-feed",
    name: "Info Feed",
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

describe("fin-info-feed plugin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns explicit stub output in default mode", async () => {
    const { api, tools } = createFakeApi({});
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_info_search")!.execute("call-1", { query: "fed rates" }),
    );
    expect(result.success).toBe(true);
    const details = result.results as { status?: unknown; mode?: unknown };
    expect(details.status).toBe("stub");
    expect(details.mode).toBe("stub");
  });

  it("returns config error in live mode when credentials are missing", async () => {
    const { api, tools } = createFakeApi({ mode: "live" });
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_info_search")!.execute("call-2", { query: "BTC" }),
    );
    expect(String(result.error)).toContain("API key not configured");
  });

  it("calls remote backend in live mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ items: [{ id: "n1", title: "News" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({
      mode: "live",
      apiKey: "token",
      endpoint: "https://feed.example",
    });
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_info_search")!.execute("call-3", {
        query: "ETH ETF",
        limit: 5,
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://feed.example/v1/search");
    expect(init.method).toBe("POST");
    expect(result.success).toBe(true);
    const payload = result.results as { status?: unknown; mode?: unknown; data?: unknown };
    expect(payload.status).toBe("ok");
    expect(payload.mode).toBe("live");
    expect(payload.data).toEqual({ items: [{ id: "n1", title: "News" }] });
  });

  it("reads live configuration from env vars when plugin config is empty", async () => {
    vi.stubEnv("FIN_INFO_FEED_MODE", "live");
    vi.stubEnv("FIN_INFO_FEED_API_KEY", "env-token");
    vi.stubEnv("FIN_INFO_FEED_ENDPOINT", "https://feed-env.example");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ items: [{ id: "n2", title: "Env News" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({});
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_info_search")!.execute("call-4", { query: "env finance" }),
    );
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://feed-env.example/v1/search");
    expect(result.success).toBe(true);
    const payload = result.results as { mode?: unknown; data?: unknown };
    expect(payload.mode).toBe("live");
    expect(payload.data).toEqual({ items: [{ id: "n2", title: "Env News" }] });
  });
});
