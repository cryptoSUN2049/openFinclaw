---
name: fin-budget
description: "Budget and spending management: set monthly budgets, track expenses, categorize spending, and review financial habits. Use when: user asks about budgeting, spending, or expense tracking."
metadata: { "openclaw": { "emoji": "💰", "requires": { "extensions": ["fin-core"] } } }
---

# Budget Skill

Track spending, manage budgets, and review financial habits.

## When to Use

**USE this skill when:**

- "monthly budget" / "set a budget"
- "spending tracker" / "track my expenses"
- "how much did I spend" / "spending this month"
- "set budget" / "budget for groceries"
- "categorize my spending" / "where is my money going"
- "am I over budget" / "budget status"

## When NOT to Use

**DON'T use this skill when:**

- User asks about investment portfolio performance -- use fin-portfolio
- User wants trading P&L -- use fin-report
- User wants to buy/sell financial assets -- use fin-trading
- User asks about market prices -- use fin-market-data

## Tools

### fin_budget_set

Set or update a budget category.

```
fin_budget_set({
  category: "groceries",
  monthlyLimit: 500,         // USD budget for the month
  currency: "USD"            // optional, defaults to USD
})
```

### fin_budget_log

Log an expense.

```
fin_budget_log({
  amount: 45.50,
  category: "groceries",
  description: "Weekly grocery run",  // optional
  date: "2026-02-24"                  // optional, defaults to today
})
```

### fin_budget_status

Get current budget status for all categories or a specific one.

```
fin_budget_status({
  category: "groceries",   // optional, omit for all categories
  period: "current"        // optional: current, last_month, custom
})
```

### fin_budget_history

View spending history with breakdowns.

```
fin_budget_history({
  period: "30d",            // 7d, 30d, 90d, 1y
  category: "groceries",   // optional, omit for all
  groupBy: "category"      // optional: category, day, week
})
```

## Response Guidelines

- Show budget status as a progress bar or percentage (e.g., "Groceries: $350 / $500 (70%)").
- Highlight categories that are over budget or approaching the limit (above 80%).
- When logging expenses, confirm the amount and category, and show the updated budget status.
- For spending history, show totals by category and highlight trends (spending more or less than usual).
- If no budgets are set, guide the user through setting up their first budget.
- Suggest budget amounts based on past spending patterns when available.
- Format all monetary values with the appropriate currency symbol and two decimal places.
- For "where is my money going" questions, present a category breakdown sorted by total spend.
