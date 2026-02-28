---
name: fin-query
description: "金融数据通用查询工具 -- 覆盖全部162个数据接口，自动路由到正确的数据源，万能兜底查询"
metadata: { "openclaw": { "emoji": "🔍", "requires": { "extensions": ["fin-data-hub"] } } }
---

# 金融数据通用查询工具

万能兜底查询技能，覆盖 7 大工具、162 个数据接口。当用户查询不明确属于哪个专项技能时，本技能自动路由到正确的数据源并返回结果。

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

## Tools

All 7 financial data tools are available:

- `fin_stock` -- A-stock equity data
- `fin_global` -- HK/US stock data
- `fin_market` -- Broad market data
- `fin_index` -- Index data
- `fin_fund` -- Fund/ETF data
- `fin_deriv` -- Derivatives data
- `fin_crypto` -- Crypto CEX data
- `fin_defi` -- DeFi on-chain data
- `fin_market_crypto` -- Crypto market overview
- `fin_macro` -- Macro/rates data
- `fin_macro` -- Global macro indicators (GDP, population, inflation)

## Complete 162 Fetcher Index

### A-Share Trading (~15)

| Fetcher Name     | Description                         | Tool       | query_type    |
| ---------------- | ----------------------------------- | ---------- | ------------- |
| EquityHistorical | A-share daily OHLCV                 | fin_stock  | `historical`  |
| EquityQuote      | Latest quote                        | fin_stock  | `quote`       |
| BackupDaily      | Backup daily (PE/PB/mcap)           | fin_stock  | `valuation`   |
| AdjFactor        | Adjustment factor                   | fin_stock  | `adj_factor`  |
| StockLimit       | Daily limit-up/down prices          | fin_market | `limit_price` |
| TradeCalendar    | Trading calendar                    | fin_market | `calendar`    |
| SuspendInfo      | Suspension/resumption               | fin_stock  | `suspend`     |
| NameChange       | Historical name changes             | fin_stock  | `name_change` |
| NewShare         | New IPO listings                    | fin_market | `new_share`   |
| ShareFloat       | Lock-up release schedule            | fin_stock  | `share_float` |
| StockFactor      | Technical factors                   | fin_stock  | `factor`      |
| LimitList        | Daily limit-up/down stats           | fin_market | `limit_list`  |
| TopList          | Dragon-Tiger list                   | fin_market | `top_list`    |
| TopInst          | Institutional seats on Dragon-Tiger | fin_market | `top_inst`    |

### A-Share Financials (~15)

| Fetcher Name      | Description          | Tool      | query_type         |
| ----------------- | -------------------- | --------- | ------------------ |
| IncomeStatement   | Income statement     | fin_stock | `income`           |
| BalanceSheet      | Balance sheet        | fin_stock | `balance`          |
| CashFlowStatement | Cash flow statement  | fin_stock | `cashflow`         |
| FinancialRatios   | Financial ratios     | fin_stock | `ratios`           |
| IncomeVip         | VIP income statement | fin_stock | `income_vip`       |
| BalancesheetVip   | VIP balance sheet    | fin_stock | `balance_vip`      |
| CashflowVip       | VIP cash flow        | fin_stock | `cashflow_vip`     |
| ForecastVip       | Earnings forecast    | fin_stock | `forecast`         |
| FinancialExpress  | Earnings express     | fin_stock | `express`          |
| FinancialAudit    | Audit opinion        | fin_stock | `audit`            |
| EarningsForecast  | Broker estimates     | fin_stock | `analyst_forecast` |
| RevenueSegmentVip | Revenue by segment   | fin_stock | `revenue_segment`  |
| DividendDetail    | Dividend history     | fin_stock | `dividend`         |
| Repurchase        | Share buyback        | fin_stock | `repurchase`       |

### A-Share Capital Flow (~8)

| Fetcher Name      | Description                 | Tool       | query_type         |
| ----------------- | --------------------------- | ---------- | ------------------ |
| MoneyFlow         | Individual stock money flow | fin_stock  | `moneyflow`        |
| MoneyflowIndustry | Sector money flow           | fin_market | `moneyflow_sector` |
| BlockTrade        | Block trades                | fin_stock  | `block_trade`      |
| MarginTrading     | Margin trading summary      | fin_stock  | `margin`           |
| MarginDetail      | Margin trading detail       | fin_market | `margin_detail`    |
| MarginSummary     | Margin trading targets      | fin_market | `margin_target`    |

### A-Share Shareholders (~7)

| Fetcher Name      | Description               | Tool      | query_type      |
| ----------------- | ------------------------- | --------- | --------------- |
| Top10Holders      | Top 10 shareholders       | fin_stock | `top10_holders` |
| Top10FloatHolders | Top 10 float shareholders | fin_stock | `top10_float`   |
| HolderNumber      | Shareholder count         | fin_stock | `holder_number` |
| ShareholderTrade  | Major shareholder trades  | fin_stock | `holder_trade`  |
| PledgeDetail      | Pledge detail             | fin_stock | `pledge`        |
| PledgeStat        | Pledge statistics         | fin_stock | `pledge_stat`   |

### HK Stocks (10)

| Fetcher Name    | Description               | Tool       | query_type      |
| --------------- | ------------------------- | ---------- | --------------- |
| HKBasic         | HK stock info             | fin_global | `hk_info`       |
| HKDaily         | HK stock daily            | fin_global | `hk_daily`      |
| HKDailyAdj      | HK adjusted daily         | fin_global | `hk_daily_adj`  |
| HKAdjFactor     | HK adjustment factor      | fin_global | `hk_adj_factor` |
| HKIncome        | HK income statement       | fin_global | `hk_income`     |
| HKBalancesheet  | HK balance sheet          | fin_global | `hk_balance`    |
| HKCashflow      | HK cash flow              | fin_global | `hk_cashflow`   |
| HKFinaIndicator | HK financial indicators   | fin_global | `hk_ratios`     |
| HKTradeCal      | HK trading calendar       | fin_global | `hk_calendar`   |
| HKHold          | HK Stock Connect holdings | fin_global | `hk_hold`       |

### US Stocks - China Equity Source (9)

| Fetcher Name    | Description             | Tool       | query_type      |
| --------------- | ----------------------- | ---------- | --------------- |
| USBasic         | US stock info           | fin_global | `us_info`       |
| USDaily         | US stock daily          | fin_global | `us_daily`      |
| USDailyAdj      | US adjusted daily       | fin_global | `us_daily_adj`  |
| USAdjFactor     | US adjustment factor    | fin_global | `us_adj_factor` |
| USIncome        | US income statement     | fin_global | `us_income`     |
| USBalancesheet  | US balance sheet        | fin_global | `us_balance`    |
| USCashflow      | US cash flow            | fin_global | `us_cashflow`   |
| USFinaIndicator | US financial indicators | fin_global | `us_ratios`     |
| USTradeCal      | US trading calendar     | fin_global | `us_calendar`   |

### Stock Connect / Cross-Border (7)

| Fetcher Name | Description                 | Tool       | query_type    |
| ------------ | --------------------------- | ---------- | ------------- |
| HSGTFlow     | Stock Connect capital flow  | fin_global | `hsgt_flow`   |
| HSGTTop10    | Stock Connect top 10 trades | fin_global | `hsgt_top10`  |
| HSConst      | Stock Connect constituents  | fin_global | `hs_const`    |
| GGTDaily     | HK Connect daily trades     | fin_global | `ggt_daily`   |
| GGTMonthly   | HK Connect monthly trades   | fin_global | `ggt_monthly` |
| GGTTop10     | HK Connect top 10 trades    | fin_global | `ggt_top10`   |
| HKHold       | HK Connect holdings         | fin_global | `hk_hold`     |

### Index (10)

| Fetcher Name      | Description                  | Tool      | query_type     |
| ----------------- | ---------------------------- | --------- | -------------- |
| IndexHistorical   | Index daily OHLCV            | fin_index | `historical`   |
| IndexInfo         | Index basic info             | fin_index | `info`         |
| IndexConstituents | Index constituents           | fin_index | `constituents` |
| IndexDailyBasic   | Index PE/PB/turnover         | fin_index | `valuation`    |
| IndexMember       | Index member changes         | fin_index | `member`       |
| IndexGlobal       | Global index daily           | fin_index | `global`       |
| IndexClassify     | SW industry classification   | fin_index | `classify`     |
| ThsIndex          | THS concept/industry indices | fin_index | `ths_list`     |
| ThsDaily          | THS index daily data         | fin_index | `ths_daily`    |
| ThsMember         | THS index members            | fin_index | `ths_member`   |

### ETF/Fund (9)

| Fetcher Name     | Description            | Tool     | query_type       |
| ---------------- | ---------------------- | -------- | ---------------- |
| EtfHistorical    | ETF daily OHLCV        | fin_fund | `etf_historical` |
| EtfInfo          | ETF basic info         | fin_fund | `etf_info`       |
| EtfSearch        | ETF search             | fin_fund | `etf_search`     |
| EtfHistoricalNav | Fund/ETF NAV           | fin_fund | `nav`            |
| FundManager      | Fund manager info      | fin_fund | `manager`        |
| FundPortfolio    | Fund holdings          | fin_fund | `portfolio`      |
| FundShare        | Fund share changes     | fin_fund | `share`          |
| FundDiv          | Fund dividends         | fin_fund | `dividend`       |
| FundAdj          | Fund adjustment factor | fin_fund | `adj_factor`     |

### Futures (6)

| Fetcher Name      | Description               | Tool      | query_type           |
| ----------------- | ------------------------- | --------- | -------------------- |
| FuturesHistorical | Futures daily OHLCV       | fin_deriv | `futures_historical` |
| FuturesInfo       | Futures contract info     | fin_deriv | `futures_info`       |
| FuturesMapping    | Dominant contract mapping | fin_deriv | `futures_mapping`    |
| FuturesHolding    | Position ranking          | fin_deriv | `futures_holding`    |
| FuturesSettle     | Settlement parameters     | fin_deriv | `futures_settle`     |
| FuturesWarehouse  | Warehouse receipts        | fin_deriv | `futures_warehouse`  |

### Options / Convertible Bonds (4)

| Fetcher Name         | Description          | Tool      | query_type     |
| -------------------- | -------------------- | --------- | -------------- |
| OptionBasic          | Option contract info | fin_deriv | `option_basic` |
| OptionDaily          | Option daily data    | fin_deriv | `option_daily` |
| ConvertibleBondBasic | CB basic info        | fin_deriv | `cb_basic`     |
| ConvertibleBondDaily | CB daily data        | fin_deriv | `cb_daily`     |

### Macro / Rates (15)

| Fetcher Name     | Description                  | Tool      | query_type         |
| ---------------- | ---------------------------- | --------- | ------------------ |
| GdpReal          | China GDP                    | fin_macro | `gdp`              |
| CPI              | Consumer Price Index         | fin_macro | `cpi`              |
| PPI              | Producer Price Index         | fin_macro | `ppi`              |
| PMI              | Purchasing Managers Index    | fin_macro | `pmi`              |
| MoneySupply      | Money supply (M0/M1/M2)      | fin_macro | `money_supply`     |
| SocialFinancing  | Social financing             | fin_macro | `social_financing` |
| EconomicCalendar | Economic calendar            | fin_macro | `calendar`         |
| Shibor           | SHIBOR rates                 | fin_macro | `shibor`           |
| ShiborLpr        | LPR rates                    | fin_macro | `lpr`              |
| ShiborQuote      | SHIBOR bank quotes           | fin_macro | `shibor_quote`     |
| Libor            | LIBOR rates                  | fin_macro | `libor`            |
| Hibor            | HIBOR rates                  | fin_macro | `hibor`            |
| TreasuryYield    | China treasury yield         | fin_macro | `cn_bond`          |
| USTreasuryYield  | US treasury yield            | fin_macro | `us_bond`          |
| WZIndex          | Wenzhou private lending rate | fin_macro | `wz_index`         |

### Forex (1)

| Fetcher Name       | Description   | Tool      | query_type |
| ------------------ | ------------- | --------- | ---------- |
| CurrencyHistorical | FX daily data | fin_macro | `fx_daily` |

### News (1)

| Fetcher Name | Description  | Tool      | query_type |
| ------------ | ------------ | --------- | ---------- |
| CompanyNews  | Company news | fin_stock | `news`     |

### Global Equity Source - US Market (20)

| Fetcher Name                | Description                    | Tool       | query_type                 |
| --------------------------- | ------------------------------ | ---------- | -------------------------- |
| EquityHistorical (Global)   | US equity OHLCV (minute-level) | fin_global | `us_historical`            |
| EquityQuote (Global)        | US latest quote                | fin_global | `us_quote`                 |
| EquityInfo (Global)         | Company profile                | fin_global | `us_profile`               |
| EquitySearch (Global)       | Stock search                   | fin_global | `us_search`                |
| MarketSnapshots             | Full market snapshot           | fin_market | `us_snapshots`             |
| CompanyNews (Global)        | Company news                   | fin_global | `us_news`                  |
| HistoricalDividends         | Dividend history               | fin_global | `us_dividends`             |
| HistoricalSplits            | Stock split history            | fin_global | `us_splits`                |
| CryptoHistorical (Global)   | Crypto OHLCV                   | fin_crypto | `crypto_historical_global` |
| CurrencyHistorical (Global) | FX OHLCV                       | fin_macro  | `fx_historical`            |
| IndexHistorical (Global)    | US index OHLCV                 | fin_index  | `us_index`                 |
| CryptoSearch (Global)       | Crypto search                  | fin_crypto | `crypto_search_global`     |
| CurrencyPairs               | Currency pairs                 | fin_macro  | `fx_pairs`                 |
| CurrencySnapshots           | FX snapshots                   | fin_macro  | `fx_snapshots`             |
| IndexSnapshots              | Index snapshots                | fin_index  | `us_index_snapshots`       |
| OptionsChains               | Option chains (Greeks)         | fin_deriv  | `option_chain`             |
| IncomeStatement (Global)    | US income statement            | fin_global | `us_income`                |
| BalanceSheet (Global)       | US balance sheet               | fin_global | `us_balance`               |
| CashFlowStatement (Global)  | US cash flow                   | fin_global | `us_cashflow`              |
| CalendarIpo                 | IPO calendar                   | fin_market | `ipo_calendar`             |

### Crypto CEX (7)

| Fetcher Name      | Description       | Tool       | query_type     |
| ----------------- | ----------------- | ---------- | -------------- |
| CryptoHistorical  | K-line/OHLCV      | fin_crypto | `ohlcv`        |
| CryptoTicker      | Single-pair quote | fin_crypto | `ticker`       |
| CryptoTickers     | All-market quote  | fin_crypto | `tickers`      |
| CryptoOrderBook   | Order book depth  | fin_crypto | `orderbook`    |
| CryptoTrades      | Recent trades     | fin_crypto | `trades`       |
| CryptoFundingRate | Funding rate      | fin_crypto | `funding_rate` |
| CryptoSearch      | Market/pair list  | fin_crypto | `markets`      |

### DeFi On-Chain (10)

| Fetcher Name      | Description         | Tool     | query_type          |
| ----------------- | ------------------- | -------- | ------------------- |
| DefiProtocols     | Protocol list + TVL | fin_defi | `protocols`         |
| DefiProtocolTvl   | Single protocol TVL | fin_defi | `protocol_tvl`      |
| DefiTvlHistorical | Chain TVL history   | fin_defi | `chain_tvl_history` |
| DefiChains        | Chain TVL snapshot  | fin_defi | `chains`            |
| DefiYields        | Yield pools         | fin_defi | `yields`            |
| DefiStablecoins   | Stablecoin supply   | fin_defi | `stablecoins`       |
| DefiBridges       | Bridge statistics   | fin_defi | `bridges`           |
| DefiFees          | Protocol fees       | fin_defi | `fees`              |
| DefiDexVolumes    | DEX volumes         | fin_defi | `dex_volumes`       |
| DefiCoinPrices    | Token prices        | fin_defi | `token_prices`      |

### Crypto Market Overview (6)

| Fetcher Name   | Description            | Tool              | query_type     |
| -------------- | ---------------------- | ----------------- | -------------- |
| CoinMarket     | Market cap ranking     | fin_market_crypto | `market_cap`   |
| CoinHistorical | Historical price chart | fin_market_crypto | `coin_history` |
| CoinInfo       | Coin project info      | fin_market_crypto | `coin_info`    |
| CoinCategories | Sector classification  | fin_market_crypto | `categories`   |
| CoinTrending   | Trending/hot search    | fin_market_crypto | `trending`     |
| CoinGlobal     | Global market data     | fin_market_crypto | `global`       |

### Global Macro Indicators (5)

| Fetcher Name | Description         | Tool      | query_type   |
| ------------ | ------------------- | --------- | ------------ |
| WbGdp        | GDP (current USD)   | fin_macro | `gdp`        |
| WbPopulation | Total population    | fin_macro | `population` |
| WbInflation  | CPI inflation rate  | fin_macro | `inflation`  |
| WbIndicator  | Custom WB indicator | fin_macro | `indicator`  |
| WbCountry    | Country/region list | fin_macro | `countries`  |

## Natural Language Routing Table

| User Query            | Tool              | query_type           |
| --------------------- | ----------------- | -------------------- |
| "茅台股价"            | fin_stock         | `historical`         |
| "茅台财报" / "利润表" | fin_stock         | `income`             |
| "茅台资金流向"        | fin_stock         | `moneyflow`          |
| "今天龙虎榜"          | fin_market        | `top_list`           |
| "涨停板"              | fin_market        | `limit_list`         |
| "板块资金流"          | fin_market        | `moneyflow_sector`   |
| "港股腾讯"            | fin_global        | `hk_daily`           |
| "美股苹果" / "AAPL"   | fin_global        | `us_historical`      |
| "AAPL期权链"          | fin_deriv         | `option_chain`       |
| "沪深300成份"         | fin_index         | `constituents`       |
| "同花顺概念"          | fin_index         | `ths_list`           |
| "ETF行情"             | fin_fund          | `etf_historical`     |
| "期货行情"            | fin_deriv         | `futures_historical` |
| "GDP" / "宏观经济"    | fin_macro         | `gdp`                |
| "CPI" / "物价"        | fin_macro         | `cpi`                |
| "LPR" / "贷款利率"    | fin_macro         | `lpr`                |
| "国债收益率"          | fin_macro         | `cn_bond`            |
| "BTC价格"             | fin_crypto        | `ohlcv`              |
| "DeFi TVL"            | fin_defi          | `protocols`          |
| "加密市值排名"        | fin_market_crypto | `market_cap`         |
| "稳定币"              | fin_defi          | `stablecoins`        |
| "世界GDP对比"         | fin_macro         | `gdp`                |
| "汇率" / "美元人民币" | fin_macro         | `fx_daily`           |
| "IPO日历"             | fin_market        | `ipo_calendar`       |
| "全市场快照"          | fin_market        | `us_snapshots`       |
| "沪深港通资金"        | fin_global        | `hsgt_flow`          |
| "融资融券"            | fin_stock         | `margin`             |

## Code Format Reference

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

## Execution Flow

When a user makes a query:

1. **Parse intent**: Identify asset type, data type, time range
2. **Route selection**: Match to the best tool and query_type from the index above
3. **Construct call**: Build the tool call with correct parameters (symbol format, date format)
4. **Execute query**: Call the appropriate fin\_\* tool
5. **Parse results**: Extract key data, format for presentation
6. **Add context**: Provide brief interpretation of the data, highlight trends or anomalies

## Response Guidelines

- Identify the correct tool and query_type before making any call. Refer to the 162-fetcher index above.
- Always use the correct symbol format for the target market (see Code Format Reference).
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
