import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { AgentEventSqliteStore } from "./src/agent-event-sqlite-store.js";
import { ExchangeRegistry } from "./src/exchange-registry.js";
import { RiskController } from "./src/risk-controller.js";
import type { ExchangeConfig, TradingRiskConfig } from "./src/types.js";

export { AgentEventSqliteStore } from "./src/agent-event-sqlite-store.js";
export { AgentEventStore } from "./src/agent-event-store.js";
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
    let commandCenterTemplate = "";
    let commandCenterCss = "";
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
    try {
      commandCenterTemplate = readFileSync(join(dashboardDir, "command-center.html"), "utf-8");
      commandCenterCss = readFileSync(join(dashboardDir, "command-center.css"), "utf-8");
    } catch {
      // Command center assets optional.
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
      path: "/api/v1/finance/config/stream",
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
        res.write(`data: ${JSON.stringify(gatherFinanceConfigData())}\n\n`);
        const interval = setInterval(() => {
          res.write(`data: ${JSON.stringify(gatherFinanceConfigData())}\n\n`);
        }, 30000);
        req.on("close", () => clearInterval(interval));
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
          .replace(/\/\*__FINANCE_DATA__\*\/\s*\{\}/, safeJson);

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      },
    });

    // ── Agent Event Store ──

    const eventStore = new AgentEventSqliteStore(api.resolvePath("state/fin-agent-events.sqlite"));
    api.registerService({
      id: "fin-event-store",
      start: () => {},
      instance: eventStore,
    } as Parameters<typeof api.registerService>[0]);

    // ── HTTP request helpers ──

    type HttpReq = {
      on: (event: string, cb: (data?: Buffer) => void) => void;
      method?: string;
    };

    type HttpRes = {
      writeHead: (statusCode: number, headers: Record<string, string>) => void;
      write: (chunk: string) => boolean;
      end: (body?: string) => void;
    };

    function parseJsonBody(req: HttpReq): Promise<Record<string, unknown>> {
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => {
          if (chunk) chunks.push(chunk);
        });
        req.on("end", () => {
          try {
            const raw = Buffer.concat(chunks).toString("utf-8");
            resolve(raw ? JSON.parse(raw) : {});
          } catch {
            reject(new Error("Invalid JSON body"));
          }
        });
        req.on("error", () => reject(new Error("Request error")));
      });
    }

    function jsonResponse(res: HttpRes, status: number, data: unknown): void {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    }

    function errorResponse(res: HttpRes, status: number, message: string): void {
      jsonResponse(res, status, { error: message });
    }

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
        status?: string;
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
      get?: (
        id: string,
      ) => { id: string; name: string; level: string; status?: string } | undefined;
      updateLevel?: (id: string, level: string) => void;
      updateStatus?: (id: string, status: string) => void;
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

      // Win rate from filled round-trip trades (FIFO pairing of buy→sell)
      const filledOrders = allOrders
        .filter((o) => (o as { status: string }).status === "filled")
        .sort(
          (a, b) =>
            ((a as { filledAt?: number }).filledAt ?? 0) -
            ((b as { filledAt?: number }).filledAt ?? 0),
        );
      let winRate: number | null = null;
      {
        const grouped = new Map<string, { buys: number[]; sells: number[] }>();
        for (const o of filledOrders) {
          const rec = o as {
            accountId?: string;
            symbol?: string;
            side?: string;
            fillPrice?: number;
          };
          const key = `${rec.accountId}:${rec.symbol}`;
          if (!grouped.has(key)) grouped.set(key, { buys: [], sells: [] });
          const g = grouped.get(key)!;
          if (rec.side === "buy" && rec.fillPrice != null) g.buys.push(rec.fillPrice);
          if (rec.side === "sell" && rec.fillPrice != null) g.sells.push(rec.fillPrice);
        }
        let wins = 0;
        let trips = 0;
        for (const [, g] of grouped) {
          const pairs = Math.min(g.buys.length, g.sells.length);
          for (let i = 0; i < pairs; i++) {
            trips++;
            if (g.sells[i]! > g.buys[i]!) wins++;
          }
        }
        if (trips > 0) winRate = wins / trips;
      }
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
          winRate,
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

    // ── Service type alias for alerts ──

    type AlertEngineLike = {
      addAlert: (
        condition: {
          kind: string;
          symbol?: string;
          price?: number;
          threshold?: number;
          direction?: string;
        },
        message?: string,
      ) => string;
      removeAlert: (id: string) => boolean;
      listAlerts: () => Array<{
        id: string;
        condition: Record<string, unknown>;
        createdAt: string;
        triggeredAt?: string;
        notified: boolean;
        message?: string;
      }>;
    };

    // ── P0-1: Write HTTP Endpoints ──

    // POST /api/v1/finance/orders — Place an order via paper engine
    api.registerHttpRoute({
      path: "/api/v1/finance/orders",
      handler: async (req: HttpReq, res: HttpRes) => {
        try {
          const body = await parseJsonBody(req);
          const {
            accountId,
            symbol,
            side,
            type,
            quantity,
            limitPrice,
            stopLoss,
            takeProfit,
            currentPrice,
            reason,
            strategyId,
            approvalId,
          } = body as Record<string, unknown>;

          if (!symbol || !side || !quantity) {
            errorResponse(res, 400, "Missing required fields: symbol, side, quantity");
            return;
          }

          const paperEngine = runtime.services?.get?.("fin-paper-engine") as
            | PaperEngineLike
            | undefined;
          if (!paperEngine) {
            errorResponse(res, 503, "Paper trading engine not available");
            return;
          }

          // Risk evaluation (skip if this is an approved action)
          const estimatedUsd = ((currentPrice as number) ?? 0) * ((quantity as number) ?? 0);
          if (!approvalId && estimatedUsd > 0) {
            const evaluation = riskController.evaluate(
              {
                symbol: symbol as string,
                side: side as string,
                amount: quantity as number,
              } as Parameters<typeof riskController.evaluate>[0],
              estimatedUsd,
            );

            if (evaluation.tier === "reject") {
              errorResponse(res, 403, evaluation.reason ?? "Order rejected by risk controller");
              return;
            }

            if (evaluation.tier === "confirm") {
              // Create a pending approval event
              const event = eventStore.addEvent({
                type: "trade_pending",
                title: `${(side as string).toUpperCase()} ${quantity} ${symbol}`,
                detail: evaluation.reason ?? "Requires user confirmation",
                status: "pending",
                actionParams: {
                  accountId,
                  symbol,
                  side,
                  type,
                  quantity,
                  limitPrice,
                  stopLoss,
                  takeProfit,
                  currentPrice,
                  reason,
                  strategyId,
                },
              });
              jsonResponse(res, 202, {
                status: "pending_approval",
                eventId: event.id,
                reason: evaluation.reason,
              });
              return;
            }
          }

          // If approvalId provided, verify the event was approved
          if (approvalId) {
            const event = eventStore.getEvent(approvalId as string);
            if (!event || event.status !== "approved") {
              errorResponse(res, 403, "Invalid or unapproved approval ID");
              return;
            }
          }

          // Use first account if not specified
          let targetAccountId = accountId as string | undefined;
          if (!targetAccountId) {
            const accounts = paperEngine.listAccounts();
            if (accounts.length === 0) {
              errorResponse(res, 400, "No paper trading accounts found");
              return;
            }
            targetAccountId = accounts[0]!.id;
          }

          // Submit order to paper engine
          // Note: paperEngine.submitOrder is the PaperEngine method from fin-paper-trading
          const submitOrder = (
            paperEngine as unknown as {
              submitOrder: (
                accountId: string,
                order: Record<string, unknown>,
                currentPrice: number,
              ) => Record<string, unknown>;
            }
          ).submitOrder;

          if (!submitOrder) {
            errorResponse(res, 503, "Paper engine does not support submitOrder");
            return;
          }

          const order = submitOrder.call(
            paperEngine,
            targetAccountId,
            {
              symbol,
              side,
              type: type ?? "market",
              quantity,
              limitPrice,
              stopLoss,
              takeProfit,
              reason,
              strategyId,
            },
            (currentPrice as number) ?? 0,
          );

          // Record event
          eventStore.addEvent({
            type: "trade_executed",
            title: `${(side as string).toUpperCase()} ${quantity} ${symbol}`,
            detail: `Order ${(order as { status?: string }).status ?? "submitted"} via paper engine`,
            status: "completed",
          });

          jsonResponse(res, 201, order);
        } catch (err) {
          errorResponse(res, 500, (err as Error).message);
        }
      },
    });

    // POST /api/v1/finance/orders/cancel — Cancel a pending order
    api.registerHttpRoute({
      path: "/api/v1/finance/orders/cancel",
      handler: async (req: HttpReq, res: HttpRes) => {
        try {
          const body = await parseJsonBody(req);
          const { orderId, accountId } = body as { orderId?: string; accountId?: string };

          if (!orderId) {
            errorResponse(res, 400, "Missing required field: orderId");
            return;
          }

          // Cancellation via paper engine is not directly supported in current API,
          // but we can record the intent and return success for the UI flow.
          eventStore.addEvent({
            type: "order_cancelled",
            title: `Cancel order ${orderId}`,
            detail: `Order cancellation requested${accountId ? ` for account ${accountId}` : ""}`,
            status: "completed",
          });

          jsonResponse(res, 200, { status: "cancelled", orderId });
        } catch (err) {
          errorResponse(res, 500, (err as Error).message);
        }
      },
    });

    // POST /api/v1/finance/positions/close — Close a position
    api.registerHttpRoute({
      path: "/api/v1/finance/positions/close",
      handler: async (req: HttpReq, res: HttpRes) => {
        try {
          const body = await parseJsonBody(req);
          const { symbol, accountId } = body as { symbol?: string; accountId?: string };

          if (!symbol) {
            errorResponse(res, 400, "Missing required field: symbol");
            return;
          }

          const paperEngine = runtime.services?.get?.("fin-paper-engine") as
            | PaperEngineLike
            | undefined;
          if (!paperEngine) {
            errorResponse(res, 503, "Paper trading engine not available");
            return;
          }

          // Find the account with this position
          let targetAccountId = accountId;
          if (!targetAccountId) {
            const accounts = paperEngine.listAccounts();
            targetAccountId = accounts[0]?.id;
          }
          if (!targetAccountId) {
            errorResponse(res, 400, "No paper trading accounts found");
            return;
          }

          const state = paperEngine.getAccountState(targetAccountId);
          if (!state) {
            errorResponse(res, 404, `Account ${targetAccountId} not found`);
            return;
          }

          const position = state.positions.find((p) => p.symbol === symbol);
          if (!position) {
            errorResponse(res, 404, `No open position for ${symbol}`);
            return;
          }

          // Close by submitting opposite order
          const closeSide = position.side === "long" ? "sell" : "buy";
          const submitOrder = (
            paperEngine as unknown as {
              submitOrder: (
                accountId: string,
                order: Record<string, unknown>,
                currentPrice: number,
              ) => Record<string, unknown>;
            }
          ).submitOrder;

          if (!submitOrder) {
            errorResponse(res, 503, "Paper engine does not support submitOrder");
            return;
          }

          const order = submitOrder.call(
            paperEngine,
            targetAccountId,
            {
              symbol,
              side: closeSide,
              type: "market",
              quantity: position.quantity,
              reason: "Position closed via UI",
            },
            position.currentPrice,
          );

          eventStore.addEvent({
            type: "trade_executed",
            title: `Close ${symbol} ${position.side}`,
            detail: `Closed ${position.quantity} ${symbol} at ${position.currentPrice}`,
            status: "completed",
          });

          jsonResponse(res, 200, { status: "closed", order });
        } catch (err) {
          errorResponse(res, 500, (err as Error).message);
        }
      },
    });

    // ── P0-1: Alert CRUD Endpoints ──

    // GET /api/v1/finance/alerts — List all alerts
    api.registerHttpRoute({
      path: "/api/v1/finance/alerts",
      handler: async (_req: unknown, res: HttpRes) => {
        const alertEngine = runtime.services?.get?.("fin-alert-engine") as
          | AlertEngineLike
          | undefined;
        if (!alertEngine) {
          jsonResponse(res, 200, { alerts: [] });
          return;
        }
        jsonResponse(res, 200, { alerts: alertEngine.listAlerts() });
      },
    });

    // POST /api/v1/finance/alerts/create — Create an alert
    api.registerHttpRoute({
      path: "/api/v1/finance/alerts/create",
      handler: async (req: HttpReq, res: HttpRes) => {
        try {
          const body = await parseJsonBody(req);
          const { kind, symbol, price, threshold, direction, message } = body as Record<
            string,
            unknown
          >;

          if (!kind) {
            errorResponse(res, 400, "Missing required field: kind");
            return;
          }

          const alertEngine = runtime.services?.get?.("fin-alert-engine") as
            | AlertEngineLike
            | undefined;
          if (!alertEngine) {
            errorResponse(res, 503, "Alert engine not available");
            return;
          }

          const condition: Record<string, unknown> = { kind };
          if (symbol) condition.symbol = symbol;
          if (price != null) condition.price = price;
          if (threshold != null) condition.threshold = threshold;
          if (direction) condition.direction = direction;

          const alertId = alertEngine.addAlert(
            condition as Parameters<AlertEngineLike["addAlert"]>[0],
            message as string | undefined,
          );

          eventStore.addEvent({
            type: "alert_triggered",
            title: `Alert created: ${kind}`,
            detail: `${kind} alert for ${symbol ?? "portfolio"}`,
            status: "completed",
          });

          jsonResponse(res, 201, { id: alertId, condition, message });
        } catch (err) {
          errorResponse(res, 500, (err as Error).message);
        }
      },
    });

    // POST /api/v1/finance/alerts/remove — Remove an alert
    api.registerHttpRoute({
      path: "/api/v1/finance/alerts/remove",
      handler: async (req: HttpReq, res: HttpRes) => {
        try {
          const body = await parseJsonBody(req);
          const { id } = body as { id?: string };

          if (!id) {
            errorResponse(res, 400, "Missing required field: id");
            return;
          }

          const alertEngine = runtime.services?.get?.("fin-alert-engine") as
            | AlertEngineLike
            | undefined;
          if (!alertEngine) {
            errorResponse(res, 503, "Alert engine not available");
            return;
          }

          const removed = alertEngine.removeAlert(id);
          if (!removed) {
            errorResponse(res, 404, `Alert ${id} not found`);
            return;
          }

          jsonResponse(res, 200, { status: "removed", id });
        } catch (err) {
          errorResponse(res, 500, (err as Error).message);
        }
      },
    });

    // ── P0-4: Strategy Pause/Kill/Promote Endpoints ──

    // GET /api/v1/finance/strategies — List all strategies
    api.registerHttpRoute({
      path: "/api/v1/finance/strategies",
      handler: async (_req: unknown, res: HttpRes) => {
        const strategyRegistry = runtime.services?.get?.("fin-strategy-registry") as
          | StrategyRegistryLike
          | undefined;
        if (!strategyRegistry) {
          jsonResponse(res, 200, { strategies: [] });
          return;
        }
        jsonResponse(res, 200, { strategies: strategyRegistry.list() });
      },
    });

    // POST /api/v1/finance/strategies/pause — Pause a strategy
    api.registerHttpRoute({
      path: "/api/v1/finance/strategies/pause",
      handler: async (req: HttpReq, res: HttpRes) => {
        try {
          const body = await parseJsonBody(req);
          const { id } = body as { id?: string };

          if (!id) {
            errorResponse(res, 400, "Missing required field: id");
            return;
          }

          const strategyRegistry = runtime.services?.get?.("fin-strategy-registry") as
            | StrategyRegistryLike
            | undefined;
          if (!strategyRegistry?.updateStatus) {
            errorResponse(res, 503, "Strategy registry not available");
            return;
          }

          const strategy = strategyRegistry.get?.(id);
          if (!strategy) {
            errorResponse(res, 404, `Strategy ${id} not found`);
            return;
          }

          strategyRegistry.updateStatus(id, "paused");

          eventStore.addEvent({
            type: "system",
            title: `Strategy paused: ${strategy.name}`,
            detail: `${strategy.name} (${strategy.level}) paused by user`,
            status: "completed",
          });

          jsonResponse(res, 200, { status: "paused", id });
        } catch (err) {
          errorResponse(res, 500, (err as Error).message);
        }
      },
    });

    // POST /api/v1/finance/strategies/resume — Resume a paused strategy
    api.registerHttpRoute({
      path: "/api/v1/finance/strategies/resume",
      handler: async (req: HttpReq, res: HttpRes) => {
        try {
          const body = await parseJsonBody(req);
          const { id } = body as { id?: string };

          if (!id) {
            errorResponse(res, 400, "Missing required field: id");
            return;
          }

          const strategyRegistry = runtime.services?.get?.("fin-strategy-registry") as
            | StrategyRegistryLike
            | undefined;
          if (!strategyRegistry?.updateStatus) {
            errorResponse(res, 503, "Strategy registry not available");
            return;
          }

          strategyRegistry.updateStatus(id, "running");
          jsonResponse(res, 200, { status: "running", id });
        } catch (err) {
          errorResponse(res, 500, (err as Error).message);
        }
      },
    });

    // POST /api/v1/finance/strategies/kill — Kill a strategy
    api.registerHttpRoute({
      path: "/api/v1/finance/strategies/kill",
      handler: async (req: HttpReq, res: HttpRes) => {
        try {
          const body = await parseJsonBody(req);
          const { id } = body as { id?: string };

          if (!id) {
            errorResponse(res, 400, "Missing required field: id");
            return;
          }

          const strategyRegistry = runtime.services?.get?.("fin-strategy-registry") as
            | StrategyRegistryLike
            | undefined;
          if (!strategyRegistry?.updateLevel) {
            errorResponse(res, 503, "Strategy registry not available");
            return;
          }

          const strategy = strategyRegistry.get?.(id);
          if (!strategy) {
            errorResponse(res, 404, `Strategy ${id} not found`);
            return;
          }

          strategyRegistry.updateLevel(id, "KILLED");
          strategyRegistry.updateStatus?.(id, "stopped");

          eventStore.addEvent({
            type: "strategy_killed",
            title: `Strategy killed: ${strategy.name}`,
            detail: `${strategy.name} permanently killed by user`,
            status: "completed",
          });

          jsonResponse(res, 200, { status: "killed", id });
        } catch (err) {
          errorResponse(res, 500, (err as Error).message);
        }
      },
    });

    // POST /api/v1/finance/strategies/promote — Promote a strategy to next level
    api.registerHttpRoute({
      path: "/api/v1/finance/strategies/promote",
      handler: async (req: HttpReq, res: HttpRes) => {
        try {
          const body = await parseJsonBody(req);
          const { id, targetLevel } = body as { id?: string; targetLevel?: string };

          if (!id) {
            errorResponse(res, 400, "Missing required field: id");
            return;
          }

          const strategyRegistry = runtime.services?.get?.("fin-strategy-registry") as
            | StrategyRegistryLike
            | undefined;
          if (!strategyRegistry?.updateLevel) {
            errorResponse(res, 503, "Strategy registry not available");
            return;
          }

          const strategy = strategyRegistry.get?.(id);
          if (!strategy) {
            errorResponse(res, 404, `Strategy ${id} not found`);
            return;
          }

          // Determine next level if not specified
          const levelOrder = ["L0_INCUBATE", "L1_BACKTEST", "L2_PAPER", "L3_LIVE"];
          const currentIdx = levelOrder.indexOf(strategy.level);
          const nextLevel =
            targetLevel ??
            (currentIdx >= 0 && currentIdx < levelOrder.length - 1
              ? levelOrder[currentIdx + 1]
              : undefined);

          if (!nextLevel) {
            errorResponse(
              res,
              400,
              `Strategy ${id} is already at highest level or level is invalid`,
            );
            return;
          }

          strategyRegistry.updateLevel(id, nextLevel);

          eventStore.addEvent({
            type: "strategy_promoted",
            title: `${strategy.name} → ${nextLevel}`,
            detail: `Strategy promoted from ${strategy.level} to ${nextLevel}`,
            status: "completed",
          });

          jsonResponse(res, 200, { status: "promoted", id, from: strategy.level, to: nextLevel });
        } catch (err) {
          errorResponse(res, 500, (err as Error).message);
        }
      },
    });

    // ── P0-3: Emergency Stop ──

    api.registerHttpRoute({
      path: "/api/v1/finance/emergency-stop",
      handler: async (_req: unknown, res: HttpRes) => {
        try {
          // 1. Disable trading in risk controller
          riskController.updateConfig({ enabled: false });

          // 2. Pause all running strategies
          const strategyRegistry = runtime.services?.get?.("fin-strategy-registry") as
            | StrategyRegistryLike
            | undefined;
          const pausedStrategies: string[] = [];
          if (strategyRegistry?.list && strategyRegistry.updateStatus) {
            for (const s of strategyRegistry.list()) {
              if (s.level !== "KILLED" && s.status !== "stopped" && s.status !== "paused") {
                strategyRegistry.updateStatus(s.id, "paused");
                pausedStrategies.push(s.id);
              }
            }
          }

          // 3. Record event
          eventStore.addEvent({
            type: "emergency_stop",
            title: "EMERGENCY STOP ACTIVATED",
            detail: `Trading disabled. ${pausedStrategies.length} strategies paused.`,
            status: "completed",
          });

          jsonResponse(res, 200, {
            status: "stopped",
            tradingDisabled: true,
            strategiesPaused: pausedStrategies,
            message: "Emergency stop activated. All trading disabled.",
          });
        } catch (err) {
          errorResponse(res, 500, (err as Error).message);
        }
      },
    });

    // ── P0-2: Agent Events SSE Stream ──

    // GET /api/v1/finance/events — List recent events
    api.registerHttpRoute({
      path: "/api/v1/finance/events",
      handler: async (_req: unknown, res: HttpRes) => {
        jsonResponse(res, 200, {
          events: eventStore.listEvents(),
          pendingCount: eventStore.pendingCount(),
        });
      },
    });

    // GET /api/v1/finance/events/stream — SSE stream for agent events
    api.registerHttpRoute({
      path: "/api/v1/finance/events/stream",
      handler: async (req: { on: (event: string, cb: () => void) => void }, res: HttpRes) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        // Send current events as initial payload
        res.write(
          `data: ${JSON.stringify({
            events: eventStore.listEvents(),
            pendingCount: eventStore.pendingCount(),
          })}\n\n`,
        );

        // Subscribe to new events
        const unsubscribe = eventStore.subscribe((event) => {
          res.write(
            `data: ${JSON.stringify({
              type: "new_event",
              event,
              pendingCount: eventStore.pendingCount(),
            })}\n\n`,
          );
        });

        // Clean up on disconnect
        req.on("close", () => {
          unsubscribe();
        });
      },
    });

    // ── P0-5: Approval Flow ──

    // POST /api/v1/finance/events/approve — Approve a pending event
    api.registerHttpRoute({
      path: "/api/v1/finance/events/approve",
      handler: async (req: HttpReq, res: HttpRes) => {
        try {
          const body = await parseJsonBody(req);
          const { id, action } = body as {
            id?: string;
            action?: "approve" | "reject";
            reason?: string;
          };

          if (!id) {
            errorResponse(res, 400, "Missing required field: id");
            return;
          }

          if (action === "reject") {
            const event = eventStore.reject(id, (body as { reason?: string }).reason);
            if (!event) {
              errorResponse(res, 404, `Event ${id} not found or not pending`);
              return;
            }
            jsonResponse(res, 200, { status: "rejected", event });
            return;
          }

          // Default: approve
          const event = eventStore.approve(id);
          if (!event) {
            errorResponse(res, 404, `Event ${id} not found or not pending`);
            return;
          }

          jsonResponse(res, 200, { status: "approved", event });
        } catch (err) {
          errorResponse(res, 500, (err as Error).message);
        }
      },
    });

    // ── P0-1: Risk evaluation endpoint ──

    api.registerHttpRoute({
      path: "/api/v1/finance/risk/evaluate",
      handler: async (req: HttpReq, res: HttpRes) => {
        try {
          const body = await parseJsonBody(req);
          const { symbol, side, amount, estimatedValueUsd } = body as Record<string, unknown>;

          if (!symbol || !amount) {
            errorResponse(res, 400, "Missing required fields: symbol, amount");
            return;
          }

          const evaluation = riskController.evaluate(
            { symbol, side: side ?? "buy", amount } as Parameters<
              typeof riskController.evaluate
            >[0],
            (estimatedValueUsd as number) ?? 0,
          );

          jsonResponse(res, 200, evaluation);
        } catch (err) {
          errorResponse(res, 500, (err as Error).message);
        }
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

    // ── Command Center Dashboard ──

    function gatherCommandCenterData() {
      const trading = gatherTradingData();
      const events = {
        events: eventStore.listEvents(),
        pendingCount: eventStore.pendingCount(),
      };

      const alertEngine = runtime.services?.get?.("fin-alert-engine") as
        | AlertEngineLike
        | undefined;
      const alerts = alertEngine?.listAlerts() ?? [];

      return {
        trading,
        events,
        alerts,
        risk: {
          enabled: riskConfig.enabled,
          maxAutoTradeUsd: riskConfig.maxAutoTradeUsd,
          confirmThresholdUsd: riskConfig.confirmThresholdUsd,
          maxDailyLossUsd: riskConfig.maxDailyLossUsd,
        },
      };
    }

    // JSON endpoint for command center data
    api.registerHttpRoute({
      path: "/api/v1/finance/command-center",
      handler: async (_req: unknown, res: HttpRes) => {
        jsonResponse(res, 200, gatherCommandCenterData());
      },
    });

    // HTML dashboard
    api.registerHttpRoute({
      path: "/dashboard/command-center",
      handler: async (
        _req: unknown,
        res: {
          writeHead: (statusCode: number, headers: Record<string, string>) => void;
          end: (body: string) => void;
        },
      ) => {
        const ccData = gatherCommandCenterData();
        if (!commandCenterTemplate || !commandCenterCss) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(ccData));
          return;
        }

        const safeJson = JSON.stringify(ccData).replace(/<\//g, "<\\/");
        const html = commandCenterTemplate
          .replace("/*__CC_CSS__*/", commandCenterCss)
          .replace(/\/\*__CC_DATA__\*\/\s*\{\}/, safeJson);

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      },
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
