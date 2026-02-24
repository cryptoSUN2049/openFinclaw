import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";

const json = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  details: payload,
});

type ExpertSdkConfig = {
  apiKey?: string;
  endpoint?: string;
  tier?: "basic" | "pro" | "enterprise";
};

/**
 * Resolve Expert SDK configuration from plugin config or fin-core FinancialConfig.
 */
function resolveConfig(api: OpenClawPluginApi): ExpertSdkConfig {
  const raw = api.pluginConfig as Record<string, unknown> | undefined;
  return {
    apiKey: typeof raw?.apiKey === "string" ? raw.apiKey : undefined,
    endpoint: typeof raw?.endpoint === "string" ? raw.endpoint : undefined,
    tier:
      raw?.tier === "basic" || raw?.tier === "pro" || raw?.tier === "enterprise"
        ? raw.tier
        : "basic",
  };
}

/**
 * Send a request to the Expert API.
 * This is a placeholder that will be replaced with actual HTTP calls.
 */
async function expertRequest(
  config: ExpertSdkConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!config.apiKey) {
    throw new Error("Expert SDK API key not configured. Set fin-expert-sdk.apiKey in plugin config.");
  }
  if (!config.endpoint) {
    throw new Error(
      "Expert SDK endpoint not configured. Set fin-expert-sdk.endpoint in plugin config.",
    );
  }

  // TODO: Implement actual HTTP request to the Expert API.
  // const url = `${config.endpoint}${path}`;
  // const response = await fetch(url, {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     "Authorization": `Bearer ${config.apiKey}`,
  //     "X-Expert-Tier": config.tier ?? "basic",
  //   },
  //   body: JSON.stringify(body),
  // });
  // if (!response.ok) throw new Error(`Expert API error: ${response.status}`);
  // return await response.json();

  return {
    status: "stub",
    path,
    body,
    message: "Expert SDK integration pending — configure endpoint and API key.",
  };
}

const finExpertSdkPlugin = {
  id: "fin-expert-sdk",
  name: "Expert SDK",
  description: "Deep financial analysis via Expert API — fundamental, technical, and risk analysis",
  kind: "financial" as const,

  register(api: OpenClawPluginApi) {
    const config = resolveConfig(api);

    // ---------------------------------------------------------------
    // Tool 1: fin_expert_query
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_expert_query",
        label: "Expert Query",
        description: "Ask a financial analysis question to the expert system.",
        parameters: Type.Object({
          question: Type.String({ description: "The financial analysis question to ask" }),
          context: Type.Optional(
            Type.String({ description: "Additional context for the question" }),
          ),
          symbols: Type.Optional(
            Type.Array(Type.String(), { description: "Related asset symbols for context" }),
          ),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const question = String(params.question ?? "").trim();
            if (!question) {
              throw new Error("question is required");
            }

            const result = await expertRequest(config, "/v1/query", {
              question,
              context: typeof params.context === "string" ? params.context : undefined,
              symbols: Array.isArray(params.symbols) ? params.symbols : undefined,
              tier: config.tier,
            });

            return json({ success: true, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_expert_query"] },
    );

    // ---------------------------------------------------------------
    // Tool 2: fin_expert_analyze
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_expert_analyze",
        label: "Expert Analyze",
        description: "Get deep analysis for a specific asset or strategy.",
        parameters: Type.Object({
          symbol: Type.String({ description: "Asset symbol to analyze, e.g. BTC/USDT or AAPL" }),
          analysisType: Type.Unsafe<"fundamental" | "technical" | "risk" | "comprehensive">({
            type: "string",
            enum: ["fundamental", "technical", "risk", "comprehensive"],
          }),
          timeframe: Type.Optional(
            Type.String({
              description: "Analysis timeframe, e.g. 1h, 4h, 1d, 1w",
            }),
          ),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const symbol = String(params.symbol ?? "").trim();
            const analysisType = String(params.analysisType ?? "").trim();

            if (!symbol || !analysisType) {
              throw new Error("symbol and analysisType are required");
            }

            const result = await expertRequest(config, "/v1/analyze", {
              symbol,
              analysisType,
              timeframe: typeof params.timeframe === "string" ? params.timeframe : undefined,
              tier: config.tier,
            });

            return json({ success: true, analysis: result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_expert_analyze"] },
    );

    // ---------------------------------------------------------------
    // Tool 3: fin_expert_research
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_expert_research",
        label: "Expert Research",
        description: "Generate a research report on a topic.",
        parameters: Type.Object({
          topic: Type.String({ description: "Research topic or question" }),
          depth: Type.Unsafe<"brief" | "standard" | "detailed">({
            type: "string",
            enum: ["brief", "standard", "detailed"],
          }),
          symbols: Type.Optional(
            Type.Array(Type.String(), { description: "Related asset symbols to include" }),
          ),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const topic = String(params.topic ?? "").trim();
            const depth = String(params.depth ?? "standard").trim();

            if (!topic) {
              throw new Error("topic is required");
            }

            const result = await expertRequest(config, "/v1/research", {
              topic,
              depth,
              symbols: Array.isArray(params.symbols) ? params.symbols : undefined,
              tier: config.tier,
            });

            return json({ success: true, report: result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_expert_research"] },
    );
  },
};

export default finExpertSdkPlugin;
