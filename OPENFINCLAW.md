# OpenFinClaw - Finance-Domain OpenClaw

> **openfinclaw.ai** | Open-source financial AI butler for users' full lifecycle financial affairs

## Vision

OpenFinClaw is a specialized finance-domain fork of OpenClaw, designed to be a proactive, intelligent financial butler and companion that manages users' complete financial lifecycle. It combines OpenClaw's powerful agent infrastructure with deep financial domain expertise.

## Core Capabilities

### 1. Finance-Domain Specialized Skills

Evolvable financial skills that grow with the user:
- Portfolio analysis and asset allocation
- Risk assessment and management
- Tax planning and optimization
- Budget tracking and expense analysis
- Financial goal planning and progress tracking
- Market research and due diligence

### 2. Proactive Financial Butler Service

Not just reactive — OpenFinClaw actively monitors and advises:
- Proactive alerts on portfolio risks and opportunities
- Scheduled financial health check-ups
- Automated reporting and summaries
- Smart reminders for financial deadlines (tax filing, bill payments, rebalancing)

### 3. Deep Financial Expert Integration (SDK Key)

Access to specialized financial intelligence via registered SDK keys:
- Professional-grade financial analysis models
- Institutional-level market data and insights
- Regulatory compliance checking
- Advanced quantitative analysis tools

### 4. Smart Information Flow (SDK Key)

Curated, real-time financial information streams:
- Market news and sentiment analysis
- Earnings reports and company fundamentals
- Macro-economic indicators and analysis
- Sector rotation and trend detection

### 5. Autonomous Trading via CCXT

Self-directed trading across major exchanges:
- **Hyperliquid** - Perpetuals and spot
- **Binance** - Full spot and derivatives
- **OKX** - Spot, futures, and options
- **Bybit** - Derivatives and spot

Features:
- Strategy execution and backtesting
- Risk-managed order placement
- Position monitoring and auto-rebalancing
- Cross-exchange arbitrage detection

### 6. User Memory-Driven Personalization

Deep user understanding that evolves over time:
- Financial profile and risk tolerance memory
- Investment preference learning
- Historical decision context retention
- Personalized advice based on accumulated knowledge
- Life-stage aware financial planning

## Architecture

```
OpenFinClaw = OpenClaw Core + Financial Domain Layer

OpenClaw Core (Agent Runtime, Channels, Memory, Plugins)
    |
    +-- Financial Skills Engine (evolvable skill plugins)
    +-- Financial Expert SDK (deep analysis, registered access)
    +-- Smart Info Flow SDK (curated intelligence, registered access)
    +-- CCXT Trading Bridge (Hyperliquid, Binance, OKX, Bybit)
    +-- User Financial Memory (persistent, personalized context)
    +-- Proactive Service Layer (monitoring, alerts, scheduling)
```

## Principles

- **User-first**: Every feature serves the user's financial wellbeing
- **Privacy by design**: Financial data stays under user control
- **Open source**: Core engine is open; premium data/expert access via SDK keys
- **Safety guardrails**: Trading operations require explicit user authorization
- **Evolvable**: Skills and capabilities grow through community and SDK ecosystem

## Roadmap

Phase 1 - Foundation:
- Fork OpenClaw core, establish openfinclaw.ai
- Implement base financial skill framework
- CCXT integration with basic trading capabilities

Phase 2 - Intelligence:
- Financial Expert SDK integration
- Smart Information Flow SDK
- User financial memory system

Phase 3 - Proactive:
- Proactive monitoring and alert engine
- Automated financial reporting
- Cross-exchange portfolio management

Phase 4 - Ecosystem:
- Community financial skill marketplace
- Third-party data provider integrations
- Advanced strategy backtesting and simulation
