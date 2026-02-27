import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { PaperEngine } from "./src/paper-engine.js";
import { PaperStore } from "./src/paper-store.js";

const json = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  details: payload,
});

const plugin = {
  id: "fin-paper-trading",
  name: "Paper Trading",
  description:
    "Simulated trading engine with fill simulation, commission models, and portfolio tracking",
  kind: "financial" as const,

  register(api: OpenClawPluginApi) {
    const dbPath = api.resolvePath("state/fin-paper-trading.sqlite");
    const store = new PaperStore(dbPath);

    const config = (api.config?.financial?.paperTrading ?? {}) as Record<string, unknown>;
    const slippageBps =
      (typeof config.constantSlippageBps === "number" ? config.constantSlippageBps : undefined) ??
      // Backward compatibility for pre-schema key naming.
      (typeof config.slippageBps === "number" ? config.slippageBps : undefined) ??
      5;
    const market =
      config.market === "crypto" || config.market === "equity" || config.market === "commodity"
        ? config.market
        : "crypto";

    const engine = new PaperEngine({ store, slippageBps, market });

    // Expose engine as a service for other fin-* plugins.
    api.registerService({
      id: "fin-paper-engine",
      start: () => {},
      instance: engine,
    } as Parameters<typeof api.registerService>[0]);

    // --- fin_paper_create ---
    api.registerTool(
      {
        name: "fin_paper_create",
        label: "Create Paper Account",
        description:
          "Create a new paper trading account with virtual capital for simulated trading",
        parameters: Type.Object({
          name: Type.String({ description: "Account name (e.g. 'BTC Swing Strategy')" }),
          capital: Type.Number({ description: "Initial virtual capital in USD (e.g. 10000)" }),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          try {
            const name = params.name as string;
            const capital = params.capital as number;

            if (capital <= 0) {
              return json({ error: "Capital must be positive" });
            }

            const state = engine.createAccount(name, capital);
            return json({
              message: `Paper account "${name}" created with $${capital.toLocaleString()} virtual capital`,
              account: state,
            });
          } catch (err) {
            return json({ error: (err as Error).message });
          }
        },
      },
      { names: ["fin_paper_create"] },
    );

    // --- fin_paper_order ---
    api.registerTool(
      {
        name: "fin_paper_order",
        label: "Paper Order",
        description:
          "Submit a paper (simulated) trade order. Uses real slippage and commission models but virtual execution.",
        parameters: Type.Object({
          account_id: Type.String({ description: "Paper account ID" }),
          symbol: Type.String({ description: "Trading pair (e.g. BTC/USDT)" }),
          side: Type.Unsafe<"buy" | "sell">({
            type: "string",
            enum: ["buy", "sell"],
            description: "Order side",
          }),
          quantity: Type.Number({ description: "Order quantity" }),
          type: Type.Optional(
            Type.Unsafe<"market" | "limit">({
              type: "string",
              enum: ["market", "limit"],
              description: "Order type (default: market)",
            }),
          ),
          limit_price: Type.Optional(
            Type.Number({ description: "Limit price (required for limit orders)" }),
          ),
          stop_loss: Type.Optional(Type.Number({ description: "Stop loss price" })),
          take_profit: Type.Optional(Type.Number({ description: "Take profit price" })),
          current_price: Type.Number({ description: "Current market price for fill simulation" }),
          reason: Type.Optional(Type.String({ description: "Reason or rationale for the trade" })),
          strategy_id: Type.Optional(
            Type.String({ description: "Strategy identifier for tracking" }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          try {
            const order = engine.submitOrder(
              params.account_id as string,
              {
                symbol: params.symbol as string,
                side: params.side as "buy" | "sell",
                type: (params.type as "market" | "limit") ?? "market",
                quantity: params.quantity as number,
                limitPrice: params.limit_price as number | undefined,
                stopLoss: params.stop_loss as number | undefined,
                takeProfit: params.take_profit as number | undefined,
                reason: params.reason as string | undefined,
                strategyId: params.strategy_id as string | undefined,
              },
              params.current_price as number,
            );
            return json({ order });
          } catch (err) {
            return json({ error: (err as Error).message });
          }
        },
      },
      { names: ["fin_paper_order"] },
    );

    // --- fin_paper_positions ---
    api.registerTool(
      {
        name: "fin_paper_positions",
        label: "Paper Positions",
        description: "View current open positions in a paper trading account",
        parameters: Type.Object({
          account_id: Type.String({ description: "Paper account ID" }),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          try {
            const state = engine.getAccountState(params.account_id as string);
            if (!state) {
              return json({ error: "Account not found" });
            }
            return json({
              accountId: state.id,
              positions: state.positions,
              totalPositions: state.positions.length,
              totalValue: state.positions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0),
            });
          } catch (err) {
            return json({ error: (err as Error).message });
          }
        },
      },
      { names: ["fin_paper_positions"] },
    );

    // --- fin_paper_state ---
    api.registerTool(
      {
        name: "fin_paper_state",
        label: "Paper Account State",
        description:
          "Get full paper trading account state including cash, equity, positions, and recent orders",
        parameters: Type.Object({
          account_id: Type.String({ description: "Paper account ID" }),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          try {
            const state = engine.getAccountState(params.account_id as string);
            if (!state) {
              return json({ error: "Account not found" });
            }
            return json({
              account: state,
              pnl: state.equity - state.initialCapital,
              pnlPct: ((state.equity - state.initialCapital) / state.initialCapital) * 100,
            });
          } catch (err) {
            return json({ error: (err as Error).message });
          }
        },
      },
      { names: ["fin_paper_state"] },
    );

    // --- fin_paper_metrics ---
    api.registerTool(
      {
        name: "fin_paper_metrics",
        label: "Paper Metrics",
        description:
          "Get strategy decay metrics for a paper trading account — Sharpe ratios, drawdown, and health status",
        parameters: Type.Object({
          account_id: Type.String({ description: "Paper account ID" }),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          try {
            const metrics = engine.getMetrics(params.account_id as string);
            if (!metrics) {
              return json({ error: "Account not found" });
            }
            return json({ metrics });
          } catch (err) {
            return json({ error: (err as Error).message });
          }
        },
      },
      { names: ["fin_paper_metrics"] },
    );

    // --- fin_paper_list ---
    api.registerTool(
      {
        name: "fin_paper_list",
        label: "List Paper Accounts",
        description: "List all paper trading accounts with their current equity",
        parameters: Type.Object({}),
        async execute() {
          try {
            const accounts = engine.listAccounts();
            return json({
              accounts,
              total: accounts.length,
            });
          } catch (err) {
            return json({ error: (err as Error).message });
          }
        },
      },
      { names: ["fin_paper_list"] },
    );
  },
};

export default plugin;
