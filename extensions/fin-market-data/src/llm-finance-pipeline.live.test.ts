/**
 * Real E2E: LLM tool-calling -> fin-market-data -> Binance testnet -> final answer.
 *
 * Requires:
 * - LIVE=1 (or OPENCLAW_LIVE_TEST=1)
 * - BINANCE_TESTNET_API_KEY
 * - BINANCE_TESTNET_SECRET
 * - OPENAI_API_KEY
 *
 * Optional:
 * - OPENAI_BASE_URL (OpenAI-compatible endpoint)
 * - OPENCLAW_FIN_LIVE_MODEL (default: gpt-5.2)
 * - OPENCLAW_FIN_LIVE_MODEL_API (openai-completions | openai-responses)
 */
import { type Api, completeSimple, getModel, type Model } from "@mariozechner/pi-ai";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isTruthyEnvValue } from "../../../src/infra/env.js";
import { ExchangeRegistry } from "../../fin-core/src/exchange-registry.js";
import finMarketDataPlugin from "../index.js";

type ToolSchema = {
  name: string;
  description?: string;
  parameters?: unknown;
};

type RegisteredTool = ToolSchema & {
  execute: (id: string, params: Record<string, unknown>) => Promise<unknown>;
};

const LIVE = isTruthyEnvValue(process.env.LIVE) || isTruthyEnvValue(process.env.OPENCLAW_LIVE_TEST);
const API_KEY = process.env.BINANCE_TESTNET_API_KEY ?? "";
const SECRET = process.env.BINANCE_TESTNET_SECRET ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL?.trim() || "";
const MODEL_API =
  (process.env.OPENCLAW_FIN_LIVE_MODEL_API?.trim() as
    | "openai-completions"
    | "openai-responses"
    | "") || (OPENAI_BASE_URL ? "openai-completions" : "openai-responses");
const MODEL_ID =
  process.env.OPENCLAW_FIN_LIVE_MODEL?.trim() ||
  (MODEL_API === "openai-completions" ? "gpt-4o-mini" : "gpt-5.2");

const describeLive = LIVE && API_KEY && SECRET && OPENAI_API_KEY ? describe : describe.skip;

function parseToolResult(result: unknown): Record<string, unknown> {
  const content = (result as { content?: Array<{ text?: string }> }).content;
  const raw = content?.[0]?.text;
  if (!raw) {
    throw new Error("tool result missing JSON text content");
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return parsed;
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function assertNoModelError(message: {
  stopReason?: string;
  errorMessage?: string;
  content?: unknown[];
}): void {
  if (message.stopReason === "error") {
    throw new Error(`model request failed: ${message.errorMessage ?? "unknown error"}`);
  }
}

function createFakeApi(registry: ExchangeRegistry): {
  api: OpenClawPluginApi;
  tools: Map<string, RegisteredTool>;
} {
  const tools = new Map<string, RegisteredTool>();
  const services = new Map<string, unknown>();
  services.set("fin-exchange-registry", registry);

  const api = {
    id: "fin-market-data",
    name: "Market Data",
    source: "live-test",
    config: {},
    pluginConfig: {},
    runtime: {
      version: "live-test",
      services,
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    registerTool(tool: {
      name: string;
      description?: string;
      parameters?: unknown;
      execute: (id: string, params: Record<string, unknown>) => Promise<unknown>;
    }) {
      tools.set(tool.name, {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        execute: tool.execute,
      });
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

describeLive("finance llm full pipeline (live)", () => {
  let registry: ExchangeRegistry;
  let tool: RegisteredTool;
  let model: Model<Api>;

  beforeAll(async () => {
    registry = new ExchangeRegistry();
    registry.addExchange("binance-testnet", {
      exchange: "binance",
      apiKey: API_KEY,
      secret: SECRET,
      testnet: true,
      defaultType: "spot",
    });

    const { api, tools } = createFakeApi(registry);
    finMarketDataPlugin.register(api);

    const marketPriceTool = tools.get("fin_market_price");
    if (!marketPriceTool) {
      throw new Error("fin_market_price tool not registered");
    }
    tool = marketPriceTool;

    if (MODEL_API === "openai-completions") {
      model = {
        id: MODEL_ID,
        name: `OpenAI Compatible ${MODEL_ID}`,
        api: "openai-completions",
        provider: "openai",
        baseUrl: OPENAI_BASE_URL || "https://api.openai.com/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 8_192,
      } as unknown as Model<Api>;
      return;
    }

    const baseModel = getModel(
      "openai" as "openai",
      MODEL_ID as Parameters<typeof getModel>[1],
    ) as unknown as Model<Api>;
    model = OPENAI_BASE_URL
      ? ({ ...baseModel, baseUrl: OPENAI_BASE_URL } as Model<Api>)
      : baseModel;
  });

  afterAll(async () => {
    await registry.closeAll();
  });

  it("LLM calls fin_market_price then produces grounded summary", async () => {
    let first = await completeSimple(
      model,
      {
        messages: [
          {
            role: "user",
            content:
              "Use tool fin_market_price to fetch BTC/USDT from binance-testnet with timeframe 1h limit 5. Return only the tool call.",
            timestamp: Date.now(),
          },
        ],
        tools: [
          {
            name: tool.name,
            description: tool.description ?? "",
            parameters: tool.parameters,
          } as NonNullable<Parameters<typeof completeSimple>[1]["tools"]>[number],
        ],
      },
      { apiKey: OPENAI_API_KEY, maxTokens: 256, reasoning: "minimal" },
    );
    assertNoModelError(first);

    let toolCall = first.content.find((block) => block.type === "toolCall");
    for (let retry = 0; retry < 2 && !toolCall; retry += 1) {
      first = await completeSimple(
        model,
        {
          messages: [
            {
              role: "user",
              content:
                'MANDATORY: Call fin_market_price with {"symbol":"BTC/USDT","exchange":"binance-testnet","timeframe":"1h","limit":5}. Reply with tool call only.',
              timestamp: Date.now(),
            },
          ],
          tools: [
            {
              name: tool.name,
              description: tool.description ?? "",
              parameters: tool.parameters,
            } as NonNullable<Parameters<typeof completeSimple>[1]["tools"]>[number],
          ],
        },
        { apiKey: OPENAI_API_KEY, maxTokens: 256, reasoning: "minimal" },
      );
      assertNoModelError(first);
      toolCall = first.content.find((block) => block.type === "toolCall");
    }

    expect(toolCall).toBeTruthy();
    if (!toolCall || toolCall.type !== "toolCall") {
      throw new Error("expected model to issue a tool call");
    }

    const toolArgs = parseToolArguments(
      (toolCall as { arguments?: unknown; input?: unknown }).arguments ??
        (toolCall as { arguments?: unknown; input?: unknown }).input,
    );
    const mergedArgs: Record<string, unknown> = {
      symbol: "BTC/USDT",
      exchange: "binance-testnet",
      timeframe: "1h",
      limit: 5,
      ...toolArgs,
    };
    const rawToolResult = await tool.execute("fin-live-call-1", mergedArgs);
    const parsedToolResult = parseToolResult(rawToolResult);

    expect(parsedToolResult.error).toBeUndefined();
    expect(parsedToolResult.symbol).toBe("BTC/USDT");
    expect(Number(parsedToolResult.price ?? 0)).toBeGreaterThan(0);
    expect(Array.isArray(parsedToolResult.candles)).toBe(true);
    expect((parsedToolResult.candles as unknown[]).length).toBeGreaterThan(0);

    const second = await completeSimple(
      model,
      {
        messages: [
          {
            role: "user",
            content:
              "Use tool fin_market_price to fetch BTC/USDT from binance-testnet with timeframe 1h limit 5. Return only the tool call.",
            timestamp: Date.now(),
          },
          first,
          {
            role: "toolResult",
            toolCallId: toolCall.id,
            toolName: tool.name,
            content: [{ type: "text", text: JSON.stringify(parsedToolResult) }],
            isError: false,
            timestamp: Date.now(),
          },
          {
            role: "user",
            content:
              "Now give one concise sentence summarizing current BTC/USDT price and 24h change from the tool result.",
            timestamp: Date.now(),
          },
        ],
      },
      { apiKey: OPENAI_API_KEY, maxTokens: 256, reasoning: "minimal" },
    );
    assertNoModelError(second);

    const finalText = second.content
      .filter((block) => block.type === "text")
      .map((block) => block.text.trim())
      .join(" ")
      .trim();

    expect(finalText.length).toBeGreaterThan(0);
    expect(/btc|usdt/i.test(finalText)).toBe(true);
    console.log(
      `  LLM summary: ${finalText}\n  Tool price: ${parsedToolResult.price}, change%: ${parsedToolResult.changePct24h}`,
    );
  }, 45_000);
});
