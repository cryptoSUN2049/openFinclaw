---
name: fin-market-data
description: "Fetch real-time market data: prices, tickers, orderbooks, and market overviews for crypto, stocks, forex, and commodities. Use when: user asks about current prices, market conditions, or trading pair information."
metadata:
  {
    "openclaw":
      {
        "emoji": "📈",
        "requires": { "extensions": ["fin-core", "fin-market-data"] },
      },
  }
---

# Market Data Skill

Fetch real-time and historical market data using OpenFinClaw tools.

## When to Use

**USE this skill when:**

- "BTC price" / "how much is ETH"
- "market overview" / "what's happening in crypto"
- "show me the orderbook for BTC/USDT"
- "ETH/BTC ticker" / "24h volume for SOL"
- "show me 1h candles for BTC"
- "what's the bid/ask spread on ETH"

## When NOT to Use

**DON'T use this skill when:**

- User wants to buy/sell/trade -- use fin-trading
- User asks about their portfolio balance -- use fin-portfolio
- User wants to set a price alert -- use fin-alerts
- User wants deep analysis or research -- use fin-expert
- User asks for a watchlist update -- use fin-watchlist

## Tools

### fin_market_price

Fetch current price or historical OHLCV candles.

```
fin_market_price({
  symbol: "BTC/USDT",
  exchange: "binance",        // optional, uses default
  timeframe: "1h",            // optional: 1m, 5m, 1h, 4h, 1d
  limit: 100                  // optional, number of candles
})
```

**Common patterns:**

- Current price: `fin_market_price({ symbol: "BTC/USDT" })` (no timeframe returns spot price)
- 4h candles: `fin_market_price({ symbol: "ETH/USDT", timeframe: "4h", limit: 50 })`
- Daily candles: `fin_market_price({ symbol: "AAPL", timeframe: "1d", limit: 30 })`

### fin_market_overview

Get market overview including indices, sector performance, and sentiment.

```
fin_market_overview({
  sector: "crypto"   // optional: crypto, stocks, forex, commodities
})
```

### fin_orderbook

Fetch order book depth for a trading pair.

```
fin_orderbook({
  symbol: "BTC/USDT",
  exchange: "binance",   // optional
  limit: 25              // optional, price levels per side
})
```

### fin_ticker_info

Get 24h ticker information including volume, price change, and high/low.

```
fin_ticker_info({
  symbol: "BTC/USDT",
  exchange: "binance"    // optional
})
```

## Response Guidelines

- Always include the current price prominently in your response.
- For candle data, summarize the trend (up/down/sideways) rather than listing raw data.
- Include 24h change percentage when available.
- Mention volume when it is notably high or low.
- If the user asks about a symbol without specifying a quote currency, default to USDT for crypto and USD for stocks.
- Format large numbers with commas (e.g. $67,432.50) and percentages to 2 decimal places.
