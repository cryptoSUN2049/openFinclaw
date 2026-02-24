# FinClaw Starter Workspace

A starter workspace for financial intelligence with OpenClaw. This template includes recommended skills and sensible defaults for financial workflows.

## Getting Started

1. Install the workspace template:

   ```bash
   openclaw commons install finclaw-starter --dir ./my-finance-workspace
   ```

2. Navigate to the workspace:

   ```bash
   cd my-finance-workspace
   ```

3. Install recommended skills:

   ```bash
   openclaw commons install fin-dca-strategy
   openclaw commons install fin-tax-report
   ```

4. Configure your exchange connections in `openclaw.json`.

## Included Configuration

- **openclaw.json** - Base configuration with finance-focused defaults
- **skills.json** - List of recommended financial skills

## Recommended Skills

| Skill            | Description                                 |
| ---------------- | ------------------------------------------- |
| fin-market-data  | Real-time prices, charts, and market data   |
| fin-portfolio    | Portfolio tracking and P&L analysis         |
| fin-trading      | Order execution with safety confirmations   |
| fin-dca-strategy | Dollar-cost averaging plan builder          |
| fin-tax-report   | Tax reporting and capital gains calculation |
| fin-alerts       | Price and portfolio alert monitoring        |
| fin-expert       | Deep financial analysis and research        |

## Learn More

Visit the [OpenClaw documentation](https://docs.openclaw.ai) for guides on configuring exchanges, setting up alerts, and customizing skills.
