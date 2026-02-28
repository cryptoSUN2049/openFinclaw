import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";

/* ---------- helpers ---------- */

const json = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  details: payload,
});

type DataHubConfig = {
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

function resolveConfig(api: OpenClawPluginApi): DataHubConfig {
  const raw = api.pluginConfig as Record<string, unknown> | undefined;

  const modeRaw =
    (typeof raw?.mode === "string" ? raw.mode : undefined) ??
    readEnv(["OPENFINCLAW_FIN_DATA_HUB_MODE", "FIN_DATA_HUB_MODE"]);

  const timeoutRaw =
    raw?.requestTimeoutMs ??
    readEnv(["OPENFINCLAW_FIN_DATA_HUB_TIMEOUT_MS", "FIN_DATA_HUB_TIMEOUT_MS"]);
  const timeout = Number(timeoutRaw);

  return {
    mode: modeRaw === "live" ? "live" : "stub",
    apiKey:
      (typeof raw?.apiKey === "string" ? raw.apiKey : undefined) ??
      readEnv(["OPENFINCLAW_FIN_DATA_HUB_API_KEY", "FIN_DATA_HUB_API_KEY"]),
    endpoint:
      (typeof raw?.endpoint === "string" ? raw.endpoint : undefined) ??
      readEnv(["OPENFINCLAW_FIN_DATA_HUB_ENDPOINT", "FIN_DATA_HUB_ENDPOINT"]),
    requestTimeoutMs: Number.isFinite(timeout) && timeout >= 1000 ? Math.floor(timeout) : 30_000,
  };
}

/* ---------- gateway HTTP call ---------- */

async function gatewayRequest(
  config: DataHubConfig,
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
        "openFinclaw-DataHub running in stub mode. Set FIN_DATA_HUB_MODE=live and configure FIN_DATA_HUB_ENDPOINT to call the real gateway.",
    };
  }

  if (!config.endpoint) {
    throw new Error(
      "Data Hub gateway endpoint not configured. Set FIN_DATA_HUB_ENDPOINT environment variable.",
    );
  }

  const url = new URL(path, config.endpoint).toString();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
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
    throw new Error(
      `Data Hub gateway error (${response.status}): ${String(message).slice(0, 240)}`,
    );
  }

  return { status: "ok", mode: "live", endpoint: url, data: payload };
}

/* ---------- plugin ---------- */

const finDataHubPlugin = {
  id: "fin-data-hub",
  name: "openFinclaw-DataHub",
  description:
    "Financial data from 162 endpoints — A-shares, HK, US, Crypto/DeFi, Macro indicators",
  kind: "financial" as const,

  register(api: OpenClawPluginApi) {
    const config = resolveConfig(api);

    // ---------------------------------------------------------------
    // Tool 1: fin_stock -- A-share / HK / US equity data
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_stock",
        label: "Stock Data (A/HK/US)",
        description:
          "Fetch A-share, HK stock, or US equity data — quotes, historical prices, financials (income/balance/cashflow), money flow, holders, dividends, and news.",
        parameters: Type.Object({
          symbol: Type.String({
            description: "Stock code. A-shares: 600519.SH / 000001.SZ; HK: 00700.HK; US: AAPL",
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
            const result = await gatewayRequest(config, "/v1/stock", {
              symbol,
              query_type: queryType,
              start_date: params.start_date,
              end_date: params.end_date,
              limit: params.limit,
            });
            return json({ success: true, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_stock"] },
    );

    // ---------------------------------------------------------------
    // Tool 2: fin_index -- Index / ETF / Fund
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_index",
        label: "Index / ETF / Fund",
        description:
          "Query index constituents, valuations, ETF prices/NAV, fund manager/portfolio data, and sector rotation via THS concepts.",
        parameters: Type.Object({
          symbol: Type.String({
            description: "Index/ETF/fund code. Index: 000300.SH; ETF: 510050.SH; THS concept code",
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
            const symbol = String(params.symbol ?? "").trim();
            const queryType = String(params.query_type ?? "").trim();
            if (!queryType) throw new Error("query_type is required");
            const result = await gatewayRequest(config, "/v1/index", {
              symbol,
              query_type: queryType,
              start_date: params.start_date,
              end_date: params.end_date,
              limit: params.limit,
            });
            return json({ success: true, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_index"] },
    );

    // ---------------------------------------------------------------
    // Tool 3: fin_macro -- Macro / Rates / FX
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_macro",
        label: "Macro / Rates / FX",
        description:
          "China macro (GDP/CPI/PPI/PMI/M2/social financing), interest rates (Shibor/LPR/Libor/treasury yields), World Bank global data, and currency exchange rates.",
        parameters: Type.Object({
          indicator: Type.String({
            description:
              "Indicator name: gdp, cpi, ppi, pmi, m2, social_financing, shibor, lpr, libor, hibor, treasury_cn, treasury_us, fx, wb_gdp, wb_population, wb_inflation, wb_indicator",
          }),
          country: Type.Optional(
            Type.String({ description: "Country code for World Bank, e.g. CN, US, JP" }),
          ),
          symbol: Type.Optional(Type.String({ description: "Currency pair for FX, e.g. USDCNH" })),
          start_date: Type.Optional(Type.String()),
          end_date: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number()),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const indicator = String(params.indicator ?? "").trim();
            if (!indicator) throw new Error("indicator is required");
            const result = await gatewayRequest(config, "/v1/macro", {
              indicator,
              country: params.country,
              symbol: params.symbol,
              start_date: params.start_date,
              end_date: params.end_date,
              limit: params.limit,
            });
            return json({ success: true, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_macro"] },
    );

    // ---------------------------------------------------------------
    // Tool 4: fin_derivatives -- Futures / Options / CB
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_derivatives",
        label: "Futures / Options / Convertible Bonds",
        description:
          "Futures (holdings, settlement, warehouse receipts, term structure), options (chains with Greeks), and convertible bonds (conversion value, premium).",
        parameters: Type.Object({
          symbol: Type.String({
            description: "Contract code, e.g. IF2501.CFX, AAPL (for US options), 113xxx.SH (CB)",
          }),
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
          trade_date: Type.Optional(
            Type.String({ description: "Trade date for daily data, e.g. 20250228" }),
          ),
          start_date: Type.Optional(Type.String()),
          end_date: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number()),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const symbol = String(params.symbol ?? "").trim();
            const queryType = String(params.query_type ?? "").trim();
            if (!queryType) throw new Error("query_type is required");
            const result = await gatewayRequest(config, "/v1/derivatives", {
              symbol,
              query_type: queryType,
              trade_date: params.trade_date,
              start_date: params.start_date,
              end_date: params.end_date,
              limit: params.limit,
            });
            return json({ success: true, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_derivatives"] },
    );

    // ---------------------------------------------------------------
    // Tool 5: fin_crypto -- Crypto / DeFi
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_crypto",
        label: "Crypto & DeFi",
        description:
          "CEX market data (K-lines, tickers, orderbook, funding rates from 100+ exchanges), DeFi protocol TVL/yields/stablecoins/DEX volumes, and crypto market cap rankings/trending.",
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
          symbol: Type.Optional(
            Type.String({ description: "Trading pair e.g. BTC/USDT or protocol slug e.g. aave" }),
          ),
          exchange: Type.Optional(
            Type.String({ description: "Exchange name for CEX data, e.g. binance, okx" }),
          ),
          timeframe: Type.Optional(
            Type.String({ description: "Candle timeframe: 1m, 5m, 1h, 4h, 1d" }),
          ),
          chain: Type.Optional(
            Type.String({ description: "Blockchain name for DeFi filters, e.g. ethereum, bsc" }),
          ),
          limit: Type.Optional(Type.Number()),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const queryType = String(params.query_type ?? "").trim();
            if (!queryType) throw new Error("query_type is required");
            const result = await gatewayRequest(config, "/v1/crypto", {
              query_type: queryType,
              symbol: params.symbol,
              exchange: params.exchange,
              timeframe: params.timeframe,
              chain: params.chain,
              limit: params.limit,
            });
            return json({ success: true, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_crypto"] },
    );

    // ---------------------------------------------------------------
    // Tool 6: fin_market -- Market Radar
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_market",
        label: "Market Radar",
        description:
          "Market monitoring — dragon-tiger list (top movers), limit-up/down stats, block trades, sector money flow, margin trading, global index snapshots, IPO calendar.",
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
          trade_date: Type.Optional(
            Type.String({ description: "Trade date, e.g. 20250228 or 2025-02-28" }),
          ),
          symbol: Type.Optional(Type.String({ description: "Symbol for specific queries" })),
          start_date: Type.Optional(Type.String()),
          end_date: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number()),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const queryType = String(params.query_type ?? "").trim();
            if (!queryType) throw new Error("query_type is required");
            const result = await gatewayRequest(config, "/v1/market", {
              query_type: queryType,
              trade_date: params.trade_date,
              symbol: params.symbol,
              start_date: params.start_date,
              end_date: params.end_date,
              limit: params.limit,
            });
            return json({ success: true, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_market"] },
    );

    // ---------------------------------------------------------------
    // Tool 7: fin_query -- Raw Data Query (fallback)
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_query",
        label: "Raw Data Query",
        description:
          "Generic fallback query — directly call any of the 162 data endpoints by specifying the API source and endpoint name. Use when other tools don't cover the specific data need.",
        parameters: Type.Object({
          source: Type.Unsafe<string>({
            type: "string",
            enum: [
              "china_equity",
              "global_equity",
              "crypto_cex",
              "defi",
              "crypto_market",
              "macro_global",
            ],
            description: "Data source to query",
          }),
          endpoint: Type.String({
            description: "API endpoint or api_name, e.g. /equity/price/historical, hk_daily, etc.",
          }),
          params: Type.Optional(
            Type.Record(Type.String(), Type.Unknown(), {
              description: "Query parameters as key-value pairs",
            }),
          ),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const source = String(params.source ?? "").trim();
            const endpoint = String(params.endpoint ?? "").trim();
            if (!source || !endpoint) throw new Error("source and endpoint are required");
            const result = await gatewayRequest(config, "/v1/query", {
              source,
              endpoint,
              params: params.params ?? {},
            });
            return json({ success: true, result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_query"] },
    );
  },
};

export default finDataHubPlugin;
