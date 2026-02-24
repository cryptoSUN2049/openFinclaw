## OpenFinClaw Vision

OpenFinClaw is a self-hosted, privacy-first AI financial butler.
It runs on your devices, in your channels, with your rules — and it can actually trade.

This document explains the current state and direction of the project.
We are still early, so iteration is fast.
Project overview and developer docs: [`README.md`](README.md)

OpenFinClaw is an independent fork of [OpenClaw](https://github.com/openclaw/openclaw) (68K+ stars),
repositioned as a **full-spectrum financial AI assistant**. It inherits OpenClaw's robust multi-channel
gateway and plugin architecture, and extends it with deep financial capabilities.

### Core Differentiators

- **Self-hosted + Privacy First**: Financial data never leaves your device. API keys stored locally.
- **Actually Trades**: CCXT integration with Hyperliquid, Binance, OKX, Bybit — not just "suggestions".
- **35+ Channels**: Interact via Telegram, Discord, WeChat, Web, and more.
- **Tiered Risk Control**: Auto-execute small trades, confirm medium ones, reject dangerous ones.
- **Evolving Skill System**: Community-driven financial skills ecosystem.
- **Expert SDK + Info Feed**: Plug in professional analysis and real-time information services.

### Current Focus

Priority:

- Security-first trading with tiered risk controls
- Cross-exchange portfolio aggregation and monitoring
- Financial skill system (market data, portfolio, trading, alerts)
- Proactive monitoring: price alerts, stop-loss, daily briefs

Next priorities:

- Expert SDK integration for deep financial analysis
- Intelligent information feed with portfolio-aware filtering
- Automated reporting (daily, weekly, monthly)
- Smart rebalancing suggestions
- Backtesting framework for strategy validation

### Architecture

All financial capabilities live as extensions, never modifying core:

```
extensions/
  fin-core/           # Shared types, exchange registry, risk controller
  fin-market-data/    # Price, orderbook, ticker, market overview tools
  fin-portfolio/      # Cross-exchange portfolio tracking and history
  fin-trading/        # CCXT trading engine with risk-gated execution
  fin-expert-sdk/     # Deep analysis via external Expert API
  fin-info-feed/      # Intelligent news and information streaming
  fin-monitoring/     # Price alerts, portfolio checks, scheduled reports
```

### Security

Financial security is non-negotiable:

- Trading disabled by default — explicit opt-in required
- Tiered execution: auto (small), confirm (medium), reject (large/risky)
- Daily loss hard limits halt all trading when breached
- Leverage caps and pair allowlists
- All credentials stored locally, never transmitted to third parties

Canonical security policy: [`SECURITY.md`](SECURITY.md)

## Plugins & Skills

OpenFinClaw inherits OpenClaw's extensive plugin API.
Financial capabilities ship as `fin-*` extensions following the standard plugin pattern.

### Financial Skills

Financial skills provide natural-language interfaces to financial tools:

- `fin-market-data` — "BTC price?", "Market overview"
- `fin-portfolio` — "My positions", "How much did I make?"
- `fin-trading` — "Buy 0.1 BTC", "Set stop-loss at 95000"
- `fin-alerts` — "Alert me when ETH hits 4000"
- `fin-expert` — "Analyze SOL's trend", "Research report on DeFi"
- `fin-report` — "Weekly report", "Monthly performance"

### MCP Support

OpenFinClaw supports MCP through `mcporter`: https://github.com/steipete/mcporter

### Why TypeScript?

OpenFinClaw is primarily an orchestration system: prompts, tools, protocols, and integrations.
TypeScript keeps it hackable by default — widely known, fast to iterate, easy to extend.

## Open Source + Business Model

```
┌─────────────────────────────────────────────┐
│            MIT Open Source (Free)            │
│                                             │
│  fin-core    fin-trading   fin-portfolio    │
│  fin-monitoring  fin-market-data            │
│  All financial skills   Community framework │
│                                             │
├─────────────────────────────────────────────┤
│          SDK Key (Paid / Value-Add)          │
│                                             │
│  fin-expert-sdk   Deep financial analysis   │
│  fin-info-feed    Smart info streaming       │
│  Advanced skills  Institutional analytics   │
│  Priority support                           │
│                                             │
└─────────────────────────────────────────────┘
```
