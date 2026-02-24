---
name: fin-trading
description: "Execute trades: place market/limit orders, cancel orders, and manage open orders. Use when: user wants to buy, sell, or manage orders on connected exchanges. ALWAYS confirm with user before executing."
metadata:
  {
    "openclaw":
      {
        "emoji": "⚡",
        "requires": { "extensions": ["fin-core"] },
      },
  }
---

# Trading Skill

Place, modify, and cancel orders on connected exchanges.

## When to Use

**USE this skill when:**

- "buy BTC" / "buy 0.1 BTC"
- "sell ETH" / "sell all my SOL"
- "place order" / "limit order BTC at 60k"
- "cancel order" / "cancel all orders"
- "limit order" / "stop loss" / "take profit"
- "show open orders" / "my orders"

## When NOT to Use

**DON'T use this skill when:**

- User just wants to check a price -- use fin-market-data
- User wants portfolio overview without trading -- use fin-portfolio
- User asks for analysis before deciding to trade -- use fin-expert
- User wants to set passive monitoring alerts -- use fin-alerts

## CRITICAL: Confirmation Required

**NEVER execute a trade without explicit user confirmation.** Always:

1. Show the order details (symbol, side, amount, price, estimated cost).
2. Show current market price for context.
3. Ask: "Confirm this order? (yes/no)"
4. Only call the execution tool after receiving "yes".

The risk controller from fin-core will also gate orders above configured thresholds.

## Tools

### fin_place_order

Place a new order on an exchange.

```
fin_place_order({
  symbol: "BTC/USDT",
  side: "buy",              // buy or sell
  type: "limit",            // market or limit
  amount: 0.01,             // quantity in base currency
  price: 65000,             // required for limit orders
  exchange: "binance",      // optional, uses default
  stopLoss: 62000,          // optional, stop-loss price
  takeProfit: 70000         // optional, take-profit price
})
```

### fin_cancel_order

Cancel an open order.

```
fin_cancel_order({
  orderId: "order-abc123",
  symbol: "BTC/USDT",
  exchange: "binance"       // optional
})
```

### fin_list_orders

List open orders.

```
fin_list_orders({
  symbol: "BTC/USDT",      // optional, filter by pair
  exchange: "binance"       // optional
})
```

### fin_modify_order

Modify an existing order (price or amount).

```
fin_modify_order({
  orderId: "order-abc123",
  symbol: "BTC/USDT",
  price: 64500,             // optional, new price
  amount: 0.02,             // optional, new amount
  exchange: "binance"       // optional
})
```

## Response Guidelines

- Before placing any order, always fetch the current price with `fin_market_price` so the user sees context.
- Show the estimated total cost/proceeds in USD.
- For limit orders, show how far the limit price is from the current market price.
- After successful order placement, show the order ID and status.
- If the order is rejected (insufficient balance, risk limits, etc.), explain why clearly.
- For "sell all" requests, first check the balance with `fin_portfolio_positions`, then confirm the exact amount.
- Never assume the user wants a market order -- if unspecified, ask whether they prefer market or limit.
- Include any fees in the cost estimate when available.
