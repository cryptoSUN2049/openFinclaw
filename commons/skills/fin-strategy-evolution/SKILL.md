---
name: fin-strategy-evolution
description: "Strategy evolution and lifecycle — promote, demote, mutate parameters, cull underperformers, and manage the full L0-L3 pipeline."
metadata:
  {
    "openclaw":
      {
        "emoji": "🧬",
        "requires":
          {
            "extensions":
              ["fin-core", "fin-strategy-engine", "fin-paper-trading", "fin-fund-manager"],
          },
      },
  }
---

# Strategy Evolution Engine

Manage the full lifecycle of trading strategies: promotion through levels, parameter mutation, fitness-based culling, and automated demotion of degrading strategies.

## When to Use

**USE this skill when:**

- "evolve my strategies" / "run evolution cycle"
- "promote strategy X to paper trading"
- "which strategies should be killed"
- "mutate parameters for strategy X"
- "run monthly strategy review"
- "show me strategy fitness scores"
- "demote underperforming strategies"

## When NOT to Use

**DON'T use this skill when:**

- User wants to create a new strategy -- use fin-strategy-research
- User wants fund-level rebalancing -- use fin-quant-fund
- User wants to review specific trades -- use fin-trade-review
- User wants a one-off backtest -- use fin-backtest

## Tools

### Lifecycle Tools

- `fin_strategy_list` -- List all strategies with levels and fitness
- `fin_fund_promote` -- Check promotion eligibility for a strategy
  - Parameters: `strategyId`
- `fin_fund_rebalance` -- Full rebalance with promotion/demotion checks
- `fin_leaderboard` -- Ranked strategies by confidence-adjusted fitness
- `fin_backtest_run` -- Re-backtest mutated strategies

### Supporting Tools

- `fin_paper_state` -- Check paper trading status for L2 strategies
- `fin_paper_metrics` -- Decay detection metrics
- `fin_data_regime` -- Current market regime (affects promotion decisions)

## Evolution Framework

### Strategy Levels

| Level  | Name     | Entry Criteria                                           | Exit Criteria                 |
| ------ | -------- | -------------------------------------------------------- | ----------------------------- |
| L0     | Incubate | Strategy registered                                      | Auto → L1                     |
| L1     | Backtest | Walk-Forward passed, Sharpe ≥ 1.0, DD ≤ 25%, 100+ trades | Fail → KILLED                 |
| L2     | Paper    | 30+ days, 30+ trades, Sharpe ≥ 0.5, DD ≤ 20%             | Sharpe < -0.5 → L1            |
| L3     | Live     | User confirmed                                           | 3 loss days / Sharpe < 0 → L2 |
| KILLED | Dead     | 3 periods bottom 20% / loss > 40%                        | —                             |

### Fitness Function (Time-Decayed)

```
With paper:    paper × 50% + recent × 35% + longTerm × 15%
Without paper: recent × 70% + longTerm × 30%

Penalties:
  - Decay:       max(0, longTerm - recent) × 0.30
  - Overfit:     max(0, recent - paper)    × 0.50
  - Correlation: portfolioCorrelation      × 0.20
  - Half-life:   if days > 180, 0.1 × (days-180)/365
```

### Monthly Evolution Cycle

1. **Score**: Calculate fitness for all active strategies
2. **Cull**: Kill bottom 20% (by fitness), minimum 3 strategies survive
3. **Mutate**: For surviving strategies with parameter ranges, generate variants:
   - Perturb parameters ±30% within defined ranges
   - Re-backtest variants with Walk-Forward
   - Replace parent if variant has higher fitness
4. **Promote**: Check L1→L2 and L2→L3 eligibility
5. **Demote**: Check L3→L2 and L2→L1 triggers
6. **Report**: Generate evolution summary

## Response Guidelines

- Show evolution results as a lifecycle flow diagram
- Highlight promoted and demoted strategies with reasons
- For killed strategies, show the specific failure criteria
- For mutations, show parameter changes and new vs old fitness
- Always include the updated leaderboard after evolution
- End with recommendations for user action (confirm L3 promotions, etc.)

## Risk Disclosures

> Strategy evolution is based on historical and simulated performance. Past fitness scores do not guarantee future returns. L3 promotion always requires explicit user confirmation before committing real capital.
