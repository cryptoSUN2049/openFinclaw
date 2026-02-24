---
name: fin-dca-strategy
description: "Dollar-cost averaging strategy - analyzes portfolios and recommends DCA plans based on risk tolerance and market conditions."
metadata: { "openclaw": { "emoji": "📊" } }
---

# DCA Strategy Assistant

Analyze portfolios and recommend dollar-cost averaging (DCA) plans tailored to the user's risk tolerance, investment horizon, and market conditions.

## When to Use

**USE this skill when:**

- "set up DCA for BTC" / "DCA plan"
- "how should I dollar-cost average"
- "recurring buy strategy"
- "build a DCA schedule"
- "investment plan for crypto"
- "accumulate ETH over time"

## When NOT to Use

**DON'T use this skill when:**

- User wants to execute a single trade now -- use fin-trading
- User wants real-time prices -- use fin-market-data
- User wants to see current holdings -- use fin-portfolio
- User asks about tax implications -- use fin-tax-report

## Analysis Framework

### 1. Asset Selection

Evaluate which assets are suitable for DCA based on:

- Market capitalization and liquidity
- Historical volatility (higher volatility = more DCA benefit)
- User's existing exposure and diversification
- Long-term fundamentals and adoption metrics

### 2. Frequency Optimization

Recommend purchase frequency based on:

- **Daily**: Best for high-volatility assets, larger total allocations
- **Weekly**: Good balance of cost-averaging and transaction cost efficiency
- **Bi-weekly**: Aligns with typical pay cycles
- **Monthly**: Suitable for lower-volatility assets, smaller allocations

### 3. Amount Allocation

Calculate per-period investment amounts considering:

- Total budget and investment horizon
- Risk tolerance (conservative: 5-10% of savings, aggressive: 20-30%)
- Asset allocation targets (e.g., 60% BTC, 30% ETH, 10% alts)
- Fee optimization (larger, less frequent purchases reduce relative fee impact)

### 4. Risk Assessment

Evaluate and communicate:

- Maximum drawdown scenarios with historical examples
- Break-even timeline expectations
- Comparison: DCA vs lump-sum given current market conditions
- Exit strategy recommendations (target price, time-based, trailing stop)

## Response Guidelines

- Always start by asking about investment goals, timeline, and risk tolerance if not provided.
- Present DCA plans in a clear table format with asset, frequency, amount, and projected costs.
- Show historical backtesting results when possible (e.g., "DCA into BTC weekly over the last 2 years would have yielded X%").
- Include total fee estimates for the recommended plan.
- Warn about exchange minimum order sizes that could affect the plan.
- Suggest reviewing the plan quarterly and adjusting based on portfolio performance.
