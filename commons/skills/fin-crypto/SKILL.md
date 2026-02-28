---
name: fin-crypto
description: "加密货币和DeFi数据分析 -- CEX行情/深度/资金费率、DeFi TVL/收益率/稳定币/DEX、市值排名/热搜/板块轮动"
metadata: { "openclaw": { "emoji": "🪙", "requires": { "extensions": ["fin-data-hub"] } } }
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

- `fin_crypto` -- CEX exchange data (OHLCV, ticker, orderbook, trades, funding rate, markets)
- `fin_defi` -- DeFi on-chain data (protocols, TVL, yields, stablecoins, bridges, fees, DEX volumes, token prices)
- `fin_market_crypto` -- crypto market overview (market cap ranking, coin info, categories, trending, global stats)

### Query Types for fin_crypto (CEX Data)

| query_type     | Description                     | Key Fields                                    |
| -------------- | ------------------------------- | --------------------------------------------- |
| `ohlcv`        | K-line / OHLCV data             | timestamp, open, high, low, close, volume     |
| `ticker`       | Single pair real-time quote     | last, bid, ask, high, low, volume, percentage |
| `tickers`      | All-market quote snapshot       | Array of ticker objects                       |
| `orderbook`    | Order book depth                | bids, asks (price, amount arrays)             |
| `trades`       | Recent trade records            | side (buy/sell), price, amount                |
| `funding_rate` | Perpetual contract funding rate | fundingRate, markPrice, nextFundingTimestamp  |
| `markets`      | Available trading pairs list    | symbol, base, quote, type                     |

**Supported Exchanges**: binance, okx, bybit, gate, huobi, coinbase, kraken, bitfinex, kucoin, mexc, and 100+ more.

**Symbol Format**: Use slash notation -- `BTC/USDT`, `ETH/USDT`, `SOL/USDT`. For perpetual contracts on some exchanges, append `:USDT` -- e.g., `BTC/USDT:USDT`.

### Query Types for fin_defi (DeFi Data)

| query_type          | Description                     | Key Fields                                        |
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

### Query Types for fin_market_crypto (Market Overview)

| query_type     | Description                   | Key Fields                                                         |
| -------------- | ----------------------------- | ------------------------------------------------------------------ |
| `market_cap`   | Market cap ranking            | name, current_price, market_cap, market_cap_rank, price_change_24h |
| `coin_history` | Historical price/mcap/volume  | prices, market_caps, total_volumes                                 |
| `coin_info`    | Project details               | description, links, market_data, categories                        |
| `categories`   | Sector classification         | name, market_cap, market_cap_change_24h                            |
| `trending`     | Trending / hot search         | name, symbol, market_cap_rank                                      |
| `global`       | Global crypto market overview | total_market_cap, btc_dominance, market_cap_change_24h             |

**Coin ID**: Uses slug format (`bitcoin`, `ethereum`, `aave`), not ticker symbol (`BTC`, `ETH`).

## Six-Step Crypto Market Analysis Framework

### Step 1: Market Overview -- Macro Sentiment

**Purpose**: Assess overall market health and phase.

**Tool Calls**:

```
fin_market_crypto({query_type: "global"})
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
fin_market_crypto({query_type: "categories"})
fin_market_crypto({query_type: "trending"})
```

**Key Sectors**: DeFi, Layer 1, Layer 2, Meme, AI, Gaming, Privacy, Stablecoins, RWA, DePin.

Sort by 24h market cap change to find momentum leaders.

### Step 3: DeFi TVL Analysis -- On-Chain Capital Flows

**Purpose**: Track where capital is flowing on-chain.

**Tool Calls**:

```
fin_defi({query_type: "chains"})
fin_defi({query_type: "protocols"})
fin_defi({slug: "aave", query_type: "protocol_tvl"})
```

**Analysis**:

- Chain-level TVL ranking shows ecosystem strength
- Protocol-level TVL changes reveal capital migration
- 1d/7d changes highlight momentum

### Step 4: Yield Farming -- High-Yield, Low-Risk Pools

**Purpose**: Find attractive yield opportunities with acceptable risk.

**Tool Call**:

```
fin_defi({query_type: "yields"})
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
fin_defi({query_type: "stablecoins"})
```

**Interpretation**:

- USDT/USDC supply increasing: Fiat inflow to crypto (bullish)
- USDT/USDC supply decreasing: Capital outflow (bearish)
- DAI/other algo stablecoin growth: DeFi ecosystem expanding

### Step 6: Arbitrage Opportunities -- Cross-Exchange Spread + Funding Rate

**Purpose**: Identify market inefficiencies.

#### Cross-Exchange Price Spread

**Tool Calls**:

```
fin_crypto({symbol: "BTC/USDT", exchange: "binance", query_type: "ticker"})
fin_crypto({symbol: "BTC/USDT", exchange: "okx", query_type: "ticker"})
fin_crypto({symbol: "BTC/USDT", exchange: "bybit", query_type: "ticker"})
```

Compare last/bid/ask across exchanges. Spread > 0.1% may indicate arbitrage opportunity (after accounting for transfer fees and time).

#### Funding Rate Comparison

**Tool Calls**:

```
fin_crypto({symbol: "BTC/USDT", exchange: "binance", query_type: "funding_rate"})
fin_crypto({symbol: "BTC/USDT:USDT", exchange: "okx", query_type: "funding_rate"})
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

## Risk Disclosures

- Cryptocurrency markets operate 24/7 with no circuit breakers. Prices can move 10-30% in minutes during high volatility events.
- DeFi protocols carry smart contract risk. Even audited protocols have suffered exploits. TVL can drop to zero in a hack event.
- Yield farming APYs are variable and often decline rapidly as more capital enters a pool. Impermanent loss can exceed yield in volatile pairs.
- Stablecoin de-peg risk exists. Algorithmic stablecoins (UST/LUNA) have catastrophically failed. Even USDT/USDC have experienced temporary de-pegs.
- Cross-exchange arbitrage involves counterparty risk, withdrawal delays, and potential for exchange-specific issues (frozen withdrawals, KYC holds).
- Funding rate strategies require maintaining margin on perpetual positions. Liquidation risk exists if the position moves against you before collecting sufficient funding.
- Regulatory risk is material. Government actions (bans, taxation, licensing requirements) can materially impact crypto asset prices and exchange operations.
- All data is sourced from third-party APIs and may have delays or inaccuracies. Cross-verify critical trading decisions.
