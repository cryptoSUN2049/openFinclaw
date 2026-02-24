import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { CcxtBridge } from "./src/ccxt-bridge.js";

type RiskController = {
  evaluate: (
    order: {
      exchange: string;
      symbol: string;
      side: string;
      type: string;
      amount: number;
      leverage?: number;
    },
    estimatedValueUsd: number,
  ) => { tier: "auto" | "confirm" | "reject"; reason?: string };
  recordLoss: (usdAmount: number) => void;
};

const json = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  details: payload,
});

/**
 * Resolve an exchange instance from the fin-core ExchangeRegistry service,
 * then wrap it in a CcxtBridge for unified access.
 */
async function resolveBridge(api: OpenClawPluginApi, exchangeId: string): Promise<CcxtBridge> {
  const runtime = api.runtime as unknown as { services?: Map<string, unknown> };
  const registry = runtime.services?.get?.("fin-exchange-registry") as
    | { getInstance: (id: string) => Promise<unknown> }
    | undefined;
  if (!registry) {
    throw new Error("fin-core plugin not loaded — exchange registry unavailable");
  }
  const instance = await registry.getInstance(exchangeId);
  return new CcxtBridge(instance);
}

/** Resolve the RiskController service from fin-core. Returns undefined if not available. */
function getRiskController(api: OpenClawPluginApi): RiskController | undefined {
  const runtime = api.runtime as unknown as { services?: Map<string, unknown> };
  return runtime.services?.get?.("fin-risk-controller") as RiskController | undefined;
}

const finTradingPlugin = {
  id: "fin-trading",
  name: "Trading Engine",
  description:
    "Risk-gated trade execution via CCXT: place, cancel, modify orders with tiered risk control",
  kind: "financial" as const,

  register(api: OpenClawPluginApi) {
    // ---------------------------------------------------------------
    // Tool 1: fin_place_order
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_place_order",
        label: "Place Order",
        description: "Place a market or limit order on an exchange. Subject to risk controls.",
        parameters: Type.Object({
          exchange: Type.String({ description: "Exchange connection ID (from fin-core registry)" }),
          symbol: Type.String({ description: "Trading pair symbol, e.g. BTC/USDT" }),
          side: Type.Unsafe<"buy" | "sell">({ type: "string", enum: ["buy", "sell"] }),
          type: Type.Unsafe<"market" | "limit">({ type: "string", enum: ["market", "limit"] }),
          amount: Type.Number({ description: "Order amount in base currency" }),
          price: Type.Optional(
            Type.Number({ description: "Limit price (required for limit orders)" }),
          ),
          leverage: Type.Optional(Type.Number({ description: "Leverage multiplier" })),
          stopLoss: Type.Optional(Type.Number({ description: "Stop-loss price" })),
          takeProfit: Type.Optional(Type.Number({ description: "Take-profit price" })),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const exchange = String(params.exchange ?? "").trim();
            const symbol = String(params.symbol ?? "").trim();
            const side = String(params.side ?? "") as "buy" | "sell";
            const type = String(params.type ?? "") as "market" | "limit";
            const amount = Number(params.amount);

            if (!exchange || !symbol || !side || !type || !amount) {
              throw new Error("exchange, symbol, side, type, and amount are required");
            }

            const bridge = await resolveBridge(api, exchange);

            // Risk evaluation: fetch current price to estimate USD value
            const riskCtrl = getRiskController(api);
            if (riskCtrl) {
              const ticker = await bridge.fetchTicker(symbol);
              const currentPrice = Number(ticker.last ?? 0);
              const estimatedValueUsd = currentPrice * amount;

              const evaluation = riskCtrl.evaluate(
                {
                  exchange,
                  symbol,
                  side,
                  type,
                  amount,
                  leverage: typeof params.leverage === "number" ? params.leverage : undefined,
                },
                estimatedValueUsd,
              );

              if (evaluation.tier === "reject") {
                return json({
                  success: false,
                  rejected: true,
                  reason: evaluation.reason,
                  estimatedValueUsd,
                  currentPrice,
                });
              }

              if (evaluation.tier === "confirm") {
                return json({
                  success: false,
                  requiresConfirmation: true,
                  reason: evaluation.reason,
                  estimatedValueUsd,
                  currentPrice,
                  order: { exchange, symbol, side, type, amount, price: params.price },
                  hint: "User must confirm this trade before execution. Re-call with the same parameters after user approval.",
                });
              }
            }

            // Apply leverage if provided
            const extraParams: Record<string, unknown> = {};
            if (typeof params.leverage === "number" && params.leverage > 1) {
              extraParams.leverage = params.leverage;
            }

            const result = await bridge.placeOrder({
              symbol,
              side,
              type,
              amount,
              price: typeof params.price === "number" ? params.price : undefined,
              params: Object.keys(extraParams).length > 0 ? extraParams : undefined,
            });

            return json({ success: true, order: result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_place_order"] },
    );

    // ---------------------------------------------------------------
    // Tool 2: fin_cancel_order
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_cancel_order",
        label: "Cancel Order",
        description: "Cancel an open order.",
        parameters: Type.Object({
          exchange: Type.String({ description: "Exchange connection ID" }),
          orderId: Type.String({ description: "Order ID to cancel" }),
          symbol: Type.String({ description: "Trading pair symbol" }),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const exchange = String(params.exchange ?? "").trim();
            const orderId = String(params.orderId ?? "").trim();
            const symbol = String(params.symbol ?? "").trim();

            if (!exchange || !orderId || !symbol) {
              throw new Error("exchange, orderId, and symbol are required");
            }

            const bridge = await resolveBridge(api, exchange);
            const result = await bridge.cancelOrder(orderId, symbol);
            return json({ success: true, cancelled: result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_cancel_order"] },
    );

    // ---------------------------------------------------------------
    // Tool 3: fin_modify_order
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_modify_order",
        label: "Modify Order",
        description: "Modify an existing order (cancel and replace).",
        parameters: Type.Object({
          exchange: Type.String({ description: "Exchange connection ID" }),
          orderId: Type.String({ description: "Existing order ID to modify" }),
          symbol: Type.String({ description: "Trading pair symbol" }),
          amount: Type.Optional(Type.Number({ description: "New order amount" })),
          price: Type.Optional(Type.Number({ description: "New limit price" })),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const exchange = String(params.exchange ?? "").trim();
            const orderId = String(params.orderId ?? "").trim();
            const symbol = String(params.symbol ?? "").trim();

            if (!exchange || !orderId || !symbol) {
              throw new Error("exchange, orderId, and symbol are required");
            }

            if (params.amount == null && params.price == null) {
              throw new Error("at least one of amount or price must be provided for modification");
            }

            const bridge = await resolveBridge(api, exchange);

            // Risk evaluation for modifications
            const riskCtrl = getRiskController(api);
            if (riskCtrl && typeof params.amount === "number") {
              const ticker = await bridge.fetchTicker(symbol);
              const currentPrice = Number(ticker.last ?? 0);
              const estimatedValueUsd = currentPrice * (params.amount as number);

              const evaluation = riskCtrl.evaluate(
                { exchange, symbol, side: "buy", type: "limit", amount: params.amount as number },
                estimatedValueUsd,
              );

              if (evaluation.tier === "reject") {
                return json({
                  success: false,
                  rejected: true,
                  reason: evaluation.reason,
                  estimatedValueUsd,
                });
              }

              if (evaluation.tier === "confirm") {
                return json({
                  success: false,
                  requiresConfirmation: true,
                  reason: evaluation.reason,
                  estimatedValueUsd,
                  hint: "User must confirm this modification before execution.",
                });
              }
            }

            // Cancel-and-replace: cancel the existing order, then place a new one.
            const cancelled = await bridge.cancelOrder(orderId, symbol);

            // Determine new order parameters. In a full implementation we would
            // fetch the original order to carry forward unchanged fields.
            const newAmount = typeof params.amount === "number" ? params.amount : 0;
            const newPrice = typeof params.price === "number" ? params.price : undefined;

            if (newAmount <= 0) {
              return json({
                success: true,
                note: "Order cancelled; no replacement placed (amount not specified).",
                cancelled,
              });
            }

            // TODO: Infer side and type from the original order.
            const replacement = await bridge.placeOrder({
              symbol,
              side: "buy",
              type: newPrice ? "limit" : "market",
              amount: newAmount,
              price: newPrice,
            });

            return json({ success: true, cancelled, replacement });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_modify_order"] },
    );

    // ---------------------------------------------------------------
    // Tool 4: fin_set_stop_loss
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_set_stop_loss",
        label: "Set Stop-Loss",
        description: "Set or update stop-loss for a position.",
        parameters: Type.Object({
          exchange: Type.String({ description: "Exchange connection ID" }),
          symbol: Type.String({ description: "Trading pair symbol" }),
          stopPrice: Type.Number({ description: "Stop-loss trigger price" }),
          amount: Type.Optional(
            Type.Number({ description: "Amount to close at stop (defaults to full position)" }),
          ),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const exchange = String(params.exchange ?? "").trim();
            const symbol = String(params.symbol ?? "").trim();
            const stopPrice = Number(params.stopPrice);

            if (!exchange || !symbol || !stopPrice) {
              throw new Error("exchange, symbol, and stopPrice are required");
            }

            // TODO: Risk evaluation — stop-loss orders are protective, so they
            // typically bypass the tiered risk gating. However, we still validate
            // that the position exists and the stop price is sane (e.g. not above
            // current price for a long position).

            const bridge = await resolveBridge(api, exchange);

            // Determine position size if amount not specified.
            const positions = await bridge.fetchPositions(symbol);
            const position = positions[0] as Record<string, unknown> | undefined;
            const size =
              typeof params.amount === "number"
                ? params.amount
                : typeof position?.contracts === "number"
                  ? (position.contracts as number)
                  : 0;

            if (size <= 0) {
              throw new Error(`No open position found for ${symbol} and no amount specified`);
            }

            // Place a stop-market sell order as the stop-loss.
            const result = await bridge.placeOrder({
              symbol,
              side: "sell",
              type: "market",
              amount: size,
              params: { stopPrice, type: "stop", reduceOnly: true },
            });

            return json({ success: true, stopLoss: result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_set_stop_loss"] },
    );

    // ---------------------------------------------------------------
    // Tool 5: fin_set_take_profit
    // ---------------------------------------------------------------
    api.registerTool(
      {
        name: "fin_set_take_profit",
        label: "Set Take-Profit",
        description: "Set or update take-profit for a position.",
        parameters: Type.Object({
          exchange: Type.String({ description: "Exchange connection ID" }),
          symbol: Type.String({ description: "Trading pair symbol" }),
          profitPrice: Type.Number({ description: "Take-profit trigger price" }),
          amount: Type.Optional(
            Type.Number({ description: "Amount to close at target (defaults to full position)" }),
          ),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const exchange = String(params.exchange ?? "").trim();
            const symbol = String(params.symbol ?? "").trim();
            const profitPrice = Number(params.profitPrice);

            if (!exchange || !symbol || !profitPrice) {
              throw new Error("exchange, symbol, and profitPrice are required");
            }

            // TODO: Similar to stop-loss — take-profit orders are protective.
            // Validate that the price target is on the correct side of the
            // current market price relative to position direction.

            const bridge = await resolveBridge(api, exchange);

            // Determine position size if amount not specified.
            const positions = await bridge.fetchPositions(symbol);
            const position = positions[0] as Record<string, unknown> | undefined;
            const size =
              typeof params.amount === "number"
                ? params.amount
                : typeof position?.contracts === "number"
                  ? (position.contracts as number)
                  : 0;

            if (size <= 0) {
              throw new Error(`No open position found for ${symbol} and no amount specified`);
            }

            // Place a take-profit limit order.
            const result = await bridge.placeOrder({
              symbol,
              side: "sell",
              type: "limit",
              amount: size,
              price: profitPrice,
              params: { takeProfitPrice: profitPrice, reduceOnly: true },
            });

            return json({ success: true, takeProfit: result });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_set_take_profit"] },
    );
  },
};

export default finTradingPlugin;
