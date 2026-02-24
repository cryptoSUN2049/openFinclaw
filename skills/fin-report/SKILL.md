---
name: fin-report
description: "Generate financial reports: daily summaries, weekly performance reviews, monthly recaps, and custom reports. Use when: user asks for a periodic summary or performance overview."
metadata:
  {
    "openclaw":
      {
        "emoji": "📊",
        "requires": { "extensions": ["fin-core", "fin-market-data", "fin-monitoring"] },
      },
  }
---

# Report Skill

Generate structured financial reports and performance summaries.

## When to Use

**USE this skill when:**

- "weekly report" / "daily summary"
- "how did I do this week" / "this month's performance"
- "monthly performance" / "monthly recap"
- "generate a report" / "portfolio report"
- "trading summary" / "what happened today"
- "year-to-date performance"

## When NOT to Use

**DON'T use this skill when:**

- User wants a quick portfolio balance check -- use fin-portfolio
- User wants real-time price data -- use fin-market-data
- User wants analysis of a specific asset -- use fin-expert
- User wants to set up automated scheduled reports -- use fin-alerts (cron-based)
- User wants budget/spending tracking -- use fin-budget

## Report Types

### Daily Summary

Gather data for today's activity:

1. Fetch portfolio P&L for today: `fin_portfolio_pnl({ period: "today" })`
2. Fetch portfolio positions: `fin_portfolio_positions({})`
3. Fetch market overview: `fin_market_overview({ sector: "crypto" })`
4. List triggered alerts: `fin_list_alerts({})`

**Format:**

```
Daily Summary — [Date]

Portfolio Value: $XX,XXX
Today's P&L: +$XXX (+X.X%)

Top Movers:
  BTC/USDT: +2.3% ($67,400)
  ETH/USDT: -1.1% ($3,450)

Alerts Triggered: X
Open Orders: X

Market Conditions: [brief overview]
```

### Weekly Report

Gather data for the past 7 days:

1. Fetch portfolio P&L: `fin_portfolio_pnl({ period: "7d" })`
2. Fetch portfolio history: `fin_portfolio_history({ period: "7d" })`
3. Fetch market overview: `fin_market_overview({})`

**Format:**

```
Weekly Report — [Start Date] to [End Date]

Starting Value: $XX,XXX
Ending Value: $XX,XXX
Weekly P&L: +$X,XXX (+X.X%)

Best Day: [Date] (+$XXX)
Worst Day: [Date] (-$XXX)

Position Changes:
  [list of trades made during the week]

Market Context:
  [brief market summary for the period]
```

### Monthly Performance

Gather data for the past 30 days:

1. Fetch portfolio P&L: `fin_portfolio_pnl({ period: "30d" })`
2. Fetch portfolio history: `fin_portfolio_history({ period: "30d" })`
3. Fetch balances: `fin_portfolio_balances({})`

**Format:**

```
Monthly Report — [Month Year]

Starting Value: $XX,XXX
Ending Value: $XX,XXX
Monthly P&L: +$X,XXX (+X.X%)

Allocation:
  BTC: XX% ($XX,XXX)
  ETH: XX% ($X,XXX)
  [...]

Key Events:
  [notable trades, alerts triggered, market events]
```

## Response Guidelines

- Always include both absolute USD amounts and percentage changes.
- Compare performance against benchmarks (BTC, S&P 500) when relevant.
- Highlight notable events: large trades, triggered alerts, significant market moves.
- Use clear date ranges so the user knows exactly what period is covered.
- If data is unavailable for any section, note it and include what is available.
- For multi-exchange accounts, break down by exchange in an appendix section.
- Keep the main summary concise; put detailed breakdowns in expandable sections or at the end.
