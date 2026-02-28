/**
 * Real multi-market analysis scenarios — 8 scenarios × multiple calls each.
 *
 * These tests require a running Gateway at FIN_DATA_HUB_ENDPOINT.
 * Excluded from CI by vitest config (*.live.test.ts pattern).
 *
 * Run:
 *   FIN_DATA_HUB_MODE=live \
 *   FIN_DATA_HUB_ENDPOINT=http://localhost:8089 \
 *   FIN_DATA_HUB_API_KEY=sk-finclaw-xxx \
 *   npx vitest run extensions/fin-data-hub/__tests__/scenarios.live.test.ts
 */

import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import plugin from "../index.js";

/* ---------- helpers ---------- */

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

/* ---------- scenario definitions ---------- */

interface ScenarioStep {
  tool: string;
  params: Record<string, unknown>;
  label: string;
}

interface Scenario {
  name: string;
  skill: string;
  steps: ScenarioStep[];
}

const SCENARIOS: Scenario[] = [
  {
    name: "A股五维分析 (贵州茅台)",
    skill: "fin-stock",
    steps: [
      {
        tool: "fin_stock",
        params: {
          symbol: "600519.SH",
          query_type: "quote",
          start_date: "20250201",
          end_date: "20250228",
        },
        label: "quote",
      },
      { tool: "fin_stock", params: { symbol: "600519.SH", query_type: "income" }, label: "income" },
      {
        tool: "fin_stock",
        params: { symbol: "600519.SH", query_type: "cashflow" },
        label: "cashflow",
      },
      {
        tool: "fin_stock",
        params: {
          symbol: "600519.SH",
          query_type: "moneyflow",
          start_date: "20250201",
          end_date: "20250228",
        },
        label: "moneyflow",
      },
      {
        tool: "fin_stock",
        params: { symbol: "600519.SH", query_type: "holders" },
        label: "holders",
      },
    ],
  },
  {
    name: "港股跨境研究 (腾讯)",
    skill: "fin-global",
    steps: [
      {
        tool: "fin_stock",
        params: {
          symbol: "00700.HK",
          query_type: "hk_daily",
          start_date: "20250201",
          end_date: "20250228",
        },
        label: "hk_daily",
      },
      {
        tool: "fin_stock",
        params: { symbol: "00700.HK", query_type: "hk_income" },
        label: "hk_income",
      },
      {
        tool: "fin_market",
        params: { query_type: "hsgt_flow", start_date: "20250201", end_date: "20250228" },
        label: "hsgt_flow",
      },
    ],
  },
  {
    name: "市场盘后复盘",
    skill: "fin-market",
    steps: [
      {
        tool: "fin_market",
        params: { query_type: "top_list", trade_date: "20250228" },
        label: "top_list",
      },
      {
        tool: "fin_market",
        params: { query_type: "limit_list", trade_date: "20250228" },
        label: "limit_list",
      },
      {
        tool: "fin_market",
        params: { query_type: "margin", trade_date: "20250228" },
        label: "margin",
      },
      {
        tool: "fin_market",
        params: { query_type: "hsgt_flow", start_date: "20250201", end_date: "20250228" },
        label: "hsgt_flow",
      },
    ],
  },
  {
    name: "宏观周期分析",
    skill: "fin-macro",
    steps: [
      { tool: "fin_macro", params: { indicator: "gdp" }, label: "gdp" },
      { tool: "fin_macro", params: { indicator: "cpi" }, label: "cpi" },
      { tool: "fin_macro", params: { indicator: "pmi" }, label: "pmi" },
      { tool: "fin_macro", params: { indicator: "shibor" }, label: "shibor" },
      { tool: "fin_macro", params: { indicator: "lpr" }, label: "lpr" },
      { tool: "fin_macro", params: { indicator: "treasury_cn" }, label: "treasury_cn" },
    ],
  },
  {
    name: "指数估值比较",
    skill: "fin-index",
    steps: [
      {
        tool: "fin_index",
        params: { symbol: "000300.SH", query_type: "index_valuation" },
        label: "index_valuation",
      },
      {
        tool: "fin_index",
        params: {
          symbol: "000300.SH",
          query_type: "index_constituents",
          start_date: "20250201",
          end_date: "20250228",
        },
        label: "index_constituents",
      },
      {
        tool: "fin_index",
        params: {
          symbol: "510050.SH",
          query_type: "etf_nav",
          start_date: "20250201",
          end_date: "20250228",
        },
        label: "etf_nav",
      },
    ],
  },
  {
    name: "衍生品分析",
    skill: "fin-deriv",
    steps: [
      {
        tool: "fin_derivatives",
        params: { symbol: "IF2503.CFX", query_type: "futures_historical" },
        label: "futures_historical",
      },
      {
        tool: "fin_derivatives",
        params: { symbol: "IF2503.CFX", query_type: "futures_holding", trade_date: "20250228" },
        label: "futures_holding",
      },
      {
        tool: "fin_derivatives",
        params: { symbol: "113050.SH", query_type: "cb_daily" },
        label: "cb_daily",
      },
    ],
  },
  {
    name: "加密全景",
    skill: "fin-crypto",
    steps: [
      { tool: "fin_crypto", params: { query_type: "coin_global" }, label: "coin_global" },
      {
        tool: "fin_crypto",
        params: { query_type: "ohlcv", symbol: "BTC/USDT", exchange: "binance", timeframe: "1d" },
        label: "ohlcv",
      },
      { tool: "fin_crypto", params: { query_type: "defi_protocols" }, label: "defi_protocols" },
      { tool: "fin_crypto", params: { query_type: "defi_yields" }, label: "defi_yields" },
      { tool: "fin_crypto", params: { query_type: "coin_trending" }, label: "coin_trending" },
    ],
  },
  {
    name: "万能查询 (跨源)",
    skill: "fin-query",
    steps: [
      {
        tool: "fin_query",
        params: {
          source: "china_equity",
          endpoint: "daily_basic",
          params: { ts_code: "000001.SZ", trade_date: "20250228" },
        },
        label: "china_equity",
      },
      {
        tool: "fin_query",
        params: { source: "crypto_cex", endpoint: "api/ticker/binance/BTC/USDT" },
        label: "crypto_cex",
      },
      {
        tool: "fin_query",
        params: { source: "defi", endpoint: "protocols", params: { _base: "main" } },
        label: "defi",
      },
    ],
  },
];

/* ---------- tests ---------- */

const TIMEOUT = 60_000;

describe("live scenarios (8 skills)", () => {
  let tools: Map<string, Tool>;

  beforeAll(() => {
    const endpoint =
      process.env.FIN_DATA_HUB_ENDPOINT || process.env.OPENFINCLAW_FIN_DATA_HUB_ENDPOINT;
    const apiKey = process.env.FIN_DATA_HUB_API_KEY || process.env.OPENFINCLAW_FIN_DATA_HUB_API_KEY;
    const mode =
      process.env.FIN_DATA_HUB_MODE || process.env.OPENFINCLAW_FIN_DATA_HUB_MODE || "live";

    if (!endpoint) {
      throw new Error(
        "FIN_DATA_HUB_ENDPOINT must be set for live tests. " +
          "Example: FIN_DATA_HUB_ENDPOINT=http://localhost:8089",
      );
    }

    const { api, tools: t } = createFakeApi({
      mode,
      apiKey,
      endpoint,
      requestTimeoutMs: 55_000,
    });
    plugin.register(api);
    tools = t;
  });

  for (const scenario of SCENARIOS) {
    describe(`${scenario.name} [${scenario.skill}] (${scenario.steps.length} calls)`, () => {
      for (const step of scenario.steps) {
        it(
          `${step.label} → status=ok with data`,
          async () => {
            const tool = tools.get(step.tool);
            expect(tool, `tool ${step.tool} should exist`).toBeDefined();

            const result = parseResult(
              await tool!.execute(`live-${scenario.skill}-${step.label}`, step.params),
            );

            expect(result.success).toBe(true);
            const payload = result.result as Record<string, unknown>;
            expect(payload.status).toBe("ok");
            expect(payload.mode).toBe("live");
            expect(payload.data).toBeDefined();

            // Data should not be empty
            const data = payload.data;
            if (Array.isArray(data)) {
              expect(data.length, `${step.label} should return non-empty array`).toBeGreaterThan(0);
            } else {
              expect(data, `${step.label} should return non-null data`).not.toBeNull();
            }
          },
          TIMEOUT,
        );
      }
    });
  }
});
