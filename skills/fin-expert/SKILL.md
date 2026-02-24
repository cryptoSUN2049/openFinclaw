---
name: fin-expert
description: "In-depth financial analysis: technical analysis, fundamental research, sentiment analysis, and research reports. Use when: user asks for analysis, opinions, or research on specific assets or market conditions."
metadata:
  { "openclaw": { "emoji": "🔬", "requires": { "extensions": ["fin-core", "fin-market-data"] } } }
---

# Expert Analysis Skill

Provide in-depth financial analysis combining technical, fundamental, and sentiment data.

## When to Use

**USE this skill when:**

- "analyze ETH" / "what do you think about BTC"
- "research report" / "deep dive on SOL"
- "technical analysis" / "TA on BTC/USDT"
- "is it a good time to buy ETH"
- "support and resistance levels for BTC"
- "what's the sentiment on DOGE"
- "compare BTC vs ETH"

## When NOT to Use

**DON'T use this skill when:**

- User just wants a quick price check -- use fin-market-data
- User wants to execute a trade -- use fin-trading
- User asks about their portfolio performance -- use fin-portfolio
- User wants to screen/filter for assets -- use fin-screener
- User wants to set alerts -- use fin-alerts

## Approach

### Technical Analysis

1. Fetch historical candle data with `fin_market_price` using appropriate timeframes:
   - Short-term: 1h candles, 100-200 candles
   - Medium-term: 4h candles, 100 candles
   - Long-term: 1d candles, 90-365 candles

2. Analyze key technical indicators from the data:
   - **Trend:** Direction based on recent price action and moving average crossovers
   - **Support/Resistance:** Key price levels from recent highs, lows, and consolidation zones
   - **Volume:** Compare recent volume to average -- is it confirming the trend?
   - **Momentum:** Is price accelerating or decelerating?
   - **Volatility:** Range of recent candles relative to historical norms

3. Fetch the orderbook with `fin_orderbook` to identify:
   - Large bid/ask walls (significant support/resistance)
   - Bid-ask spread (liquidity indicator)
   - Order imbalance (bullish vs bearish pressure)

### Fundamental Analysis

4. Use `fin_ticker_info` for 24h metrics:
   - Volume trends
   - Price change magnitude
   - Market cap context (for crypto)

5. Consider broader context:
   - Market cycle position
   - Recent news or events affecting the asset
   - Correlation with BTC/major indices

### Synthesis

6. Combine all data into a structured analysis:
   - **Verdict:** Bullish / Bearish / Neutral with confidence level
   - **Key levels:** Entry, stop-loss, and take-profit suggestions
   - **Risks:** What could invalidate the analysis
   - **Timeframe:** How long the analysis is expected to remain valid

## Response Guidelines

- Always state clearly that this is analysis, not financial advice.
- Structure the response with clear sections: Summary, Technical, Fundamental, Verdict.
- Include specific price levels (support, resistance, entry, stop-loss).
- State the confidence level (low / medium / high) and what would change the thesis.
- When comparing assets, use a side-by-side format.
- For "is it a good time to buy" questions, present both bull and bear cases.
- Use data from tools to support every claim -- do not make unsupported assertions.
- Keep the analysis concise but thorough; aim for actionable insights.
