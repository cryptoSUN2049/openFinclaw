import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";

const finPortfolioPlugin = {
  id: "fin-portfolio",
  name: "Portfolio Tracker",
  description: "Cross-exchange portfolio tracking, balance aggregation, and history",
  kind: "financial" as const,

  register(api: OpenClawPluginApi) {
    // --- fin_portfolio_view ---
    api.registerTool(
      {
        name: "fin_portfolio_view",
        label: "Portfolio View",
        description: "View aggregated portfolio across all connected exchanges",
        parameters: Type.Object({
          currency: Type.Optional(
            Type.String({
              description: "Base currency for valuation (default USD)",
              default: "USD",
            }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          const currency = (params.currency as string | undefined) ?? "USD";

          // TODO: Query all connected exchanges via ExchangeRegistry, aggregate balances,
          // and compute total portfolio value in the requested currency.
          const placeholder = {
            currency,
            totalValue: null,
            exchanges: [],
            assets: [],
            notice: "Placeholder: portfolio aggregation not yet wired to exchange registry.",
          };

          return {
            content: [{ type: "text", text: JSON.stringify(placeholder, null, 2) }],
          };
        },
      },
      { names: ["fin_portfolio_view"] },
    );

    // --- fin_portfolio_history ---
    api.registerTool(
      {
        name: "fin_portfolio_history",
        label: "Portfolio History",
        description: "Get portfolio value history over time",
        parameters: Type.Object({
          period: Type.Optional(
            Type.Unsafe<"1d" | "1w" | "1m" | "3m" | "1y">({
              type: "string",
              enum: ["1d", "1w", "1m", "3m", "1y"],
              description: "Time period for history (default 1m)",
            }),
          ),
          currency: Type.Optional(
            Type.String({
              description: "Base currency for valuation (default USD)",
            }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          const period = (params.period as string | undefined) ?? "1m";
          const currency = (params.currency as string | undefined) ?? "USD";

          // TODO: Build historical portfolio snapshots from exchange trade/balance history.
          const placeholder = {
            period,
            currency,
            snapshots: [],
            startValue: null,
            endValue: null,
            changePct: null,
            notice: "Placeholder: portfolio history not yet implemented.",
          };

          return {
            content: [{ type: "text", text: JSON.stringify(placeholder, null, 2) }],
          };
        },
      },
      { names: ["fin_portfolio_history"] },
    );

    // --- fin_exchange_balance ---
    api.registerTool(
      {
        name: "fin_exchange_balance",
        label: "Exchange Balance",
        description: "Get balance details for a specific exchange",
        parameters: Type.Object({
          exchange: Type.String({
            description: "Exchange ID to query (must be a configured exchange)",
          }),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          const exchange = params.exchange as string;

          // TODO: Fetch balance from the specified exchange via ExchangeRegistry / ccxt.
          const placeholder = {
            exchange,
            balances: [],
            totalUsd: null,
            timestamp: null,
            notice: "Placeholder: exchange balance fetch not yet wired to exchange registry.",
          };

          return {
            content: [{ type: "text", text: JSON.stringify(placeholder, null, 2) }],
          };
        },
      },
      { names: ["fin_exchange_balance"] },
    );

    // --- fin_positions ---
    api.registerTool(
      {
        name: "fin_positions",
        label: "Open Positions",
        description: "Get current open positions across exchanges",
        parameters: Type.Object({
          exchange: Type.Optional(
            Type.String({
              description: "Filter by exchange ID. Returns all exchanges if omitted.",
            }),
          ),
          symbol: Type.Optional(
            Type.String({
              description: "Filter by trading pair symbol (e.g. BTC/USDT)",
            }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          const exchange = params.exchange as string | undefined;
          const symbol = params.symbol as string | undefined;

          // TODO: Query open positions from connected exchanges via ccxt.
          const placeholder = {
            exchange: exchange ?? "all",
            symbol: symbol ?? "all",
            positions: [],
            notice: "Placeholder: positions fetch not yet wired to exchange registry.",
          };

          return {
            content: [{ type: "text", text: JSON.stringify(placeholder, null, 2) }],
          };
        },
      },
      { names: ["fin_positions"] },
    );

    // --- fin_order_history ---
    api.registerTool(
      {
        name: "fin_order_history",
        label: "Order History",
        description: "Get order history with filtering options",
        parameters: Type.Object({
          exchange: Type.Optional(
            Type.String({
              description: "Filter by exchange ID. Returns all exchanges if omitted.",
            }),
          ),
          symbol: Type.Optional(
            Type.String({
              description: "Filter by trading pair symbol (e.g. BTC/USDT)",
            }),
          ),
          limit: Type.Optional(
            Type.Number({
              description: "Maximum number of orders to return (default 50)",
            }),
          ),
          since: Type.Optional(
            Type.String({
              description: "ISO 8601 date to fetch orders from (e.g. 2026-01-01T00:00:00Z)",
            }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          const exchange = params.exchange as string | undefined;
          const symbol = params.symbol as string | undefined;
          const limit = (params.limit as number | undefined) ?? 50;
          const since = params.since as string | undefined;

          // TODO: Fetch order history from connected exchanges, merge and sort.
          const placeholder = {
            exchange: exchange ?? "all",
            symbol: symbol ?? "all",
            limit,
            since: since ?? null,
            orders: [],
            notice: "Placeholder: order history fetch not yet wired to exchange registry.",
          };

          return {
            content: [{ type: "text", text: JSON.stringify(placeholder, null, 2) }],
          };
        },
      },
      { names: ["fin_order_history"] },
    );
  },
};

export default finPortfolioPlugin;
