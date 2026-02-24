---
name: fin-screener
description: "Screen and filter financial instruments by criteria: top gainers/losers, volume leaders, price ranges, and custom filters. Use when: user wants to discover or filter assets based on specific conditions."
metadata:
  { "openclaw": { "emoji": "🔍", "requires": { "extensions": ["fin-core", "fin-market-data"] } } }
---

# Screener Skill

Screen and filter financial instruments based on user-defined criteria.

## When to Use

**USE this skill when:**

- "find coins up 5%" / "top gainers today"
- "screen for low PE stocks"
- "top gainers" / "biggest losers"
- "filter" / "find assets with high volume"
- "what's pumping" / "what's dumping"
- "show me coins under $1 with high volume"
- "altcoins outperforming BTC"

## When NOT to Use

**DON'T use this skill when:**

- User asks about a specific asset's price -- use fin-market-data
- User wants in-depth analysis of one asset -- use fin-expert
- User wants their own portfolio positions -- use fin-portfolio
- User wants to place a trade -- use fin-trading
- User wants to track specific assets long-term -- use fin-watchlist

## Approach

The screener uses market data tools to fetch, filter, and rank assets.

### Step 1: Fetch Market Data

Use `fin_market_overview` to get broad market data for the relevant sector:

```
fin_market_overview({
  sector: "crypto"    // or stocks, forex, commodities
})
```

### Step 2: Enrich with Ticker Data

For promising candidates or specific filter criteria, fetch ticker details:

```
fin_ticker_info({
  symbol: "SOL/USDT",
  exchange: "binance"
})
```

### Step 3: Apply Filters

Common screening criteria:

| Filter         | How to Evaluate                                     |
| -------------- | --------------------------------------------------- |
| Top gainers    | Sort by 24h change percentage (descending)          |
| Top losers     | Sort by 24h change percentage (ascending)           |
| Volume leaders | Sort by 24h volume (descending)                     |
| Price range    | Filter by price (e.g. under $1, over $100)          |
| Volatility     | Filter by 24h high-low range as percentage of price |
| Volume surge   | Compare current volume to average                   |

### Step 4: Present Results

Format as a ranked table:

```
| # | Symbol    | Price     | 24h Change | Volume (24h)  |
|---|-----------|-----------|------------|---------------|
| 1 | SOL/USDT  | $198.50   | +12.3%     | $2.1B         |
| 2 | AVAX/USDT | $42.10    | +8.7%      | $890M         |
| 3 | NEAR/USDT | $7.85     | +7.2%      | $450M         |
```

## Response Guidelines

- Always show results in a table format for easy scanning.
- Include at least: symbol, price, 24h change, and volume.
- Default to showing top 10 results unless the user asks for more.
- Clearly state the screening criteria and the time period (e.g., "Top gainers in the last 24 hours").
- If the user's filter returns no results, suggest relaxing the criteria.
- For composite screens (multiple filters), apply them in the order that reduces the dataset fastest.
- Note which exchange the data comes from, since results may vary across exchanges.
- If the user asks to screen stocks by fundamental metrics (PE ratio, market cap, etc.), note that these require additional data sources that may not yet be connected.
