/**
 * Atomic call matrix — 97 test cases covering 7 tools × all query_types.
 *
 * Each tool/query_type combination is tested in two modes:
 *   1. stub: verifies {status:"stub", path, body} structure
 *   2. live mock: verifies fetch was called with correct URL/method/headers/body
 *
 * Run: npx vitest run extensions/fin-data-hub/__tests__/atomic.test.ts
 */

import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "../index.js";

/* ---------- helpers (same as index.test.ts) ---------- */

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

/* ---------- tool × query_type matrix ---------- */

interface ToolSpec {
  toolName: string;
  gatewayPath: string;
  /** Key used for the discriminator: "query_type" or "indicator" */
  discriminator: "query_type" | "indicator";
  /** All valid enum values */
  queryTypes: string[];
  /** Function to build minimal valid params for a given query_type */
  buildParams: (qt: string) => Record<string, unknown>;
  /** Required params that trigger validation error when missing */
  requiredFields: string[];
}

const TOOL_SPECS: ToolSpec[] = [
  {
    toolName: "fin_stock",
    gatewayPath: "/v1/stock",
    discriminator: "query_type",
    queryTypes: [
      "quote",
      "historical",
      "income",
      "balance",
      "cashflow",
      "ratios",
      "moneyflow",
      "holders",
      "dividends",
      "news",
      "pledge",
      "margin",
      "block_trade",
      "factor",
    ],
    buildParams: (qt) => ({ symbol: "600519.SH", query_type: qt }),
    requiredFields: ["symbol", "query_type"],
  },
  {
    toolName: "fin_index",
    gatewayPath: "/v1/index",
    discriminator: "query_type",
    queryTypes: [
      "index_historical",
      "index_constituents",
      "index_valuation",
      "etf_historical",
      "etf_nav",
      "fund_manager",
      "fund_portfolio",
      "fund_share",
      "ths_index",
      "ths_daily",
      "ths_member",
      "sector_classify",
    ],
    buildParams: (qt) => ({ symbol: "000300.SH", query_type: qt }),
    requiredFields: ["query_type"],
  },
  {
    toolName: "fin_macro",
    gatewayPath: "/v1/macro",
    discriminator: "indicator",
    queryTypes: [
      "gdp",
      "cpi",
      "ppi",
      "pmi",
      "m2",
      "social_financing",
      "shibor",
      "lpr",
      "libor",
      "hibor",
      "treasury_cn",
      "treasury_us",
      "fx",
      "wb_gdp",
      "wb_population",
      "wb_inflation",
      "wb_indicator",
    ],
    buildParams: (qt) => {
      const params: Record<string, unknown> = { indicator: qt };
      if (qt.startsWith("wb_")) params.country = "CN";
      if (qt === "fx") params.symbol = "USDCNH";
      return params;
    },
    requiredFields: ["indicator"],
  },
  {
    toolName: "fin_derivatives",
    gatewayPath: "/v1/derivatives",
    discriminator: "query_type",
    queryTypes: [
      "futures_historical",
      "futures_info",
      "futures_holding",
      "futures_settle",
      "futures_warehouse",
      "futures_mapping",
      "option_basic",
      "option_daily",
      "option_chains",
      "cb_basic",
      "cb_daily",
    ],
    buildParams: (qt) => ({ symbol: "IF2501.CFX", query_type: qt }),
    requiredFields: ["query_type"],
  },
  {
    toolName: "fin_crypto",
    gatewayPath: "/v1/crypto",
    discriminator: "query_type",
    queryTypes: [
      "ohlcv",
      "ticker",
      "tickers",
      "orderbook",
      "trades",
      "funding_rate",
      "search",
      "coin_market",
      "coin_historical",
      "coin_info",
      "coin_categories",
      "coin_trending",
      "coin_global",
      "defi_protocols",
      "defi_tvl",
      "defi_chains",
      "defi_yields",
      "defi_stablecoins",
      "defi_fees",
      "defi_dex_volumes",
      "defi_coin_prices",
    ],
    buildParams: (qt) => {
      const params: Record<string, unknown> = { query_type: qt };
      if (["ohlcv", "ticker", "orderbook", "trades", "funding_rate"].includes(qt)) {
        params.symbol = "BTC/USDT";
        params.exchange = "binance";
      }
      if (qt === "ohlcv") params.timeframe = "1d";
      return params;
    },
    requiredFields: ["query_type"],
  },
  {
    toolName: "fin_market",
    gatewayPath: "/v1/market",
    discriminator: "query_type",
    queryTypes: [
      "top_list",
      "top_inst",
      "limit_list",
      "block_trade",
      "moneyflow_industry",
      "concept_list",
      "concept_detail",
      "margin",
      "margin_detail",
      "hsgt_flow",
      "hsgt_top10",
      "index_global",
      "market_snapshot",
      "calendar_ipo",
      "suspend",
      "trade_calendar",
    ],
    buildParams: (qt) => {
      const params: Record<string, unknown> = { query_type: qt };
      if (["top_list", "limit_list", "block_trade"].includes(qt)) {
        params.trade_date = "20250228";
      }
      return params;
    },
    requiredFields: ["query_type"],
  },
  {
    toolName: "fin_query",
    gatewayPath: "/v1/query",
    discriminator: "query_type", // not really, but we use source
    queryTypes: [
      "china_equity",
      "global_equity",
      "crypto_cex",
      "defi",
      "crypto_market",
      "macro_global",
    ],
    buildParams: (source) => ({
      source,
      endpoint: "/test/endpoint",
      params: { ts_code: "000001.SZ" },
    }),
    requiredFields: ["source", "endpoint"],
  },
];

/* ---------- tests ---------- */

describe("atomic call matrix", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // Count total: 14+12+17+11+21+16+6 = 97
  for (const spec of TOOL_SPECS) {
    describe(`${spec.toolName} (${spec.queryTypes.length} query_types)`, () => {
      // ---- Stub mode tests ----
      describe("stub mode", () => {
        for (const qt of spec.queryTypes) {
          it(`${qt} → stub output with correct path and body`, async () => {
            const { api, tools } = createFakeApi({});
            plugin.register(api);

            const params = spec.buildParams(qt);
            const result = parseResult(
              await tools.get(spec.toolName)!.execute(`stub-${qt}`, params),
            );

            expect(result.success).toBe(true);
            const details = result.result as Record<string, unknown>;
            expect(details.status).toBe("stub");
            expect(details.mode).toBe("stub");
            expect(details.path).toBe(spec.gatewayPath);

            const body = details.body as Record<string, unknown>;
            if (spec.toolName === "fin_query") {
              expect(body.source).toBe(qt);
              expect(body.endpoint).toBe("/test/endpoint");
            } else if (spec.discriminator === "indicator") {
              expect(body.indicator).toBe(qt);
            } else {
              expect(body.query_type).toBe(qt);
            }
          });
        }
      });

      // ---- Live mock tests ----
      describe("live mock", () => {
        for (const qt of spec.queryTypes) {
          it(`${qt} → correct HTTP POST to gateway`, async () => {
            const mockResponse = { data: [{ value: 42 }] };
            const fetchMock = vi.fn().mockResolvedValue({
              ok: true,
              status: 200,
              text: async () => JSON.stringify(mockResponse),
            });
            vi.stubGlobal("fetch", fetchMock);

            const { api, tools } = createFakeApi({
              mode: "live",
              apiKey: "test-key",
              endpoint: "https://gateway.test",
            });
            plugin.register(api);

            const params = spec.buildParams(qt);
            const result = parseResult(
              await tools.get(spec.toolName)!.execute(`live-${qt}`, params),
            );

            expect(result.success).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(1);

            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe(`https://gateway.test${spec.gatewayPath}`);
            expect(init.method).toBe("POST");
            expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
              "application/json",
            );
            expect((init.headers as Record<string, string>)["Authorization"]).toBe(
              "Bearer test-key",
            );

            const body = JSON.parse(init.body as string) as Record<string, unknown>;
            if (spec.toolName === "fin_query") {
              expect(body.source).toBe(qt);
            } else if (spec.discriminator === "indicator") {
              expect(body.indicator).toBe(qt);
            } else {
              expect(body.query_type).toBe(qt);
            }

            const payload = result.result as Record<string, unknown>;
            expect(payload.status).toBe("ok");
            expect(payload.mode).toBe("live");
            expect(payload.data).toEqual(mockResponse);
          });
        }
      });

      // ---- Required params validation ----
      it("throws error when required params are missing", async () => {
        const { api, tools } = createFakeApi({});
        plugin.register(api);

        const result = parseResult(await tools.get(spec.toolName)!.execute("missing-params", {}));
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe("string");
        expect(String(result.error)).toContain("required");
      });
    });
  }
});
