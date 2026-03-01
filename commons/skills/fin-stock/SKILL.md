---
name: fin-stock
description: "A股个股深度分析 -- 行情/财务/资金/股东/事件全景研究，五维分析法评级"
metadata: { "openclaw": { "emoji": "📊", "requires": { "mcp": ["datahub"] } } }
---

# A股个股深度分析

对任意 A 股个股执行五维度系统性分析：估值、盈利、成长、资金、股东。自动生成标准化深度研究报告，包含星级评分和风险提示。

## When to Use

**USE this skill when:**

- "分析贵州茅台" / "600519 怎么样"
- "000001.SZ 的估值高不高"
- "比亚迪的财务指标"
- "茅台的资金流向" / "主力在买还是卖"
- "宁德时代的股东变化"
- "某只 A 股的业绩预告"
- "帮我做个个股深度分析"
- "这只股票的 ROE 趋势"

## When NOT to Use

**DON'T use this skill when:**

- User asks about HK or US stocks -- use fin-global
- User wants broad market overview (sector flows, limit-up counts) -- use fin-market
- User wants macro indicators (CPI, PMI, interest rates) -- use fin-macro
- User asks about funds, ETFs, or indices -- use fin-fund
- User asks about futures, options, or convertible bonds -- use fin-deriv
- User asks about crypto or DeFi -- use fin-crypto

## Tools (DataHub MCP)

All data is accessed via the `datahub` MCP server. The following MCP tools are used by this skill:

| MCP Tool                                 | Description                            | Key Fields                                                   |
| ---------------------------------------- | -------------------------------------- | ------------------------------------------------------------ |
| `equity_price_quote`                     | Latest quote / price snapshot          | close, vol, pct_chg                                          |
| `equity_price_historical`                | Daily OHLCV history                    | open, high, low, close, vol, amount                          |
| `equity_fundamental_backup_daily`        | PE / PB / market cap / turnover        | pe, pb, total_mv, circ_mv, turnover_rate                     |
| `equity_fundamental_income`              | Income statement                       | revenue, n_income, operate_profit                            |
| `equity_fundamental_balance`             | Balance sheet                          | total_assets, total_liab, total_hldr_eqy_exc_min_int         |
| `equity_fundamental_cash`                | Cash flow statement                    | n_cashflow_act, n_cashflow_inv_act, n_cash_flows_fnc_act     |
| `equity_fundamental_ratios`              | Financial ratios                       | roe, grossprofit_margin, netprofit_margin, debt_to_assets    |
| `equity_fundamental_income_vip`          | VIP income statement (extended fields) | --                                                           |
| `equity_fundamental_balance_vip`         | VIP balance sheet (extended fields)    | --                                                           |
| `equity_fundamental_cashflow_vip`        | VIP cash flow (extended fields)        | --                                                           |
| `equity_fundamental_forecast_vip`        | Earnings forecast / pre-announcement   | type, p_change_min, p_change_max                             |
| `equity_fundamental_financial_express`   | Earnings express report                | revenue, operate_profit, n_income                            |
| `equity_fundamental_revenue_segment_vip` | Revenue breakdown by product/region    | bz_item, bz_sales, bz_profit                                 |
| `equity_moneyflow_individual`            | Intraday money flow (by order size)    | buy_sm_vol, sell_sm_vol, buy_lg_vol, sell_lg_vol, net_mf_vol |
| `equity_moneyflow_block_trade`           | Block trades                           | price, vol, amount, buyer, seller                            |
| `equity_margin_trading`                  | Margin trading detail                  | rzye, rqye, rzmre, rzche                                     |
| `equity_ownership_top10_holders`         | Top 10 shareholders                    | holder_name, hold_amount, hold_ratio                         |
| `equity_ownership_top10_float_holders`   | Top 10 float shareholders              | holder_name, hold_amount                                     |
| `equity_ownership_holder_number`         | Shareholder count trend                | holder_num                                                   |
| `equity_ownership_shareholder_trade`     | Major shareholder trades               | holder_name, change_vol, after_share                         |
| `equity_pledge_detail`                   | Pledge statistics                      | pledge_ratio, pledge_count                                   |
| `equity_fundamental_dividend_detail`     | Dividend history                       | --                                                           |
| `equity_ownership_share_float`           | Lock-up share release schedule         | --                                                           |
| `equity_fundamental_stock_factor`        | Technical factors                      | turnover_rate, volume_ratio                                  |
| `equity_fundamental_adj_factor`          | Adjustment factor for price            | adj_factor                                                   |
| `equity_fundamental_financial_audit`     | Financial audit opinion                | audit_result                                                 |
| `equity_fundamental_earnings_forecast`   | Broker earnings estimates              | eps_avg, rating                                              |
| `equity_ownership_repurchase`            | Share repurchase records               | --                                                           |

## Five-Dimension Analysis Framework

For any A-share stock, execute the following systematic analysis:

### Dimension 1: Valuation Snapshot

**Data**: `equity_fundamental_backup_daily({symbol, provider: "tushare"})` + historical valuation series

**Core Metrics**: PE (TTM), PB, total market cap, float market cap, turnover rate

**Analysis Logic**:

1. Fetch latest valuation data
2. Fetch historical PE/PB series (recent 5 years)
3. Calculate current PE/PB percentile rank within historical distribution
4. Compare against sector average valuation

**Output**:

```
Valuation Snapshot
- PE(TTM): XX.X | Historical Percentile: XX% (5Y)
- PB: X.XX | Historical Percentile: XX% (5Y)
- Market Cap: XXXX bn | Float Cap: XXXX bn
- Sector Average PE: XX.X | Premium: +XX%
- Rating: 3/5
```

### Dimension 2: Profitability

**Data**: `equity_fundamental_ratios({symbol, provider: "tushare"})` (recent 8 quarters)

**Core Metrics**: ROE, gross margin, net margin, debt-to-assets ratio

**Analysis Logic**:

1. Fetch 8 quarters of financial ratios
2. Chart ROE / gross margin / net margin trend
3. Compare vs sector average
4. Judge stability and direction

**Output**:

```
Profitability
- ROE(TTM): XX.X% | Trend: rising/stable/declining
- Gross Margin: XX.X% | 4Q delta: +X.X pct
- Net Margin: XX.X% | 4Q delta: +X.X pct
- Debt-to-Assets: XX.X%
- Rating: 4/5
```

### Dimension 3: Growth

**Data**: `equity_fundamental_income({symbol, provider: "tushare"})` + `equity_fundamental_forecast_vip({symbol, provider: "tushare"})`

**Core Metrics**: Revenue YoY, net profit YoY, earnings forecast

**Analysis Logic**:

1. Fetch 8 quarters of income statements
2. Calculate single-quarter YoY revenue and net profit growth
3. Fetch latest earnings forecast / express report
4. Assess acceleration or deceleration

**Output**:

```
Growth
- Latest Quarter Revenue: XXX bn | YoY: +XX.X%
- Latest Quarter Net Profit: XXX bn | YoY: +XX.X%
- Revenue Growth Trend (4Q): +XX% -> +XX% -> +XX% -> +XX%
- Earnings Forecast: [pre-increase/decrease] XX%-XX%
- Rating: 3/5
```

### Dimension 4: Capital Flow

**Data**: `equity_moneyflow_individual({symbol, provider: "tushare"})` + `equity_margin_trading({symbol, provider: "tushare"})`

**Core Metrics**: Net institutional inflow, retail flow direction, margin balance change

**Analysis Logic**:

1. Fetch 20 trading days of money flow
2. Calculate cumulative net institutional flow (large + super-large orders)
3. Fetch margin trading balance trend
4. Judge capital direction

**Output**:

```
Capital Flow
- 5D Institutional Net Inflow: +X.XX bn | Trend: sustained inflow/outflow
- 20D Institutional Net Inflow: +X.XX bn
- Retail Flow Direction: net inflow/outflow X.XX bn
- Margin Balance: XX.XX bn | 20D change: +X.XX bn
- Block Trades: X deals in 30D, total X.XX bn
- Rating: 3/5
```

### Dimension 5: Shareholder Structure

**Data**: `equity_ownership_top10_holders({symbol, provider: "tushare"})` + `equity_ownership_holder_number({symbol, provider: "tushare"})` + `equity_pledge_detail({symbol, provider: "tushare"})`

**Core Metrics**: Institutional holding changes, shareholder count trend, pledge ratio

**Analysis Logic**:

1. Compare top-10 shareholders across last two reporting periods
2. Track shareholder count trend (decreasing = bullish concentration signal)
3. Check pledge ratio and risk
4. Monitor major shareholder trades

**Output**:

```
Shareholder Structure
- Shareholder Count: X.XX 10k | Change: -X.XX% (concentration up)
- Top 10 Holding: XX.XX% | Change: +X.XX pct
- Institutional Changes: +X new / +X increased / -X decreased / -X exited
- Pledge Ratio: X.XX% | Pledge Count: XX
- Major Shareholder Trades: [none / sold XX 10k shares in 6M]
- Rating: 4/5
```

## Standard Report Template

```
===================================================
  {Stock Name} ({Stock Code}) Deep Analysis Report
  Date: YYYY-MM-DD
===================================================

[1. Valuation Snapshot]
  PE(TTM): XX.X | Percentile: XX%
  PB: X.XX | Percentile: XX%
  Market Cap: XXXX bn | Float: XXXX bn
  Sector Comparison: PE premium/discount XX%
  Rating: 3/5

[2. Profitability]
  ROE(TTM): XX.X%
  Gross Margin: XX.X% -> XX.X% (4Q trend)
  Net Margin: XX.X% -> XX.X%
  Debt-to-Assets: XX.X%
  Rating: 4/5

[3. Growth]
  Revenue Growth(TTM): +XX.X%
  Net Profit Growth(TTM): +XX.X%
  Trend: accelerating/stable/decelerating
  Earnings Forecast: pre-increase XX%-XX%
  Rating: 3/5

[4. Capital Flow]
  5D Institutional Net: +X.XX bn
  20D Institutional Net: +X.XX bn
  Margin Balance: XX.XX bn | Change: +X.XX bn
  Block Trades: X deals, X.XX bn
  Rating: 3/5

[5. Shareholder Structure]
  Count: X.XX 10k | Change: -X.XX%
  Top 10 Holding: XX.XX%
  Pledge Ratio: X.XX%
  Trades: none / sold XX 10k shares
  Rating: 4/5

[Overall Rating]: 17/25

[Key Risks]
  1. ...
  2. ...

[Investment Highlights]
  1. ...
  2. ...

===================================================
  Disclaimer: Based on public data, not investment advice.
===================================================
```

## A-Share Code Format

| Board         | Prefix      | Suffix | Example   |
| ------------- | ----------- | ------ | --------- |
| Shanghai Main | 600/601/603 | .SH    | 600036.SH |
| Shenzhen Main | 000/001     | .SZ    | 000001.SZ |
| SME Board     | 002         | .SZ    | 002594.SZ |
| ChiNext (GEM) | 300/301     | .SZ    | 300750.SZ |
| STAR Market   | 688         | .SH    | 688981.SH |
| BSE           | 8/4         | .BJ    | 830799.BJ |

## Execution Flow

1. **Parse Code**: Identify or search for stock code (if user provides name, search first)
2. **Parallel Data Fetch**: Call all five dimensions concurrently via DataHub MCP tools
3. **Compute Derived Metrics**: YoY growth, percentiles, net flow totals
4. **Generate Report**: Output standardized five-dimension report
5. **Risk Alerts**: Auto-flag risks (high pledge, declining earnings, capital outflow, etc.)
6. **Highlight Positives**: Auto-identify strengths (high ROE, accelerating growth, institutional accumulation, etc.)

**Notes**:

- If any dimension returns no data, mark it as "no data available" and continue with other dimensions
- For recently listed stocks, historical percentile analysis may not apply -- note this explicitly
- Pay attention to earnings forecast/express report timeliness (check announcement date)

## Response Guidelines

- Always produce a structured five-dimension report for comprehensive requests.
- For single-dimension queries (e.g., "what's the ROE"), answer concisely but offer to run the full analysis.
- Present financial data in clean tables with units clearly labeled.
- When comparing against sector, state which sector benchmark is used.
- Use star ratings (1-5) for each dimension to enable quick scanning.
- For valuation, always show both absolute value and historical percentile.
- Highlight anomalies proactively: "Shareholder count dropped 15% in one quarter -- significant concentration signal."

## Risk Disclosures

- All analysis is based on publicly available historical data and does not constitute investment advice.
- Financial data may have reporting delays; always note the latest reporting period used.
- Valuation percentiles depend on the lookback window; results may differ for shorter or longer periods.
- Money flow data reflects exchange-level order classification and may not precisely represent institutional behavior.
- Past financial performance does not guarantee future results.
