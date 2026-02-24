---
name: fin-alerts
description: "Set, manage, and view price and P&L alerts. Use when: user wants to be notified when a price target is hit or portfolio P&L crosses a threshold."
metadata:
  {
    "openclaw":
      {
        "emoji": "🔔",
        "requires": { "extensions": ["fin-monitoring"] },
      },
  }
---

# Alerts Skill

Create and manage financial alerts using the fin-monitoring extension.

## When to Use

**USE this skill when:**

- "alert me when BTC hits 100k"
- "price alert" / "set alert"
- "notify me when ETH drops below 3000"
- "set a stop-loss alert at 60k"
- "alert if I lose more than $500"
- "show my alerts" / "list alerts"
- "remove alert" / "delete alert"

## When NOT to Use

**DON'T use this skill when:**

- User wants to place an actual trade with stop-loss -- use fin-trading
- User just wants to check the current price -- use fin-market-data
- User wants to add to their watchlist (passive tracking, no notifications) -- use fin-watchlist
- User asks for a scheduled report -- use fin-report

## Tools

### fin_set_alert

Create a new alert. Supported kinds:

**Price above:**

```
fin_set_alert({
  kind: "price_above",
  symbol: "BTC/USDT",
  price: 100000,
  message: "BTC hit 100k!"   // optional custom message
})
```

**Price below:**

```
fin_set_alert({
  kind: "price_below",
  symbol: "ETH/USDT",
  price: 3000,
  message: "ETH dropped below 3k"
})
```

**P&L threshold (loss):**

```
fin_set_alert({
  kind: "pnl_threshold",
  threshold: 500,
  direction: "loss",
  message: "Portfolio down $500"
})
```

**P&L threshold (gain):**

```
fin_set_alert({
  kind: "pnl_threshold",
  threshold: 1000,
  direction: "gain",
  message: "Portfolio up $1000!"
})
```

### fin_list_alerts

List all active and triggered alerts.

```
fin_list_alerts({})
```

### fin_remove_alert

Remove an alert by ID.

```
fin_remove_alert({
  id: "alert-1"
})
```

## Response Guidelines

- When setting an alert, always fetch the current price first with `fin_market_price` to show the user how far the target is from the current level.
- Confirm the alert details after creation: kind, symbol, target, and the alert ID.
- When listing alerts, clearly distinguish between active (waiting) and already-triggered alerts.
- For "alert me when BTC hits X" -- determine whether the user means price_above or price_below based on whether X is above or below the current price.
- If the user says "stop-loss alert at 60k" for BTC, set a price_below alert.
- Suggest related alerts when appropriate (e.g., "Want me to also set a take-profit alert?").
- Remind users that alerts are checked periodically (every 5 minutes) so exact price triggers may have slight delay.
