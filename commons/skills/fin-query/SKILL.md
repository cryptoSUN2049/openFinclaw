---
name: fin-query
description: "金融数据通用查询工具 -- 覆盖 DataHub MCP 全部数据接口，自动路由到正确的 MCP 工具"
metadata: { "openclaw": { "emoji": "🔍", "requires": { "mcp": ["datahub"] } } }
---

# 金融数据通用查询工具

万能兜底查询技能，覆盖 DataHub MCP Server 全部数据接口（~280 个 MCP 工具）。当用户查询不明确属于哪个专项技能时，本技能自动路由到正确的 MCP 工具并返回结果。

> **架构**: DataHub MCP Server 对外暴露标准工具名 (如 `equity_price_historical`)，内部支持多 provider 切换 (tushare/yfinance/polygon/ccxt)。有重叠数据时使用标准路由 + `provider` 参数切换。

## When to Use

**USE this skill when:**

- Query spans multiple asset classes or data sources
- User asks about a data point not clearly covered by other specialized skills
- "帮我查一下 XXX 数据"
- "龙虎榜" / "涨停板统计"
- "交易日历" / "IPO日历"
- "汇率" / "美元人民币"
- "世界银行GDP数据" / "各国通胀对比"
- "全市场快照" / "市场概览"
- "新股上市" / "限售解禁"
- "质押统计" / "股东增减持"
- User explicitly requests raw data from a specific endpoint
- Fallback when no other specialized skill fits

## When NOT to Use

**DON'T use this skill when:**

- User clearly wants A-stock deep analysis -- use fin-stock
- User clearly wants HK/US stock research -- use fin-global
- User clearly wants index/fund/ETF analysis -- use fin-index
- User clearly wants derivatives analysis -- use fin-deriv
- User clearly wants crypto/DeFi analysis -- use fin-crypto
- User clearly wants macro/rates analysis -- use fin-macro
- User clearly wants market overview -- use fin-market

**Rule**: If the query matches a specialized skill, prefer that skill. Use this skill only when no single specialized skill is the obvious fit, or when the user needs raw data access.

## MCP Tool Architecture

DataHub MCP Server 提供标准化的 MCP 工具，命名规则: `/api/v1/{category}/{sub}/{cmd}` → `{category}_{sub}_{cmd}`

有重叠的数据（多 provider 可切换）使用标准路由:

- **equity_price_historical** — A股/港股/美股 OHLCV (tushare/yfinance/polygon 可切换)
- **crypto_price_historical** — 加密货币 OHLCV (ccxt/coingecko 可切换)
- **equity_fundamental_income** — 全市场利润表 (tushare/fmp 可切换)

无重叠的独立数据（Tushare 专有）使用市场专属路由:

- **equity_hk_income** — 港股利润表 (pivot 格式，Tushare only)
- **equity_market_top_list** — 龙虎榜 (A股独有)
- **equity_flow_hsgt_flow** — 沪港通资金 (Tushare only)

## Complete MCP Tool Index

### A-Share Trading (~15)

| Fetcher Name     | Description                | MCP Tool                          |
| ---------------- | -------------------------- | --------------------------------- |
| EquityHistorical | A-share daily OHLCV        | `equity_price_historical`         |
| EquityQuote      | Latest quote               | `equity_price_quote`              |
| BackupDaily      | PE/PB/market cap/turnover  | `equity_fundamental_backup_daily` |
| AdjFactor        | Adjustment factor          | `equity_fundamental_adj_factor`   |
| StockLimit       | Daily limit-up/down prices | `equity_market_stock_limit`       |
| TradeCalendar    | Trading calendar           | `equity_market_trade_calendar`    |
| SuspendInfo      | Suspension/resumption      | `equity_market_suspend`           |
| NameChange       | Historical name changes    | `equity_discovery_name_change`    |
| NewShare         | New IPO listings           | `equity_discovery_new_share`      |
| ShareFloat       | Lock-up release schedule   | `equity_ownership_share_float`    |
| StockFactor      | Technical factors          | `equity_fundamental_stock_factor` |
| LimitList        | Daily limit-up/down stats  | `equity_market_limit_list`        |
| TopList          | Dragon-Tiger list          | `equity_market_top_list`          |
| TopInst          | Dragon-Tiger institutions  | `equity_market_top_inst`          |

### A-Share Financials (~15)

| Fetcher Name      | Description          | MCP Tool                                 |
| ----------------- | -------------------- | ---------------------------------------- |
| IncomeStatement   | Income statement     | `equity_fundamental_income`              |
| BalanceSheet      | Balance sheet        | `equity_fundamental_balance`             |
| CashFlowStatement | Cash flow statement  | `equity_fundamental_cash`                |
| FinancialRatios   | Financial ratios     | `equity_fundamental_ratios`              |
| IncomeVip         | VIP income statement | `equity_fundamental_income_vip`          |
| BalancesheetVip   | VIP balance sheet    | `equity_fundamental_balance_vip`         |
| CashflowVip       | VIP cash flow        | `equity_fundamental_cashflow_vip`        |
| ForecastVip       | Earnings forecast    | `equity_fundamental_forecast_vip`        |
| FinancialExpress  | Earnings express     | `equity_fundamental_financial_express`   |
| FinancialAudit    | Audit opinion        | `equity_fundamental_financial_audit`     |
| EarningsForecast  | Broker estimates     | `equity_fundamental_earnings_forecast`   |
| RevenueSegmentVip | Revenue by segment   | `equity_fundamental_revenue_segment_vip` |
| DividendDetail    | Dividend history     | `equity_fundamental_dividend_detail`     |
| Repurchase        | Share buyback        | `equity_ownership_repurchase`            |

### A-Share Capital Flow (~6)

| Fetcher Name      | Description                 | MCP Tool                       |
| ----------------- | --------------------------- | ------------------------------ |
| MoneyFlow         | Individual stock money flow | `equity_moneyflow_individual`  |
| MoneyflowIndustry | Sector money flow           | `equity_moneyflow_industry`    |
| BlockTrade        | Block trades                | `equity_moneyflow_block_trade` |
| MarginTrading     | Margin trading summary      | `equity_margin_trading`        |
| MarginDetail      | Margin trading detail       | `equity_margin_detail`         |
| MarginSummary     | Margin trading targets      | `equity_margin_summary`        |

### A-Share Shareholders (~6)

| Fetcher Name      | Description               | MCP Tool                               |
| ----------------- | ------------------------- | -------------------------------------- |
| Top10Holders      | Top 10 shareholders       | `equity_ownership_top10_holders`       |
| Top10FloatHolders | Top 10 float shareholders | `equity_ownership_top10_float_holders` |
| HolderNumber      | Shareholder count         | `equity_ownership_holder_number`       |
| ShareholderTrade  | Major shareholder trades  | `equity_ownership_shareholder_trade`   |
| PledgeDetail      | Pledge detail             | `equity_pledge_detail`                 |
| PledgeStat        | Pledge statistics         | `equity_pledge_stat`                   |

### HK Stocks (8) — Tushare-only, independent routes

| Fetcher Name    | Description               | MCP Tool                   |
| --------------- | ------------------------- | -------------------------- |
| HKBasic         | HK stock info             | `equity_hk_basic`          |
| HKAdjFactor     | HK adjustment factor      | `equity_hk_adj_factor`     |
| HKIncome        | HK income statement       | `equity_hk_income`         |
| HKBalancesheet  | HK balance sheet          | `equity_hk_balancesheet`   |
| HKCashflow      | HK cash flow              | `equity_hk_cashflow`       |
| HKFinaIndicator | HK financial indicators   | `equity_hk_fina_indicator` |
| HKTradeCal      | HK trading calendar       | `equity_hk_trade_cal`      |
| HKHold          | HK Stock Connect holdings | `equity_hk_hold`           |

> **HK/US OHLCV**: 使用标准路由 `equity_price_historical({symbol: "00700.HK", provider: "tushare"})`，Fetcher 自动检测 .HK 后缀路由到 hk_daily API。

### US Stocks (7) — Tushare-only, independent routes

| Fetcher Name    | Description             | MCP Tool                   |
| --------------- | ----------------------- | -------------------------- |
| USBasic         | US stock info           | `equity_us_basic`          |
| USAdjFactor     | US adjustment factor    | `equity_us_adj_factor`     |
| USIncome        | US income statement     | `equity_us_income`         |
| USBalancesheet  | US balance sheet        | `equity_us_balancesheet`   |
| USCashflow      | US cash flow            | `equity_us_cashflow`       |
| USFinaIndicator | US financial indicators | `equity_us_fina_indicator` |
| USTradeCal      | US trading calendar     | `equity_us_trade_cal`      |

> **US OHLCV**: 使用标准路由 `equity_price_historical({symbol: "AAPL", provider: "tushare"})` 或 `provider: "yfinance"`/`"polygon"` 可切换。

### Stock Connect / Cross-Border (6)

| Fetcher Name | Description                 | MCP Tool                  |
| ------------ | --------------------------- | ------------------------- |
| HSGTFlow     | Stock Connect capital flow  | `equity_flow_hsgt_flow`   |
| HSGTTop10    | Stock Connect top 10 trades | `equity_flow_hsgt_top10`  |
| HSConst      | Stock Connect constituents  | `equity_flow_hs_const`    |
| GGTDaily     | HK Connect daily trades     | `equity_flow_ggt_daily`   |
| GGTMonthly   | HK Connect monthly trades   | `equity_flow_ggt_monthly` |
| GGTTop10     | HK Connect top 10 trades    | `equity_flow_ggt_top10`   |

### Index (10)

| Fetcher Name      | Description                  | MCP Tool                        |
| ----------------- | ---------------------------- | ------------------------------- |
| IndexInfo         | Index basic info             | `index_info`                    |
| IndexConstituents | Index constituents           | `index_constituents`            |
| IndexDailyBasic   | Index PE/PB/turnover         | `index_daily_basic`             |
| IndexMember       | Index member changes         | `index_members`                 |
| IndexGlobal       | Global index daily           | `index_global_index`            |
| IndexClassify     | SW industry classification   | `index_classify`                |
| ThsIndex          | THS concept/industry indices | `equity_concept_concept_list`   |
| ThsDaily          | THS index daily data         | `equity_concept_concept_detail` |

### Futures (6)

| Fetcher Name      | Description               | MCP Tool                       |
| ----------------- | ------------------------- | ------------------------------ |
| FuturesHistorical | Futures daily OHLCV       | _(Tushare proxy: fut_daily)_   |
| FuturesInfo       | Futures contract info     | _(Tushare proxy: fut_basic)_   |
| FuturesMapping    | Dominant contract mapping | _(Tushare proxy: fut_mapping)_ |
| FuturesHolding    | Position ranking          | _(Tushare proxy: fut_holding)_ |
| FuturesSettle     | Settlement parameters     | _(Tushare proxy: fut_settle)_  |
| FuturesWarehouse  | Warehouse receipts        | _(Tushare proxy: fut_wsr)_     |

> **Note**: 期货数据暂通过 Tushare 代理直接调用，未通过 OpenBB 标准路由暴露。

### Options / Convertible Bonds (4)

| Fetcher Name         | Description          | MCP Tool                     |
| -------------------- | -------------------- | ---------------------------- |
| OptionBasic          | Option contract info | `derivatives_options_basic`  |
| OptionDaily          | Option daily data    | `derivatives_options_daily`  |
| OptionsChains        | Option chains+Greeks | `derivatives_options_chains` |
| ConvertibleBondBasic | CB basic info        | _(Tushare proxy: cb_basic)_  |
| ConvertibleBondDaily | CB daily data        | _(Tushare proxy: cb_daily)_  |

### Macro / Rates (15)

| Fetcher Name     | Description                  | MCP Tool                      |
| ---------------- | ---------------------------- | ----------------------------- |
| ConsumerPriceIdx | Consumer Price Index         | `economy_cpi`                 |
| PurchMgrIndex    | Purchasing Managers Index    | `economy_pmi`                 |
| ProducerPriceIdx | Producer Price Index         | `economy_ppi`                 |
| MoneySupply      | Money supply (M0/M1/M2)      | `economy_money_supply`        |
| SocialFinancing  | Social financing             | `economy_social_financing`    |
| ShiborQuote      | SHIBOR bank quotes           | `economy_shibor_quote`        |
| TreasuryYield    | China treasury yield         | `economy_treasury_cn`         |
| USTreasuryYield  | US treasury yield            | `economy_treasury_us`         |
| WZIndex          | Wenzhou private lending rate | `economy_wz_index`            |
| IndexGlobal      | Global indices daily         | `economy_index_global`        |
| Shibor           | SHIBOR rates                 | `fixedincome_rate_shibor`     |
| ShiborLpr        | LPR rates                    | `fixedincome_rate_shibor_lpr` |
| Hibor            | HIBOR rates                  | `fixedincome_rate_hibor`      |
| Libor            | LIBOR rates                  | `fixedincome_rate_libor`      |

### Forex (3)

| Fetcher Name      | Description    | MCP Tool             |
| ----------------- | -------------- | -------------------- |
| CurrencyPairs     | Currency pairs | `currency_search`    |
| CurrencySnapshots | FX snapshots   | `currency_snapshots` |

### News (2)

| Fetcher Name | Description  | MCP Tool       |
| ------------ | ------------ | -------------- |
| CompanyNews  | Company news | `news_company` |
| WorldNews    | World news   | `news_world`   |

### Global Multi-Provider Routes (standard routes, provider switchable)

| Fetcher Name               | Description               | MCP Tool                               | Providers                |
| -------------------------- | ------------------------- | -------------------------------------- | ------------------------ |
| EquityHistorical           | Stock OHLCV (all markets) | `equity_price_historical`              | tushare/yfinance/polygon |
| EquityQuote                | Latest quote              | `equity_price_quote`                   | fmp/polygon/intrinio     |
| EquityInfo                 | Company profile           | `equity_profile`                       | fmp/intrinio             |
| EquitySearch               | Stock search              | `equity_search`                        | nasdaq/intrinio          |
| MarketSnapshots            | Full market snapshot      | `equity_market_snapshots`              | fmp                      |
| HistoricalDividends        | Dividend history          | `equity_fundamental_dividends`         | fmp/intrinio             |
| HistoricalSplits           | Stock split history       | `equity_fundamental_historical_splits` | fmp                      |
| CryptoHistorical           | Crypto OHLCV              | `crypto_price_historical`              | fmp/polygon/yfinance     |
| CryptoSearch               | Crypto search             | `crypto_search`                        | fmp                      |
| IndexSnapshots             | Index snapshots           | `index_snapshots`                      | fmp                      |
| CalendarIpo                | IPO calendar              | `equity_calendar_ipo`                  | fmp/intrinio             |
| IncomeStatement (Global)   | US income statement       | `equity_fundamental_income`            | fmp/intrinio/polygon     |
| BalanceSheet (Global)      | US balance sheet          | `equity_fundamental_balance`           | fmp/intrinio/polygon     |
| CashFlowStatement (Global) | US cash flow              | `equity_fundamental_cash`              | fmp/intrinio/polygon     |

### Crypto CEX (7) — via CCXT

| Fetcher Name      | Description       | MCP Tool (fin-data-bus) |
| ----------------- | ----------------- | ----------------------- |
| CryptoHistorical  | K-line/OHLCV      | `fin_data_ohlcv`        |
| CryptoTicker      | Single-pair quote | `fin_data_ticker`       |
| CryptoTickers     | All-market quote  | _(CCXT direct)_         |
| CryptoOrderBook   | Order book depth  | _(CCXT direct)_         |
| CryptoTrades      | Recent trades     | _(CCXT direct)_         |
| CryptoFundingRate | Funding rate      | _(CCXT direct)_         |
| CryptoSearch      | Market/pair list  | _(CCXT direct)_         |

### Economy (additional standard routes)

| Fetcher Name        | Description          | MCP Tool                       |
| ------------------- | -------------------- | ------------------------------ |
| EconomicCalendar    | Economic calendar    | `economy_calendar`             |
| Unemployment        | Unemployment rate    | `economy_unemployment`         |
| CountryProfile      | Country profile      | `economy_country_profile`      |
| AvailableIndicators | Available indicators | `economy_available_indicators` |
| EconomicIndicators  | Economic indicators  | `economy_indicators`           |

## Natural Language Routing Table

| User Query            | MCP Tool                             | Provider         |
| --------------------- | ------------------------------------ | ---------------- |
| "茅台股价"            | `equity_price_historical`            | tushare          |
| "茅台财报" / "利润表" | `equity_fundamental_income`          | tushare          |
| "茅台资金流向"        | `equity_moneyflow_individual`        | tushare          |
| "今天龙虎榜"          | `equity_market_top_list`             | tushare          |
| "涨停板"              | `equity_market_limit_list`           | tushare          |
| "板块资金流"          | `equity_moneyflow_industry`          | tushare          |
| "港股腾讯"            | `equity_price_historical` (00700.HK) | tushare          |
| "美股苹果" / "AAPL"   | `equity_price_historical` (AAPL)     | tushare/yfinance |
| "AAPL期权链"          | `derivatives_options_chains`         | intrinio         |
| "沪深300成份"         | `index_constituents`                 | tushare          |
| "同花顺概念"          | `equity_concept_concept_list`        | tushare          |
| "期货行情"            | _(Tushare proxy: fut_daily)_         | tushare          |
| "GDP" / "宏观经济"    | `economy_indicators` (GDP)           | tushare          |
| "CPI" / "物价"        | `economy_cpi`                        | tushare          |
| "LPR" / "贷款利率"    | `fixedincome_rate_shibor_lpr`        | tushare          |
| "国债收益率"          | `economy_treasury_cn`                | tushare          |
| "BTC价格"             | `crypto_price_historical`            | ccxt/fmp         |
| "加密市值排名"        | _(CoinGecko API)_                    | coingecko        |
| "世界GDP对比"         | `economy_indicators` (WB)            | worldbank        |
| "汇率" / "美元人民币" | `currency_snapshots`                 | fmp/polygon      |
| "IPO日历"             | `equity_calendar_ipo`                | fmp              |
| "全市场快照"          | `equity_market_snapshots`            | fmp              |
| "沪深港通资金"        | `equity_flow_hsgt_flow`              | tushare          |
| "融资融券"            | `equity_margin_trading`              | tushare          |

## Symbol Format Reference

| Market             | Format         | Example                      |
| ------------------ | -------------- | ---------------------------- |
| A-Share (Shenzhen) | `XXXXXX.SZ`    | `000001.SZ` (Ping An Bank)   |
| A-Share (Shanghai) | `XXXXXX.SH`    | `600036.SH` (CMB)            |
| HK Stock           | `XXXXX.HK`     | `00700.HK` (Tencent)         |
| US Stock           | Ticker         | `AAPL`, `TSLA`               |
| Index (SSE)        | `XXXXXX.SH`    | `000001.SH` (SSE Composite)  |
| Index (SZSE)       | `XXXXXX.SZ`    | `399001.SZ` (SZSE Component) |
| Crypto (CEX)       | `BTC/USDT`     | Slash notation               |
| Crypto (Market)    | Lowercase slug | `bitcoin`, `ethereum`        |
| Futures            | `XXXX.XXX`     | `CU2401.SHF`                 |
| World Bank Country | ISO2           | `CN`, `US`, `JP`             |

## Provider Switching

When multiple providers overlap on the same data, use the `provider` parameter:

```
# A股日线 — Tushare (default for CN)
equity_price_historical({symbol: "600519.SH", provider: "tushare"})

# 美股日线 — 三种 provider 可切换
equity_price_historical({symbol: "AAPL", provider: "tushare"})
equity_price_historical({symbol: "AAPL", provider: "yfinance"})
equity_price_historical({symbol: "AAPL", provider: "polygon"})

# 港股日线 — Tushare 自动检测 .HK 后缀
equity_price_historical({symbol: "00700.HK", provider: "tushare"})
```

## Execution Flow

When a user makes a query:

1. **Parse intent**: Identify asset type, market, data type, time range
2. **Route selection**: Match to the best MCP tool from the index above
3. **Select provider**: Choose appropriate provider (tushare for CN, flexible for US/crypto)
4. **Construct call**: Build the MCP tool call with correct parameters (symbol format, date format, provider)
5. **Execute query**: Call the MCP tool
6. **Parse results**: Extract key data, format for presentation
7. **Add context**: Provide brief interpretation of the data, highlight trends or anomalies

## Response Guidelines

- Identify the correct MCP tool before making any call. Refer to the tool index above.
- Always use the correct symbol format for the target market (see Symbol Format Reference).
- When multiple data points are needed, make parallel tool calls where possible.
- Present results in structured tables for quantitative data.
- Add brief interpretation after raw data -- don't just dump numbers.
- If a query is ambiguous, ask the user to clarify the specific data they need.
- When the query clearly belongs to a specialized skill, suggest that skill instead of handling it here.

## Risk Disclosures

- Data is sourced from multiple third-party providers and may have delays, gaps, or inaccuracies.
- This tool provides data access, not investment advice. Always cross-verify critical decisions with primary sources (exchange filings, official announcements).
- Rate limits apply to some data sources. Large batch queries may experience throttling.
- Historical data availability varies by source and market. Some endpoints may not have data for all time periods.
