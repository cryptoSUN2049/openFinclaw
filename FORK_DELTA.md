# FORK_DELTA.md — OpenFinClaw vs Upstream OpenClaw

**Last updated**: 2026-02-28
**Upstream merged**: 2026.2.25 (395 commits)

This document catalogs every OpenFinClaw-specific customization that diverges from upstream. Use it as a checklist when merging upstream changes.

---

## 1. Brand Customizations

| File                             | Our Value                               | Upstream Value                 |
| -------------------------------- | --------------------------------------- | ------------------------------ |
| `package.json` → name            | `openfinclaw`                           | `openclaw`                     |
| `package.json` → description     | AI-powered financial assistant gateway… | Multi-channel AI gateway…      |
| `package.json` → homepage        | `github.com/cryptoSUN2049/openFinclaw`  | `github.com/openclaw/openclaw` |
| `package.json` → keywords        | ai, ccxt, crypto, finance, gateway…     | `[]`                           |
| `package.json` → bin             | `openfinclaw: openfinclaw.mjs`          | `openclaw: openclaw.mjs`       |
| `package.json` → bugs/repository | cryptoSUN2049/openFinclaw               | openclaw/openclaw              |
| `openfinclaw.mjs`                | Custom CLI entry point                  | N/A (ours only)                |
| `README.md`                      | OpenFinClaw brand, features, roadmap    | OpenClaw docs                  |

## 2. Financial Extensions (15)

All in `extensions/fin-*/`, each with `devDependencies: { "openfinclaw": "workspace:*" }`.

| Extension              | Purpose                                                            | AI Tools |
| ---------------------- | ------------------------------------------------------------------ | -------- |
| `fin-core`             | Exchange registry, risk controller, CCXT bridge, SSE, events       | 0        |
| `fin-trading`          | Order execution with risk gates (Binance, OKX, Bybit, Hyperliquid) | 5        |
| `fin-portfolio`        | Balance aggregation, performance metrics, rebalancing              | 5        |
| `fin-market-data`      | Price feeds, OHLCV, market depth                                   | 4        |
| `fin-expert-sdk`       | Professional analysis API bridge                                   | 3        |
| `fin-info-feed`        | Market intelligence, sentiment, earnings data                      | 3        |
| `fin-monitoring`       | Price alerts, portfolio health checks, anomaly detection           | 4        |
| `fin-data-bus`         | Unified data provider, OHLCV cache, regime detection               | 3        |
| `fin-data-hub`         | External data source proxy (stock/crypto/macro/FX/derivatives)     | 7        |
| `fin-evolution-engine` | GEP gene evolution, LLM mutation, RDAVD fitness                    | 2        |
| `fin-fund-manager`     | Capital flow tracking, performance snapshots                       | 6        |
| `fin-openbb-data`      | OpenBB data bridge (162+ fetchers, 38+ providers)                  | 0        |
| `fin-paper-trading`    | Multi-market paper trading (US/HK/A-shares/Crypto)                 | 6        |
| `fin-strategy-engine`  | Strategy registry, backtesting engine, custom rule engine          | 4        |
| `fin-strategy-memory`  | Strategy persistence, time-decayed fitness scoring                 | 4        |
| `fin-shared-types`     | Cross-extension shared types (OHLCV, StrategyDefinition, etc.)     | 0        |

**Total AI tools**: 56

## 3. Financial Skills (9)

All in `skills/fin-*/SKILL.md` — runtime-discoverable skill definitions.

| Skill             | Purpose                                  |
| ----------------- | ---------------------------------------- |
| `fin-alerts`      | Real-time alerts, price triggers         |
| `fin-budget`      | Budgeting, spending analysis, cash flow  |
| `fin-expert`      | Institutional-grade analysis             |
| `fin-market-data` | Market data queries, technical analysis  |
| `fin-portfolio`   | Portfolio analysis, rebalancing          |
| `fin-report`      | Automated daily/weekly/monthly reports   |
| `fin-screener`    | Security screening, quantitative ranking |
| `fin-trading`     | Trade execution, order management        |
| `fin-watchlist`   | Custom watchlist management              |

## 4. Financial Configuration

| File                                  | Purpose                                                           |
| ------------------------------------- | ----------------------------------------------------------------- |
| `src/config/types.financial.ts`       | `FinancialConfig`, `ExchangeAccountConfig`, `TradingConfig` types |
| `src/config/zod-schema.financial.ts`  | Zod validation with sensitive field masking                       |
| `src/commands/configure.financial.ts` | Interactive exchange + trading risk config wizard                 |

## 5. Core Integration Points

| File                   | Change                                                            |
| ---------------------- | ----------------------------------------------------------------- |
| `src/config/types.ts`  | `export * from "./types.financial.js"` — financial types exported |
| `tsconfig.json` paths  | Dual aliases: `openfinclaw/plugin-sdk` + `openclaw/plugin-sdk`    |
| `package.json` exports | `./plugin-sdk`, `./plugin-sdk/account-id`, `./cli-entry`          |

## 6. Deploy Configuration

| Path                              | Purpose                         |
| --------------------------------- | ------------------------------- |
| `deploy/Dockerfile.gateway`       | Multi-stage gateway build       |
| `deploy/docker-compose.local.yml` | Local dev (gateway + Redis)     |
| `deploy/docker-compose.test.yml`  | Test environment                |
| `deploy/docker-compose.prd.yml`   | Production                      |
| `deploy/config/finclaw.*.json`    | Gateway configs per environment |
| `deploy/scripts/`                 | Deployment scripts              |
| `deploy/.env.example`             | Environment variable reference  |

## 7. FinClaw Commons

| Path                                 | Purpose                                                             |
| ------------------------------------ | ------------------------------------------------------------------- |
| `commons/index.json`                 | Central registry (8 entries)                                        |
| `commons/skills/fin-*/`              | 7 community skills (DCA, tax, risk, news, backtest, onchain, macro) |
| `commons/templates/finclaw-starter/` | Starter workspace template                                          |
| `commons/dashboard/`                 | HTML dashboard generator                                            |
| `commons/fcs/`                       | FinClaw Score system                                                |
| `commons/site/`                      | Static browsing site                                                |

## 8. UI Extensions

| Path                                            | Purpose                               |
| ----------------------------------------------- | ------------------------------------- |
| `ui/src/ui/views/exchanges.ts`                  | Exchanges management view (337 lines) |
| `ui/src/ui/controllers/exchanges.ts`            | Controller bridging to config RPC     |
| `ui/src/ui/app-render.ts`                       | Exchanges tab rendering               |
| `ui/src/ui/navigation.ts`                       | Exchanges tab in nav                  |
| `ui/src/i18n/locales/{en,zh-CN,zh-TW,pt-BR}.ts` | i18n strings                          |

## 9. Extension devDeps Pattern

All `extensions/*/package.json` (upstream + ours) include:

```json
{
  "devDependencies": {
    "openfinclaw": "workspace:*"
  }
}
```

This enables local development with our package name. Must be restored after every upstream merge.

## 10. Merge Checklist

When merging upstream, restore these after conflict resolution:

- [ ] `package.json` — name, description, homepage, keywords, bin, bugs, repository
- [ ] `README.md` — OpenFinClaw brand sections (keep upstream doc links if useful)
- [ ] `openfinclaw.mjs` — must not be deleted
- [ ] All `extensions/*/package.json` — re-add `"openfinclaw": "workspace:*"` devDep
- [ ] `pnpm-lock.yaml` — delete conflicted version, run `pnpm install`
- [ ] `tsconfig.json` paths — verify dual `openfinclaw/` + `openclaw/` aliases
- [ ] `src/config/types.ts` — verify `export * from "./types.financial.js"` present
- [ ] Fix any upstream API changes in `extensions/fin-*` (check `pnpm tsgo`)
- [ ] Run `pnpm format:fix` then `pnpm check` to verify

## 11. Environment Variables

- Primary: `OPENFINCLAW_*`
- Fallback: `OPENCLAW_*`
- Financial: `FINANCE_ENABLED`, exchange API keys in config

---

**File count**: ~200+ OpenFinClaw-specific files across 15 extensions (56 AI tools), 9 skills, config, UI, commons, and deploy.
