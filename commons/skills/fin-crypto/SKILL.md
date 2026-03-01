---
name: fin-crypto
description: "加密货币和DeFi数据分析 -- CEX行情/深度/资金费率、DeFi TVL/收益率/稳定币/DEX、市值排名/热搜/板块轮动"
metadata:
  {
    "openclaw":
      { "emoji": "🪙", "requires": { "mcp": ["datahub"], "extensions": ["fin-data-bus"] } },
  }
---

# 加密货币与 DeFi 数据分析

覆盖三大数据维度：CEX 交易所数据（100+ 交易所行情/深度/资金费率）、DeFi 链上数据（TVL/收益率/稳定币/DEX）、市场总览（市值排名/板块轮动/热搜趋势）。支持完整的六步加密市场分析框架。

## When to Use

**USE this skill when:**

- "BTC当前价格" / "比特币行情"
- "ETH在Binance的盘口深度"
- "永续合约资金费率" / "funding rate"
- "DeFi TVL排名" / "Aave的TVL变化"
- "DeFi收益率" / "哪个池子APY最高"
- "稳定币供应量" / "USDT发行量"
- "加密市值排名" / "市值前20"
- "板块轮动" / "DeFi板块涨了多少"
- "热搜榜" / "trending coins"
- "跨交易所价差" / "套利机会"
- "DEX交易量" / "Uniswap手续费"
- "跨链桥数据"

## When NOT to Use

**DON'T use this skill when:**

- User asks about A-stock analysis -- use fin-stock
- User asks about HK or US stock fundamentals -- use fin-global
- User wants futures or options on traditional markets -- use fin-deriv
- User wants macro indicators (CPI, PMI, interest rates) -- use fin-macro
- User wants index or fund analysis -- use fin-index
- User wants broad A-share market overview -- use fin-market

## Tools

### Category 1: OpenBB MCP Tools (via DataHub MCP Server)

These tools are provided by the DataHub MCP server (`datahub`) and follow OpenBB standard routes.

| Tool                      | Description                   | Use Case                                       |
| ------------------------- | ----------------------------- | ---------------------------------------------- |
| `crypto_price_historical` | Historical OHLCV price data   | K-line charts, technical analysis, backtesting |
| `crypto_search`           | Search available crypto pairs | Discover tradeable symbols, exchange listings  |

**Providers**: fmp, polygon, yfinance (specified via `provider` parameter).

### Category 2: fin-data-bus Tools (CCXT Direct Exchange Access)

These tools connect directly to CEX exchanges via CCXT through the `fin-data-bus` extension. They provide real-time data with exchange-specific access.

| Tool              | Description                 | Key Fields                                    | Exchange Param |
| ----------------- | --------------------------- | --------------------------------------------- | -------------- |
| `fin_data_ohlcv`  | K-line / OHLCV data         | timestamp, open, high, low, close, volume     | Required       |
| `fin_data_ticker` | Single pair real-time quote | last, bid, ask, high, low, volume, percentage | Required       |

Additional CCXT-direct capabilities available through fin-data-bus (no dedicated named tool -- accessed via bus query interface):

| Data Type      | Description                     | Key Fields                                   |
| -------------- | ------------------------------- | -------------------------------------------- |
| `tickers`      | All-market quote snapshot       | Array of ticker objects                      |
| `orderbook`    | Order book depth                | bids, asks (price, amount arrays)            |
| `trades`       | Recent trade records            | side (buy/sell), price, amount               |
| `funding_rate` | Perpetual contract funding rate | fundingRate, markPrice, nextFundingTimestamp |

**Supported Exchanges**: binance, okx, bybit, gate, huobi, coinbase, kraken, bitfinex, kucoin, mexc, and 100+ more (all CCXT-supported exchanges).

**Symbol Format**: Use slash notation -- `BTC/USDT`, `ETH/USDT`, `SOL/USDT`. For perpetual contracts on some exchanges, append `:USDT` -- e.g., `BTC/USDT:USDT`.

**Exchange Parameter**: All fin-data-bus tools require an `exchange` parameter (e.g., `"binance"`, `"okx"`) specifying which CEX to query.

### Category 3: External APIs (Direct)

These data sources do not have standard OpenBB routes and are accessed via direct API calls.

#### DeFi Data (DefiLlama API)

| Query Type          | Description                     | Key Fields                                        |
| ------------------- | ------------------------------- | ------------------------------------------------- |
| `protocols`         | All DeFi protocol list with TVL | name, tvl, chains, category, change_1d, change_7d |
| `protocol_tvl`      | Single protocol TVL history     | tvl, chainTvls, historical TVL array              |
| `chains`            | All chain TVL snapshot          | name, tvl, tokenSymbol                            |
| `chain_tvl_history` | Chain TVL history               | date, tvl                                         |
| `yields`            | Yield farming pools             | project, symbol, chain, apy, tvlUsd, stablecoin   |
| `stablecoins`       | Stablecoin supply data          | name, symbol, circulating, pegType                |
| `bridges`           | Cross-chain bridge stats        | name, chains, currentDayVolume                    |
| `fees`              | Protocol fee/revenue ranking    | name, total24h, total7d, chains                   |
| `dex_volumes`       | DEX trading volume              | name, total24h, total7d, chains                   |
| `token_prices`      | Token price lookup              | price, symbol, confidence                         |

API base: `https://api.llama.fi` (protocols, TVL), `https://yields.llama.fi` (yields), `https://stablecoins.llama.fi` (stablecoins), `https://bridges.llama.fi` (bridges).

#### Crypto Market Overview (CoinGecko API)

| Query Type     | Description                   | Key Fields                                                         |
| -------------- | ----------------------------- | ------------------------------------------------------------------ |
| `market_cap`   | Market cap ranking            | name, current_price, market_cap, market_cap_rank, price_change_24h |
| `coin_history` | Historical price/mcap/volume  | prices, market_caps, total_volumes                                 |
| `coin_info`    | Project details               | description, links, market_data, categories                        |
| `categories`   | Sector classification         | name, market_cap, market_cap_change_24h                            |
| `trending`     | Trending / hot search         | name, symbol, market_cap_rank                                      |
| `global`       | Global crypto market overview | total_market_cap, btc_dominance, market_cap_change_24h             |

**Coin ID**: Uses slug format (`bitcoin`, `ethereum`, `aave`), not ticker symbol (`BTC`, `ETH`).

API base: `https://api.coingecko.com/api/v3`

## OHLCV Data: Choosing the Right Tool

For historical OHLCV (candlestick) data, two paths are available:

| Scenario                                  | Recommended Tool          | Reason                                            |
| ----------------------------------------- | ------------------------- | ------------------------------------------------- |
| General historical analysis / backtesting | `crypto_price_historical` | OpenBB MCP, multi-provider, standardized output   |
| Exchange-specific real-time OHLCV         | `fin_data_ohlcv`          | CCXT direct, lowest latency, exchange-native data |
| Need data from a specific CEX             | `fin_data_ohlcv`          | Specify `exchange` param for exact exchange data  |
| Provider-agnostic historical data         | `crypto_price_historical` | Aggregated from fmp/polygon/yfinance              |

## Six-Step Crypto Market Analysis Framework

### Step 1: Market Overview -- Macro Sentiment

**Purpose**: Assess overall market health and phase.

**Tool Calls**:

```
# CoinGecko global market data
CoinGecko API: GET /api/v3/global
```

**Key Metrics**:

- Total market cap and 24h change
- BTC dominance and ETH dominance
- Active cryptocurrencies count

**Market Phase Classification**:

- BTC dominance > 60%: BTC-dominant phase -- risk appetite declining, capital flowing to BTC
- BTC dominance 50-60%: Stable phase -- watch for large-cap rotation
- BTC dominance < 50%: Alt season -- capital flowing to altcoins, elevated risk appetite

### Step 2: Sector Rotation -- Find Strong Narratives

**Purpose**: Identify which sectors/narratives are leading or lagging.

**Tool Calls**:

```
# CoinGecko sector categories
CoinGecko API: GET /api/v3/coins/categories

# CoinGecko trending coins
CoinGecko API: GET /api/v3/search/trending
```

**Key Sectors**: DeFi, Layer 1, Layer 2, Meme, AI, Gaming, Privacy, Stablecoins, RWA, DePin.

Sort by 24h market cap change to find momentum leaders.

### Step 3: DeFi TVL Analysis -- On-Chain Capital Flows

**Purpose**: Track where capital is flowing on-chain.

**Tool Calls**:

```
# DefiLlama chain TVL ranking
DefiLlama API: GET https://api.llama.fi/v2/chains

# DefiLlama all protocols
DefiLlama API: GET https://api.llama.fi/protocols

# DefiLlama single protocol TVL (e.g., Aave)
DefiLlama API: GET https://api.llama.fi/protocol/aave
```

**Analysis**:

- Chain-level TVL ranking shows ecosystem strength
- Protocol-level TVL changes reveal capital migration
- 1d/7d changes highlight momentum

### Step 4: Yield Farming -- High-Yield, Low-Risk Pools

**Purpose**: Find attractive yield opportunities with acceptable risk.

**Tool Call**:

```
# DefiLlama yield pools
DefiLlama API: GET https://yields.llama.fi/pools
```

**Filtering Criteria**:

- TVL > $1M (sufficient liquidity)
- APY < 200% (filter anomalous/unsustainable yields)
- Stablecoin pools for lower risk
- Sort by APY descending

**Risk Tiers**:

- Stablecoin-only pools: Lowest risk
- Blue-chip pairs (ETH/USDT): Medium risk
- Exotic pairs with IL risk: Higher risk

### Step 5: Stablecoin Supply -- Capital Inflow/Outflow

**Purpose**: Gauge fiat capital entering or leaving the crypto ecosystem.

**Tool Call**:

```
# DefiLlama stablecoin supply
DefiLlama API: GET https://stablecoins.llama.fi/stablecoins
```

**Interpretation**:

- USDT/USDC supply increasing: Fiat inflow to crypto (bullish)
- USDT/USDC supply decreasing: Capital outflow (bearish)
- DAI/other algo stablecoin growth: DeFi ecosystem expanding

### Step 6: Arbitrage Opportunities -- Cross-Exchange Spread + Funding Rate

**Purpose**: Identify market inefficiencies.

#### Cross-Exchange Price Spread

**Tool Calls** (fin-data-bus, CCXT direct):

```
fin_data_ticker({symbol: "BTC/USDT", exchange: "binance"})
fin_data_ticker({symbol: "BTC/USDT", exchange: "okx"})
fin_data_ticker({symbol: "BTC/USDT", exchange: "bybit"})
```

Compare last/bid/ask across exchanges. Spread > 0.1% may indicate arbitrage opportunity (after accounting for transfer fees and time).

#### Funding Rate Comparison

**Tool Calls** (fin-data-bus, CCXT direct):

```
# Query funding rate via fin-data-bus CCXT interface
fin-data-bus: funding_rate({symbol: "BTC/USDT", exchange: "binance"})
fin-data-bus: funding_rate({symbol: "BTC/USDT:USDT", exchange: "okx"})
```

**Funding Rate Interpretation**:

- Positive rate (> 0): Longs pay shorts -- market crowded long
- Negative rate (< 0): Shorts pay longs -- market crowded short
- Rate > 0.01% (per 8h): Excessive long leverage, potential correction
- Rate < -0.01%: Excessive short sentiment, potential short squeeze

**Funding Rate Arbitrage**: Go long on exchange with negative rate, short on exchange with positive rate -- collect funding from both sides.

## Output Report Template

```markdown
# [Coin/Protocol] Crypto Market Analysis Report

## Market Overview

- Total Market Cap: $X.XXT
- BTC Dominance: XX.X%
- 24h Global Volume: $X.XXB
- Market Phase: BTC-dominant / Alt season / Transition

## [Coin] Price Analysis

### Price Data

| Metric            | Value    |
| ----------------- | -------- |
| Current Price     | $XX,XXX  |
| 24h Change        | +/-X.XX% |
| 24h Volume        | $X.XXB   |
| Market Cap Rank   | #X       |
| Distance from ATH | -XX%     |

### Order Book Analysis

- Bid/Ask ratio: X.XX (buy strong / sell strong / balanced)
- Top 10 bid volume: XX.X BTC
- Top 10 ask volume: XX.X BTC

### Funding Rate

| Exchange | Rate    | Signal             |
| -------- | ------- | ------------------ |
| Binance  | X.XXXX% | Long/short crowded |
| OKX      | X.XXXX% |                    |
| Bybit    | X.XXXX% |                    |

## DeFi Analysis (if applicable)

### TVL Ranking

| Rank | Protocol | TVL | 1d Chg | 7d Chg |
| ---- | -------- | --- | ------ | ------ |

### Yield Opportunities

| Pool | Chain | APY | TVL | Risk |
| ---- | ----- | --- | --- | ---- |

### Stablecoin Supply

| Stablecoin | Supply | Trend             |
| ---------- | ------ | ----------------- |
| USDT       | $XXXB  | Minting / Burning |
| USDC       | $XXXB  | Minting / Burning |

## Sector Rotation

| Rank | Sector | 24h Chg | Representative Coins |
| ---- | ------ | ------- | -------------------- |

## Arbitrage Opportunities

### Cross-Exchange Spread

| Pair | Low Exchange | High Exchange | Spread |
| ---- | ------------ | ------------- | ------ |

### Funding Rate Arbitrage

- Positive rate coins: [short to earn funding]
- Negative rate coins: [long to earn funding]

## Overall Assessment

- **Short-term direction**: Bullish / Bearish / Consolidation
- **Core logic**: [1-2 sentences]
- **Risk factors**: [Key risks]
- **Suggestion**: [Based on analysis]
```

## Response Guidelines

- Always start with the macro picture (global market cap, BTC dominance) before diving into specific coins or protocols.
- When analyzing a specific coin, present data from multiple sources (CEX price + DeFi TVL if applicable + market fundamentals) for a comprehensive view.
- For DeFi yield pools, always note whether the pool is stablecoin-only (lower risk) or involves volatile assets (IL risk).
- Funding rate analysis should compare across at least 2-3 exchanges to identify divergences.
- Cross-exchange arbitrage should note that transfer fees and confirmation times often eliminate small spreads.
- Stablecoin supply changes are a leading indicator -- highlight minting/burning trends prominently.
- Use sector rotation data to identify narrative momentum, not as standalone trading signals.
- Include order book depth analysis for large-cap coins to assess market microstructure.
- For OHLCV data, prefer `crypto_price_historical` (MCP) for historical analysis and `fin_data_ohlcv` (CCXT) for exchange-specific real-time data.
- Always specify the `exchange` parameter when using fin-data-bus tools.

## Risk Disclosures

- Cryptocurrency markets operate 24/7 with no circuit breakers. Prices can move 10-30% in minutes during high volatility events.
- DeFi protocols carry smart contract risk. Even audited protocols have suffered exploits. TVL can drop to zero in a hack event.
- Yield farming APYs are variable and often decline rapidly as more capital enters a pool. Impermanent loss can exceed yield in volatile pairs.
- Stablecoin de-peg risk exists. Algorithmic stablecoins (UST/LUNA) have catastrophically failed. Even USDT/USDC have experienced temporary de-pegs.
- Cross-exchange arbitrage involves counterparty risk, withdrawal delays, and potential for exchange-specific issues (frozen withdrawals, KYC holds).
- Funding rate strategies require maintaining margin on perpetual positions. Liquidation risk exists if the position moves against you before collecting sufficient funding.
- Regulatory risk is material. Government actions (bans, taxation, licensing requirements) can materially impact crypto asset prices and exchange operations.
- All data is sourced from third-party APIs and may have delays or inaccuracies. Cross-verify critical trading decisions.
