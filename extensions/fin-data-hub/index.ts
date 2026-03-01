import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";

/* ---------- helpers ---------- */

const json = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  details: payload,
});

const DEFAULT_PROXY_URL = "http://43.134.187.48:7088";

type DataHubConfig = {
  mode: "stub" | "live";
  tushareProxyUrl: string;
  tushareApiKey?: string;
  coingeckoApiKey?: string;
  coinglassApiKey?: string;
  requestTimeoutMs: number;
};

function readEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function resolveConfig(api: OpenClawPluginApi): DataHubConfig {
  const raw = api.pluginConfig as Record<string, unknown> | undefined;

  const modeRaw =
    (typeof raw?.mode === "string" ? raw.mode : undefined) ??
    readEnv(["OPENFINCLAW_FIN_DATA_HUB_MODE", "FIN_DATA_HUB_MODE"]);

  const timeoutRaw =
    raw?.requestTimeoutMs ??
    readEnv(["OPENFINCLAW_FIN_DATA_HUB_TIMEOUT_MS", "FIN_DATA_HUB_TIMEOUT_MS"]);
  const timeout = Number(timeoutRaw);

  const tushareApiKey =
    (typeof raw?.tushareApiKey === "string" ? raw.tushareApiKey : undefined) ??
    (typeof raw?.apiKey === "string" ? raw.apiKey : undefined) ??
    readEnv(["TUSHARE_PROXY_API_KEY", "FIN_DATA_HUB_API_KEY"]);

  const tushareProxyUrl =
    (typeof raw?.tushareProxyUrl === "string" ? raw.tushareProxyUrl : undefined) ??
    (typeof raw?.endpoint === "string" ? raw.endpoint : undefined) ??
    readEnv(["TUSHARE_PROXY_URL", "FIN_DATA_HUB_ENDPOINT"]) ??
    DEFAULT_PROXY_URL;

  const coingeckoApiKey =
    (typeof raw?.coingeckoApiKey === "string" ? raw.coingeckoApiKey : undefined) ??
    readEnv(["COINGECKO_API_KEY"]);

  const coinglassApiKey =
    (typeof raw?.coinglassApiKey === "string" ? raw.coinglassApiKey : undefined) ??
    readEnv(["COINGLASS_API_KEY"]);

  const mode =
    modeRaw === "stub" ? "stub" : modeRaw === "live" ? "live" : tushareApiKey ? "live" : "stub";

  return {
    mode,
    tushareApiKey,
    coingeckoApiKey,
    coinglassApiKey,
    tushareProxyUrl: tushareProxyUrl.replace(/\/+$/, ""),
    requestTimeoutMs: Number.isFinite(timeout) && timeout >= 1000 ? Math.floor(timeout) : 30_000,
  };
}

/* ---------- Tushare proxy call ---------- */

async function tusharePost(
  config: DataHubConfig,
  apiName: string,
  params: Record<string, unknown>,
  fields?: string,
): Promise<{ success: boolean; data: unknown[] }> {
  if (config.mode === "stub") {
    return {
      success: true,
      data: [
        {
          _stub: true,
          api_name: apiName,
          params,
          message: "Stub mode. Set TUSHARE_PROXY_API_KEY or configure tushareApiKey for real data.",
        },
      ],
    };
  }

  const url = `${config.tushareProxyUrl}/api/tushare`;
  const body: Record<string, unknown> = { api_name: apiName, params };
  if (fields) body.fields = fields;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.tushareApiKey) headers["X-Api-Key"] = config.tushareApiKey;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });

  const text = await response.text();
  let payload: { success?: boolean; data?: unknown[]; error?: string };
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Tushare proxy returned non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(
      `Tushare proxy error (${response.status}): ${payload.error ?? text.slice(0, 200)}`,
    );
  }
  if (!payload.success) {
    throw new Error(`Tushare query failed: ${payload.error ?? "unknown error"}`);
  }

  return { success: true, data: payload.data ?? [] };
}

/* ---------- market detection ---------- */

function detectMarket(symbol: string): "cn" | "hk" | "us" {
  const upper = symbol.toUpperCase();
  if (upper.endsWith(".HK")) return "hk";
  if (upper.endsWith(".SH") || upper.endsWith(".SZ") || upper.endsWith(".BJ")) return "cn";
  if (/^[A-Z]{1,5}$/.test(upper)) return "us";
  return "cn"; // default to CN for numeric codes
}

/* ---------- query_type → Tushare api_name mappings ---------- */

const STOCK_CN_MAP: Record<string, string> = {
  quote: "daily",
  historical: "daily",
  income: "income",
  balance: "balancesheet",
  cashflow: "cashflow",
  ratios: "fina_indicator",
  moneyflow: "moneyflow",
  holders: "top10_holders",
  dividends: "dividend",
  news: "major_news",
  pledge: "pledge_stat",
  margin: "margin_detail",
  block_trade: "block_trade",
  factor: "stk_factor",
};

const STOCK_HK_MAP: Record<string, string> = {
  quote: "hk_daily",
  historical: "hk_daily",
  income: "hk_income",
  balance: "hk_balancesheet",
  cashflow: "hk_cashflow",
  ratios: "hk_fina_indicator",
};

const STOCK_US_MAP: Record<string, string> = {
  quote: "us_daily",
  historical: "us_daily",
  income: "us_income",
  balance: "us_balancesheet",
  cashflow: "us_cashflow",
  ratios: "us_fina_indicator",
};

function resolveStockApi(queryType: string, market: string): string {
  if (market === "hk") return STOCK_HK_MAP[queryType] ?? STOCK_CN_MAP[queryType] ?? queryType;
  if (market === "us") return STOCK_US_MAP[queryType] ?? STOCK_CN_MAP[queryType] ?? queryType;
  return STOCK_CN_MAP[queryType] ?? queryType;
}

const INDEX_MAP: Record<string, string> = {
  index_historical: "index_daily",
  index_constituents: "index_weight",
  index_valuation: "index_dailybasic",
  etf_historical: "fund_daily",
  etf_nav: "fund_nav",
  fund_manager: "fund_manager",
  fund_portfolio: "fund_portfolio",
  fund_share: "fund_share",
  ths_index: "ths_index",
  ths_daily: "ths_daily",
  ths_member: "ths_member",
  sector_classify: "index_classify",
};

const MACRO_MAP: Record<string, string> = {
  gdp: "cn_gdp",
  cpi: "cn_cpi",
  ppi: "cn_ppi",
  pmi: "cn_pmi",
  m2: "cn_m",
  money_supply: "cn_m",
  social_financing: "sf",
  shibor: "shibor",
  shibor_quote: "shibor_quote",
  lpr: "shibor_lpr",
  libor: "libor",
  hibor: "hibor",
  treasury_cn: "yc_cb",
  treasury_us: "us_tycr",
  wz_index: "wz_index",
  fx: "fx_daily",
  calendar: "eco_cal",
  // World Bank passthrough (api_name used directly when not in map)
  wb_gdp: "wb_gdp",
  wb_population: "wb_population",
  wb_inflation: "wb_inflation",
  wb_indicator: "wb_indicator",
};

const DERIV_MAP: Record<string, string> = {
  futures_historical: "fut_daily",
  futures_info: "fut_basic",
  futures_holding: "fut_holding",
  futures_settle: "fut_settle",
  futures_warehouse: "fut_wsr",
  futures_mapping: "fut_mapping",
  option_basic: "opt_basic",
  option_daily: "opt_daily",
  option_chains: "opt_basic", // fallback — real US options need separate provider
  cb_basic: "cb_basic",
  cb_daily: "cb_daily",
};

const MARKET_MAP: Record<string, string> = {
  top_list: "top_list",
  top_inst: "top_inst",
  limit_list: "limit_list_d",
  block_trade: "block_trade",
  moneyflow_industry: "moneyflow_ind_dc",
  concept_list: "ths_index",
  concept_detail: "ths_daily",
  margin: "margin",
  margin_detail: "margin_detail",
  hsgt_flow: "moneyflow_hsgt",
  hsgt_top10: "hsgt_top10",
  index_global: "index_global",
  market_snapshot: "index_global",
  calendar_ipo: "new_share",
  suspend: "suspend_d",
  trade_calendar: "trade_cal",
};

/* ---------- build Tushare params ---------- */

function buildTushareParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (params.symbol) out.ts_code = String(params.symbol);
  if (params.start_date) out.start_date = String(params.start_date).replace(/-/g, "");
  if (params.end_date) out.end_date = String(params.end_date).replace(/-/g, "");
  if (params.trade_date) out.trade_date = String(params.trade_date).replace(/-/g, "");
  if (params.limit) out.limit = params.limit;
  if (params.exchange) out.exchange = params.exchange;
  return out;
}

/* ---------- CoinGecko + DefiLlama helpers ---------- */

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const DEFILLAMA_BASE = "https://api.llama.fi";

async function coingeckoGet(
  config: DataHubConfig,
  path: string,
  params?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`${COINGECKO_BASE}${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const headers: Record<string, string> = {};
  if (config.coingeckoApiKey) headers["x-cg-demo-api-key"] = config.coingeckoApiKey;

  const resp = await fetch(url.toString(), {
    headers,
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`CoinGecko error (${resp.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function defillamaGet(config: DataHubConfig, path: string): Promise<unknown> {
  const resp = await fetch(`${DEFILLAMA_BASE}${path}`, {
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`DefiLlama error (${resp.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/** Route crypto query_type to the right API */
async function executeCryptoQuery(
  config: DataHubConfig,
  queryType: string,
  params: Record<string, unknown>,
): Promise<{ source: string; data: unknown }> {
  const symbol = String(params.symbol ?? "").trim();
  const limit = params.limit ? String(params.limit) : undefined;

  switch (queryType) {
    // --- CoinGecko market data ---
    case "coin_global":
      return { source: "coingecko", data: await coingeckoGet(config, "/global") };

    case "coin_market":
      return {
        source: "coingecko",
        data: await coingeckoGet(config, "/coins/markets", {
          vs_currency: "usd",
          order: "market_cap_desc",
          per_page: limit ?? "50",
          sparkline: "false",
        }),
      };

    case "coin_trending":
      return { source: "coingecko", data: await coingeckoGet(config, "/search/trending") };

    case "coin_categories":
      return { source: "coingecko", data: await coingeckoGet(config, "/coins/categories") };

    case "coin_info": {
      const coinId = symbol.toLowerCase() || "bitcoin";
      return {
        source: "coingecko",
        data: await coingeckoGet(config, `/coins/${coinId}`, {
          localization: "false",
          tickers: "false",
          community_data: "false",
          developer_data: "false",
        }),
      };
    }

    case "coin_historical": {
      const coinId = symbol.toLowerCase() || "bitcoin";
      const days = limit ?? "30";
      return {
        source: "coingecko",
        data: await coingeckoGet(config, `/coins/${coinId}/market_chart`, {
          vs_currency: "usd",
          days,
        }),
      };
    }

    case "search": {
      const query = symbol || "bitcoin";
      return { source: "coingecko", data: await coingeckoGet(config, "/search", { query }) };
    }

    // --- DefiLlama ---
    case "defi_protocols":
      return { source: "defillama", data: await defillamaGet(config, "/protocols") };

    case "defi_tvl":
      if (symbol) {
        return { source: "defillama", data: await defillamaGet(config, `/tvl/${symbol}`) };
      }
      return { source: "defillama", data: await defillamaGet(config, "/protocols") };

    case "defi_chains":
      return { source: "defillama", data: await defillamaGet(config, "/v2/chains") };

    case "defi_yields":
      return { source: "defillama", data: await defillamaGet(config, "/pools") };

    case "defi_stablecoins":
      return { source: "defillama", data: await defillamaGet(config, "/stablecoins") };

    case "defi_fees":
      return { source: "defillama", data: await defillamaGet(config, "/overview/fees") };

    case "defi_dex_volumes":
      return { source: "defillama", data: await defillamaGet(config, "/overview/dexs") };

    case "defi_coin_prices": {
      const coins = symbol || "coingecko:bitcoin,coingecko:ethereum";
      return {
        source: "defillama",
        data: await defillamaGet(config, `/prices/current/${coins}`),
      };
    }

    // --- CEX data → redirect to fin-data-bus ---
    case "ohlcv":
    case "ticker":
    case "tickers":
    case "orderbook":
    case "trades":
    case "funding_rate":
      return {
        source: "redirect",
        data: {
          message: `CEX ${queryType} data is served by fin-data-bus. Use tools: fin_data_ohlcv, fin_data_ticker.`,
          suggestedTool: queryType === "ohlcv" ? "fin_data_ohlcv" : "fin_data_ticker",
        },
      };

    default:
      throw new Error(`Unknown crypto query_type: ${queryType}`);
  }
}

/* ---------- plugin ---------- */

const finDataHubPlugin = {
  id: "fin-data-hub",
  name: "openFinclaw DataHub",
  description:
    "Financial data bridge to Tushare proxy — A-shares, HK stocks, US equities, Macro, Derivatives. " +
    "Set TUSHARE_PROXY_API_KEY for real-time data.",
  kind: "financial" as const,

  register(api: OpenClawPluginApi) {
    const config = resolveConfig(api);

    // Tool 1: fin_stock — A-share / HK / US equity data
    api.registerTool(
      {
        name: "fin_stock",
        label: "Stock Data (A/HK/US)",
        description:
          "Fetch A-share, HK stock, or US equity data — quotes, historical prices, income statements, balance sheets, cashflow, financial ratios, money flow, holders, dividends, news, pledge, margin, block trades.",
        parameters: Type.Object({
          symbol: Type.String({
            description: "Stock code. A-shares: 600519.SH; HK: 00700.HK; US: AAPL",
          }),
          query_type: Type.Unsafe<string>({
            type: "string",
            enum: [
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
            description: "Type of data to query",
          }),
          start_date: Type.Optional(Type.String({ description: "Start date, e.g. 2025-01-01" })),
          end_date: Type.Optional(Type.String({ description: "End date, e.g. 2025-12-31" })),
          limit: Type.Optional(Type.Number({ description: "Max records to return" })),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const symbol = String(params.symbol ?? "").trim();
            const queryType = String(params.query_type ?? "").trim();
            if (!symbol || !queryType) throw new Error("symbol and query_type are required");
            const market = detectMarket(symbol);
            const apiName = resolveStockApi(queryType, market);
            const tsParams = buildTushareParams(params);
            const result = await tusharePost(config, apiName, tsParams);
            return json({ success: true, market, api_name: apiName, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_stock"] },
    );

    // Tool 2: fin_index — Index / ETF / Fund
    api.registerTool(
      {
        name: "fin_index",
        label: "Index / ETF / Fund",
        description:
          "Query index constituents, index valuations, ETF historical prices/NAV, fund manager/portfolio, fund share, THS concept sector classification.",
        parameters: Type.Object({
          symbol: Type.String({
            description: "Index/ETF/fund code. Index: 000300.SH; ETF: 510050.SH",
          }),
          query_type: Type.Unsafe<string>({
            type: "string",
            enum: [
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
            description: "Type of data to query",
          }),
          start_date: Type.Optional(Type.String()),
          end_date: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number()),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const queryType = String(params.query_type ?? "").trim();
            if (!queryType) throw new Error("query_type is required");
            const apiName = INDEX_MAP[queryType] ?? queryType;
            const tsParams = buildTushareParams(params);
            const result = await tusharePost(config, apiName, tsParams);
            return json({ success: true, api_name: apiName, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_index"] },
    );

    // Tool 3: fin_macro — Macro / Rates / FX
    api.registerTool(
      {
        name: "fin_macro",
        label: "Macro / Rates / FX",
        description:
          "China macro (GDP/CPI/PPI/PMI/M2/money supply/social financing), interest rates (Shibor/LPR/Libor/Hibor), treasury yields (CN + US), FX daily, Wenzhou index, economic calendar. World Bank data via wb_* indicators.",
        parameters: Type.Object({
          indicator: Type.String({
            description:
              "Indicator: gdp, cpi, ppi, pmi, m2, shibor, lpr, libor, hibor, treasury_cn, treasury_us, fx, wz_index",
          }),
          country: Type.Optional(Type.String({ description: "Country code for World Bank" })),
          symbol: Type.Optional(Type.String({ description: "Currency pair for FX, e.g. USDCNH" })),
          start_date: Type.Optional(Type.String()),
          end_date: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number()),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const indicator = String(params.indicator ?? "").trim();
            if (!indicator) throw new Error("indicator is required");
            const apiName = MACRO_MAP[indicator] ?? indicator;
            const tsParams = buildTushareParams(params);
            const result = await tusharePost(config, apiName, tsParams);
            return json({ success: true, api_name: apiName, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_macro"] },
    );

    // Tool 4: fin_derivatives — Futures / Options / CB
    api.registerTool(
      {
        name: "fin_derivatives",
        label: "Futures / Options / CB",
        description:
          "Futures (daily, holdings, settlement, warehouse, mapping), options (basic, daily, chains), convertible bonds (CB).",
        parameters: Type.Object({
          symbol: Type.String({ description: "Contract code, e.g. IF2501.CFX, 113xxx.SH (CB)" }),
          query_type: Type.Unsafe<string>({
            type: "string",
            enum: [
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
            description: "Type of derivatives data",
          }),
          trade_date: Type.Optional(Type.String({ description: "Trade date, e.g. 20250228" })),
          start_date: Type.Optional(Type.String()),
          end_date: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number()),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const queryType = String(params.query_type ?? "").trim();
            if (!queryType) throw new Error("query_type is required");
            const apiName = DERIV_MAP[queryType] ?? queryType;
            const tsParams = buildTushareParams(params);
            const result = await tusharePost(config, apiName, tsParams);
            return json({ success: true, api_name: apiName, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_derivatives"] },
    );

    // Tool 5: fin_crypto — Crypto / DeFi (stub — real data from fin-data-bus CCXT)
    api.registerTool(
      {
        name: "fin_crypto",
        label: "Crypto & DeFi",
        description:
          "Crypto market data — K-lines/OHLCV, tickers, orderbook, trades, funding rates via CEX (fin-data-bus/CCXT). " +
          "CoinGecko: market cap rankings, trending coins, global stats, coin info/categories. " +
          "DeFi: TVL protocols, yields, chains, stablecoins, fees, DEX volumes, coin prices.",
        parameters: Type.Object({
          query_type: Type.Unsafe<string>({
            type: "string",
            enum: [
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
            description: "Type of crypto/DeFi data",
          }),
          symbol: Type.Optional(Type.String({ description: "Trading pair or slug" })),
          exchange: Type.Optional(Type.String({ description: "Exchange name" })),
          timeframe: Type.Optional(Type.String({ description: "Candle timeframe" })),
          chain: Type.Optional(Type.String({ description: "Blockchain name" })),
          limit: Type.Optional(Type.Number()),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const queryType = String(params.query_type ?? "").trim();
            if (!queryType) throw new Error("query_type is required");

            if (config.mode === "stub") {
              return json({
                success: true,
                result: {
                  _stub: true,
                  query_type: queryType,
                  message: "Stub mode. Set COINGECKO_API_KEY for CoinGecko data.",
                },
              });
            }

            const result = await executeCryptoQuery(config, queryType, params);
            return json({
              success: true,
              query_type: queryType,
              source: result.source,
              result: result.data,
            });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_crypto"] },
    );

    // Tool 6: fin_market — Market Radar
    api.registerTool(
      {
        name: "fin_market",
        label: "Market Radar",
        description:
          "Market monitoring — dragon-tiger list (top movers), limit-up/down stats, block trades, sector/industry money flow, margin trading, Stock Connect (HSGT) north/south flow, global index snapshot, IPO calendar, suspend, trade calendar.",
        parameters: Type.Object({
          query_type: Type.Unsafe<string>({
            type: "string",
            enum: [
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
            description: "Type of market data",
          }),
          trade_date: Type.Optional(Type.String({ description: "Trade date, e.g. 20250228" })),
          symbol: Type.Optional(Type.String({ description: "Symbol for specific queries" })),
          start_date: Type.Optional(Type.String()),
          end_date: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number()),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const queryType = String(params.query_type ?? "").trim();
            if (!queryType) throw new Error("query_type is required");
            const apiName = MARKET_MAP[queryType] ?? queryType;
            const tsParams = buildTushareParams(params);
            const result = await tusharePost(config, apiName, tsParams);
            return json({ success: true, api_name: apiName, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_market"] },
    );

    // Tool 7: fin_query — Raw Tushare query (fallback)
    api.registerTool(
      {
        name: "fin_query",
        label: "Raw Tushare Query",
        description:
          "Raw Tushare API fallback — direct passthrough to any of 162+ Tushare endpoints by api_name. Use when other tools don't cover the specific data.",
        parameters: Type.Object({
          api_name: Type.String({
            description: "Tushare API name, e.g. daily, hk_daily, cn_gdp, fut_daily",
          }),
          params: Type.Optional(
            Type.Record(Type.String(), Type.Unknown(), {
              description: "Query parameters as key-value pairs, e.g. {ts_code: '600519.SH'}",
            }),
          ),
          fields: Type.Optional(
            Type.String({ description: "Comma-separated field list to return" }),
          ),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const apiName = String(params.api_name ?? "").trim();
            if (!apiName) throw new Error("api_name is required");
            const tsParams = (params.params ?? {}) as Record<string, unknown>;
            const fields = params.fields ? String(params.fields) : undefined;
            const result = await tusharePost(config, apiName, tsParams, fields);
            return json({ success: true, api_name: apiName, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_query"] },
    );

    // Register gateway service for fin-data-bus consumption
    api.registerService({
      id: "fin-datahub-gateway",
      start: () => {},
      instance: { tusharePost: tusharePost.bind(null, config), config },
    });
  },
};

export default finDataHubPlugin;
