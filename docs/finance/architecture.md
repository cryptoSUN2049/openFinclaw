# OpenFinClaw Financial Architecture

## Overview

OpenFinClaw extends the OpenClaw AI gateway with a plugin-based financial layer.
All financial capabilities live in `extensions/fin-*` workspace packages — **zero
modifications** to core OpenClaw logic. The only core touch-points are two
append-only config files (`types.financial.ts`, `zod-schema.financial.ts`) that
export optional financial types.

---

## Extension Topology

14 extensions under `extensions/fin-*/`, each a standalone workspace package with
`devDependencies: { "openfinclaw": "workspace:*" }`.

| Extension              | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `fin-core`             | Gateway plugin: exchange registry, risk controller, dashboards, SSE API |
| `fin-data-bus`         | Unified data provider, OHLCV cache (SQLite), regime detection           |
| `fin-data-hub`         | Data hub integration layer                                              |
| `fin-strategy-engine`  | Strategy registry, backtesting engine, walk-forward validation          |
| `fin-strategy-memory`  | Strategy persistence, time-decayed fitness scoring                      |
| `fin-paper-trading`    | Multi-market paper trading (US/HK/A-shares/Crypto)                      |
| `fin-fund-manager`     | Capital flow tracking, performance snapshots, rebalancing               |
| `fin-evolution-engine` | GEP gene evolution, LLM mutation, RDAVD fitness (WIP)                   |
| `fin-market-data`      | Price feeds, OHLCV, market depth via LLM tools                          |
| `fin-trading`          | CCXT bridge for real order execution (Binance, OKX, Bybit, Hyperliquid) |
| `fin-portfolio`        | Balance aggregation, performance metrics                                |
| `fin-expert-sdk`       | Professional / institutional analysis API bridge                        |
| `fin-info-feed`        | Market intelligence, sentiment, earnings data                           |
| `fin-monitoring`       | Price alerts, portfolio health checks, anomaly detection                |

---

## Data Flow

```
                        +-----------------+
                        |  Market Sources  |
                        | (Exchanges, APIs)|
                        +--------+--------+
                                 |
                    OHLCV / ticks / depth
                                 v
                     +-----------+-----------+
                     |     fin-data-bus       |
                     | (OHLCV cache, regime)  |
                     +-----------+-----------+
                                 |
              +------------------+------------------+
              |                                     |
              v                                     v
   +----------+----------+              +-----------+-----------+
   |  fin-strategy-engine |              |   fin-market-data     |
   | (backtest, signals)  |              | (LLM tool responses)  |
   +----------+----------+              +-----------------------+
              |
         signals / orders
              v
   +----------+----------+
   |  fin-paper-trading   |
   | (simulated fills)    |
   +----------+----------+
              |
       equity snapshots
              v
   +----------+----------+
   |  fin-fund-manager    |
   | (NAV, rebalancing)   |
   +----------+----------+
              |
       performance data
              v
   +----------+----------+
   |      fin-core        |
   | (Dashboard + SSE)    |
   +----------------------+
```

---

## Configuration

Financial config lives in `src/config/types.financial.ts` under the
`FinancialConfig` type, validated by `src/config/zod-schema.financial.ts`.

Key sections:

| Config Key     | Type                      | Purpose                                            |
| -------------- | ------------------------- | -------------------------------------------------- |
| `exchanges`    | `ExchangeAccountConfig[]` | API keys, sandbox flags per exchange               |
| `trading`      | `TradingConfig`           | Risk gates: max auto-trade, daily loss, leverage   |
| `paperTrading` | `PaperTradingConfig`      | Initial capital, slippage, market rules per market |
| `fund`         | `FundConfig`              | Fund name, base currency, rebalance interval       |
| `backtest`     | `BacktestConfig`          | Default lookback, commission, slippage             |
| `evolution`    | `EvolutionConfig`         | Population size, mutation rate, fitness weights    |
| `equity`       | `EquityConfig`            | Equity-specific settings                           |
| `commodity`    | `CommodityConfig`         | Commodity market settings                          |
| `expertSdk`    | `ExpertSdkConfig`         | External analysis API credentials                  |
| `infoFeedSdk`  | `InfoFeedSdkConfig`       | News / sentiment feed credentials                  |

All fields are optional; the system runs with sensible defaults when unconfigured.

---

## Testing

Three test layers, each progressively closer to production:

### Unit Tests

```bash
pnpm test                 # vitest, colocated *.test.ts
pnpm test:coverage        # with V8 coverage (70% threshold)
```

### Rendering E2E

```bash
pnpm test:e2e             # mock Gateway server, vmForks pool
```

Dashboard HTML files are rendered against a mock server and validated for
structure and content.

### Integration E2E

```bash
pnpm test:e2e:integration # real Gateway instance, forks pool
```

Full end-to-end with a live Gateway process. Tests live in `test/*.e2e.test.ts`.

---

## State Files

Runtime state is persisted under `~/.openfinclaw/state/`:

| File                       | Format | Contents                                         |
| -------------------------- | ------ | ------------------------------------------------ |
| `pipeline-paper.sqlite`    | SQLite | Paper trading accounts, orders, equity snapshots |
| `pipeline-ohlcv.sqlite`    | SQLite | OHLCV price cache                                |
| `pipeline-strategies.json` | JSON   | Strategy registry (definitions + metadata)       |
| `agent-events.sqlite`      | SQLite | Agent event log (used by fin-core SSE)           |

Schema definitions:

- Paper trading: `extensions/fin-paper-trading/src/paper-store.ts`
- OHLCV cache: `extensions/fin-data-bus/src/ohlcv-cache.ts`
- Agent events: `extensions/fin-core/src/agent-event-sqlite-store.ts`

---

## Plugin Registration

Each extension exports a plugin object following the OpenClaw plugin API:

```typescript
const plugin = {
  id: "fin-core",
  name: "Financial Core",
  kind: "financial",
  register(api: OpenClawPluginApi) {
    // register tools, routes, event handlers
  },
};
export default plugin;
```

`fin-core` acts as the hub — it maintains a registry of all loaded financial
plugins (`FINANCIAL_PLUGIN_IDS`) and provides shared infrastructure
(ExchangeRegistry, RiskController) consumed by downstream extensions.

---

## Core Invasiveness

Only two core files are modified (append-only, optional fields):

- `src/config/types.ts` — re-exports `types.financial.ts`
- `src/config/zod-schema.financial.ts` — Zod schema with sensitive field masking

Everything else is additive: new `extensions/`, `skills/`, `commons/`, and UI
views. This keeps upstream merges clean and conflicts minimal.
