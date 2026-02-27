import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { ExchangeRegistry } from "./src/exchange-registry.js";
import { RiskController } from "./src/risk-controller.js";
import type { ExchangeConfig, TradingRiskConfig } from "./src/types.js";

export { ExchangeRegistry } from "./src/exchange-registry.js";
export { RiskController } from "./src/risk-controller.js";
export * from "./src/types.js";

const DEFAULT_RISK_CONFIG: TradingRiskConfig = {
  enabled: false,
  maxAutoTradeUsd: 100,
  confirmThresholdUsd: 500,
  maxDailyLossUsd: 1000,
  maxPositionPct: 25,
  maxLeverage: 1,
};

const FINANCIAL_PLUGIN_IDS = [
  "fin-core",
  "fin-data-bus",
  "fin-market-data",
  "fin-trading",
  "fin-portfolio",
  "fin-monitoring",
  "fin-paper-trading",
  "fin-strategy-engine",
  "fin-strategy-memory",
  "fin-fund-manager",
  "fin-expert-sdk",
  "fin-info-feed",
] as const;

const finCorePlugin = {
  id: "fin-core",
  name: "Financial Core",
  description: "Core financial infrastructure: exchange registry, risk controller, shared types",
  kind: "financial" as const,

  register(api: OpenClawPluginApi) {
    const registry = new ExchangeRegistry();

    // Pre-load exchanges from config so they're available immediately.
    const financialConfig = api.config?.financial;
    if (financialConfig?.exchanges) {
      for (const [name, cfg] of Object.entries(financialConfig.exchanges)) {
        registry.addExchange(name, cfg as ExchangeConfig);
      }
    }

    // Apply configured risk limits, falling back to safe defaults.
    const tradingCfg = financialConfig?.trading;
    const riskConfig: TradingRiskConfig = {
      ...DEFAULT_RISK_CONFIG,
      ...(tradingCfg?.enabled != null && { enabled: tradingCfg.enabled }),
      ...(tradingCfg?.maxAutoTradeUsd != null && { maxAutoTradeUsd: tradingCfg.maxAutoTradeUsd }),
      ...(tradingCfg?.confirmThresholdUsd != null && {
        confirmThresholdUsd: tradingCfg.confirmThresholdUsd,
      }),
      ...(tradingCfg?.maxDailyLossUsd != null && { maxDailyLossUsd: tradingCfg.maxDailyLossUsd }),
      ...(tradingCfg?.maxPositionPct != null && { maxPositionPct: tradingCfg.maxPositionPct }),
      ...(tradingCfg?.maxLeverage != null && { maxLeverage: tradingCfg.maxLeverage }),
      ...(tradingCfg?.allowedPairs && { allowedPairs: tradingCfg.allowedPairs }),
      ...(tradingCfg?.blockedPairs && { blockedPairs: tradingCfg.blockedPairs }),
    };
    const riskController = new RiskController(riskConfig);

    // Expose services for other fin-* plugins to consume.
    // The registry handles optional `instance` at runtime — cast to satisfy the type.
    api.registerService({
      id: "fin-exchange-registry",
      start: () => {},
      instance: registry,
    } as Parameters<typeof api.registerService>[0]);

    api.registerService({
      id: "fin-risk-controller",
      start: () => {},
      instance: riskController,
    } as Parameters<typeof api.registerService>[0]);

    const dashboardDir = join(dirname(fileURLToPath(import.meta.url)), "dashboard");
    let dashboardTemplate = "";
    let dashboardCss = "";
    let tradingDashboardTemplate = "";
    let tradingDashboardCss = "";
    try {
      dashboardTemplate = readFileSync(join(dashboardDir, "finance-dashboard.html"), "utf-8");
      dashboardCss = readFileSync(join(dashboardDir, "finance-dashboard.css"), "utf-8");
    } catch {
      // Fallback to JSON response when dashboard assets are not available.
    }
    try {
      tradingDashboardTemplate = readFileSync(
        join(dashboardDir, "trading-dashboard.html"),
        "utf-8",
      );
      tradingDashboardCss = readFileSync(join(dashboardDir, "trading-dashboard.css"), "utf-8");
    } catch {
      // Trading dashboard assets optional.
    }

    const gatherFinanceConfigData = () => {
      const pluginEntries = (api.config.plugins?.entries ?? {}) as Record<
        string,
        { enabled?: boolean; config?: Record<string, unknown> }
      >;

      const plugins = FINANCIAL_PLUGIN_IDS.map((id) => ({
        id,
        enabled: pluginEntries[id]?.enabled === true,
      }));

      return {
        generatedAt: new Date().toISOString(),
        exchanges: registry.listExchanges(),
        trading: {
          enabled: riskConfig.enabled,
          maxAutoTradeUsd: riskConfig.maxAutoTradeUsd,
          confirmThresholdUsd: riskConfig.confirmThresholdUsd,
          maxDailyLossUsd: riskConfig.maxDailyLossUsd,
          maxPositionPct: riskConfig.maxPositionPct,
          maxLeverage: riskConfig.maxLeverage,
          allowedPairs: riskConfig.allowedPairs ?? [],
          blockedPairs: riskConfig.blockedPairs ?? [],
        },
        plugins: {
          total: plugins.length,
          enabled: plugins.filter((entry) => entry.enabled).length,
          entries: plugins,
        },
      };
    };

    api.registerHttpRoute({
      path: "/api/v1/finance/config",
      handler: async (
        _req: unknown,
        res: {
          writeHead: (statusCode: number, headers: Record<string, string>) => void;
          end: (body: string) => void;
        },
      ) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(gatherFinanceConfigData()));
      },
    });

    api.registerHttpRoute({
      path: "/dashboard/finance",
      handler: async (
        _req: unknown,
        res: {
          writeHead: (statusCode: number, headers: Record<string, string>) => void;
          end: (body: string) => void;
        },
      ) => {
        const financeData = gatherFinanceConfigData();
        if (!dashboardTemplate || !dashboardCss) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(financeData));
          return;
        }

        const safeJson = JSON.stringify(financeData).replace(/<\//g, "<\\/");
        const html = dashboardTemplate
          .replace("/*__FINANCE_CSS__*/", dashboardCss)
          .replace("/*__FINANCE_DATA__*/{}", safeJson);

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      },
    });

    // ── Trading Dashboard: service type aliases ──

    type PaperEngineLike = {
      listAccounts: () => Array<{ id: string; name: string; equity: number }>;
      getAccountState: (id: string) => {
        id: string;
        name: string;
        initialCapital: number;
        cash: number;
        equity: number;
        positions: Array<{
          symbol: string;
          side: string;
          quantity: number;
          entryPrice: number;
          currentPrice: number;
          unrealizedPnl: number;
        }>;
        orders: Array<{
          id: string;
          symbol: string;
          side: string;
          type: string;
          quantity: number;
          fillPrice?: number;
          commission?: number;
          status: string;
          strategyId?: string;
          createdAt: number;
          filledAt?: number;
        }>;
      } | null;
      getSnapshots: (id: string) => Array<{
        timestamp: number;
        equity: number;
        cash: number;
        positionsValue: number;
        dailyPnl: number;
        dailyPnlPct: number;
      }>;
      getOrders: (
        id: string,
        limit?: number,
      ) => Array<{
        id: string;
        symbol: string;
        side: string;
        type: string;
        quantity: number;
        fillPrice?: number;
        commission?: number;
        status: string;
        strategyId?: string;
        createdAt: number;
        filledAt?: number;
      }>;
    };

    type StrategyRegistryLike = {
      list: (filter?: { level?: string }) => Array<{
        id: string;
        name: string;
        level: string;
        lastBacktest?: {
          totalReturn: number;
          sharpe: number;
          sortino: number;
          maxDrawdown: number;
          winRate: number;
          profitFactor: number;
          totalTrades: number;
          finalEquity: number;
          initialCapital: number;
          strategyId: string;
        };
      }>;
    };

    type FundManagerLike = {
      getState: () => {
        allocations: Array<{ strategyId: string; capitalUsd: number; weightPct: number }>;
        totalCapital: number;
      };
    };

    const runtime = api.runtime as unknown as { services?: Map<string, unknown> };

    function gatherTradingData() {
      const paperEngine = runtime.services?.get?.("fin-paper-engine") as
        | PaperEngineLike
        | undefined;
      const strategyRegistry = runtime.services?.get?.("fin-strategy-registry") as
        | StrategyRegistryLike
        | undefined;
      const fundManager = runtime.services?.get?.("fin-fund-manager") as
        | FundManagerLike
        | undefined;

      // Aggregate across all paper accounts
      const accounts = paperEngine?.listAccounts() ?? [];
      let totalEquity = 0;
      let totalDailyPnl = 0;
      const allPositions: Array<Record<string, unknown>> = [];
      const allOrders: Array<Record<string, unknown>> = [];
      const allSnapshots: Array<Record<string, unknown>> = [];

      for (const acct of accounts) {
        const state = paperEngine?.getAccountState(acct.id);
        if (!state) continue;

        totalEquity += state.equity;

        for (const pos of state.positions) {
          allPositions.push(pos);
        }

        const snapshots = paperEngine?.getSnapshots(acct.id) ?? [];
        for (const snap of snapshots) {
          allSnapshots.push(snap);
        }
        if (snapshots.length > 0) {
          totalDailyPnl += snapshots[snapshots.length - 1]!.dailyPnl;
        }

        const orders = paperEngine?.getOrders(acct.id, 50) ?? [];
        for (const order of orders) {
          allOrders.push(order);
        }
      }

      // Strategies
      const strategies = strategyRegistry?.list() ?? [];
      const strategyData = strategies.map((s) => ({
        id: s.id,
        name: s.name,
        level: s.level,
        totalReturn: s.lastBacktest?.totalReturn,
        sharpe: s.lastBacktest?.sharpe,
        maxDrawdown: s.lastBacktest?.maxDrawdown,
        totalTrades: s.lastBacktest?.totalTrades,
      }));

      // Backtests
      const backtests = strategies.filter((s) => s.lastBacktest).map((s) => s.lastBacktest!);

      // Allocations
      const fundState = fundManager?.getState();
      const allocItems = fundState?.allocations ?? [];
      const totalAllocated = allocItems.reduce(
        (sum: number, a: { capitalUsd: number }) => sum + a.capitalUsd,
        0,
      );

      // Win rate from filled orders
      const filledOrders = allOrders.filter((o) => (o as { status: string }).status === "filled");
      const totalInitialCapital =
        accounts.length > 0 ? accounts.reduce((sum, a) => sum + a.equity, 0) : totalEquity;
      const dailyPnlPct = totalInitialCapital > 0 ? (totalDailyPnl / totalInitialCapital) * 100 : 0;

      // Avg sharpe from strategies with backtests
      const sharpValues = strategies
        .filter((s) => s.lastBacktest?.sharpe != null)
        .map((s) => s.lastBacktest!.sharpe);
      const avgSharpe =
        sharpValues.length > 0 ? sharpValues.reduce((a, b) => a + b, 0) / sharpValues.length : null;

      // Sort snapshots by timestamp for equity curve
      allSnapshots.sort(
        (a, b) => (a as { timestamp: number }).timestamp - (b as { timestamp: number }).timestamp,
      );

      return {
        summary: {
          totalEquity,
          dailyPnl: totalDailyPnl,
          dailyPnlPct,
          positionCount: allPositions.length,
          strategyCount: strategies.length,
          winRate: filledOrders.length > 0 ? null : null,
          avgSharpe,
        },
        positions: allPositions,
        orders: allOrders,
        snapshots: allSnapshots,
        strategies: strategyData,
        backtests,
        allocations: {
          items: allocItems,
          totalAllocated,
          cashReserve: (fundState?.totalCapital ?? 0) - totalAllocated,
          totalCapital: fundState?.totalCapital ?? 0,
        },
      };
    }

    // ── Trading Dashboard API ──

    // SSE stream for real-time dashboard updates
    api.registerHttpRoute({
      path: "/api/v1/finance/trading/stream",
      handler: async (
        req: { on: (event: string, cb: () => void) => void },
        res: {
          writeHead: (statusCode: number, headers: Record<string, string>) => void;
          write: (chunk: string) => boolean;
          end: (body?: string) => void;
        },
      ) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        // Send current data immediately
        res.write(`data: ${JSON.stringify(gatherTradingData())}\n\n`);
        // Push updates every 10 seconds
        const interval = setInterval(() => {
          res.write(`data: ${JSON.stringify(gatherTradingData())}\n\n`);
        }, 10000);
        // Clean up when client disconnects
        req.on("close", () => clearInterval(interval));
      },
    });

    api.registerHttpRoute({
      path: "/api/v1/finance/trading",
      handler: async (
        _req: unknown,
        res: {
          writeHead: (statusCode: number, headers: Record<string, string>) => void;
          end: (body: string) => void;
        },
      ) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(gatherTradingData()));
      },
    });

    api.registerHttpRoute({
      path: "/dashboard/trading",
      handler: async (
        _req: unknown,
        res: {
          writeHead: (statusCode: number, headers: Record<string, string>) => void;
          end: (body: string) => void;
        },
      ) => {
        const tradingData = gatherTradingData();
        if (!tradingDashboardTemplate || !tradingDashboardCss) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(tradingData));
          return;
        }

        const safeJson = JSON.stringify(tradingData).replace(/<\//g, "<\\/");
        const html = tradingDashboardTemplate
          .replace("/*__TRADING_CSS__*/", tradingDashboardCss)
          .replace("/*__TRADING_DATA__*/ {}", safeJson);

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      },
    });

    // Register CLI commands for exchange management.
    api.registerCli(({ program }) => {
      const exchange = program.command("exchange").description("Manage exchange connections");

      exchange
        .command("list")
        .description("List configured exchanges")
        .action(() => {
          const exchanges = registry.listExchanges();
          if (exchanges.length === 0) {
            console.log("No exchanges configured. Run: openfinclaw exchange add <name>");
            return;
          }
          console.log("Configured exchanges:");
          for (const ex of exchanges) {
            console.log(`  ${ex.id} (${ex.exchange}${ex.testnet ? " [testnet]" : ""})`);
          }
        });

      exchange
        .command("add <name>")
        .description("Add an exchange connection")
        .option("--exchange <type>", "Exchange type (binance, okx, bybit, hyperliquid)")
        .option("--api-key <key>", "API key")
        .option("--secret <secret>", "API secret")
        .option("--passphrase <pass>", "API passphrase (OKX)")
        .option("--testnet", "Use testnet/sandbox mode")
        .action((name: string, opts: Record<string, string | boolean | undefined>) => {
          registry.addExchange(name, {
            exchange: (opts.exchange ?? name) as "binance" | "okx" | "bybit" | "hyperliquid",
            apiKey: (opts.apiKey as string) ?? "",
            secret: (opts.secret as string) ?? "",
            passphrase: opts.passphrase as string | undefined,
            testnet: !!opts.testnet,
          });
          console.log(`Exchange "${name}" added${opts.testnet ? " (testnet)" : ""}.`);
        });

      exchange
        .command("remove <name>")
        .description("Remove an exchange connection")
        .action((name: string) => {
          if (registry.removeExchange(name)) {
            console.log(`Exchange "${name}" removed.`);
          } else {
            console.log(`Exchange "${name}" not found.`);
          }
        });
    });

    // Risk control hook: intercept all fin_* tool calls.
    api.registerHook(
      "before_tool_call",
      async (ctx) => {
        const toolName = (ctx as unknown as Record<string, unknown>).toolName as string | undefined;
        if (
          !toolName ||
          (!toolName.startsWith("fin_place_order") && !toolName.startsWith("fin_modify_order"))
        ) {
          return; // Only gate trading actions.
        }

        // Risk evaluation happens in fin-trading; this hook provides the controller.
        (ctx as unknown as Record<string, unknown>).riskController = riskController;
      },
      { name: "fin-risk-gate" },
    );
  },
};

export default finCorePlugin;
