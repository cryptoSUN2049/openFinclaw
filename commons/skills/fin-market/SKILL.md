---
name: fin-market
description: "A股市场全景监控与异动发现 -- 龙虎榜/涨跌停/大宗交易/板块资金流/行业轮动/融资融券/全球快照"
metadata: { "openclaw": { "emoji": "📡", "requires": { "extensions": ["fin-data-hub"] } } }
---

# Market Radar

Full-spectrum A-share market monitoring and anomaly detection. Covers institutional block lists (Dragon-Tiger), limit-up/down statistics, block trades, sector capital flows, industry rotation, margin trading, and global market snapshots. Ideal for post-market review, intraday monitoring, and sector rotation analysis.

## When to Use

**USE this skill when:**

- "today's Dragon-Tiger list" / "institutional block buys"
- "how many stocks hit limit-up today"
- "sector capital flows" / "which sectors are seeing inflows"
- "block trades today" / "large transactions"
- "margin trading balance" / "leverage data"
- "northbound capital" / "foreign capital flow"
- "market review" / "post-market recap"
- "industry rotation analysis"
- "global market snapshot" / "overnight US market"
- "hot concepts today" / "trending sectors"

## When NOT to Use

**DON'T use this skill when:**

- User asks about a specific A-share stock in depth -- use fin-stock
- User asks about HK/US stocks -- use fin-global
- User wants macro indicators (GDP, CPI, rates) -- use fin-macro
- User asks about crypto or DeFi -- use fin-crypto
- User asks about funds or ETFs -- use fin-fund

## Tools

- `fin_market` -- market-wide data (indices, sector flows, Dragon-Tiger, limit lists, block trades, margin, Stock Connect, global indices, concepts)

### Query Types for fin_market

#### Anomaly Detection

| query_type          | Description                               | Key Fields                                                       |
| ------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| `dragon_tiger`      | Dragon-Tiger list daily detail            | ts_code, name, close, pct_change, amount, reason                 |
| `dragon_tiger_inst` | Dragon-Tiger institutional seats          | ts_code, exalter, buy, sell, net_buy                             |
| `limit_up`          | Limit-up stocks                           | ts_code, name, close, pct_chg, fd_amount, first_time, open_times |
| `limit_down`        | Limit-down stocks                         | ts_code, name, close, pct_chg                                    |
| `limit_broken`      | Broken limit (opened after hitting limit) | ts_code, name, open_times                                        |

#### Block Trades

| query_type    | Description                            | Key Fields                                 |
| ------------- | -------------------------------------- | ------------------------------------------ |
| `block_trade` | Block trade details (by date or stock) | ts_code, price, vol, amount, buyer, seller |

#### Sector & Industry

| query_type         | Description                                | Key Fields                                                  |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------- |
| `sector_flow`      | Industry capital flow                      | industry_name, buy_sm, sell_sm, buy_lg, sell_lg, net_amount |
| `sw_classify`      | Shenwan industry classification (L1/L2/L3) | index_code, industry_name, level                            |
| `ths_concept_list` | THS concept/industry index list            | ts_code, name, type (N=concept, I=industry)                 |
| `ths_daily`        | THS index daily data                       | ts_code, close, pct_change, vol, turnover_rate              |
| `ths_members`      | THS index constituent stocks               | ts_code, code, name                                         |

#### Leverage (Margin Trading)

| query_type      | Description                | Key Fields                                             |
| --------------- | -------------------------- | ------------------------------------------------------ |
| `margin_total`  | Market-wide margin summary | rzye (margin balance), rqye, rzmre (margin buy amount) |
| `margin_detail` | Per-stock margin detail    | ts_code, rzye, rqye, rzmre                             |

#### Stock Connect (Cross-Border)

| query_type   | Description                              | Key Fields                         |
| ------------ | ---------------------------------------- | ---------------------------------- |
| `hsgt_flow`  | Northbound/Southbound daily capital flow | north_money, south_money, hgt, sgt |
| `hsgt_top10` | Stock Connect top 10 traded              | ts_code, name, amount, net_amount  |
| `hs_const`   | Stock Connect constituent list           | ts_code, name, hs_type             |

#### Global Market

| query_type        | Description                                                | Key Fields                     |
| ----------------- | ---------------------------------------------------------- | ------------------------------ |
| `global_index`    | Global major index quotes (DJIA, NASDAQ, HSI, Nikkei, DAX) | ts_code, name, close, pct_chg  |
| `market_snapshot` | Full-market snapshot                                       | symbol, last_price, change_pct |
| `ipo_calendar`    | US IPO calendar                                            | company, date, price_range     |

#### Index Data

| query_type    | Description                    | Key Fields                           |
| ------------- | ------------------------------ | ------------------------------------ |
| `index_daily` | Major A-share index daily data | ts_code, close, pct_chg, vol, amount |

#### Utilities

| query_type       | Description      | Key Fields            |
| ---------------- | ---------------- | --------------------- |
| `suspend`        | Suspended stocks | ts_code, suspend_type |
| `trade_calendar` | Trading calendar | cal_date, is_open     |

## Analysis Frameworks

### Framework 1: Post-Market Review

Systematic review after market close. Execute all 5 steps:

**Step 1: Market Temperature**

```
fin_market({query_type: "index_daily", date: "YYYYMMDD"})
```

Fetch major indices: Shanghai Composite, Shenzhen Component, ChiNext, CSI 300, CSI 500, CSI 1000, STAR 50.

**Step 2: Sector Strength**

```
fin_market({query_type: "sector_flow", date: "YYYYMMDD"})
```

Sort by net_amount to find top 5 inflow and outflow sectors.

**Step 3: Sentiment Indicators**

```
fin_market({query_type: "limit_up", date: "YYYYMMDD"})
fin_market({query_type: "limit_down", date: "YYYYMMDD"})
fin_market({query_type: "limit_broken", date: "YYYYMMDD"})
fin_market({query_type: "margin_total", date: "YYYYMMDD"})
fin_market({query_type: "hsgt_flow", date: "YYYYMMDD"})
```

Calculate: limit-up/down ratio, seal rate = limit-up / (limit-up + broken).

**Step 4: Anomaly Detection**

```
fin_market({query_type: "dragon_tiger", date: "YYYYMMDD"})
fin_market({query_type: "dragon_tiger_inst", date: "YYYYMMDD"})
fin_market({query_type: "block_trade", date: "YYYYMMDD"})
```

Focus on institutional net-buy top stocks, block trade premium/discount.

**Step 5: Hot Concepts**

```
fin_market({query_type: "ths_concept_list"})
fin_market({query_type: "ths_daily", ts_code: "concept_code", start_date: "YYYYMMDD"})
```

Find top 10 concepts by daily return.

**Post-Market Review Output Template**:

```
===================================================
  A-Share Post-Market Review | YYYY-MM-DD
===================================================

[Market Temperature]
  Shanghai: XXXX.XX (+/-X.XX%)  Volume: XXXX bn
  Shenzhen: XXXXX.XX (+/-X.XX%)
  ChiNext: XXXX.XX (+/-X.XX%)
  Total Turnover: XXXXX bn | vs Prior: +/-XXX bn

[Sentiment Dashboard]
  Limit-Up: XX | Limit-Down: XX | Broken: XX
  Up/Down Ratio: X.XX (>1 bullish, <1 bearish)
  Seal Rate: XX% (limit-up / (limit-up + broken))
  Northbound: +/-XX.XX bn | Margin Balance: XXXXX bn (+/-XX bn)

[Sector Capital Inflow Top 5]
  1. XXXX: +XX.XX bn
  2. XXXX: +XX.XX bn
  ...

[Sector Capital Outflow Top 5]
  1. XXXX: -XX.XX bn
  2. XXXX: -XX.XX bn
  ...

[Hot Concepts Top 5]
  1. XXXX Concept: +X.XX% (Leader: XXXX +XX%)
  2. ...

[Dragon-Tiger Highlights]
  Institutional Net-Buy Top 3:
  1. XXXXXX (XXX.SH): inst buy X.XX bn
  2. ...

  Institutional Net-Sell Top 3:
  1. ...

[Block Trades]
  Today: XX deals, total XX.XX bn
  Premium deals: XX (watch: XXXX)
  Deep discount (>10%): XX deals

[Tomorrow Watch]
  - Consecutive limit-up: XXX (Xth), XXX (Xth)
  - Lock-up release: XXX (XX bn)
  - Earnings announcements: XXX

===================================================
```

### Framework 2: Intraday Monitoring

For pre-market and intraday tracking:

**Step 1: Overnight Global Markets**

```
fin_market({query_type: "global_index", date: "YYYYMMDD"})
```

**Step 2: A-Share Indices + Northbound Flow**

```
fin_market({query_type: "index_daily", date: "YYYYMMDD"})
fin_market({query_type: "hsgt_flow", date: "YYYYMMDD"})
```

**Step 3: Leading Sectors**

```
fin_market({query_type: "sector_flow", date: "YYYYMMDD"})
```

### Framework 3: Industry Rotation Analysis

Medium-term sector strength and capital rotation:

1. Fetch THS industry index returns over 5/10/20 days
2. Fetch sector capital flow over 20 trading days
3. Compare short-term (5D) vs medium-term (20D) rankings
4. Identify:
   - **Main themes**: 20D sustained strength + capital inflow
   - **Emerging hot spots**: 5D acceleration + capital rotation in
   - **Fading sectors**: 5D weakening + capital outflow

**Rotation Output Template**:

```
===================================================
  Industry Rotation Analysis | as of YYYY-MM-DD
===================================================

[Main Themes (20D strong + sustained inflow)]
  1. XXXX: 20D +XX% | Cumulative inflow XX bn
  2. ...

[Emerging Hot Spots (5D acceleration + capital turning in)]
  1. XXXX: 5D +XX% (20D +XX%) | 5D inflow XX bn
  2. ...

[Fading Sectors (5D weakening + outflow)]
  1. XXXX: 5D -XX% | 5D outflow XX bn
  2. ...

[Rotation Direction]
  Capital flowing: XXXX -> XXXX -> XXXX
  Watch: XXXX (reason: ...)

===================================================
```

## Amount Unit Reference

Different data sources use different units. The skill normalizes output to billions (bn) or millions (mn) CNY:

| Source                         | Raw Unit    |
| ------------------------------ | ----------- |
| Sector flow (moneyflow_ind)    | 10,000 CNY  |
| Stock Connect (moneyflow_hsgt) | Million CNY |
| Margin (margin)                | CNY         |
| Block trade                    | 10,000 CNY  |
| Dragon-Tiger (top_list)        | CNY         |

## Date Handling

- If user says "today" but it's a non-trading day, automatically find the most recent trading day using `trade_calendar`.
- Dragon-Tiger, limit-up/down, and block trade data are only available on trading days.
- Global indices may have different trading calendars per market.

## Response Guidelines

- For full market reviews, follow the 5-step framework systematically.
- For single queries (e.g., "Dragon-Tiger list"), just return that specific data.
- Always normalize amounts to billions CNY for readability.
- Highlight anomalies proactively: "Institutional net buy in XXX was 3x the 20-day average."
- Include sentiment metrics (limit ratio, seal rate) to quantify market mood.
- For sector analysis, show both absolute flow and flow-vs-average to detect acceleration.

## Risk Disclosures

- Market data reflects historical activity and does not predict future price movements.
- Dragon-Tiger list data is published after market close and reflects completed transactions.
- Sector capital flow calculations depend on order-size classification heuristics.
- Northbound capital flow represents aggregate Stock Connect activity and may include hedging or arbitrage, not solely directional bets.
- This analysis is informational and does not constitute investment advice.
