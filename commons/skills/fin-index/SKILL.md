---
name: fin-index
description: "基金ETF和指数深度研究 -- 指数成分/估值百分位/行业轮动、ETF套利、基金经理评价/持仓分析、同花顺概念追踪"
metadata: { "openclaw": { "emoji": "📈", "requires": { "extensions": ["fin-data-hub"] } } }
---

# 基金/ETF/指数深度研究

对指数、ETF、基金进行系统性深度分析：估值百分位判断、行业轮动追踪、基金经理评价、ETF折溢价套利、全球指数横向对比。

## When to Use

**USE this skill when:**

- "沪深300估值分位" / "现在指数贵不贵"
- "000300.SH 的成分股" / "指数权重"
- "同花顺概念板块涨幅排名"
- "行业轮动" / "哪个板块最强"
- "张坤管理的基金" / "基金经理评价"
- "510050 ETF折溢价" / "ETF套利机会"
- "基金持仓分析" / "110011 的重仓股"
- "标普500 vs 沪深300 对比"
- "中证500 PE/PB 历史百分位"
- "申万行业分类"

## When NOT to Use

**DON'T use this skill when:**

- User asks about individual A-stock analysis -- use fin-stock
- User asks about HK or US stock fundamentals -- use fin-global
- User wants broad market overview (limit-up counts, sentiment) -- use fin-market
- User asks about macro indicators (CPI, PMI, interest rates) -- use fin-macro
- User asks about futures, options, or convertible bonds -- use fin-deriv
- User asks about crypto or DeFi -- use fin-crypto

## Tools

- `fin_index` -- index data (historical, constituents, valuation, sector classification)
- `fin_fund` -- fund/ETF data (NAV, manager, portfolio, share changes, dividends)
- `fin_market` -- supplement with sector-level data when needed

### Query Types for fin_index

| query_type     | Description                             | Key Fields                              |
| -------------- | --------------------------------------- | --------------------------------------- |
| `historical`   | Index daily OHLCV                       | open, high, low, close, vol, amount     |
| `info`         | Index basic information                 | ts_code, name, market                   |
| `constituents` | Index constituent stocks with weights   | con_code, con_name, weight              |
| `valuation`    | Daily PE/PB/turnover (index_dailybasic) | pe, pb, turnover_rate, total_mv         |
| `member`       | Index member changes                    | index_code, con_code, in_date, out_date |
| `global`       | Global major index daily data           | ts_code, trade_date, close, pct_chg     |
| `ths_list`     | THS concept/industry index list         | ts_code, name, type (N/I/S)             |
| `ths_daily`    | THS index daily data                    | ts_code, close, pct_change              |
| `ths_member`   | THS index constituents                  | ts_code, code, name                     |
| `classify`     | SW industry classification (L1/L2/L3)   | index_code, industry_name, level        |

### Query Types for fin_fund

| query_type       | Description              | Key Fields                          |
| ---------------- | ------------------------ | ----------------------------------- |
| `etf_historical` | ETF daily OHLCV          | open, high, low, close, vol         |
| `etf_info`       | ETF basic information    | ts_code, name, fund_type            |
| `etf_search`     | ETF search by keyword    | ts_code, name                       |
| `nav`            | Fund/ETF net asset value | end_date, unit_nav, accum_nav       |
| `manager`        | Fund manager info        | ts_code, name, begin_date, end_date |
| `portfolio`      | Fund holdings detail     | symbol, mkv, amount, stk_mkv_ratio  |
| `share`          | Fund share changes       | end_date, fd_share                  |
| `dividend`       | Fund dividend records    | --                                  |
| `adj_factor`     | Fund adjustment factor   | adj_factor                          |

## Code Format Conventions

| Type         | Format      | Example                                             |
| ------------ | ----------- | --------------------------------------------------- |
| SSE Index    | `XXXXXX.SH` | `000001.SH` (SSE Composite), `000016.SH` (SSE 50)   |
| SZSE Index   | `XXXXXX.SZ` | `399001.SZ` (SZSE Component), `399006.SZ` (ChiNext) |
| CSI 300      | `000300.SH` |                                                     |
| CSI 500      | `000905.SH` |                                                     |
| CSI 1000     | `000852.SH` |                                                     |
| SSE ETF      | `XXXXXX.SH` | `510050.SH` (50ETF), `510300.SH` (300ETF)           |
| SZSE ETF     | `XXXXXX.SZ` | `159919.SZ` (CSI 300 ETF)                           |
| THS Index    | `XXXXXX.TI` | from `ths_list` query                               |
| Global Index | `I:XXX`     | `I:SPX` (S&P 500), `I:DJI` (Dow Jones)              |
| Fund         | `XXXXXX.OF` | `110011.OF`                                         |

### Common Index Code Reference

| Name           | Code           | Description         |
| -------------- | -------------- | ------------------- |
| SSE Composite  | 000001.SH      | Full market         |
| SZSE Component | 399001.SZ      | Shenzhen blue chips |
| CSI 300        | 000300.SH      | Large cap           |
| CSI 500        | 000905.SH      | Mid cap growth      |
| CSI 1000       | 000852.SH      | Small cap           |
| ChiNext        | 399006.SZ      | Tech growth         |
| STAR 50        | 000688.SH      | Sci-tech            |
| SSE 50         | 000016.SH      | Ultra large cap     |
| S&P 500        | I:SPX (Global) | US large cap        |
| NASDAQ 100     | I:NDX (Global) | US tech             |

## Analysis Frameworks

### Framework 1: Index Valuation Percentile

**Purpose**: Determine where current valuation sits in historical distribution to support timing decisions.

**Data**: `valuation` query type (PE/PB/turnover/market cap)

**Steps**:

1. Fetch 3-year and 5-year PE/PB historical data
2. Calculate current PE/PB percentile in historical distribution
3. Classify valuation level

**Percentile Interpretation**:

| PE Percentile | Valuation              | Suggested Action        |
| ------------- | ---------------------- | ----------------------- |
| < 20%         | Extremely undervalued  | Aggressive accumulation |
| 20-40%        | Moderately undervalued | Gradual buying          |
| 40-60%        | Fair value             | Hold                    |
| 60-80%        | Moderately overvalued  | Reduce position         |
| > 80%         | Extremely overvalued   | Consider full exit      |

**Example Tool Call**:

```
fin_index({symbol: "000300.SH", query_type: "valuation", start_date: "20190101", end_date: "20240301"})
```

### Framework 2: Sector Rotation Tracking

**Purpose**: Identify capital rotation direction and sector opportunities.

**Data**: `ths_list` (type=I for industries) + `ths_daily` for each industry index

**Steps**:

1. Fetch all industry indices via `ths_list` (type=I)
2. Batch fetch recent performance via `ths_daily`
3. Sort by 5-day / 20-day / 60-day performance
4. Analyze rotation trends

**Rotation Signals**:

- Short-term (5d) leading, mid-term (20d) lagging: Bounce play, may not persist
- Short + mid-term both leading: Strong trend, worthy of attention
- Long-term (60d) leading but short-term pullback: Potential buy opportunity

**Example Tool Calls**:

```
fin_index({query_type: "ths_list", exchange: "A", type: "I"})
fin_index({symbol: "885760.TI", query_type: "ths_daily", start_date: "20240101"})
```

### Framework 3: Fund Manager Evaluation

**Purpose**: Comprehensive assessment of fund manager's investment capability.

**Evaluation Dimensions**:

| Dimension         | Data Source | Metrics                                         |
| ----------------- | ----------- | ----------------------------------------------- |
| Performance       | `nav`       | Annualized return / max drawdown / Sharpe ratio |
| Scale             | `manager`   | Total AUM across managed funds                  |
| Style             | `portfolio` | Concentration / sector distribution / turnover  |
| Market Acceptance | `share`     | Net subscription/redemption trend               |
| Experience        | `manager`   | Tenure years / historical fund count            |

**Evaluation Standards**:

- Annualized return > 15%: Excellent
- Max drawdown < 20%: Good risk control
- Top-10 holding concentration > 60%: Concentrated style
- Continuous share growth: High market acceptance
- Tenure > 5 years: Experienced

**Example Tool Calls**:

```
fin_fund({query_type: "manager", name: "张坤"})
fin_fund({symbol: "110011.OF", query_type: "portfolio"})
fin_fund({symbol: "110011.OF", query_type: "nav", start_date: "20230101"})
fin_fund({symbol: "110011.OF", query_type: "share", start_date: "20230101"})
```

### Framework 4: ETF Premium/Discount Arbitrage

**Purpose**: Identify premium/discount opportunities between ETF market price and NAV.

**Steps**:

1. Fetch ETF market price via `etf_historical`
2. Fetch tracking index data via `historical`
3. Fetch ETF NAV via `nav`
4. Calculate: Premium/Discount Rate = (ETF Price / IOPV - 1) x 100%

**Arbitrage Signals**:

| Premium/Discount Rate | Status   | Arbitrage Direction                                                |
| --------------------- | -------- | ------------------------------------------------------------------ |
| > +1%                 | Premium  | Creation arbitrage (primary market create, secondary market sell)  |
| < -1%                 | Discount | Redemption arbitrage (secondary market buy, primary market redeem) |
| -1% ~ +1%             | Fair     | No arbitrage opportunity                                           |

**Example Tool Calls**:

```
fin_fund({symbol: "510050.SH", query_type: "etf_historical", start_date: "2024-01-01"})
fin_index({symbol: "000016.SH", query_type: "historical", start_date: "2024-01-01"})
fin_fund({symbol: "510050.SH", query_type: "nav", start_date: "20240101"})
```

## Execution Flow

When a user inputs an index/fund/ETF code or name:

1. **Identify type**:
   - 6-digit + .SH/.SZ: Index or ETF
   - 6-digit + .OF: Fund
   - Chinese name: Search first, then determine type
   - I:XXX: Global index

2. **Fetch basic info**: `info` / `etf_info` / `manager`

3. **Price and valuation**:
   - Index: `valuation` (PE/PB) + `historical` (OHLCV)
   - ETF: `etf_historical` (OHLCV) + `nav` (NAV)
   - Fund: `nav` (NAV)

4. **Constituents/Holdings**:
   - Index: `constituents` or `member`
   - Fund: `portfolio`

5. **Sector/Concept**: `ths_list` + `ths_daily` for sector rotation

6. **Global comparison**: Global data for S&P 500 / Dow Jones etc.

7. **Generate report**: Organize per output template

## Output Report Template

```markdown
# [Index/Fund Name] Deep Research Report

## Basic Information

- Code: [XXXXXX.XX]
- Type: [Broad-based Index / Sector Index / ETF / Active Fund]
- Tracking Target: [if applicable]
- Fund Manager: [if applicable]
- AUM: [if applicable]

## Index Valuation Analysis

| Metric         | Current | 5Y Percentile | 3Y Percentile | Assessment        |
| -------------- | ------- | ------------- | ------------- | ----------------- |
| PE(TTM)        | XX.X    | XX%           | XX%           | [Under/Fair/Over] |
| PB             | XX.XX   | XX%           | XX%           | [Under/Fair/Over] |
| Dividend Yield | XX%     | -             | -             | -                 |

## Constituent Analysis

- Top 10 weighted stocks: [list]
- Sector distribution: [top 5 sectors by weight]
- Concentration: Top 10 = XX%

## Sector Rotation Signals (THS Data)

| Sector    | 5D Chg | 20D Chg | 60D Chg | Signal       |
| --------- | ------ | ------- | ------- | ------------ |
| XX Sector | +X.X%  | +X.X%   | +X.X%   | Strong trend |
| YY Sector | +X.X%  | -X.X%   | -X.X%   | Bounce       |

## Fund Manager Evaluation (if applicable)

- Tenure: XX years
- Annualized return: XX%
- Max drawdown: XX%
- Holding concentration: XX%
- Share trend: [net subscription / net redemption]

## ETF Premium/Discount (if applicable)

- Current rate: XX%
- 30-day range: XX% ~ XX%
- Arbitrage opportunity: [Yes/No]

## Global Index Comparison

| Index     | 1M  | 3M  | 1Y  | Current PE |
| --------- | --- | --- | --- | ---------- |
| CSI 300   | XX% | XX% | XX% | XX         |
| S&P 500   | XX% | XX% | XX% | XX         |
| Hang Seng | XX% | XX% | XX% | XX         |

## Investment Suggestion

[Comprehensive judgment based on valuation percentile, sector rotation, capital flow]
```

## Response Guidelines

- Always start with the valuation percentile assessment -- this is the most actionable data point.
- Present PE/PB percentiles for multiple timeframes (3-year and 5-year) for context.
- For sector rotation, show both short-term and medium-term rankings to distinguish bounces from trends.
- For fund manager evaluation, compare key metrics against peer average.
- When analyzing ETFs, always check premium/discount and flag if outside normal range.
- Include global index comparison when analyzing domestic indices for macro perspective.
- Use tables for structured data; use bullet points for signals and conclusions.
- Note data freshness: fund holdings are disclosed quarterly with a 1-2 month delay.

## Risk Disclosures

- Index valuation percentiles are backward-looking. A historically low PE does not guarantee future appreciation; structural changes in index composition may shift valuation norms.
- Sector rotation signals are based on historical pattern recognition. Momentum can reverse abruptly due to policy changes, macro shifts, or black swan events.
- Fund manager past performance does not predict future results. Manager style may drift as AUM grows.
- ETF premium/discount arbitrage involves execution risk, transaction costs, and minimum creation/redemption unit requirements that may exceed retail investor capacity.
- All data sourced from market data providers. There may be delays, omissions, or inaccuracies. Cross-verify critical decisions with official filings.
