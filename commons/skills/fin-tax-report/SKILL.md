---
name: fin-tax-report
description: "Tax reporting assistant - generates tax summaries from transaction history including capital gains, income categorization, and jurisdiction-specific rules."
metadata: { "openclaw": { "emoji": "🧾" } }
---

# Tax Reporting Assistant

Generate comprehensive tax reports from cryptocurrency and financial transaction history. Supports capital gains calculation, income categorization, and cost basis methods.

## When to Use

**USE this skill when:**

- "tax report" / "generate tax summary"
- "capital gains this year"
- "how much do I owe in taxes"
- "export transactions for taxes"
- "cost basis for my BTC"
- "wash sale check"
- "tax-loss harvesting opportunities"

## When NOT to Use

**DON'T use this skill when:**

- User wants to see current portfolio value -- use fin-portfolio
- User wants to place a trade -- use fin-trading
- User wants market analysis -- use fin-expert
- User wants price alerts -- use fin-alerts

## Capabilities

### Capital Gains Calculation

- **FIFO** (First In, First Out) - default method
- **LIFO** (Last In, First Out)
- **HIFO** (Highest In, First Out) - minimizes gains
- **Specific Identification** - user selects which lots to sell

### Income Categorization

Classify transactions into tax-relevant categories:

- **Short-term capital gains**: Assets held < 1 year
- **Long-term capital gains**: Assets held >= 1 year
- **Staking/mining income**: Ordinary income at fair market value on receipt
- **Airdrops**: Ordinary income at fair market value
- **Interest/lending**: Ordinary income
- **Gifts received**: Cost basis carries over from donor
- **Losses**: Deductible against gains (with carryforward rules)

### Report Formats

- **Summary**: Total gains/losses by category, estimated tax liability
- **Detailed**: Per-transaction breakdown with cost basis and holding period
- **Form 8949**: US-specific format for reporting capital gains
- **CSV Export**: Raw data for import into tax software

## Response Guidelines

- Always ask which tax year and jurisdiction the user needs.
- Default to FIFO unless the user specifies a different cost basis method.
- Clearly separate short-term vs long-term gains.
- Show the estimated tax impact at the user's marginal rate if provided.
- Flag any transactions that could not be matched to a cost basis (e.g., transfers from unknown sources).
- Warn about wash sale rules when applicable.
- Suggest tax-loss harvesting opportunities if unrealized losses exist.
- Include a disclaimer that this is informational, not tax advice, and recommend consulting a tax professional.
