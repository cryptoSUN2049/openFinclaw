<div align="center">

<img src="https://img.shields.io/badge/OpenFinClaw-Finance_AI_Companion-0066FF?style=for-the-badge&logoColor=white" alt="OpenFinClaw" height="40">

# OpenFinClaw

### Your Open-Source Financial AI Companion

**The first open-source, self-evolving, user-owned financial AI butler for your entire financial lifecycle.**

<p>
  <a href="./README.md"><img alt="English" src="https://img.shields.io/badge/English-blue?style=flat-square"></a>
  <a href="./README.zh-CN.md"><img alt="简体中文" src="https://img.shields.io/badge/简体中文-blue?style=flat-square"></a>
  <a href="./README.ja.md"><img alt="日本語" src="https://img.shields.io/badge/日本語-blue?style=flat-square"></a>
</p>

<p>
  <a href="https://github.com/cryptoSUN2049/openFinclaw/stargazers"><img src="https://img.shields.io/github/stars/cryptoSUN2049/openFinclaw?style=flat-square&logo=github" alt="Stars"></a>
  <a href="https://github.com/cryptoSUN2049/openFinclaw/network/members"><img src="https://img.shields.io/github/forks/cryptoSUN2049/openFinclaw?style=flat-square&logo=github" alt="Forks"></a>
  <a href="https://github.com/cryptoSUN2049/openFinclaw/issues"><img src="https://img.shields.io/github/issues/cryptoSUN2049/openFinclaw?style=flat-square" alt="Issues"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="MIT License"></a>
</p>

<p>
  <a href="https://openfinclaw.ai">Website</a> ·
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="https://github.com/openclaw/openclaw">Upstream: OpenClaw</a>
</p>

</div>

---

## What is OpenFinClaw?

OpenFinClaw is a **finance-domain specialization** of [OpenClaw](https://github.com/openclaw/openclaw), the powerful open-source personal AI assistant. We build on OpenClaw's battle-tested agent infrastructure — always-on gateway, 25+ messaging channels, plugin system, vector memory, and multi-model support — and add a deep financial intelligence layer on top.

**Our mission**: Give every individual an AI financial companion that is proactive, private, ever-evolving, and truly yours.

```
Traditional Finance Tools        OpenFinClaw
─────────────────────────        ───────────────────────────
You query, it responds    →      It watches, it learns, it acts
One-size-fits-all advice  →      Deeply personalized to YOUR life
Data locked in silos      →      Your data, your device, your rules
Static features           →      Self-evolving financial skills
Fragmented tools          →      Unified lifecycle companion
```

## Why OpenFinClaw?

In 2026, AI agents are transitioning from "tools you invoke" to "companions that live alongside you." Financial life — investing, budgeting, tax planning, trading, retirement — is too complex and too personal for generic chatbots or static dashboards.

OpenFinClaw is different:

- **Always-on** — Runs 24/7 on your device via OpenClaw's Gateway. Global markets never sleep, neither does your financial companion.
- **Self-evolving** — Agent writes its own new skills at runtime (JIT plugin hot-loading). Market changed? Your agent adapts in minutes, not months.
- **Memory-driven** — Four-layer context system (Soul → Tools → User → Session) means it remembers your risk tolerance, past decisions, and financial goals across every conversation.
- **Private by design** — All data stays on your device. Vector memory, trading credentials, financial history — nothing leaves unless you choose.
- **Open source** — No vendor lock-in. Audit the code. Fork it. Extend it. This is your financial sovereignty.

## Features

### Core Financial Capabilities

| Feature | Description | Status |
|---------|-------------|--------|
| **Evolvable Financial Skills** | Self-improving skill plugins for portfolio analysis, risk assessment, tax optimization, budgeting, and more. Skills grow and adapt over time. | Planned |
| **Proactive Financial Butler** | Not just reactive — monitors markets, schedules health checks, sends predictive alerts, generates automated reports. | Planned |
| **Autonomous Trading (CCXT)** | Execute trades across Hyperliquid, Binance, OKX, Bybit with human-in-the-loop safety guardrails. | Planned |
| **Deep Financial Expert SDK** | Professional-grade analysis, institutional-level insights, and quantitative tools via registered SDK keys. | Planned |
| **Smart Information Flow SDK** | Curated real-time market intelligence, sentiment analysis, earnings data, and macro indicators. | Planned |
| **User Memory Engine** | Remembers your financial profile, risk tolerance, investment preferences, and decision history. Gets smarter with every interaction. | Planned |

### Advanced Intelligence

| Feature | Description | Status |
|---------|-------------|--------|
| **Self-Review Engine** | After every trade/decision, automatically reviews outcomes vs. expectations, identifies cognitive biases, and updates its own decision parameters. | Planned |
| **Predictive Alerts** | Goes beyond price alerts — detects whale movements, correlates historical patterns, predicts budget overruns based on spending behavior. | Planned |
| **Behavioral Finance Guard** | Detects emotional trading patterns (revenge trading, FOMO, panic selling) and provides calm, evidence-based guidance. | Planned |
| **Financial Digital Twin** | Simulates your complete financial future — "What if I buy this house?", "When can I retire?", "How does this investment change my 10-year outlook?" | Planned |
| **Multi-Agent Financial Team** | Researcher, Trader, Risk Officer, and Compliance Auditor — each with their own personality, permissions, and memory, working together as your personal financial team. | Planned |
| **Regulatory Compliance Autopilot** | Automated tax event tracking, large-position reporting, cross-border compliance checks (CRS/FATCA), and audit trail generation. | Planned |

### Powered by OpenClaw

All of the above is built on OpenClaw's proven infrastructure:

- **25+ Messaging Channels** — WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams, and more
- **Always-on Gateway** — 7x24 daemon process with hot-reload, no restarts needed
- **Pi Primitives Engine** — 4 core primitives (Read/Write/Edit/Bash) + LLM = infinite composability
- **JIT Plugin System** — Agent can write and hot-load new TypeScript plugins at runtime
- **Vector Memory** — sqlite-vec based hybrid search (semantic + keyword) for long-term memory
- **Multi-Model Support** — Claude, GPT, Gemini, Ollama, and 10+ providers with automatic failover
- **5-Layer Security** — Network → Auth → Channel → Execution → Device, with human-in-the-loop approval
- **Browser Automation** — Playwright-based, headless + extension relay for sites without APIs

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    OpenFinClaw                                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Financial Intelligence Layer               │  │
│  │                                                        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │  │
│  │  │Financial │ │ Proactive│ │  Trading │ │  Self-   │ │  │
│  │  │  Skills  │ │  Butler  │ │  Bridge  │ │  Review  │ │  │
│  │  │  Engine  │ │  Service │ │  (CCXT)  │ │  Engine  │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │  │
│  │  │ Expert   │ │  Smart   │ │Behavioral│ │Financial │ │  │
│  │  │   SDK    │ │Info Flow │ │  Guard   │ │  Memory  │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │  │
│  └────────────────────────────────────────────────────────┘  │
│                            │                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              OpenClaw Core Infrastructure               │  │
│  │                                                        │  │
│  │  Gateway · Agent Runtime · Channels · Memory · Plugins │  │
│  │  Security · Cron · Browser · Models · CLI · Mobile     │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
        │  CEX/DEX  │  │  TradFi   │  │  Personal │
        │ Exchanges │  │  Markets  │  │  Finance  │
        └───────────┘  └───────────┘  └───────────┘
```

## Supported Exchanges (via CCXT)

| Exchange | Spot | Futures | Options | Status |
|----------|------|---------|---------|--------|
| Hyperliquid | Yes | Yes | - | Planned |
| Binance | Yes | Yes | Yes | Planned |
| OKX | Yes | Yes | Yes | Planned |
| Bybit | Yes | Yes | - | Planned |
| _More via CCXT..._ | - | - | - | Future |

## Quick Start

> OpenFinClaw is in early development. Star and watch this repo to follow our progress.

```bash
# Prerequisites: Node >= 22
git clone https://github.com/cryptoSUN2049/openFinclaw.git
cd openFinclaw
pnpm install
```

## Roadmap

### Phase 1 — Foundation `Q1 2026`
- [x] Fork OpenClaw core, establish project vision
- [ ] Financial skill plugin framework
- [ ] CCXT trading bridge (Hyperliquid, Binance, OKX, Bybit)
- [ ] Basic portfolio tracking and reporting
- [ ] User financial profile memory system

### Phase 2 — Intelligence `Q2 2026`
- [ ] Deep Financial Expert SDK integration
- [ ] Smart Information Flow SDK
- [ ] Self-review engine (trade journaling + cognitive bias detection)
- [ ] Predictive alert system
- [ ] Behavioral finance guard

### Phase 3 — Proactive `Q3 2026`
- [ ] Proactive monitoring and alert engine
- [ ] Automated financial reporting (daily/weekly/monthly)
- [ ] Cross-exchange portfolio management
- [ ] Financial digital twin simulation
- [ ] Multi-agent financial team

### Phase 4 — Ecosystem `Q4 2026`
- [ ] Community financial skill marketplace
- [ ] Third-party data provider integrations
- [ ] DeFi cross-chain operations
- [ ] Regulatory compliance autopilot
- [ ] Advanced strategy backtesting and simulation

## Principles

1. **User-first** — Every feature serves the user's financial wellbeing, not engagement metrics.
2. **Privacy by design** — Financial data stays on your device. Period.
3. **Open source** — Core engine is open. Premium data/expert access available via SDK keys.
4. **Safety guardrails** — Trading operations always require explicit user authorization. No silent trades.
5. **Evolvable** — Skills and capabilities grow through community contribution and self-improvement.
6. **Transparency** — Show reasoning, not just results. Users should understand why a recommendation is made.

## Acknowledgments

OpenFinClaw is proudly built on top of [**OpenClaw**](https://github.com/openclaw/openclaw), created by [Peter Steinberger](https://github.com/steipete) and the OpenClaw community. We are deeply grateful for their vision of an open, privacy-respecting, always-on AI assistant — it provides the perfect foundation for a financial AI companion.

This project follows the spirit of open source: we build upon the shoulders of giants, contribute back to the ecosystem, and keep our work open for others to build upon.

**Upstream**: [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw) · [openclaw.ai](https://openclaw.ai) · [docs.openclaw.ai](https://docs.openclaw.ai)

## Contributing

OpenFinClaw is an open community project. We welcome contributions of all kinds:

- **Financial Skills** — Build and share skill plugins for specific financial domains
- **Exchange Integrations** — Help expand CCXT bridge coverage
- **Data Connectors** — Connect new financial data sources
- **Documentation** — Improve guides, tutorials, and translations
- **Bug Reports** — Help us find and fix issues

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Community

- GitHub Issues: [Report bugs & request features](https://github.com/cryptoSUN2049/openFinclaw/issues)
- GitHub Discussions: [Ask questions & share ideas](https://github.com/cryptoSUN2049/openFinclaw/discussions)

<!--
## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=cryptoSUN2049/openFinclaw&type=Date)](https://star-history.com/#cryptoSUN2049/openFinclaw&Date)
-->

## License

[MIT License](LICENSE) — same as upstream OpenClaw.

---

<div align="center">

**Built with love on [OpenClaw](https://github.com/openclaw/openclaw)** · **Your finances, your data, your rules.**

</div>
