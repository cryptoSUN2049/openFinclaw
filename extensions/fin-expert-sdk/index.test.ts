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
    id: "fin-expert-sdk",
    name: "Expert SDK",
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

describe("fin-expert-sdk plugin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns explicit stub output in default mode", async () => {
    const { api, tools } = createFakeApi({});
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_expert_query")!.execute("call-1", { question: "trend?" }),
    );
    expect(result.success).toBe(true);
    const details = result.result as { status?: unknown; mode?: unknown };
    expect(details.status).toBe("stub");
    expect(details.mode).toBe("stub");
  });

  it("returns config error in live mode when credentials are missing", async () => {
    const { api, tools } = createFakeApi({ mode: "live" });
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_expert_query")!.execute("call-2", { question: "trend?" }),
    );
    expect(String(result.error)).toContain("API key not configured");
  });

  it("calls remote backend in live mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ summary: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({
      mode: "live",
      apiKey: "token",
      endpoint: "https://expert.example",
      tier: "pro",
    });
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_expert_query")!.execute("call-3", {
        question: "BTC outlook",
        symbols: ["BTC/USDT"],
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://expert.example/v1/query");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Expert-Tier"]).toBe("pro");
    expect(result.success).toBe(true);
    const payload = result.result as { status?: unknown; mode?: unknown; data?: unknown };
    expect(payload.status).toBe("ok");
    expect(payload.mode).toBe("live");
    expect(payload.data).toEqual({ summary: "ok" });
  });

  it("reads live configuration from env vars when plugin config is empty", async () => {
    vi.stubEnv("FIN_EXPERT_SDK_MODE", "live");
    vi.stubEnv("FIN_EXPERT_SDK_API_KEY", "env-token");
    vi.stubEnv("FIN_EXPERT_SDK_ENDPOINT", "https://expert-env.example");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ summary: "env-ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, tools } = createFakeApi({});
    plugin.register(api);

    const result = parseResult(
      await tools.get("fin_expert_query")!.execute("call-4", { question: "env config?" }),
    );
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://expert-env.example/v1/query");
    expect(result.success).toBe(true);
    const payload = result.result as { mode?: unknown; data?: unknown };
    expect(payload.mode).toBe("live");
    expect(payload.data).toEqual({ summary: "env-ok" });
  });
});
