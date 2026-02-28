import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { BacktestEngine } from "./src/backtest-engine.js";
import { createBollingerBands } from "./src/builtin-strategies/bollinger-bands.js";
import { createMacdDivergence } from "./src/builtin-strategies/macd-divergence.js";
import { createMultiTimeframeConfluence } from "./src/builtin-strategies/multi-timeframe-confluence.js";
import { createRegimeAdaptive } from "./src/builtin-strategies/regime-adaptive.js";
import { createRiskParityTripleScreen } from "./src/builtin-strategies/risk-parity-triple-screen.js";
import { createRsiMeanReversion } from "./src/builtin-strategies/rsi-mean-reversion.js";
import { createSmaCrossover } from "./src/builtin-strategies/sma-crossover.js";
import { createTrendFollowingMomentum } from "./src/builtin-strategies/trend-following-momentum.js";
import { createVolatilityMeanReversion } from "./src/builtin-strategies/volatility-mean-reversion.js";
import { StrategyRegistry } from "./src/strategy-registry.js";
import type { BacktestConfig, StrategyDefinition } from "./src/types.js";

type OhlcvBar = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const json = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  details: payload,
});

const plugin = {
  id: "fin-strategy-engine",
  name: "Strategy Engine",
  description: "Strategy lifecycle: indicators, backtest, walk-forward, evolution",
  kind: "financial" as const,
  register(api: OpenClawPluginApi) {
    const registryPath = api.resolvePath("state/fin-strategies.json");
    const registry = new StrategyRegistry(registryPath);
    const engine = new BacktestEngine();

    // Register services
    api.registerService({
      id: "fin-strategy-registry",
      start: () => {},
      instance: registry,
    } as Parameters<typeof api.registerService>[0]);

    api.registerService({
      id: "fin-backtest-engine",
      start: () => {},
      instance: engine,
    } as Parameters<typeof api.registerService>[0]);

    // --- fin_strategy_create ---
    api.registerTool(
      {
        name: "fin_strategy_create",
        label: "Create Strategy",
        description: "Create a new trading strategy from a built-in template or custom definition",
        parameters: Type.Object({
          name: Type.String({ description: "Strategy display name" }),
          type: Type.Unsafe<
            | "sma-crossover"
            | "rsi-mean-reversion"
            | "bollinger-bands"
            | "macd-divergence"
            | "trend-following-momentum"
            | "volatility-mean-reversion"
            | "regime-adaptive"
            | "multi-timeframe-confluence"
            | "risk-parity-triple-screen"
            | "custom"
          >({
            type: "string",
            enum: [
              "sma-crossover",
              "rsi-mean-reversion",
              "bollinger-bands",
              "macd-divergence",
              "trend-following-momentum",
              "volatility-mean-reversion",
              "regime-adaptive",
              "multi-timeframe-confluence",
              "risk-parity-triple-screen",
              "custom",
            ],
            description: "Strategy template type",
          }),
          parameters: Type.Optional(
            Type.Object(
              {},
              {
                additionalProperties: true,
                description: "Strategy parameters (e.g. fastPeriod, slowPeriod)",
              },
            ),
          ),
          symbols: Type.Optional(
            Type.Array(Type.String(), { description: "Trading pair symbols (e.g. BTC/USDT)" }),
          ),
          timeframes: Type.Optional(
            Type.Array(Type.String(), { description: "Timeframes (e.g. 1d, 4h)" }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          try {
            const name = params.name as string;
            const type = params.type as string;
            const stratParams = (params.parameters ?? {}) as Record<string, number>;
            const symbols = (params.symbols as string[] | undefined) ?? ["BTC/USDT"];
            const timeframes = (params.timeframes as string[] | undefined) ?? ["1d"];

            let definition: StrategyDefinition;

            if (type === "sma-crossover") {
              definition = createSmaCrossover(stratParams);
            } else if (type === "rsi-mean-reversion") {
              definition = createRsiMeanReversion(stratParams);
            } else if (type === "bollinger-bands") {
              definition = createBollingerBands(stratParams);
            } else if (type === "macd-divergence") {
              definition = createMacdDivergence(stratParams);
            } else if (type === "trend-following-momentum") {
              definition = createTrendFollowingMomentum(stratParams);
            } else if (type === "volatility-mean-reversion") {
              definition = createVolatilityMeanReversion(stratParams);
            } else if (type === "regime-adaptive") {
              definition = createRegimeAdaptive(stratParams);
            } else if (type === "multi-timeframe-confluence") {
              definition = createMultiTimeframeConfluence(stratParams);
            } else if (type === "risk-parity-triple-screen") {
              definition = createRiskParityTripleScreen(stratParams);
            } else {
              return json({ error: "Custom strategies are not yet supported via this tool" });
            }

            // Override metadata
            definition.id = `${type}-${Date.now()}`;
            definition.name = name;
            definition.symbols = symbols;
            definition.timeframes = timeframes;

            const record = registry.create(definition);

            return json({
              created: true,
              id: record.id,
              name: record.name,
              level: record.level,
              parameters: definition.parameters,
            });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_strategy_create"] },
    );

    // --- fin_strategy_list ---
    api.registerTool(
      {
        name: "fin_strategy_list",
        label: "List Strategies",
        description: "List registered trading strategies with their status and metrics",
        parameters: Type.Object({
          level: Type.Optional(
            Type.Unsafe<"L0_INCUBATE" | "L1_BACKTEST" | "L2_PAPER" | "L3_LIVE" | "KILLED">({
              type: "string",
              enum: ["L0_INCUBATE", "L1_BACKTEST", "L2_PAPER", "L3_LIVE", "KILLED"],
              description: "Filter by strategy level",
            }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          try {
            const level = params.level as string | undefined;
            const strategies = registry.list(level ? { level: level as "L0_INCUBATE" } : undefined);

            const summary = strategies.map((s) => ({
              id: s.id,
              name: s.name,
              level: s.level,
              version: s.version,
              lastBacktest: s.lastBacktest
                ? {
                    totalReturn: s.lastBacktest.totalReturn,
                    sharpe: s.lastBacktest.sharpe,
                    maxDrawdown: s.lastBacktest.maxDrawdown,
                    totalTrades: s.lastBacktest.totalTrades,
                  }
                : null,
              lastWalkForward: s.lastWalkForward
                ? { passed: s.lastWalkForward.passed, ratio: s.lastWalkForward.ratio }
                : null,
              updatedAt: new Date(s.updatedAt).toISOString(),
            }));

            return json({ total: summary.length, strategies: summary });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_strategy_list"] },
    );

    // --- fin_backtest_run ---
    api.registerTool(
      {
        name: "fin_backtest_run",
        label: "Run Backtest",
        description: "Run a backtest for a registered strategy using historical data",
        parameters: Type.Object({
          strategyId: Type.String({ description: "ID of the strategy to backtest" }),
          capital: Type.Optional(Type.Number({ description: "Initial capital (default 10000)" })),
          commission: Type.Optional(
            Type.Number({ description: "Commission rate as decimal (e.g. 0.001 = 0.1%)" }),
          ),
          slippage: Type.Optional(
            Type.Number({ description: "Slippage in basis points (e.g. 5 = 0.05%)" }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          try {
            const strategyId = params.strategyId as string;
            const record = registry.get(strategyId);
            if (!record) {
              return json({ error: `Strategy ${strategyId} not found` });
            }

            const config: BacktestConfig = {
              capital: (params.capital as number) ?? 10000,
              commissionRate: (params.commission as number) ?? 0.001,
              slippageBps: (params.slippage as number) ?? 5,
              market: record.definition.markets[0] ?? "crypto",
            };

            // Get data from the data provider service
            const runtime = api.runtime as unknown as { services?: Map<string, unknown> };
            const dataProvider = runtime.services?.get?.("fin-data-provider") as
              | {
                  getOHLCV?: (
                    paramsOrSymbol:
                      | {
                          symbol: string;
                          market: "crypto" | "equity" | "commodity";
                          timeframe: string;
                          limit?: number;
                          since?: number;
                        }
                      | string,
                    timeframe?: string,
                    limit?: number,
                  ) => Promise<OhlcvBar[]>;
                }
              | undefined;

            if (!dataProvider?.getOHLCV) {
              return json({
                error:
                  "Data provider (fin-data-bus) not available. Load the fin-data-bus plugin first.",
              });
            }

            const symbol = record.definition.symbols[0] ?? "BTC/USDT";
            const timeframe = record.definition.timeframes[0] ?? "1d";
            const getOHLCV = dataProvider.getOHLCV;
            const ohlcvData =
              getOHLCV.length <= 1
                ? await getOHLCV({
                    symbol,
                    market: config.market,
                    timeframe,
                    limit: 365,
                  })
                : await getOHLCV(symbol, timeframe, 365);

            const result = await engine.run(record.definition, ohlcvData, config);
            registry.updateBacktest(strategyId, result);

            return json({
              strategyId,
              totalReturn: `${result.totalReturn.toFixed(2)}%`,
              sharpe: result.sharpe.toFixed(3),
              sortino: result.sortino.toFixed(3),
              maxDrawdown: `${result.maxDrawdown.toFixed(2)}%`,
              winRate: `${result.winRate.toFixed(1)}%`,
              profitFactor: result.profitFactor.toFixed(2),
              totalTrades: result.totalTrades,
              finalEquity: result.finalEquity.toFixed(2),
            });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_backtest_run"] },
    );

    // --- fin_backtest_result ---
    api.registerTool(
      {
        name: "fin_backtest_result",
        label: "Backtest Result",
        description: "Retrieve the last backtest result for a strategy",
        parameters: Type.Object({
          strategyId: Type.String({ description: "ID of the strategy" }),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          try {
            const strategyId = params.strategyId as string;
            const record = registry.get(strategyId);
            if (!record) {
              return json({ error: `Strategy ${strategyId} not found` });
            }
            if (!record.lastBacktest) {
              return json({ error: `No backtest result for strategy ${strategyId}` });
            }

            const bt = record.lastBacktest;
            return json({
              strategyId,
              totalReturn: bt.totalReturn,
              sharpe: bt.sharpe,
              sortino: bt.sortino,
              maxDrawdown: bt.maxDrawdown,
              calmar: bt.calmar,
              winRate: bt.winRate,
              profitFactor: bt.profitFactor,
              totalTrades: bt.totalTrades,
              initialCapital: bt.initialCapital,
              finalEquity: bt.finalEquity,
              trades: bt.trades.slice(0, 50), // limit output
            });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_backtest_result"] },
    );
  },
};

export default plugin;
