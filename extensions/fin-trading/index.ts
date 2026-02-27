import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { CcxtBridge } from "./src/ccxt-bridge.js";

type ExchangeRegistry = {
  getInstance: (id: string) => Promise<unknown>;
  listExchanges: () => Array<{ id: string; exchange: string; testnet: boolean }>;
};

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

type ResolvedBridge = {
  bridge: CcxtBridge;
  exchangeId: string;
  testnet: boolean;
};

const json = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  details: payload,
});

/** Get the ExchangeRegistry service from fin-core. */
function getRegistry(api: OpenClawPluginApi): ExchangeRegistry | undefined {
  return api.runtime.services.get("fin-exchange-registry") as ExchangeRegistry | undefined;
}

/**
 * Resolve an exchange instance from the fin-core ExchangeRegistry service,
 * then wrap it in a CcxtBridge for unified access.
 * When exchangeId is omitted, falls back to the first configured exchange.
 */
async function resolveBridge(api: OpenClawPluginApi, exchangeId?: string): Promise<ResolvedBridge> {
  const registry = getRegistry(api);
  if (!registry) {
    throw new Error("fin-core plugin not loaded — exchange registry unavailable");
  }

  let resolvedId = exchangeId?.trim() ?? "";

  // Fall back to the first configured exchange when none specified.
  if (!resolvedId) {
    const exchanges = registry.listExchanges();
    if (exchanges.length === 0) {
      throw new Error(
        "No exchanges configured. Add one in config financial.exchanges or run: openfinclaw exchange add <name>",
      );
    }
    resolvedId = exchanges[0].id;
  }

  const exchanges = registry.listExchanges();
  const meta = exchanges.find((e) => e.id === resolvedId);
  const testnet = meta?.testnet ?? false;

  const instance = await registry.getInstance(resolvedId);
  return { bridge: new CcxtBridge(instance), exchangeId: resolvedId, testnet };
}

/** Resolve the RiskController service from fin-core. Returns undefined if not available. */
function getRiskController(api: OpenClawPluginApi): RiskController | undefined {
  return api.runtime.services.get("fin-risk-controller") as RiskController | undefined;
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
        description:
          "Place a market or limit order on an exchange. Subject to risk controls. If exchange is omitted, uses the first configured exchange.",
        parameters: Type.Object({
          exchange: Type.Optional(
            Type.String({ description: "Exchange connection ID (omit to use default)" }),
          ),
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
            const symbol = String(params.symbol ?? "").trim();
            const side = String(params.side ?? "") as "buy" | "sell";
            const type = String(params.type ?? "") as "market" | "limit";
            const amount = Number(params.amount);

            if (!symbol || !side || !type || !amount) {
              throw new Error("symbol, side, type, and amount are required");
            }

            const { bridge, exchangeId, testnet } = await resolveBridge(
              api,
              params.exchange as string | undefined,
            );

            // Risk evaluation: fetch current price to estimate USD value
            const riskCtrl = getRiskController(api);
            if (riskCtrl) {
              const ticker = await bridge.fetchTicker(symbol);
              const currentPrice = Number(ticker.last ?? 0);
              const estimatedValueUsd = currentPrice * amount;

              const evaluation = riskCtrl.evaluate(
                {
                  exchange: exchangeId,
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
                  exchange: exchangeId,
                  testnet,
                });
              }

              if (evaluation.tier === "confirm") {
                return json({
                  success: false,
                  requiresConfirmation: true,
                  reason: evaluation.reason,
                  estimatedValueUsd,
                  currentPrice,
                  order: { exchange: exchangeId, symbol, side, type, amount, price: params.price },
                  hint: "User must confirm this trade before execution. Re-call with the same parameters after user approval.",
                  exchange: exchangeId,
                  testnet,
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

            return json({ success: true, order: result, exchange: exchangeId, testnet });
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
          exchange: Type.Optional(
            Type.String({ description: "Exchange connection ID (omit to use default)" }),
          ),
          orderId: Type.String({ description: "Order ID to cancel" }),
          symbol: Type.String({ description: "Trading pair symbol" }),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const orderId = String(params.orderId ?? "").trim();
            const symbol = String(params.symbol ?? "").trim();

            if (!orderId || !symbol) {
              throw new Error("orderId and symbol are required");
            }

            const { bridge, exchangeId, testnet } = await resolveBridge(
              api,
              params.exchange as string | undefined,
            );
            const result = await bridge.cancelOrder(orderId, symbol);
            return json({ success: true, cancelled: result, exchange: exchangeId, testnet });
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
          exchange: Type.Optional(
            Type.String({ description: "Exchange connection ID (omit to use default)" }),
          ),
          orderId: Type.String({ description: "Existing order ID to modify" }),
          symbol: Type.String({ description: "Trading pair symbol" }),
          amount: Type.Optional(Type.Number({ description: "New order amount" })),
          price: Type.Optional(Type.Number({ description: "New limit price" })),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const orderId = String(params.orderId ?? "").trim();
            const symbol = String(params.symbol ?? "").trim();

            if (!orderId || !symbol) {
              throw new Error("orderId and symbol are required");
            }

            if (params.amount == null && params.price == null) {
              throw new Error("at least one of amount or price must be provided for modification");
            }

            const { bridge, exchangeId, testnet } = await resolveBridge(
              api,
              params.exchange as string | undefined,
            );

            const existingOrder = (await bridge.fetchOrder(orderId, symbol)) as Record<
              string,
              unknown
            >;
            const existingSide = existingOrder.side;
            if (existingSide !== "buy" && existingSide !== "sell") {
              throw new Error(
                `Unable to infer existing order side for ${orderId}. Found: ${String(existingSide)}`,
              );
            }
            const existingType = existingOrder.type === "limit" ? "limit" : "market";

            // Risk evaluation for modifications
            const riskCtrl = getRiskController(api);
            if (riskCtrl && typeof params.amount === "number") {
              const ticker = await bridge.fetchTicker(symbol);
              const currentPrice = Number(ticker.last ?? 0);
              const estimatedValueUsd = currentPrice * (params.amount as number);

              const evaluation = riskCtrl.evaluate(
                {
                  exchange: exchangeId,
                  symbol,
                  side: existingSide,
                  type: typeof params.price === "number" ? "limit" : existingType,
                  amount: params.amount as number,
                },
                estimatedValueUsd,
              );

              if (evaluation.tier === "reject") {
                return json({
                  success: false,
                  rejected: true,
                  reason: evaluation.reason,
                  estimatedValueUsd,
                  exchange: exchangeId,
                  testnet,
                });
              }

              if (evaluation.tier === "confirm") {
                return json({
                  success: false,
                  requiresConfirmation: true,
                  reason: evaluation.reason,
                  estimatedValueUsd,
                  hint: "User must confirm this modification before execution.",
                  exchange: exchangeId,
                  testnet,
                });
              }
            }

            // Cancel-and-replace: cancel the existing order, then place a new one.
            const cancelled = await bridge.cancelOrder(orderId, symbol);

            // Determine new order parameters.
            const newAmount = typeof params.amount === "number" ? params.amount : 0;
            const newPrice = typeof params.price === "number" ? params.price : undefined;

            if (newAmount <= 0) {
              return json({
                success: true,
                note: "Order cancelled; no replacement placed (amount not specified).",
                cancelled,
                exchange: exchangeId,
                testnet,
              });
            }

            // TODO: Infer side and type from the original order.
            const replacement = await bridge.placeOrder({
              symbol,
              side: existingSide,
              type: newPrice ? "limit" : existingType,
              amount: newAmount,
              price: newPrice,
            });

            return json({
              success: true,
              cancelled,
              replacement,
              exchange: exchangeId,
              testnet,
            });
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
          exchange: Type.Optional(
            Type.String({ description: "Exchange connection ID (omit to use default)" }),
          ),
          symbol: Type.String({ description: "Trading pair symbol" }),
          stopPrice: Type.Number({ description: "Stop-loss trigger price" }),
          amount: Type.Optional(
            Type.Number({ description: "Amount to close at stop (defaults to full position)" }),
          ),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const symbol = String(params.symbol ?? "").trim();
            const stopPrice = Number(params.stopPrice);

            if (!symbol || !stopPrice) {
              throw new Error("symbol and stopPrice are required");
            }

            const { bridge, exchangeId, testnet } = await resolveBridge(
              api,
              params.exchange as string | undefined,
            );

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

            return json({ success: true, stopLoss: result, exchange: exchangeId, testnet });
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
          exchange: Type.Optional(
            Type.String({ description: "Exchange connection ID (omit to use default)" }),
          ),
          symbol: Type.String({ description: "Trading pair symbol" }),
          profitPrice: Type.Number({ description: "Take-profit trigger price" }),
          amount: Type.Optional(
            Type.Number({ description: "Amount to close at target (defaults to full position)" }),
          ),
        }),
        async execute(_toolCallId: string, params: Record<string, unknown>) {
          try {
            const symbol = String(params.symbol ?? "").trim();
            const profitPrice = Number(params.profitPrice);

            if (!symbol || !profitPrice) {
              throw new Error("symbol and profitPrice are required");
            }

            const { bridge, exchangeId, testnet } = await resolveBridge(
              api,
              params.exchange as string | undefined,
            );

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

            return json({ success: true, takeProfit: result, exchange: exchangeId, testnet });
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
