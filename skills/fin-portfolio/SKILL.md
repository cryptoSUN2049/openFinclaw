---
name: fin-portfolio
description: "View portfolio positions, balances, P&L, and allocation breakdowns. Use when: user asks about their holdings, account balance, profit/loss, or portfolio composition."
metadata: { "openclaw": { "emoji": "💼", "requires": { "extensions": ["fin-core"] } } }
---

# Portfolio Skill

View and analyze the user's portfolio across connected exchanges.

## When to Use

**USE this skill when:**

- "my portfolio" / "show my positions"
- "how much did I make" / "P&L today"
- "balance" / "account balance"
- "what am I holding" / "show my assets"
- "portfolio allocation" / "position sizes"
- "how is my portfolio doing"
- "unrealized P&L" / "realized gains"

## When NOT to Use

**DON'T use this skill when:**

- User wants to buy or sell -- use fin-trading
- User asks for a price without mentioning portfolio -- use fin-market-data
- User wants to set up monitoring or alerts -- use fin-alerts
- User asks for in-depth research or analysis -- use fin-expert
- User wants a weekly/daily report -- use fin-report

## Tools

### fin_portfolio_balances

Fetch all balances across connected exchanges.

```
fin_portfolio_balances({
  exchange: "binance"   // optional, omit for all exchanges
})
```

### fin_portfolio_positions

List open positions with entry price, current price, and unrealized P&L.

```
fin_portfolio_positions({
  exchange: "binance",   // optional
  symbol: "BTC/USDT"    // optional, filter to specific pair
})
```

### fin_portfolio_pnl

Get realized and unrealized profit/loss summary.

```
fin_portfolio_pnl({
  period: "today",       // optional: today, 7d, 30d, all
  exchange: "binance"    // optional
})
```

### fin_portfolio_history

Fetch portfolio value history for charting.

```
fin_portfolio_history({
  period: "30d",         // optional: 7d, 30d, 90d, 1y
  exchange: "binance"    // optional
})
```

## Response Guidelines

- Start with the total portfolio value prominently displayed.
- Show P&L in both absolute USD and percentage terms.
- For multi-exchange portfolios, break down by exchange.
- Highlight the top gainers and losers in the portfolio.
- Show allocation as percentages of total portfolio value.
- Use color-coded language: clearly distinguish gains from losses.
- If the user has no positions, suggest using fin-market-data to research opportunities.
- Always note if data is delayed or if any exchange connection is unavailable.
