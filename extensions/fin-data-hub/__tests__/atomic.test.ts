/**
 * Atomic call matrix for fin-data-hub tools (Tushare proxy architecture).
 *
 * Each tool/query_type combination is tested in two modes:
 *   1. Stub mode: no API key -> returns {_stub: true} nested in result.data[]
 *   2. Live mock: mocks global fetch, verifies POST to /api/tushare with X-Api-Key
 *   3. fin_crypto: CoinGecko/DefiLlama in live mode, redirect for CEX data
 *
 * Run: npx vitest run extensions/fin-data-hub/__tests__/atomic.test.ts
 */

import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/** Mock fetch returning a successful Tushare proxy response */
function mockFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: [{ value: 42 }] }),
    };
  });
  return { fake, calls };
}

const LIVE_CONFIG = {
  mode: "live",
  tushareApiKey: "test-key",
  tushareProxyUrl: "https://proxy.test",
};

/* ---------- tool x query_type matrix ---------- */

interface ToolSpec {
  toolName: string;
  queryTypes: {
    qt: string;
    expectedApi: string;
    /** Live-mode behavior: default "tushare", crypto uses redirect/coingecko/defillama */
    behavior?: "redirect" | "coingecko" | "defillama";
  }[];
  buildParams: (qt: string) => Record<string, unknown>;
  requiredFields: string[];
  /** Stub format: "crypto" = flat result with _stub, default = nested data[] with _stub */
  stubFormat?: "crypto";
}

const TOOL_SPECS: ToolSpec[] = [
  {
    toolName: "fin_stock",
    queryTypes: [
      { qt: "quote", expectedApi: "daily" },
      { qt: "historical", expectedApi: "daily" },
      { qt: "income", expectedApi: "income" },
      { qt: "balance", expectedApi: "balancesheet" },
      { qt: "cashflow", expectedApi: "cashflow" },
      { qt: "ratios", expectedApi: "fina_indicator" },
      { qt: "moneyflow", expectedApi: "moneyflow" },
      { qt: "holders", expectedApi: "top10_holders" },
      { qt: "dividends", expectedApi: "dividend" },
      { qt: "news", expectedApi: "major_news" },
      { qt: "pledge", expectedApi: "pledge_stat" },
      { qt: "margin", expectedApi: "margin_detail" },
      { qt: "block_trade", expectedApi: "block_trade" },
      { qt: "factor", expectedApi: "stk_factor" },
    ],
    buildParams: (qt) => ({ symbol: "600519.SH", query_type: qt }),
    requiredFields: ["symbol", "query_type"],
  },
  {
    toolName: "fin_index",
    queryTypes: [
      { qt: "index_historical", expectedApi: "index_daily" },
      { qt: "index_constituents", expectedApi: "index_weight" },
      { qt: "index_valuation", expectedApi: "index_dailybasic" },
      { qt: "etf_historical", expectedApi: "fund_daily" },
      { qt: "etf_nav", expectedApi: "fund_nav" },
      { qt: "fund_manager", expectedApi: "fund_manager" },
      { qt: "fund_portfolio", expectedApi: "fund_portfolio" },
      { qt: "fund_share", expectedApi: "fund_share" },
      { qt: "ths_index", expectedApi: "ths_index" },
      { qt: "ths_daily", expectedApi: "ths_daily" },
      { qt: "ths_member", expectedApi: "ths_member" },
      { qt: "sector_classify", expectedApi: "index_classify" },
    ],
    buildParams: (qt) => ({ symbol: "000300.SH", query_type: qt }),
    requiredFields: ["query_type"],
  },
  {
    toolName: "fin_macro",
    queryTypes: [
      { qt: "gdp", expectedApi: "cn_gdp" },
      { qt: "cpi", expectedApi: "cn_cpi" },
      { qt: "ppi", expectedApi: "cn_ppi" },
      { qt: "pmi", expectedApi: "cn_pmi" },
      { qt: "m2", expectedApi: "cn_m" },
      { qt: "social_financing", expectedApi: "sf" },
      { qt: "shibor", expectedApi: "shibor" },
      { qt: "lpr", expectedApi: "shibor_lpr" },
      { qt: "libor", expectedApi: "libor" },
      { qt: "hibor", expectedApi: "hibor" },
      { qt: "treasury_cn", expectedApi: "yc_cb" },
      { qt: "treasury_us", expectedApi: "us_tycr" },
      { qt: "fx", expectedApi: "fx_daily" },
      { qt: "wb_gdp", expectedApi: "wb_gdp" },
      { qt: "wb_population", expectedApi: "wb_population" },
      { qt: "wb_inflation", expectedApi: "wb_inflation" },
      { qt: "wb_indicator", expectedApi: "wb_indicator" },
    ],
    buildParams: (qt) => {
      const p: Record<string, unknown> = { indicator: qt };
      if (qt === "fx") p.symbol = "USDCNH";
      return p;
    },
    requiredFields: ["indicator"],
  },
  {
    toolName: "fin_derivatives",
    queryTypes: [
      { qt: "futures_historical", expectedApi: "fut_daily" },
      { qt: "futures_info", expectedApi: "fut_basic" },
      { qt: "futures_holding", expectedApi: "fut_holding" },
      { qt: "futures_settle", expectedApi: "fut_settle" },
      { qt: "futures_warehouse", expectedApi: "fut_wsr" },
      { qt: "futures_mapping", expectedApi: "fut_mapping" },
      { qt: "option_basic", expectedApi: "opt_basic" },
      { qt: "option_daily", expectedApi: "opt_daily" },
      { qt: "option_chains", expectedApi: "opt_basic" },
      { qt: "cb_basic", expectedApi: "cb_basic" },
      { qt: "cb_daily", expectedApi: "cb_daily" },
    ],
    buildParams: (qt) => ({ symbol: "IF2501.CFX", query_type: qt }),
    requiredFields: ["query_type"],
  },
  {
    toolName: "fin_crypto",
    queryTypes: [
      { qt: "ohlcv", expectedApi: "", behavior: "redirect" },
      { qt: "ticker", expectedApi: "", behavior: "redirect" },
      { qt: "coin_market", expectedApi: "", behavior: "coingecko" },
      { qt: "defi_protocols", expectedApi: "", behavior: "defillama" },
    ],
    buildParams: (qt) => ({ query_type: qt, symbol: "BTC/USDT" }),
    requiredFields: ["query_type"],
    stubFormat: "crypto",
  },
  {
    toolName: "fin_market",
    queryTypes: [
      { qt: "top_list", expectedApi: "top_list" },
      { qt: "top_inst", expectedApi: "top_inst" },
      { qt: "limit_list", expectedApi: "limit_list_d" },
      { qt: "block_trade", expectedApi: "block_trade" },
      { qt: "moneyflow_industry", expectedApi: "moneyflow_ind_dc" },
      { qt: "concept_list", expectedApi: "ths_index" },
      { qt: "concept_detail", expectedApi: "ths_daily" },
      { qt: "margin", expectedApi: "margin" },
      { qt: "margin_detail", expectedApi: "margin_detail" },
      { qt: "hsgt_flow", expectedApi: "moneyflow_hsgt" },
      { qt: "hsgt_top10", expectedApi: "hsgt_top10" },
      { qt: "index_global", expectedApi: "index_global" },
      { qt: "market_snapshot", expectedApi: "index_global" },
      { qt: "calendar_ipo", expectedApi: "new_share" },
      { qt: "suspend", expectedApi: "suspend_d" },
      { qt: "trade_calendar", expectedApi: "trade_cal" },
    ],
    buildParams: (qt) => ({ query_type: qt, trade_date: "20250228" }),
    requiredFields: ["query_type"],
  },
  {
    toolName: "fin_query",
    queryTypes: [{ qt: "daily", expectedApi: "daily" }],
    buildParams: (qt) => ({ api_name: qt, params: { ts_code: "000001.SZ" } }),
    requiredFields: ["api_name"],
  },
];

/* ---------- tests ---------- */

describe("atomic call matrix (Tushare proxy)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  for (const spec of TOOL_SPECS) {
    describe(`${spec.toolName} (${spec.queryTypes.length} query_types)`, () => {
      /* ---- Stub mode ---- */
      describe("stub mode (no API key)", () => {
        for (const { qt } of spec.queryTypes) {
          it(`${qt} -> stub response with _stub: true`, async () => {
            const { api, tools } = createFakeApi({});
            plugin.register(api);
            const params = spec.buildParams(qt);
            const result = parseResult(
              await tools.get(spec.toolName)!.execute(`stub-${qt}`, params),
            );

            expect(result.success).toBe(true);

            if (spec.stubFormat === "crypto") {
              // fin_crypto: stub at result level
              const inner = result.result as Record<string, unknown>;
              expect(inner._stub).toBe(true);
              expect(inner.query_type).toBe(qt);
            } else {
              // Tushare-backed tools: stub nested in result.data[]
              const inner = result.result as {
                success: boolean;
                data: Record<string, unknown>[];
              };
              expect(inner.success).toBe(true);
              expect(inner.data).toBeInstanceOf(Array);
              expect(inner.data.length).toBeGreaterThan(0);
              expect(inner.data[0]._stub).toBe(true);
              expect(inner.data[0].api_name).toBeDefined();
            }
          });
        }
      });

      /* ---- Live mock ---- */
      describe("live mode (mocked fetch)", () => {
        for (const { qt, expectedApi, behavior } of spec.queryTypes) {
          const label =
            behavior === "redirect"
              ? "redirect (no fetch)"
              : behavior === "coingecko"
                ? "GET CoinGecko"
                : behavior === "defillama"
                  ? "GET DefiLlama"
                  : `POST ${expectedApi}`;
          it(`${qt} -> ${label}`, async () => {
            const { fake, calls } = mockFetch();
            globalThis.fetch = fake as unknown as typeof globalThis.fetch;

            const { api, tools } = createFakeApi(LIVE_CONFIG);
            plugin.register(api);
            const params = spec.buildParams(qt);
            const result = parseResult(
              await tools.get(spec.toolName)!.execute(`live-${qt}`, params),
            );

            expect(result.success).toBe(true);

            if (behavior === "redirect") {
              // CEX data → redirect to fin-data-bus, no fetch
              expect(calls).toHaveLength(0);
              expect(result.source).toBe("redirect");
            } else if (behavior === "coingecko") {
              expect(calls).toHaveLength(1);
              expect(calls[0].url).toContain("api.coingecko.com");
            } else if (behavior === "defillama") {
              expect(calls).toHaveLength(1);
              expect(calls[0].url).toContain("api.llama.fi");
            } else {
              // Tushare proxy
              expect(calls).toHaveLength(1);
              const { url, init } = calls[0];

              // URL
              expect(url).toBe("https://proxy.test/api/tushare");

              // Method
              expect(init.method).toBe("POST");

              // Headers
              const headers = init.headers as Record<string, string>;
              expect(headers["Content-Type"]).toBe("application/json");
              expect(headers["X-Api-Key"]).toBe("test-key");

              // Body
              const body = JSON.parse(init.body as string) as Record<string, unknown>;
              expect(body.api_name).toBe(expectedApi);
              expect(body.params).toBeDefined();

              // Result wraps proxy response
              const inner = result.result as { success: boolean; data: unknown[] };
              expect(inner.success).toBe(true);
              expect(inner.data).toEqual([{ value: 42 }]);
            }
          });
        }
      });

      /* ---- Required params validation ---- */
      it("returns error when required params are missing", async () => {
        const { api, tools } = createFakeApi({});
        plugin.register(api);
        const result = parseResult(await tools.get(spec.toolName)!.execute("missing-params", {}));
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe("string");
      });
    });
  }

  /* ---- Market detection (fin_stock) ---- */
  describe("fin_stock market detection", () => {
    const cases: { symbol: string; expectedApi: string; market: string }[] = [
      { symbol: "600519.SH", expectedApi: "daily", market: "cn" },
      { symbol: "000001.SZ", expectedApi: "daily", market: "cn" },
      { symbol: "00700.HK", expectedApi: "hk_daily", market: "hk" },
      { symbol: "AAPL", expectedApi: "us_daily", market: "us" },
      { symbol: "MSFT", expectedApi: "us_daily", market: "us" },
    ];
    for (const { symbol, expectedApi, market } of cases) {
      it(`${symbol} -> ${market} (${expectedApi})`, async () => {
        const { fake, calls } = mockFetch();
        globalThis.fetch = fake as unknown as typeof globalThis.fetch;

        const { api, tools } = createFakeApi(LIVE_CONFIG);
        plugin.register(api);
        const result = parseResult(
          await tools.get("fin_stock")!.execute("mkt", { symbol, query_type: "quote" }),
        );

        expect(result.success).toBe(true);
        expect(result.market).toBe(market);
        expect(result.api_name).toBe(expectedApi);
        expect(calls).toHaveLength(1);
        const body = JSON.parse(calls[0].init.body as string) as Record<string, unknown>;
        expect(body.api_name).toBe(expectedApi);
      });
    }
  });

  /* ---- Date conversion ---- */
  describe("date conversion (YYYY-MM-DD -> YYYYMMDD)", () => {
    it("converts dashed dates in start_date / end_date", async () => {
      const { fake, calls } = mockFetch();
      globalThis.fetch = fake as unknown as typeof globalThis.fetch;

      const { api, tools } = createFakeApi(LIVE_CONFIG);
      plugin.register(api);
      await tools.get("fin_stock")!.execute("date", {
        symbol: "600519.SH",
        query_type: "historical",
        start_date: "2025-01-01",
        end_date: "2025-12-31",
      });

      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].init.body as string) as {
        params: { start_date?: string; end_date?: string };
      };
      expect(body.params.start_date).toBe("20250101");
      expect(body.params.end_date).toBe("20251231");
    });
  });

  /* ---- fin_query: fields passthrough ---- */
  describe("fin_query fields passthrough", () => {
    it("includes fields in Tushare POST body", async () => {
      const { fake, calls } = mockFetch();
      globalThis.fetch = fake as unknown as typeof globalThis.fetch;

      const { api, tools } = createFakeApi(LIVE_CONFIG);
      plugin.register(api);
      await tools.get("fin_query")!.execute("fields", {
        api_name: "daily",
        params: { ts_code: "600519.SH" },
        fields: "ts_code,trade_date,close",
      });

      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].init.body as string) as Record<string, unknown>;
      expect(body.api_name).toBe("daily");
      expect(body.params).toEqual({ ts_code: "600519.SH" });
      expect(body.fields).toBe("ts_code,trade_date,close");
    });
  });

  /* ---- fin_macro: fx with symbol ---- */
  describe("fin_macro fx symbol passthrough", () => {
    it("passes USDCNH as ts_code for fx indicator", async () => {
      const { fake, calls } = mockFetch();
      globalThis.fetch = fake as unknown as typeof globalThis.fetch;

      const { api, tools } = createFakeApi(LIVE_CONFIG);
      plugin.register(api);
      await tools.get("fin_macro")!.execute("fx", { indicator: "fx", symbol: "USDCNH" });

      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0].init.body as string) as {
        api_name: string;
        params: { ts_code?: string };
      };
      expect(body.api_name).toBe("fx_daily");
      expect(body.params.ts_code).toBe("USDCNH");
    });
  });
});
