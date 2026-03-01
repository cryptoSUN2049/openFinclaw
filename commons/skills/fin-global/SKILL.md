---
name: fin-global
description: "港股/美股跨境投资研究 -- HK/US equity analysis, cross-border capital flow (Stock Connect), AH premium, options chains"
metadata: { "openclaw": { "emoji": "🌏", "requires": { "mcp": ["datahub"] } } }
---

# Global Equity Research (HK & US)

Cross-border investment research covering Hong Kong and US equities. Includes price action, financial statements, Stock Connect capital flows, AH premium analysis, and US options chain data.

## When to Use

**USE this skill when:**

- "analyze Tencent 00700.HK" / "how is AAPL doing"
- "compare A-share vs H-share for Ping An"
- "northbound capital flow today" / "Stock Connect data"
- "US stock financials for Tesla"
- "AAPL options chain" / "put/call ratio"
- "Hong Kong stock income statement for Meituan"
- "southbound top 10" / "HK Connect holdings"
- "Chinese ADR valuations"

## When NOT to Use

**DON'T use this skill when:**

- User asks about A-shares only -- use fin-stock
- User wants broad A-share market overview -- use fin-market
- User wants macro indicators -- use fin-macro
- User asks about crypto -- use fin-crypto
- User wants fund/ETF analysis -- use fin-fund

## Tools (DataHub MCP)

All data is accessed via the `datahub` MCP server. The following MCP tools are used by this skill:

- For A-share supplementary data (AH premium comparison), refer to the fin-stock skill's MCP tools.

### HK Stock Data

| MCP Tool                   | Description                           | Key Fields                                      |
| -------------------------- | ------------------------------------- | ----------------------------------------------- |
| `equity_hk_basic`          | HK stock basic info                   | ts_code, name, list_date, industry              |
| `equity_price_historical`  | HK daily OHLCV (auto-detects .HK)     | open, high, low, close, vol, amount             |
| `equity_hk_adj_factor`     | HK adjustment factor                  | adj_factor                                      |
| `equity_hk_income`         | HK income statement (pivot format)    | ind_name, ind_value (Revenue, Net Profit, etc.) |
| `equity_hk_balancesheet`   | HK balance sheet (pivot format)       | ind_name, ind_value (Total Assets, etc.)        |
| `equity_hk_cashflow`       | HK cash flow statement (pivot format) | ind_name, ind_value                             |
| `equity_hk_fina_indicator` | HK financial indicators               | ROE, margins, ratios                            |
| `equity_hk_trade_cal`      | HK trading calendar                   | cal_date, is_open                               |
| `equity_hk_hold`           | Southbound holdings detail            | vol, ratio (holding ratio change)               |

### US Stock Data

| MCP Tool                               | Description                                | Key Fields                                 |
| -------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| `equity_us_basic`                      | US stock basic info                        | ts_code, name, classify (NYSE/NASDAQ)      |
| `equity_price_historical`              | US daily OHLCV (auto-detects plain ticker) | close, vol, amount                         |
| `equity_us_adj_factor`                 | US adjustment factor                       | adj_factor                                 |
| `equity_us_income`                     | US income statement (pivot)                | ind_name, ind_value                        |
| `equity_us_balancesheet`               | US balance sheet (pivot)                   | ind_name, ind_value                        |
| `equity_us_cashflow`                   | US cash flow statement                     | ind_name, ind_value                        |
| `equity_us_fina_indicator`             | US financial indicators                    | ROE, net profit growth, etc.               |
| `equity_us_trade_cal`                  | US trading calendar                        | cal_date, is_open                          |
| `derivatives_options_chains`           | US options chain with Greeks               | strike, expiry, bid, ask, delta, gamma, iv |
| `equity_profile`                       | Company profile                            | description, sector, market_cap            |
| `news_company`                         | Company news                               | title, published, url                      |
| `equity_fundamental_dividends`         | Dividend history                           | ex_date, amount, frequency                 |
| `equity_fundamental_historical_splits` | Historical splits                          | date, split_ratio                          |

### Stock Connect (Cross-Border Capital Flow)

| MCP Tool                  | Description                              | Key Fields                          |
| ------------------------- | ---------------------------------------- | ----------------------------------- |
| `equity_flow_hsgt_flow`   | Daily northbound/southbound capital flow | north_money, south_money, hgt, sgt  |
| `equity_flow_hsgt_top10`  | Stock Connect top 10 traded stocks       | ts_code, name, amount, net_amount   |
| `equity_flow_hs_const`    | Stock Connect constituent list           | ts_code, name, hs_type (SH/SZ)      |
| `equity_flow_ggt_daily`   | HK Connect daily capital flow            | buy_amount, sell_amount, net_amount |
| `equity_flow_ggt_monthly` | HK Connect monthly capital flow          | month, buy_amount, sell_amount      |
| `equity_flow_ggt_top10`   | HK Connect top 10 daily                  | ts_code, name, amount               |

### Note on `equity_price_historical`

`equity_price_historical` is the standard OHLCV route for all markets. The provider auto-detects the market based on symbol format:

- HK stocks: pass `symbol: "00700.HK"` -- auto-routes to HK data
- US stocks: pass `symbol: "AAPL"` -- auto-routes to US data
- A-shares: pass `symbol: "600519.SH"` -- auto-routes to A-share data

You can also explicitly set `provider: "tushare"` or other providers as needed.

## Code Format Conventions

| Market           | Format                            | Example                                    |
| ---------------- | --------------------------------- | ------------------------------------------ |
| HK               | `XXXXX.HK`                        | `00700.HK` (Tencent), `09988.HK` (Alibaba) |
| US (with suffix) | `TICKER` or `TICKER.N`/`TICKER.O` | `AAPL`, `TSLA`                             |
| US (plain)       | Plain ticker, no suffix           | `AAPL`, `TSLA`, `MSFT`                     |
| A-share          | `XXXXXX.SH` / `XXXXXX.SZ`         | `600519.SH` (Moutai)                       |

## Pivot Format Handling

HK and US financial statements (income/balance/cashflow) may return data in **ind_name / ind_value** long-table format. The tool automatically pivots this into a wide table. When reviewing results, note that field names are English indicator names (e.g., "Revenue", "Net Profit", "Total Assets").

## Analysis Frameworks

### Framework 1: AH Premium Analysis

For companies dual-listed on A-share and H-share markets:

1. Fetch A-share daily price via `equity_price_historical({symbol: "601318.SH", provider: "tushare"})`
2. Fetch H-share daily price via `equity_price_historical({symbol: "02318.HK", provider: "tushare"})`
3. Apply FX conversion (HKDCNY)
4. Compute: AH Premium = (A-price / H-price _ FX - 1) _ 100%
5. Compare PE/PB differentials to judge relative value

**Applicable Targets**: Companies with both A and H listings (e.g., Ping An 601318.SH / 02318.HK)

### Framework 2: Northbound Capital Signal Tracking

1. `equity_flow_hsgt_flow({provider: "tushare"})` -- recent northbound net inflow trend
2. `equity_flow_hsgt_top10({provider: "tushare"})` -- today's top 10 bought/sold stocks
3. `equity_hk_hold({symbol: "00700.HK", provider: "tushare"})` -- track specific stock's Stock Connect holding changes
4. Signal interpretation:
   - Sustained net inflow > 5 bn/day -- strong bullish signal
   - Top 10 concentrated in one sector -- sector rotation signal
   - Holding ratio steadily rising -- long-term bullish outlook

### Framework 3: Chinese ADR Assessment

1. `equity_us_basic({provider: "tushare"})` -- list Chinese ADRs
2. `equity_price_historical({symbol: "BABA", provider: "tushare"})` -- price and valuation data
3. `equity_us_fina_indicator({symbol: "BABA", provider: "tushare"})` -- ROE, net profit growth
4. `equity_us_income({symbol: "BABA", provider: "tushare"})` -- detailed financials (pivot)
5. Compare against US sector peers

### Framework 4: HK Connect Holding Analysis

1. `equity_hk_hold({symbol: "00700.HK", provider: "tushare"})` -- southbound holding history for a HK stock
2. `equity_flow_ggt_daily({provider: "tushare"})` or `equity_flow_ggt_monthly` -- overall southbound trend
3. `equity_flow_ggt_top10({provider: "tushare"})` -- daily top 10 southbound
4. Calculate holding ratio change rate to gauge southbound sentiment

## Report Template

```
===================================================
  {Company Name} Cross-Border Research Report
  Date: YYYY-MM-DD
===================================================

[Basic Info]
  HK Code: XXXXX.HK | US Code: TICKER
  Sector: [sector]
  Market Cap: [HK cap] / [US cap]

[Price Overview]
  | Metric      | HK      | US      | Diff    |
  |-------------|---------|---------|---------|
  | Latest      | HKD XX  | USD XX  | -       |
  | PE(TTM)     | XX      | XX      | XX%     |
  | PB          | XX      | XX      | XX%     |
  | 30D Return  | XX%     | XX%     | -       |

[AH Premium] (if applicable)
  Current AH Premium: XX%
  Historical Average: XX%
  Assessment: [high/low/fair]

[Financial Highlights]
  Revenue Growth: XX% (trailing 4Q)
  Net Profit Growth: XX%
  ROE: XX%
  Debt-to-Assets: XX%

[Capital Flow]
  Northbound 5D Net Buy: XX bn
  HK Connect Holding: XX% (+/- XX% vs prior month)
  Top 10 Ranking: #X

[Options Signal] (US only)
  Put/Call Ratio: XX
  Max Open Interest Strike: $XX
  Implied Volatility: XX%

[Summary & Assessment]
  [Data-driven comprehensive analysis]

===================================================
  Disclaimer: Based on public data, not investment advice.
===================================================
```

## Execution Flow

1. **Identify Market**: Determine HK (.HK) / US (ticker) / or search by name
2. **Fetch Basic Info**: `equity_hk_basic` or `equity_us_basic`
3. **Fetch Price Data**: `equity_price_historical` (auto-detects market by symbol format)
4. **Fetch Financials**: Market-specific financial tools (e.g., `equity_hk_income`, `equity_us_income`)
5. **Capital Flow**: Stock Connect tools (`equity_flow_hsgt_flow`, `equity_flow_ggt_daily`, etc.)
6. **Options Data**: `derivatives_options_chains` for US stocks
7. **Generate Report**: Compile and output per template

## Response Guidelines

- For HK stocks, present prices in HKD; for US stocks in USD. Always state the currency.
- When doing AH premium analysis, clearly state the FX rate used and the date.
- Present Stock Connect data with clear direction labels (northbound = HK->A, southbound = A->HK).
- For US financial statements, note whether using pivot format or XBRL format.
- Options analysis should include implied volatility context (is it elevated vs 30D average?).
- When multiple data sources are available for the same metric, note which source was used.

## Risk Disclosures

- Cross-border investment involves currency risk. Exchange rate fluctuations can significantly affect returns.
- AH premium analysis is informational. Premiums can persist or widen beyond historical norms.
- Stock Connect data reflects aggregate flows and does not indicate specific institutional intent.
- Options data reflects market expectations, not predictions. Implied volatility can change rapidly.
- Financial statement formats differ between markets (HK IFRS, US GAAP, A-share CAS). Direct comparison requires adjustment.
- This analysis is based on public data and does not constitute investment advice.
