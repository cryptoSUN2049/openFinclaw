# OpenFinclaw Finance Review & Test Checklist

Last updated: 2026-02-27
Owner: **\_\_\_\_**
Branch/Commit: **\_\_\_\_**
Environment: **\_\_\_\_**

## Scope

- Finance config + schema: `src/config/types.financial.ts`, `src/config/zod-schema.financial.ts`, `src/commands/configure.financial.ts`
- Finance extensions: `extensions/fin-*`
- Integration layers:
  - UI/UX (CLI wizard + plugin dashboard routes)
  - Backend capability (tool/service behavior)
  - Data path (config -> services -> tools -> response)
  - Scenario path (market data -> strategy -> paper/live -> fund/risk/monitoring)

## Preflight (Must Pass Before Functional Testing)

- [x] Runtime is Node `>=22` (`node -v`)
- [ ] `pnpm install` completed with no missing deps
- [x] `ccxt` available for trading/data extensions
- [ ] Test profile selected (`OPENCLAW_TEST_PROFILE=low` on low-memory hosts)
- [x] Confirm writable state dirs (`state/`, plugin temp paths)
      Note: root `import("ccxt")` resolution differs by workspace layout; runtime fallback now resolves via `extensions/fin-core`.
- [x] Finance env var validation and deployment checks run via `uv`

## Test Execution Log (Fill As You Run)

- [x] `pnpm exec vitest run --config vitest.config.ts src/config/zod-schema.financial.test.ts`
- [x] `pnpm exec vitest run --config vitest.config.ts $(rg --files extensions/fin-* | rg '\\.test\\.ts$' | tr '\\n' ' ') src/config/zod-schema.financial.test.ts`
- [x] Re-run full finance suite on Node 22+ (required for `node:sqlite` suites)
- [x] `pnpm exec vitest run --config vitest.config.ts extensions/fin-core/index.test.ts extensions/fin-monitoring/index.test.ts extensions/fin-expert-sdk/index.test.ts extensions/fin-info-feed/index.test.ts extensions/fin-fund-manager/index.test.ts src/commands/configure.financial.test.ts`
- [x] Full Node22 finance verification result: `46 files / 500 tests passed`
- [x] Full Node22 finance verification (env fallback + uv env-check updates): `46 files / 503 tests passed`
- [x] `uv run scripts/finance/check_finance_env.py --env-file .env.finance.example --strict-file`
- [x] `pnpm finance:env:check` (uses `UV_CACHE_DIR=${UV_CACHE_DIR:-.uv-cache} uv run ...`)
- [x] Live E2E (real Binance testnet): `pnpm exec vitest run --config vitest.live.config.ts extensions/fin-trading/src/ccxt-bridge.live.test.ts --reporter verbose --testTimeout 30000 --hookTimeout 30000 --maxWorkers=1`
- [x] Live E2E (real Binance testnet): `pnpm exec vitest run --config vitest.live.config.ts extensions/fin-paper-trading/src/paper-engine.live.test.ts --reporter verbose --testTimeout 30000 --hookTimeout 30000 --maxWorkers=1`
- [x] Live E2E (real Binance testnet): `pnpm exec vitest run --config vitest.live.config.ts extensions/fin-strategy-engine/src/backtest-engine.live.test.ts extensions/fin-strategy-engine/src/full-pipeline.live.test.ts --reporter verbose --testTimeout 30000 --hookTimeout 30000 --maxWorkers=1`
- [x] Live E2E (LLM + finance tool + real Binance): `pnpm exec vitest run --config vitest.live.config.ts extensions/fin-market-data/src/llm-finance-pipeline.live.test.ts --reporter verbose --testTimeout 45000 --hookTimeout 30000 --maxWorkers=1`
- [x] Live test卡点定位：此前误用 `vitest.config.ts`（排除 `*.live.test.ts`），导致 `No test files found`
- [x] Live test卡点定位：Binance testnet `/api/v3/account` 偶发 `RequestTimeout(10000ms)`，`CcxtBridge` 读接口已加 1 次轻量重试并复测通过
- [x] Live 稳定性复测：`ccxt-bridge.live.test.ts` 连续 3 轮（真实 testnet）全部通过，单轮约 4~5s
- [x] 修复后全链路复测（真实 testnet）：`ccxt-bridge` + `paper-engine` + `strategy-engine` live 全部通过（28 tests）
- [x] LLM 工具调用卡点定位：当前 `openai-responses` 路径在该 key/endpoint 下无法稳定产出 `toolCall`；切换兼容模式 `openai-completions` 后通过
- [x] 一键全链路 live 回归（含 LLM）：5 files / 29 tests 全通过（约 22.6s）
- [ ] `pnpm tsgo` (or targeted typecheck) after fixes
      Note: currently blocked by unrelated existing type error in `extensions/bluebubbles/src/monitor.test.ts`.

## Layer 1: UI/UX Checklist

- [ ] `configure` wizard shows Finance section and enters/exits normally
- [ ] Exchange add/remove flow validates alias/input formats correctly
- [x] Risk prompt defaults are aligned with schema defaults and product copy
- [x] Wizard docs link resolves to an existing docs page
- [x] Clear user feedback for missing `ccxt` / connection test failures
- [x] Plugin dashboard route `/dashboard/fund` renders with valid data
- [x] HTTP API routes under `/api/v1/fund/*` return valid JSON shape
- [x] Dedicated finance management dashboard route available (`/dashboard/finance`)
- [x] Finance config API route available (`/api/v1/finance/config`)

## Layer 2: Backend Capability Checklist

- [x] `fin-core` service boot: exchange registry + risk controller available
- [x] `fin-data-bus` tools return stable outputs (`fin_data_ohlcv`, `fin_data_regime`, `fin_data_markets`)
- [x] `fin-market-data` tools handle empty/default exchange and error propagation correctly
- [x] `fin-trading` tools enforce risk tiers correctly (`auto/confirm/reject`)
- [x] `fin_modify_order` preserves original order intent (side/type) when replacing
- [x] `fin-portfolio` aggregation/positions/history tools return coherent metrics
- [x] `fin-monitoring` alert lifecycle works (`set/list/remove`)
- [x] `fin-paper-trading` account/order/metrics tools reflect configured paper params
- [x] `fin-strategy-engine` create/list/backtest/result tools run with real data-provider contract
- [x] `fin-strategy-memory` hooks/tools correctly record and summarize trade memory
- [x] `fin-fund-manager` allocate/rebalance/risk/leaderboard/promotion outputs are consistent
- [x] `fin-expert-sdk` and `fin-info-feed` either provide real API integration or explicit feature-flagged stub behavior

## Layer 3: Data Path (Frontend/Backend + Service Wiring)

- [ ] `financial` config writes survive round-trip (`configure` -> config file -> runtime read)
- [x] `financial.trading` values are consumed by `fin-core` risk controller
- [x] `financial.paperTrading` values are consumed by `fin-paper-trading` with matching key names
- [x] Service dependency chain is valid at runtime:
- [x] `fin-core` -> `fin-data-bus` -> `fin-strategy-engine`
- [x] `fin-core` -> `fin-trading`/`fin-portfolio`
- [x] `fin-paper-trading` + `fin-strategy-engine` -> `fin-fund-manager`
- [x] Missing dependency cases return actionable errors (not silent failures)
- [x] Plugin enablement path documented and validated (`plugins.entries.<id>.enabled`)
- [x] Plugin config env var fallback validated (`fin-expert-sdk`, `fin-info-feed`, `fin-monitoring`)

## Layer 4: Scenario Capability (End-to-End)

- [x] Scenario A: "Query market" (`fin_market_price`/`fin_market_overview`) end-to-end
- [x] Scenario B: "Risk-gated order" (`fin_place_order`) with `auto`, `confirm`, `reject`
- [x] Scenario C: "Portfolio snapshot" across multiple exchanges
- [x] Scenario D: "Set alert + trigger evaluation" (or scheduled simulation)
- [x] Scenario E: "Create strategy -> run backtest -> inspect result"
- [x] Scenario F: "Paper account -> submit orders -> metrics/decay"
- [x] Scenario G: "Fund rebalance -> risk status -> leaderboard update"
- [x] Scenario H: "Memory feedback loop" (trade recorded -> summary -> constraints applied)
- [x] Scenario I: "LLM -> fin_market_price tool call -> grounded summary" (real key + real Binance testnet)

## Non-Functional Checklist

- [ ] Security: credentials never printed in plain logs/tool responses
- [ ] Security: trading disabled default verified in fresh config
- [ ] Reliability: extension startup and service registration order is deterministic
- [ ] Reliability: state persistence/reload works after process restart
- [ ] Performance: large ticker/orderbook payloads within acceptable latency
- [ ] Observability: key finance actions emit debuggable logs and clear errors

## Known Gaps Found In This Review (Track to Closure)

- [x] Gap-01: `configure.financial` docs link points to non-existent page
- [x] Gap-02: Wizard risk defaults diverge from schema defaults
- [x] Gap-03: `fin-paper-trading` reads config keys not present in `financial.paperTrading` schema
- [x] Gap-04: `fin-strategy-engine` data-provider call contract mismatches `fin-data-bus` provider signature
- [x] Gap-05: `fin_modify_order` replacement hardcodes `side: "buy"`
- [x] Gap-06: Web control UI currently has no dedicated finance/exchange management view
- [x] Gap-07: `fin-expert-sdk` / `fin-info-feed` still stubbed (no real backend integration)
- [x] Gap-08: `fin-monitoring` scheduler wiring still TODO
- [x] Gap-09: Binance testnet 账户接口偶发超时导致 live 测试抖动
- [x] Gap-10: 当前 LLM endpoint 在 `openai-responses` 模式下 tool-calling 不稳定/不可用

## Release Gate (Finance)

- [x] All Gap-\* items triaged (fixed or accepted with explicit rationale)
- [x] Finance tests green on Node 22+
- [x] Critical scenario tests (A/B/C/E/F/G) pass
- [ ] Docs updated for setup + plugin enablement + supported/unsupported capabilities
- [ ] Sign-off from product + engineering owner
