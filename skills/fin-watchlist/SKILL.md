---
name: fin-watchlist
description: "Manage a personal watchlist of symbols to track. Use when: user wants to add, remove, or view their watchlist of tracked assets."
metadata:
  { "openclaw": { "emoji": "👁", "requires": { "extensions": ["fin-core", "fin-market-data"] } } }
---

# Watchlist Skill

Manage and view a personal watchlist of tracked financial instruments.

## When to Use

**USE this skill when:**

- "watch SOL" / "add BTC to watchlist"
- "my watchlist" / "show watchlist"
- "add to watchlist" / "track ETH"
- "remove from watchlist" / "stop watching DOGE"
- "watchlist update" / "how are my tracked coins doing"

## When NOT to Use

**DON'T use this skill when:**

- User wants current price without mentioning watchlist -- use fin-market-data
- User wants to buy or sell -- use fin-trading
- User asks about their portfolio positions -- use fin-portfolio
- User wants price alerts (trigger-based notifications) -- use fin-alerts
- User wants broad market screening -- use fin-screener

## Tools

### fin_watchlist_add

Add a symbol to the user's watchlist.

```
fin_watchlist_add({
  symbol: "SOL/USDT",
  notes: "Watching for breakout above $200"  // optional
})
```

### fin_watchlist_remove

Remove a symbol from the watchlist.

```
fin_watchlist_remove({
  symbol: "SOL/USDT"
})
```

### fin_watchlist_list

Show the current watchlist with latest prices.

```
fin_watchlist_list({})
```

### fin_watchlist_update

Fetch live prices and 24h changes for all watchlist items.

```
fin_watchlist_update({})
```

## Response Guidelines

- When adding to the watchlist, confirm the symbol and fetch its current price as context.
- When showing the watchlist, always include current price and 24h change for each item.
- Sort watchlist items by 24h change (biggest movers first) unless the user prefers a different order.
- If the watchlist is empty, suggest popular symbols the user might want to track.
- When removing, confirm what was removed.
- For watchlist updates, highlight any symbols with significant moves (greater than 5% change).
- Use `fin_market_price` or `fin_ticker_info` as needed to enrich the watchlist display with live data.
