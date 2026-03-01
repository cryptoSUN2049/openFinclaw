---
name: fin-macro
description: "宏观经济与利率监控 -- GDP/CPI/PPI/PMI/M2/社融、全球利率(Shibor/LPR/Libor/国债)、世界银行全球数据、汇率"
metadata: { "openclaw": { "emoji": "🏛️", "requires": { "mcp": ["datahub"] } } }
---

# Macro Economy & Interest Rate Monitor

Comprehensive macroeconomic analysis covering China's key economic indicators (GDP, CPI, PPI, PMI, M2, social financing), global interest rate monitoring (Shibor, LPR, Libor, treasury yields), World Bank cross-country comparison, and FX rates. Built around the **Macro Cycle 5-Step Framework**.

## When to Use

**USE this skill when:**

- "China CPI latest" / "PPI trend"
- "PMI this month" / "is manufacturing expanding"
- "M2 growth rate" / "social financing data"
- "LPR rate" / "Shibor today"
- "China-US yield spread" / "10Y treasury yield"
- "compare GDP of China vs US vs Japan"
- "USDCNH exchange rate" / "RMB trend"
- "macro outlook" / "economic cycle analysis"
- "World Bank data for India"
- "global inflation comparison"

## When NOT to Use

**DON'T use this skill when:**

- User asks about individual A-share stocks -- use fin-stock
- User asks about HK/US equities -- use fin-global
- User wants market-level data (Dragon-Tiger, sector flows) -- use fin-market
- User asks about crypto or DeFi -- use fin-crypto
- User wants to backtest a strategy -- use fin-backtest
- User wants earnings calendar or event impact -- use fin-macro-calendar

## Tools (DataHub MCP)

### China Economic Indicators

| MCP Tool                   | Description                      | Key Fields                                |
| -------------------------- | -------------------------------- | ----------------------------------------- |
| `economy_indicators`       | GDP real growth (China)          | quarter, gdp, gdp_yoy                     |
| `economy_cpi`              | Consumer Price Index             | month, cpi_yoy, cpi_mom                   |
| `economy_ppi`              | Producer Price Index             | month, ppi_yoy                            |
| `economy_pmi`              | Purchasing Managers' Index       | month, pmi, pmi_new_order, pmi_production |
| `economy_money_supply`     | Money supply (M0/M1/M2)          | month, m0_yoy, m1_yoy, m2_yoy             |
| `economy_social_financing` | Social financing scale (monthly) | month, total, loan, bond, equity          |

### China Interest Rates

| MCP Tool                      | Description                     | Key Fields                               |
| ----------------------------- | ------------------------------- | ---------------------------------------- |
| `fixedincome_rate_shibor`     | Shanghai Interbank Offered Rate | date, on (overnight), 1w, 1m, 3m, 6m, 1y |
| `economy_shibor_quote`        | Shibor quoting bank details     | date, bank, rate                         |
| `fixedincome_rate_shibor_lpr` | Loan Prime Rate                 | date, 1y, 5y                             |
| `economy_treasury_cn`         | China treasury yield curve      | date, 1y, 2y, 5y, 7y, 10y, 30y           |
| `economy_wz_index`            | Wenzhou private lending rate    | date, rate                               |

### Global Interest Rates

| MCP Tool                 | Description                      | Key Fields                             |
| ------------------------ | -------------------------------- | -------------------------------------- |
| `fixedincome_rate_hibor` | Hong Kong Interbank Offered Rate | date, on, 1w, 1m, 3m, 6m, 1y           |
| `fixedincome_rate_libor` | London Interbank Offered Rate    | date, on, 1w, 1m, 3m, 6m, 1y           |
| `economy_treasury_us`    | US treasury yield curve          | date, 1m, 3m, 6m, 1y, 2y, 5y, 10y, 30y |

### World Bank Data

| MCP Tool             | Description                                 | Key Fields                      | Notes                                |
| -------------------- | ------------------------------------------- | ------------------------------- | ------------------------------------ |
| `economy_indicators` | GDP (current USD) by country                | country, year, value            | Use `indicator: "NY.GDP.MKTP.CD"`    |
| `economy_indicators` | GDP growth rate (annual %)                  | country, year, value            | Use `indicator: "NY.GDP.MKTP.KD.ZG"` |
| `economy_indicators` | GDP per capita (current USD)                | country, year, value            | Use `indicator: "NY.GDP.PCAP.CD"`    |
| `economy_indicators` | Total population                            | country, year, value            | Use `indicator: "SP.POP.TOTL"`       |
| `economy_indicators` | CPI inflation rate (annual %)               | country, year, value            | Use `indicator: "FP.CPI.TOTL.ZG"`    |
| `economy_indicators` | Unemployment rate (%)                       | country, year, value            | Use `indicator: "SL.UEM.TOTL.ZS"`    |
| `economy_indicators` | Trade as % of GDP                           | country, year, value            | Use `indicator: "NE.TRD.GNFS.ZS"`    |
| `economy_indicators` | Foreign direct investment net inflows (USD) | country, year, value            | Use `indicator: "BX.KLT.DINV.CD.WD"` |
| `economy_indicators` | Custom indicator query                      | country, year, value, indicator | Use any World Bank indicator code    |

### FX Rates

| MCP Tool             | Description                      | Key Fields                   | Notes                                       |
| -------------------- | -------------------------------- | ---------------------------- | ------------------------------------------- |
| `currency_snapshots` | USDCNH (offshore RMB) historical | date, open, high, low, close | Or Tushare proxy with `provider: "tushare"` |

### Economic Calendar

| MCP Tool           | Description             | Key Fields                                    |
| ------------------ | ----------------------- | --------------------------------------------- |
| `economy_calendar` | Economic event calendar | date, event, country, actual, forecast, prior |

## Macro Cycle 5-Step Framework

### Step 1: Economic Growth Assessment

**Data**:

```
mcp_datahub.economy_indicators({country: "CN", indicator: "NY.GDP.MKTP.KD.ZG"})
mcp_datahub.economy_pmi({start_date: "YYYYMMDD", end_date: "YYYYMMDD"})
```

**Analysis Logic**:

- GDP quarterly growth trend: rising / falling / stabilizing
- PMI threshold: > 50 expansion, < 50 contraction
- PMI sub-indices: New Orders (leading) > Production > Employment (lagging)
- Manufacturing PMI vs Services PMI divergence -- structural shift signal

**Judgment Matrix**:

| PMI                | GDP Trend    | Economic Phase         |
| ------------------ | ------------ | ---------------------- |
| > 51 and rising    | Rising       | Recovery / Overheating |
| > 50 but declining | Slowing      | Peaking signal         |
| < 50 and falling   | Declining    | Recession              |
| < 50 but rising    | Decelerating | Bottoming signal       |

### Step 2: Inflation Cycle Analysis

**Data**:

```
mcp_datahub.economy_cpi()
mcp_datahub.economy_ppi({start_date: "YYYYMMDD", end_date: "YYYYMMDD"})
```

**Analysis Logic**:

- CPI-PPI scissors gap = CPI YoY - PPI YoY
- PPI leads CPI by ~3-6 months (cost transmission lag)
- Gap widening -- upstream price increase not transmitted, corporate margin squeeze
- Gap narrowing -- cost pass-through to consumers, or upstream deflation

**Cycle Phases**:

| CPI     | PPI     | Phase            | Policy Implication  |
| ------- | ------- | ---------------- | ------------------- |
| Rising  | Rising  | Broad inflation  | Monetary tightening |
| Rising  | Falling | Cost-push fading | Wait and see        |
| Falling | Falling | Deflation risk   | Monetary easing     |
| Falling | Rising  | Early cost-push  | Structural policy   |

### Step 3: Liquidity Assessment

**Data**:

```
mcp_datahub.economy_money_supply({start_date: "YYYYMMDD", end_date: "YYYYMMDD"})
mcp_datahub.economy_social_financing({start_date: "YYYYMMDD", end_date: "YYYYMMDD"})
```

**Analysis Logic**:

- M2 growth - GDP growth = Excess liquidity (positive = loose)
- M1-M2 scissors: M1 > M2 -- capital activation, economic vitality
- Social financing growth inflection leads economic inflection by ~2-3 quarters
- Structure: rising share of medium/long-term corporate loans -- real economy financing demand recovering

**Key Thresholds**:

- M2 growth > 10%: ample liquidity
- M2 growth < 8%: tight liquidity
- Social financing YoY growth turning up: leading signal of economic stabilization

### Step 4: Interest Rate System Analysis

**Data**:

```
mcp_datahub.fixedincome_rate_shibor({start_date: "YYYYMMDD", end_date: "YYYYMMDD"})
mcp_datahub.fixedincome_rate_shibor_lpr({start_date: "YYYYMMDD", end_date: "YYYYMMDD"})
mcp_datahub.economy_treasury_cn({start_date: "YYYYMMDD", end_date: "YYYYMMDD"})
mcp_datahub.economy_treasury_us({start_date: "YYYYMMDD", end_date: "YYYYMMDD"})
```

**Interest Rate Transmission Chain**:

```
PBOC Policy Rate
  +-- MLF Rate -> LPR (1Y / 5Y)
  |                +-- 1Y LPR -> Short-term loans / consumer credit
  |                +-- 5Y LPR -> Mortgage rate
  +-- Reverse Repo Rate -> Shibor (ON / 1W / 1M ...)
  |                         +-- Interbank market funding cost
  +-- Treasury Yield Curve
       +-- 1Y -> Short end (reflects funding conditions)
       +-- 10Y -> Long end (reflects economic expectations)
       +-- 10Y-1Y spread -> Term spread (economic outlook)
```

**China-US Yield Spread Analysis**:

- Spread = China 10Y - US 10Y
- Spread > 0: China rates higher, attracts foreign capital inflow
- Spread < 0: Inverted, capital outflow pressure
- Spread narrowing: RMB depreciation pressure increases

### Step 5: FX & Capital Flows

**Data**:

```
mcp_datahub.currency_snapshots({symbol: "USDCNH", start_date: "YYYY-MM-DD", end_date: "YYYY-MM-DD"})
```

**Analysis Logic**:

- USDCNH rising -- RMB depreciation; falling -- RMB appreciation
- FX and yield spread co-movement: narrowing China-US spread -- USDCNH upward pressure
- Northbound capital inflow -- foreign investors bullish on A-shares, supports RMB
- Comprehensive assessment of capital flow direction and asset price implications

## World Bank Cross-Country Comparison

### Common Country Codes

| Country        | Code | Country       | Code |
| -------------- | ---- | ------------- | ---- |
| China          | CN   | United States | US   |
| Japan          | JP   | Germany       | DE   |
| United Kingdom | GB   | India         | IN   |
| Brazil         | BR   | South Korea   | KR   |
| France         | FR   | Canada        | CA   |

### Example Queries

```
# Compare China-US-Japan-Germany GDP
mcp_datahub.economy_indicators({countries: "CN;US;JP;DE", indicator: "NY.GDP.MKTP.CD", date_range: "2000:2023"})

# BRICS population comparison
mcp_datahub.economy_indicators({countries: "CN;IN;BR;RU;ZA", indicator: "SP.POP.TOTL", date_range: "2000:2023"})

# Global major economy inflation rates
mcp_datahub.economy_indicators({countries: "CN;US;JP;DE;GB;IN", indicator: "FP.CPI.TOTL.ZG", date_range: "2010:2023"})
```

## Report Template

```
===================================================
  Macro Economy Monthly Analysis
  Report Date: YYYY-MM-DD
===================================================

[1. Economic Growth]
  GDP Growth: Q[X] XX% (prior XX%)
  Manufacturing PMI: XX.X (prior XX.X) [above/below 50]
  Assessment: [Recovery / Overheating / Recession / Bottoming]

[2. Inflation]
  CPI YoY: XX.X% (prior XX.X%)
  PPI YoY: XX.X% (prior XX.X%)
  CPI-PPI Gap: XX.X pct (prior XX.X)
  Assessment: [Rising / Cooling / Deflation risk / Moderate]

[3. Liquidity]
  M2 Growth: XX.X% (prior XX.X%)
  M1 Growth: XX.X% (prior XX.X%)
  M1-M2 Gap: XX.X pct
  Social Financing: XXXX bn (prior XXXX bn)
  Assessment: [Loose / Neutral / Tight]

[4. Interest Rate System]
  | Rate          | Latest | Prior Month | Change    |
  |---------------|--------|-------------|-----------|
  | LPR 1Y        | XX%    | XX%         | +/-XX bp  |
  | LPR 5Y        | XX%    | XX%         | +/-XX bp  |
  | Shibor ON      | XX%    | XX%         | +/-XX bp  |
  | Shibor 1W      | XX%    | XX%         | +/-XX bp  |
  | China 10Y      | XX%    | XX%         | +/-XX bp  |
  | US 10Y         | XX%    | XX%         | +/-XX bp  |
  | **CN-US Spread** | **XX bp** | **XX bp** | **+/-XX bp** |

[5. FX & Capital Flows]
  USDCNH: XX.XXXX (monthly change +/-XX pips)
  Northbound Monthly Net: XX bn
  Assessment: [Appreciation / Depreciation / Range-bound]

[6. Global Comparison (World Bank)]
  | Country | GDP (tn $) | GDP Growth | CPI    | Pop (bn) |
  |---------|-----------|------------|--------|----------|
  | China   | XX.X      | XX%        | XX%    | 1.4X     |
  | US      | XX.X      | XX%        | XX%    | 0.3X     |
  | Japan   | XX.X      | XX%        | XX%    | 0.1X     |
  | Germany | XX.X      | XX%        | XX%    | 0.08X    |

[7. Comprehensive Assessment]
  Economic Cycle: [Early recovery / Mid-expansion / Late overheating / Recession]
  Policy Expectation: [RRR cut / Rate cut / Rate hike / Hold]
  Asset Class Implications:
    Equities: [Bullish / Neutral / Bearish]
    Bonds: [Bullish / Neutral / Bearish]
    Commodities: [Bullish / Neutral / Bearish]
    RMB: [Appreciate / Depreciate / Range-bound]

===================================================
  Disclaimer: Based on public data, not investment advice.
===================================================
```

## Execution Flow

1. **Determine Scope**: China macro / global rates / cross-country comparison / specific indicator
2. **Fetch Latest Data**: Call appropriate MCP tools based on scope
3. **5-Step Analysis**: Growth -> Inflation -> Liquidity -> Rates -> FX (for comprehensive requests)
4. **Cross-Country Comparison**: Supplement with `economy_indicators` (World Bank) for global context
5. **Generate Report**: Output per template

## Response Guidelines

- For comprehensive macro analysis, follow all 5 steps systematically.
- For single indicator queries (e.g., "latest CPI"), answer concisely with trend context.
- Always show both latest value and prior period for comparison.
- Interest rates should be quoted in basis points (bp) for changes, percentage (%) for levels.
- For China-US yield spread, always state whether it's positive or inverted and the directional trend.
- World Bank data may lag by 1-2 years for some countries -- note the latest available year.
- When presenting M2/social financing, include the YoY growth rate, not just absolute values.

## Risk Disclosures

- Macroeconomic analysis provides a framework for understanding the current environment but does not predict future outcomes.
- Economic data releases are subject to revision. Initial prints may be significantly revised in subsequent months.
- The 5-Step Framework is an analytical tool, not a trading signal generator. Multiple indicators may give conflicting signals.
- World Bank data typically lags by 1-2 years. Use domestic data sources for more recent Chinese macro indicators.
- Interest rate forecasts based on current trends may not account for unexpected policy shifts or external shocks.
- FX movements are influenced by many factors beyond interest rate differentials.
- This analysis is informational and does not constitute investment advice.
