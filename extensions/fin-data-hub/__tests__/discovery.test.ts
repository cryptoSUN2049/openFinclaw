/**
 * Self-discovery routing — 41 natural language → tool + query_type mappings.
 *
 * Validates that:
 *   1. The target tool exists and is callable
 *   2. The expected enum value exists in the tool's parameters (or param exists for free-form fields)
 *   3. The tool description contains relevant routing keywords
 *
 * Run: npx vitest run extensions/fin-data-hub/__tests__/discovery.test.ts
 */

import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "../index.js";

/* ---------- helpers ---------- */

type Tool = {
  execute: (id: string, params: Record<string, unknown>) => Promise<unknown>;
};

type RegisteredTool = {
  name: string;
  description: string;
  parameters: { properties?: Record<string, unknown> };
  execute: Tool["execute"];
};

function createFakeApiWithMeta(pluginConfig: Record<string, unknown>): {
  api: OpenClawPluginApi;
  tools: Map<string, RegisteredTool>;
} {
  const tools = new Map<string, RegisteredTool>();
  const api = {
    id: "fin-data-hub",
    name: "openFinclaw-DataHub",
    source: "test",
    config: {},
    pluginConfig,
    runtime: { version: "test", services: new Map() },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    registerTool(tool: RegisteredTool) {
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

/** Extract enum values from a Typebox schema property */
function extractEnumValues(tool: RegisteredTool, field: string): string[] {
  const props = (tool.parameters as { properties?: Record<string, { enum?: string[] }> })
    .properties;
  if (!props?.[field]?.enum) return [];
  return props[field].enum;
}

/* ---------- discovery mapping ---------- */

interface DiscoveryCase {
  /** Natural language query */
  query: string;
  /** Expected tool name */
  tool: string;
  /** Expected discriminator field */
  field: "query_type" | "indicator" | "api_name";
  /** Expected value */
  value: string;
  /** Keywords that should appear in the tool description */
  descriptionKeywords: string[];
}

const DISCOVERY_CASES: DiscoveryCase[] = [
  // --- Stock (A-share / HK / US) ---
  {
    query: "茅台股价",
    tool: "fin_stock",
    field: "query_type",
    value: "quote",
    descriptionKeywords: ["quote"],
  },
  {
    query: "600519日K线数据",
    tool: "fin_stock",
    field: "query_type",
    value: "historical",
    descriptionKeywords: ["historical"],
  },
  {
    query: "贵州茅台利润表",
    tool: "fin_stock",
    field: "query_type",
    value: "income",
    descriptionKeywords: ["income"],
  },
  {
    query: "茅台资产负债表",
    tool: "fin_stock",
    field: "query_type",
    value: "balance",
    descriptionKeywords: ["balance"],
  },
  {
    query: "茅台现金流量表",
    tool: "fin_stock",
    field: "query_type",
    value: "cashflow",
    descriptionKeywords: ["cashflow"],
  },
  {
    query: "茅台财务比率",
    tool: "fin_stock",
    field: "query_type",
    value: "ratios",
    descriptionKeywords: ["financial ratios"],
  },
  {
    query: "茅台资金流向",
    tool: "fin_stock",
    field: "query_type",
    value: "moneyflow",
    descriptionKeywords: ["money flow"],
  },
  {
    query: "茅台十大股东",
    tool: "fin_stock",
    field: "query_type",
    value: "holders",
    descriptionKeywords: ["holders"],
  },
  {
    query: "茅台分红历史",
    tool: "fin_stock",
    field: "query_type",
    value: "dividends",
    descriptionKeywords: ["dividends"],
  },
  {
    query: "茅台相关新闻",
    tool: "fin_stock",
    field: "query_type",
    value: "news",
    descriptionKeywords: ["news"],
  },

  // --- Index / ETF ---
  {
    query: "沪深300成份股",
    tool: "fin_index",
    field: "query_type",
    value: "index_constituents",
    descriptionKeywords: ["index", "constituents"],
  },
  {
    query: "沪深300历史行情",
    tool: "fin_index",
    field: "query_type",
    value: "index_historical",
    descriptionKeywords: ["index"],
  },
  {
    query: "沪深300估值",
    tool: "fin_index",
    field: "query_type",
    value: "index_valuation",
    descriptionKeywords: ["valuation"],
  },
  {
    query: "50ETF净值",
    tool: "fin_index",
    field: "query_type",
    value: "etf_nav",
    descriptionKeywords: ["ETF"],
  },
  {
    query: "基金经理信息",
    tool: "fin_index",
    field: "query_type",
    value: "fund_manager",
    descriptionKeywords: ["fund", "manager"],
  },
  {
    query: "基金持仓组合",
    tool: "fin_index",
    field: "query_type",
    value: "fund_portfolio",
    descriptionKeywords: ["fund", "portfolio"],
  },
  {
    query: "同花顺概念指数",
    tool: "fin_index",
    field: "query_type",
    value: "ths_index",
    descriptionKeywords: ["THS"],
  },
  {
    query: "行业板块分类",
    tool: "fin_index",
    field: "query_type",
    value: "sector_classify",
    descriptionKeywords: ["sector"],
  },

  // --- Macro ---
  {
    query: "CPI数据",
    tool: "fin_macro",
    field: "indicator",
    value: "cpi",
    descriptionKeywords: ["CPI"],
  },
  {
    query: "GDP增速",
    tool: "fin_macro",
    field: "indicator",
    value: "gdp",
    descriptionKeywords: ["GDP"],
  },
  {
    query: "PPI同比",
    tool: "fin_macro",
    field: "indicator",
    value: "ppi",
    descriptionKeywords: ["PPI"],
  },
  {
    query: "PMI数据",
    tool: "fin_macro",
    field: "indicator",
    value: "pmi",
    descriptionKeywords: ["PMI"],
  },
  {
    query: "Shibor利率",
    tool: "fin_macro",
    field: "indicator",
    value: "shibor",
    descriptionKeywords: ["Shibor"],
  },
  {
    query: "LPR利率",
    tool: "fin_macro",
    field: "indicator",
    value: "lpr",
    descriptionKeywords: ["LPR"],
  },
  {
    query: "中国国债收益率",
    tool: "fin_macro",
    field: "indicator",
    value: "treasury_cn",
    descriptionKeywords: ["treasury yields"],
  },
  {
    query: "美国10年期国债收益率",
    tool: "fin_macro",
    field: "indicator",
    value: "treasury_us",
    descriptionKeywords: ["treasury yields"],
  },
  {
    query: "经济日历事件",
    tool: "fin_macro",
    field: "indicator",
    value: "calendar",
    descriptionKeywords: ["calendar"],
  },

  // --- Derivatives ---
  {
    query: "螺纹钢期货行情",
    tool: "fin_derivatives",
    field: "query_type",
    value: "futures_historical",
    descriptionKeywords: ["Futures"],
  },
  {
    query: "螺纹钢期货持仓排名",
    tool: "fin_derivatives",
    field: "query_type",
    value: "futures_holding",
    descriptionKeywords: ["holdings"],
  },
  {
    query: "AAPL期权链",
    tool: "fin_derivatives",
    field: "query_type",
    value: "option_chains",
    descriptionKeywords: ["options", "chains"],
  },
  {
    query: "可转债基本面",
    tool: "fin_derivatives",
    field: "query_type",
    value: "cb_basic",
    descriptionKeywords: ["convertible bonds"],
  },

  // --- Crypto / DeFi ---
  {
    query: "BTC K线",
    tool: "fin_crypto",
    field: "query_type",
    value: "ohlcv",
    descriptionKeywords: ["K-lines"],
  },
  {
    query: "BTC实时价格",
    tool: "fin_crypto",
    field: "query_type",
    value: "ticker",
    descriptionKeywords: ["tickers"],
  },
  {
    query: "DeFi TVL排行",
    tool: "fin_crypto",
    field: "query_type",
    value: "defi_protocols",
    descriptionKeywords: ["DeFi", "TVL"],
  },
  {
    query: "DeFi收益率",
    tool: "fin_crypto",
    field: "query_type",
    value: "defi_yields",
    descriptionKeywords: ["yields"],
  },
  {
    query: "全球加密市场总览",
    tool: "fin_crypto",
    field: "query_type",
    value: "coin_global",
    descriptionKeywords: ["market cap"],
  },
  {
    query: "热门加密货币",
    tool: "fin_crypto",
    field: "query_type",
    value: "coin_trending",
    descriptionKeywords: ["trending"],
  },

  // --- Market ---
  {
    query: "龙虎榜",
    tool: "fin_market",
    field: "query_type",
    value: "top_list",
    descriptionKeywords: ["dragon-tiger", "top movers"],
  },
  {
    query: "涨跌停统计",
    tool: "fin_market",
    field: "query_type",
    value: "limit_list",
    descriptionKeywords: ["limit-up/down"],
  },
  {
    query: "北向资金今日流入",
    tool: "fin_market",
    field: "query_type",
    value: "hsgt_flow",
    descriptionKeywords: ["market"],
  },

  // --- Query (fallback) ---
  {
    query: "通用A股查询",
    tool: "fin_query",
    field: "api_name",
    value: "daily",
    descriptionKeywords: ["fallback", "162"],
  },
];

/* ---------- tests ---------- */

describe("self-discovery routing (41 cases)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const { api, tools } = createFakeApiWithMeta({});
  plugin.register(api);

  for (const tc of DISCOVERY_CASES) {
    describe(`"${tc.query}" → ${tc.tool}.${tc.value}`, () => {
      it("tool exists and is callable", () => {
        const tool = tools.get(tc.tool);
        expect(tool, `tool ${tc.tool} should be registered`).toBeDefined();
        expect(typeof tool!.execute).toBe("function");
      });

      it(`${tc.field}="${tc.value}" is valid for tool`, () => {
        const tool = tools.get(tc.tool)!;
        if (tc.tool === "fin_query") {
          // fin_query has free-form api_name (Type.String), verify param exists
          const paramProps = (tool.parameters as { properties?: Record<string, { type?: string }> })
            .properties;
          expect(paramProps?.api_name, "api_name param should exist").toBeDefined();
          expect(paramProps!.api_name.type, "api_name should be string type").toBe("string");
        } else if (tc.field === "indicator") {
          // fin_macro uses indicator as free-form Type.String — verify param exists
          // and that the indicator value is a recognized key in the macro mapping
          const paramProps = (
            tool.parameters as {
              properties?: Record<string, { type?: string; description?: string }>;
            }
          ).properties;
          expect(paramProps?.indicator, "indicator param should exist").toBeDefined();
          expect(paramProps!.indicator.type, "indicator should be string type").toBe("string");
          // Verify the value is documented in the indicator description or the tool description
          const indicatorDesc = (paramProps!.indicator.description ?? "").toLowerCase();
          const toolDesc = tool.description.toLowerCase();
          const valueInDesc = indicatorDesc.includes(tc.value) || toolDesc.includes(tc.value);
          expect(
            valueInDesc,
            `indicator "${tc.value}" should be documented in param or tool description`,
          ).toBe(true);
        } else {
          const enumValues = extractEnumValues(tool, "query_type");
          expect(enumValues, "query_type enum should exist").toBeDefined();
          expect(enumValues).toContain(tc.value);
        }
      });

      it("tool description contains routing keywords", () => {
        const tool = tools.get(tc.tool)!;
        const desc = tool.description.toLowerCase();
        for (const keyword of tc.descriptionKeywords) {
          expect(
            desc.includes(keyword.toLowerCase()),
            `description should contain "${keyword}" but got: ${tool.description}`,
          ).toBe(true);
        }
      });
    });
  }
});
