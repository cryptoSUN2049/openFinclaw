---
name: fin-deriv
description: "衍生品分析 -- 期货(持仓/结算/仓单/期限结构)、期权(Greeks/IV曲线)、可转债(转股价值/溢价率)"
metadata: { "openclaw": { "emoji": "📉", "requires": { "mcp": ["datahub"] } } }
---

# 衍生品分析 -- 期货/期权/可转债

覆盖中国期货市场、A股期权、美股期权以及可转债数据分析。支持基差分析、期限结构、持仓多空博弈、期权Greeks风险、IV微笑曲线、可转债转股价值计算等完整分析框架。

## When to Use

**USE this skill when:**

- "IF2501 基差分析" / "股指期货升贴水"
- "螺纹钢期限结构" / "contango还是backwardation"
- "期货持仓排名" / "多空博弈"
- "仓单变化" / "供需分析"
- "AAPL期权链" / "Greeks分析"
- "隐含波动率曲线" / "IV微笑"
- "可转债转股价值" / "溢价率"
- "资金费率" / "PCR情绪指标"
- "期货主力合约是哪个"
- "期权Delta/Gamma/Theta/Vega"

## When NOT to Use

**DON'T use this skill when:**

- User asks about A-stock individual equity analysis -- use fin-stock
- User asks about HK or US stock fundamentals -- use fin-global
- User wants index or fund analysis -- use fin-index
- User asks about macro indicators (CPI, PMI, interest rates) -- use fin-macro
- User wants broad market overview -- use fin-market
- User asks about crypto or DeFi -- use fin-crypto

## Tools (DataHub MCP)

### Options (Standard OpenBB Routes)

| MCP Tool                     | Description                               | Key Fields                                             |
| ---------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `derivatives_options_basic`  | Option contract info                      | ts_code, exercise_price, opt_type (C/P), maturity_date |
| `derivatives_options_daily`  | Option daily data                         | close, vol, oi, pct_chg                                |
| `derivatives_options_chains` | Full option chain with Greeks (US stocks) | strike_price, iv, delta, gamma, theta, vega            |

### Equity Price (for basis calculation)

| MCP Tool                  | Description             | Key Fields                     |
| ------------------------- | ----------------------- | ------------------------------ |
| `equity_price_historical` | Underlying equity OHLCV | open, high, low, close, volume |

### Futures (Tushare Proxy Only)

> **Note**: Futures data is currently only available through the Tushare proxy. There are no standard OpenBB routes for Chinese futures yet. Use `provider: "tushare"` in all futures calls.

| Tushare Proxy API | Description                 | Key Fields                                            |
| ----------------- | --------------------------- | ----------------------------------------------------- |
| `fut_daily`       | Futures daily OHLCV         | open, high, low, close, vol, oi, settle               |
| `fut_basic`       | Futures contract basic info | symbol, name, exchange, multiplier                    |
| `fut_mapping`     | Dominant contract mapping   | ts_code, mapping_ts_code                              |
| `fut_holding`     | Position ranking (top 20)   | broker, vol, long_hld, short_hld, long_chg, short_chg |
| `fut_settle`      | Daily settlement parameters | settle, pre_settle                                    |
| `fut_wsr`         | Warehouse receipt data      | warehouse, vol, vol_chg, unit                         |

### Convertible Bonds (Tushare Proxy Only)

> **Note**: Convertible bond data is currently only available through the Tushare proxy. No standard OpenBB routes exist for Chinese CB data yet. Use `provider: "tushare"` in all CB calls.

| Tushare Proxy API | Description                 | Key Fields                                               |
| ----------------- | --------------------------- | -------------------------------------------------------- |
| `cb_basic`        | Convertible bond info       | ts_code, stk_code, conv_price, maturity_date, issue_size |
| `cb_daily`        | Convertible bond daily data | close, vol, pct_chg                                      |

## Futures Contract Code Rules

### Code Format

```
Commodity Code + Year-Month . Exchange
Example: IF2501.CFX   (CSI 300 index futures, Jan 2025, CFFEX)
         RB2505.SHF   (Rebar, May 2025, SHFE)
         M2505.DCE    (Soybean meal, May 2025, DCE)
         CF2505.ZCE   (Cotton, May 2025, CZCE)
```

### Major Exchanges

| Exchange | Code        | Example Commodities                                                             |
| -------- | ----------- | ------------------------------------------------------------------------------- |
| CFFEX    | CFX / CFFEX | IF (CSI 300), IC (CSI 500), IH (SSE 50), T/TF/TS (Treasury)                     |
| SHFE     | SHF / SHFE  | CU (Copper), AL (Aluminum), ZN (Zinc), RB (Rebar), AU (Gold), AG (Silver)       |
| DCE      | DCE         | M (Soybean meal), Y (Soybean oil), P (Palm oil), I (Iron ore), JM (Coking coal) |
| CZCE     | ZCE / CZCE  | CF (Cotton), SR (Sugar), TA (PTA), MA (Methanol), AP (Apple)                    |

### Dominant Contract Lookup

```
# Tushare proxy call — no standard MCP route yet
mcp_datahub.fut_mapping({symbol: "IF.CFX", provider: "tushare"})
# Returns mapping_ts_code which is the current dominant contract
```

## Analysis Frameworks

### Framework 1: Basis Analysis

**Basis** = Spot Price - Futures Price; **Basis Rate** = (Futures - Spot) / Spot x 100%

**Steps**:

1. Get dominant contract code via `fut_mapping` (Tushare proxy)
2. Get futures price via `fut_daily` (Tushare proxy)
3. Get spot price (from underlying index or commodity)
4. Calculate basis and basis rate

**Interpretation**:

- Basis rate > 0: Contango (futures premium) -- market expects future prices higher
- Basis rate < 0: Backwardation (futures discount) -- spot demand is tight

**Example Tool Calls**:

```
# Tushare proxy — futures data
mcp_datahub.fut_mapping({symbol: "RB.SHF", provider: "tushare"})
mcp_datahub.fut_daily({symbol: "RB2505.SHF", start_date: "2025-01-01", provider: "tushare"})
```

### Framework 2: Term Structure Analysis

Fetch prices across different delivery months to determine market structure.

**Steps**:

1. Get multiple month contracts for the same commodity
2. Compare near-month vs far-month prices
3. Classify structure type

**Structure Types**:

- **Contango** (all near < far): Normal carry cost structure, bearish for near-term
- **Backwardation** (all near > far): Supply shortage signal, bullish for spot
- **Mixed**: No clear structural signal

**Example Tool Calls**:

```
# Tushare proxy — futures data
mcp_datahub.fut_daily({symbol: "RB2501.SHF", start_date: "2025-01-20", provider: "tushare"})
mcp_datahub.fut_daily({symbol: "RB2505.SHF", start_date: "2025-01-20", provider: "tushare"})
mcp_datahub.fut_daily({symbol: "RB2509.SHF", start_date: "2025-01-20", provider: "tushare"})
```

### Framework 3: Long/Short Position Analysis

Analyze top-20 position holders to gauge institutional sentiment.

**Steps**:

1. Fetch position ranking via `fut_holding` (Tushare proxy)
2. Aggregate daily long vs short totals
3. Calculate long/short ratio and changes

**Signals**:

- Long/Short ratio > 1.1: Longs dominating, bullish bias
- Long/Short ratio < 0.9: Shorts dominating, bearish bias
- Both long and short increasing: Active market, potential breakout
- Both decreasing: Capital exiting, declining volatility

**Example Tool Call**:

```
# Tushare proxy — futures holding data
mcp_datahub.fut_holding({symbol: "IF", start_date: "20250120", end_date: "20250131", provider: "tushare"})
```

### Framework 4: Warehouse Receipt Trend

Warehouse receipt changes reflect physical supply/demand dynamics.

- Receipts increasing: Supply ample, bearish for price
- Receipts decreasing: Supply tightening, bullish for price

**Example Tool Call**:

```
# Tushare proxy — warehouse receipt data
mcp_datahub.fut_wsr({exchange: "SHF", start_date: "20250101", provider: "tushare"})
```

### Framework 5: Option IV Smile Curve (US Stocks)

Construct implied volatility curve across strike prices for a given expiration.

**Steps**:

1. Fetch full option chain via `derivatives_options_chains`
2. Group by expiration date
3. Separate calls and puts
4. Plot IV by strike price

**IV Interpretation**:

- Smile shape: Higher IV at wings -- market pricing tail risk
- Skew (Put IV > Call IV): Bearish sentiment, investors buying protection
- Flat: Neutral market, low tail risk expectation

**Example Tool Call**:

```
mcp_datahub.derivatives_options_chains({symbol: "AAPL"})
```

### Framework 6: Greeks Risk Analysis

| Greek | Meaning                                        | Key Thresholds                          |
| ----- | ---------------------------------------------- | --------------------------------------- |
| Delta | Directional exposure per $1 underlying move    | ATM ~ 0.5                               |
| Gamma | Rate of Delta change                           | > 0.05 = high, sensitive to price moves |
| Theta | Daily time decay (usually negative for buyers) | More negative near expiry               |
| Vega  | Sensitivity to 1% IV change                    | Higher for longer-dated options         |
| IV    | Implied Volatility level                       | > 50% = expensive, < 20% = cheap        |

**Strategy Implications**:

- High IV + negative skew: Favor selling premium (iron condors, credit spreads)
- Low IV: Favor buying premium (straddles, strangles)
- High Gamma near expiry: Position size carefully, Delta changes rapidly

### Framework 7: Put/Call Ratio (PCR) Sentiment

**Calculation**: PCR = Put Volume / Call Volume (or OI-based)

**Interpretation**:

- PCR > 1.0: Bearish sentiment -- more puts traded, investors buying protection
- PCR < 0.7: Bullish sentiment -- calls dominating, market optimistic
- PCR 0.7-1.0: Neutral

### Framework 8: Convertible Bond Value Analysis

**Key Calculations**:

- Conversion Value = Stock Price / Conversion Price x 100 (par value)
- Conversion Premium = (CB Price - Conversion Value) / Conversion Value x 100%

**Signal Interpretation**:

| Premium Rate | Character      | Signal                                                   |
| ------------ | -------------- | -------------------------------------------------------- |
| < 0%         | Discount       | CB price below conversion value -- arbitrage opportunity |
| 0-10%        | Low premium    | Strong equity linkage, offensive                         |
| 10-30%       | Medium premium | Balanced offense/defense                                 |
| > 30%        | High premium   | Bond-like, downside protection but limited upside        |

**Example Tool Calls**:

```
# Tushare proxy — convertible bond data
mcp_datahub.cb_basic({provider: "tushare"})
mcp_datahub.cb_daily({symbol: "128041.SZ", start_date: "20250101", provider: "tushare"})

# Standard MCP — underlying equity price for conversion value calculation
mcp_datahub.equity_price_historical({symbol: "600519.SH", start_date: "2025-01-01"})
```

## Output Report Template

```markdown
# [Commodity/Underlying] Derivatives Analysis Report

## Basic Information

- Commodity: [Name] ([Code])
- Exchange: [Exchange Name]
- Dominant Contract: [Contract Code]
- Analysis Date: [YYYY-MM-DD]

## Futures Analysis (if applicable)

### Market Overview

| Metric        | Value |
| ------------- | ----- |
| Latest Price  |       |
| Settlement    |       |
| Change %      |       |
| Volume        |       |
| Open Interest |       |

### Basis Analysis

- Spot: XXXX
- Futures: XXXX
- Basis: XXXX (contango/backwardation)
- Basis Rate: X.XX%

### Term Structure

| Contract | Price | vs Near-Month Spread |
| -------- | ----- | -------------------- |
| [Near]   |       | Benchmark            |
| [Next]   |       | +/-                  |
| [Far]    |       | +/-                  |

- Type: Contango / Backwardation / Mixed

### Long/Short Position Analysis

- Top20 Long: XXX lots, change +/-XXX
- Top20 Short: XXX lots, change +/-XXX
- Net Long: XXX lots
- L/S Ratio: X.XX

## Options Analysis (if applicable)

### Greeks Overview

| Metric | Value   | Interpretation         |
| ------ | ------- | ---------------------- |
| IV     | X.X%    | High/Low/Medium        |
| Delta  | X.XXXX  | Directional risk       |
| Gamma  | X.XXXX  | Non-linear risk        |
| Theta  | -X.XXXX | Daily time decay       |
| Vega   | X.XXXX  | Volatility sensitivity |

### PCR Sentiment

- PCR (Volume): X.XXX
- PCR (OI): X.XXX
- Sentiment: Bullish / Bearish / Neutral

## Convertible Bond Analysis (if applicable)

| Bond | CB Price | Conv Price | Conv Value | Premium | Rating          |
| ---- | -------- | ---------- | ---------- | ------- | --------------- |
|      |          |            |            |         | Low/Medium/High |

## Overall Assessment

- **Direction**: Bullish / Bearish / Neutral
- **Core Logic**: [1-2 sentence summary]
- **Risk Factors**: [Key risks to monitor]
- **Suggestion**: [Based on above analysis]
```

## Response Guidelines

- Always identify the dominant contract first when analyzing futures -- use `fut_mapping` (Tushare proxy) before fetching price data.
- Present basis analysis with clear contango/backwardation labeling and its market implication.
- For term structure, show at least 3 delivery months to establish the curve shape.
- Position analysis should highlight changes (not just absolute levels) -- institutional intent is revealed in position changes.
- For options, always show both Call and Put sides of the IV curve to assess skew.
- Greeks should be interpreted in context: "High Gamma" near expiry has different implications than "High Gamma" with months remaining.
- For convertible bonds, always calculate both conversion value and premium rate -- raw price alone is insufficient.
- Use tables for structured data; narrative for market interpretation.

## Risk Disclosures

- Futures trading involves significant leverage. Small price moves can result in large gains or losses relative to margin. Position sizing and stop-loss discipline are critical.
- Options can expire worthless. Buyers face total premium loss; sellers face theoretically unlimited risk (naked calls) or significant risk (naked puts).
- IV levels are market expectations, not predictions. Actual realized volatility may differ substantially from implied volatility.
- Convertible bond arbitrage requires understanding of credit risk, liquidity risk, and the issuer's ability to force conversion or adjust conversion price.
- Warehouse receipt and position data reflect past state. Market conditions can change rapidly due to policy, weather, geopolitical events, or supply chain disruptions.
- All analysis is informational. This does not constitute trading advice. Derivatives are complex instruments unsuitable for all investors.
