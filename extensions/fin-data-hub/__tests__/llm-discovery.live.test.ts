/**
 * LLM self-discovery test — verify that an LLM (via LiteLLM Proxy) can
 * correctly route natural language financial queries to the right tool
 * and query_type using function-calling / tool_choice.
 *
 * Requires:
 *   - LiteLLM Proxy running (or any OpenAI-compatible endpoint)
 *   - LITELLM_BASE_URL, LITELLM_API_KEY, LITELLM_MODEL env vars
 *
 * Excluded from CI by vitest config (*.live.test.ts pattern).
 *
 * Run:
 *   LITELLM_BASE_URL=http://localhost:8600/v1 \
 *   LITELLM_API_KEY=sk-xxx \
 *   LITELLM_MODEL=deepseek/deepseek-chat \
 *   npx vitest run extensions/fin-data-hub/__tests__/llm-discovery.live.test.ts
 */

import { beforeAll, describe, expect, it } from "vitest";

/* ---------- config ---------- */

const LITELLM_BASE = process.env.LITELLM_BASE_URL || "http://localhost:8600/v1";
const LITELLM_KEY = process.env.LITELLM_API_KEY || "";
const LITELLM_MODEL = process.env.LITELLM_MODEL || "deepseek/deepseek-chat";

/* ---------- Tool JSON Schema (matches index.ts registerTool definitions) ---------- */

const TOOLS_SCHEMA = [
  {
    type: "function" as const,
    function: {
      name: "fin_stock",
      description:
        "Fetch A-share, HK stock, or US equity data — quotes, historical prices, financials (income/balance/cashflow), money flow, holders, dividends, and news.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Stock code. A-shares: 600519.SH / 000001.SZ; HK: 00700.HK; US: AAPL",
          },
          query_type: {
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
          },
        },
        required: ["symbol", "query_type"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fin_index",
      description:
        "Query index constituents, valuations, ETF prices/NAV, fund manager/portfolio data, and sector rotation via THS concepts.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Index/ETF/fund code. Index: 000300.SH; ETF: 510050.SH",
          },
          query_type: {
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
          },
        },
        required: ["query_type"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fin_macro",
      description:
        "China macro (GDP/CPI/PPI/PMI/M2/social financing), interest rates (Shibor/LPR/Libor/treasury yields), World Bank global data, and currency exchange rates.",
      parameters: {
        type: "object",
        properties: {
          indicator: {
            type: "string",
            description:
              "Indicator name: gdp, cpi, ppi, pmi, m2, social_financing, shibor, lpr, libor, hibor, treasury_cn, treasury_us, fx, wb_gdp, wb_population, wb_inflation, wb_indicator",
          },
          country: { type: "string", description: "Country code for World Bank, e.g. CN, US, JP" },
        },
        required: ["indicator"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fin_derivatives",
      description:
        "Futures (holdings, settlement, warehouse receipts, term structure), options (chains with Greeks), and convertible bonds (conversion value, premium).",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Contract code, e.g. IF2501.CFX, AAPL (for US options), 113xxx.SH (CB)",
          },
          query_type: {
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
          },
        },
        required: ["query_type"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fin_crypto",
      description:
        "CEX market data (K-lines, tickers, orderbook, funding rates from 100+ exchanges), DeFi protocol TVL/yields/stablecoins/DEX volumes, and crypto market cap rankings/trending.",
      parameters: {
        type: "object",
        properties: {
          query_type: {
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
          },
          symbol: { type: "string", description: "Trading pair e.g. BTC/USDT or protocol slug" },
          exchange: {
            type: "string",
            description: "Exchange name for CEX data, e.g. binance, okx",
          },
        },
        required: ["query_type"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fin_market",
      description:
        "Market monitoring — dragon-tiger list (top movers), limit-up/down stats, block trades, sector money flow, margin trading, global index snapshots, IPO calendar.",
      parameters: {
        type: "object",
        properties: {
          query_type: {
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
          },
          trade_date: { type: "string", description: "Trade date, e.g. 20250228" },
        },
        required: ["query_type"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fin_query",
      description:
        "Generic fallback query — directly call any of the 162 data endpoints by specifying the API source and endpoint name. Use when other tools don't cover the specific data need.",
      parameters: {
        type: "object",
        properties: {
          source: {
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
          },
          endpoint: { type: "string", description: "API endpoint or api_name" },
        },
        required: ["source", "endpoint"],
      },
    },
  },
];

/* ---------- test matrix ---------- */

interface DiscoveryCase {
  prompt: string;
  expectTool: string;
  expectArgs: Record<string, string>;
}

const LLM_DISCOVERY_CASES: DiscoveryCase[] = [
  {
    prompt: "帮我查一下贵州茅台的最新股价",
    expectTool: "fin_stock",
    expectArgs: { query_type: "quote" },
  },
  {
    prompt: "BTC 在 Binance 的实时价格是多少",
    expectTool: "fin_crypto",
    expectArgs: { query_type: "ticker" },
  },
  { prompt: "最新的中国 CPI 数据", expectTool: "fin_macro", expectArgs: { indicator: "cpi" } },
  {
    prompt: "今天龙虎榜有哪些股票",
    expectTool: "fin_market",
    expectArgs: { query_type: "top_list" },
  },
  {
    prompt: "沪深300指数的成份股",
    expectTool: "fin_index",
    expectArgs: { query_type: "index_constituents" },
  },
  {
    prompt: "AAPL 的期权链",
    expectTool: "fin_derivatives",
    expectArgs: { query_type: "option_chains" },
  },
  {
    prompt: "DeFi 协议 TVL 排行",
    expectTool: "fin_crypto",
    expectArgs: { query_type: "defi_protocols" },
  },
  { prompt: "港股腾讯今天行情", expectTool: "fin_stock", expectArgs: { query_type: "quote" } },
  {
    prompt: "美国 10 年期国债收益率",
    expectTool: "fin_macro",
    expectArgs: { indicator: "treasury_us" },
  },
  {
    prompt: "螺纹钢期货持仓排名",
    expectTool: "fin_derivatives",
    expectArgs: { query_type: "futures_holding" },
  },
  { prompt: "北向资金今日流入", expectTool: "fin_market", expectArgs: { query_type: "hsgt_flow" } },
  {
    prompt: "以太坊 DeFi 锁仓量变化",
    expectTool: "fin_crypto",
    expectArgs: { query_type: "defi_tvl" },
  },
];

/* ---------- LLM call helper ---------- */

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
}

async function callLLM(prompt: string): Promise<ChatCompletionResponse> {
  const response = await fetch(`${LITELLM_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(LITELLM_KEY ? { Authorization: `Bearer ${LITELLM_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: LITELLM_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a financial data assistant. When the user asks for financial data, " +
            "always use the appropriate tool to fetch the data. Never respond with text only — " +
            "always call a tool.",
        },
        { role: "user", content: prompt },
      ],
      tools: TOOLS_SCHEMA,
      tool_choice: "auto",
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LiteLLM error (${response.status}): ${text.slice(0, 500)}`);
  }

  return (await response.json()) as ChatCompletionResponse;
}

/* ---------- tests ---------- */

const LLM_TIMEOUT = 90_000; // LLM calls can be slow, especially via proxy

describe("LLM self-discovery (12 cases)", () => {
  beforeAll(() => {
    if (!LITELLM_KEY && !process.env.LITELLM_BASE_URL) {
      throw new Error("LITELLM_BASE_URL and LITELLM_API_KEY must be set for LLM discovery tests.");
    }
  });

  for (const { prompt, expectTool, expectArgs } of LLM_DISCOVERY_CASES) {
    it(
      `LLM: "${prompt}" → ${expectTool}`,
      async () => {
        const data = await callLLM(prompt);

        const toolCall = data.choices[0]?.message?.tool_calls?.[0];
        expect(toolCall, "LLM should produce a tool call").toBeDefined();
        expect(toolCall!.function.name).toBe(expectTool);

        const args = JSON.parse(toolCall!.function.arguments) as Record<string, unknown>;
        for (const [key, value] of Object.entries(expectArgs)) {
          expect(
            args[key],
            `Expected ${key}="${value}" but got ${key}="${String(args[key])}"`,
          ).toBe(value);
        }
      },
      LLM_TIMEOUT,
    );
  }

  it(
    "pass rate ≥ 90%",
    async () => {
      let passed = 0;
      const total = LLM_DISCOVERY_CASES.length;

      for (const { prompt, expectTool, expectArgs } of LLM_DISCOVERY_CASES) {
        try {
          const data = await callLLM(prompt);
          const toolCall = data.choices[0]?.message?.tool_calls?.[0];
          if (!toolCall) continue;
          if (toolCall.function.name !== expectTool) continue;

          const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
          let allMatch = true;
          for (const [key, value] of Object.entries(expectArgs)) {
            if (args[key] !== value) {
              allMatch = false;
              break;
            }
          }
          if (allMatch) passed++;
        } catch {
          // count as failure
        }
      }

      const rate = passed / total;
      console.log(`LLM discovery pass rate: ${passed}/${total} = ${(rate * 100).toFixed(1)}%`);
      expect(rate).toBeGreaterThanOrEqual(0.9);
    },
    LLM_TIMEOUT * (LLM_DISCOVERY_CASES.length + 1),
  );
});
