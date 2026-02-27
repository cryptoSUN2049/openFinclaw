import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";

const json = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  details: payload,
});

type InfoFeedConfig = {
  mode: "stub" | "live";
  apiKey?: string;
  endpoint?: string;
  requestTimeoutMs: number;
};

function readEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * Resolve Info Feed configuration from plugin config.
 */
function resolveConfig(api: OpenClawPluginApi): InfoFeedConfig {
  const raw = api.pluginConfig as Record<string, unknown> | undefined;
  const modeRaw =
    (typeof raw?.mode === "string" ? raw.mode : undefined) ??
    readEnv(["OPENFINCLAW_FIN_INFO_MODE", "FIN_INFO_FEED_MODE"]);
  const timeoutRaw =
    raw?.requestTimeoutMs ??
    readEnv(["OPENFINCLAW_FIN_INFO_TIMEOUT_MS", "FIN_INFO_FEED_TIMEOUT_MS"]);
  const timeout = Number(timeoutRaw);

  return {
    mode: modeRaw === "live" ? "live" : "stub",
    apiKey:
      (typeof raw?.apiKey === "string" ? raw.apiKey : undefined) ??
      readEnv(["OPENFINCLAW_FIN_INFO_API_KEY", "FIN_INFO_FEED_API_KEY"]),
    endpoint:
      (typeof raw?.endpoint === "string" ? raw.endpoint : undefined) ??
      readEnv(["OPENFINCLAW_FIN_INFO_ENDPOINT", "FIN_INFO_FEED_ENDPOINT"]),
    requestTimeoutMs: Number.isFinite(timeout) && timeout >= 1000 ? Math.floor(timeout) : 15_000,
  };
}

/**
 * Send a request to the Info Feed API or return explicit stub output.
 */
async function feedRequest(
  config: InfoFeedConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (config.mode === "stub") {
    return {
      status: "stub",
      mode: "stub",
      path,
      body,
      message:
        "Info Feed running in stub mode. Set fin-info-feed.mode=live to call the real backend.",
    };
  }

  if (!config.apiKey) {
    throw new Error("Info Feed API key not configured. Set fin-info-feed.apiKey in plugin config.");
  }
  if (!config.endpoint) {
    throw new Error(
      "Info Feed endpoint not configured. Set fin-info-feed.endpoint in plugin config.",
    );
  }

  const url = new URL(path, config.endpoint).toString();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });

  const raw = await response.text();
  let payload: unknown = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw };
    }
  }

  if (!response.ok) {
    const message =
      (payload as { error?: unknown; message?: unknown })?.error ??
      (payload as { error?: unknown; message?: unknown })?.message ??
      raw;
    throw new Error(`Info Feed API error (${response.status}): ${String(message).slice(0, 240)}`);
  }

  return {
    status: "ok",
    mode: "live",
    endpoint: url,
    data: payload,
  };
}

const finInfoFeedPlugin = {
  id: "fin-info-feed",
  name: "Info Feed",
  description:
    "Intelligent financial information streaming — news search, subscriptions, and digests",
  kind: "financial" as const,

  register(api: OpenClawPluginApi) {
    const config = resolveConfig(api);

    // ---------------------------------------------------------------
    // Tool 1: fin_info_search
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_info_search",
        label: "Info Search",
        description: "Search financial news and information.",
        parameters: Type.Object({
          query: Type.String({ description: "Search query for financial news and information" }),
          symbols: Type.Optional(
            Type.Array(Type.String(), { description: "Filter by asset symbols" }),
          ),
          timeRange: Type.Optional(
            Type.Unsafe<"1h" | "24h" | "7d" | "30d">({
              type: "string",
              enum: ["1h", "24h", "7d", "30d"],
            }),
          ),
          limit: Type.Optional(Type.Number({ description: "Maximum number of results to return" })),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const query = String(params.query ?? "").trim();
            if (!query) {
              throw new Error("query is required");
            }

            const result = await feedRequest(config, "/v1/search", {
              query,
              symbols: Array.isArray(params.symbols) ? params.symbols : undefined,
              timeRange: typeof params.timeRange === "string" ? params.timeRange : undefined,
              limit: typeof params.limit === "number" ? params.limit : 20,
            });

            return json({ success: true, results: result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_info_search"] },
    );

    // ---------------------------------------------------------------
    // Tool 2: fin_info_subscribe
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_info_subscribe",
        label: "Info Subscribe",
        description: "Subscribe to information feed for specific topics or assets.",
        parameters: Type.Object({
          topics: Type.Array(Type.String(), { description: "Topics to subscribe to" }),
          symbols: Type.Optional(
            Type.Array(Type.String(), { description: "Asset symbols to track" }),
          ),
          priority: Type.Unsafe<"low" | "medium" | "high" | "critical">({
            type: "string",
            enum: ["low", "medium", "high", "critical"],
          }),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const topics = Array.isArray(params.topics) ? (params.topics as string[]) : [];
            if (topics.length === 0) {
              throw new Error("at least one topic is required");
            }

            const priority = String(params.priority ?? "medium").trim();

            const result = await feedRequest(config, "/v1/subscribe", {
              topics,
              symbols: Array.isArray(params.symbols) ? params.symbols : undefined,
              priority,
            });

            return json({ success: true, subscription: result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_info_subscribe"] },
    );

    // ---------------------------------------------------------------
    // Tool 3: fin_info_digest
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_info_digest",
        label: "Info Digest",
        description: "Generate a personalized news digest.",
        parameters: Type.Object({
          period: Type.Unsafe<"morning" | "evening" | "weekly">({
            type: "string",
            enum: ["morning", "evening", "weekly"],
          }),
          includePortfolio: Type.Optional(
            Type.Boolean({
              description: "Include portfolio-related news (default: true)",
              default: true,
            }),
          ),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const period = String(params.period ?? "").trim();
            if (!period) {
              throw new Error("period is required");
            }

            const includePortfolio =
              typeof params.includePortfolio === "boolean" ? params.includePortfolio : true;

            const result = await feedRequest(config, "/v1/digest", {
              period,
              includePortfolio,
            });

            return json({ success: true, digest: result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_info_digest"] },
    );
  },
};

export default finInfoFeedPlugin;
