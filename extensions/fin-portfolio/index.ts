import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";

type ExchangeRegistry = {
  getInstance: (id: string) => Promise<unknown>;
  listExchanges: () => Array<{ id: string; exchange: string; testnet: boolean }>;
};

type CcxtExchange = {
  fetchBalance: () => Promise<Record<string, unknown>>;
  fetchPositions: (symbols?: string[]) => Promise<unknown[]>;
  fetchClosedOrders: (symbol?: string, since?: number, limit?: number) => Promise<unknown[]>;
  fetchTicker: (symbol: string) => Promise<Record<string, unknown>>;
};

const json = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  details: payload,
});

function getRegistry(api: OpenClawPluginApi): ExchangeRegistry {
  const runtime = api.runtime as unknown as { services?: Map<string, unknown> };
  const registry = runtime.services?.get?.("fin-exchange-registry") as ExchangeRegistry | undefined;
  if (!registry) {
    throw new Error("fin-core plugin not loaded — exchange registry unavailable");
  }
  return registry;
}

async function resolveExchange(
  api: OpenClawPluginApi,
  exchangeId: string | undefined,
): Promise<{ exchange: CcxtExchange; exchangeId: string }> {
  const registry = getRegistry(api);
  let id = exchangeId;
  if (!id || id === "default") {
    const exchanges = registry.listExchanges();
    if (exchanges.length === 0) {
      throw new Error(
        "No exchanges configured. Run: openfinclaw exchange add <name> --exchange binance --api-key <key> --secret <secret>",
      );
    }
    id = exchanges[0]!.id;
  }
  const instance = await registry.getInstance(id);
  return { exchange: instance as CcxtExchange, exchangeId: id };
}

/** Get all configured exchanges from registry. */
async function resolveAllExchanges(
  api: OpenClawPluginApi,
): Promise<Array<{ exchange: CcxtExchange; exchangeId: string; exchangeType: string }>> {
  const registry = getRegistry(api);
  const list = registry.listExchanges();
  if (list.length === 0) {
    throw new Error(
      "No exchanges configured. Run: openfinclaw exchange add <name> --exchange binance --api-key <key> --secret <secret>",
    );
  }
  const results: Array<{ exchange: CcxtExchange; exchangeId: string; exchangeType: string }> = [];
  for (const entry of list) {
    const instance = await registry.getInstance(entry.id);
    results.push({
      exchange: instance as CcxtExchange,
      exchangeId: entry.id,
      exchangeType: entry.exchange,
    });
  }
  return results;
}

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
          try {
            const currency = (params.currency as string | undefined) ?? "USD";
            const exchanges = await resolveAllExchanges(api);

            const exchangeBalances: Array<{
              exchangeId: string;
              exchangeType: string;
              assets: Array<{ currency: string; total: number; free: number; used: number }>;
              totalEstimateUsd: number;
            }> = [];

            let grandTotal = 0;
            const assetMap = new Map<string, number>();

            for (const { exchange, exchangeId, exchangeType } of exchanges) {
              try {
                const balance = await exchange.fetchBalance();
                const total = balance.total as Record<string, number> | undefined;
                const free = balance.free as Record<string, number> | undefined;
                const used = balance.used as Record<string, number> | undefined;

                if (!total) continue;

                const assets: Array<{
                  currency: string;
                  total: number;
                  free: number;
                  used: number;
                }> = [];

                for (const [coin, amount] of Object.entries(total)) {
                  if (amount <= 0) continue;
                  assets.push({
                    currency: coin,
                    total: amount,
                    free: free?.[coin] ?? 0,
                    used: used?.[coin] ?? 0,
                  });
                  assetMap.set(coin, (assetMap.get(coin) ?? 0) + amount);
                }

                // Rough USD estimate: USDT/USDC/USD count directly, others need ticker lookup
                let exchangeTotal = 0;
                for (const a of assets) {
                  if (["USDT", "USDC", "USD", "BUSD", "DAI"].includes(a.currency)) {
                    exchangeTotal += a.total;
                  }
                  // For non-stablecoin assets, try to estimate value
                }

                exchangeBalances.push({
                  exchangeId,
                  exchangeType,
                  assets: assets.sort((a, b) => b.total - a.total),
                  totalEstimateUsd: exchangeTotal,
                });
                grandTotal += exchangeTotal;
              } catch (err) {
                api.logger.warn(
                  `fin-portfolio: failed to fetch balance from ${exchangeId}: ${err instanceof Error ? err.message : String(err)}`,
                );
                exchangeBalances.push({
                  exchangeId,
                  exchangeType,
                  assets: [],
                  totalEstimateUsd: 0,
                });
              }
            }

            // Aggregate all assets across exchanges
            const aggregatedAssets = Array.from(assetMap.entries())
              .map(([coin, total]) => ({ currency: coin, total }))
              .sort((a, b) => b.total - a.total);

            return json({
              currency,
              exchangeCount: exchanges.length,
              totalEstimateUsd: grandTotal,
              note: "USD estimate includes stablecoins only. For full valuation, use fin_exchange_balance per exchange.",
              aggregatedAssets,
              exchanges: exchangeBalances,
            });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
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
          try {
            const period = (params.period as string | undefined) ?? "1m";
            const currency = (params.currency as string | undefined) ?? "USD";

            // Take a current snapshot as the starting point
            const exchanges = await resolveAllExchanges(api);
            let currentValue = 0;
            for (const { exchange } of exchanges) {
              try {
                const balance = await exchange.fetchBalance();
                const total = balance.total as Record<string, number> | undefined;
                if (total) {
                  for (const [coin, amount] of Object.entries(total)) {
                    if (["USDT", "USDC", "USD", "BUSD", "DAI"].includes(coin)) {
                      currentValue += amount;
                    }
                  }
                }
              } catch (err) {
                api.logger.warn(
                  `fin-portfolio: failed to fetch balance for history from exchange: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
            }

            return json({
              period,
              currency,
              currentSnapshot: {
                timestamp: new Date().toISOString(),
                estimateUsd: currentValue,
              },
              snapshots: [],
              note: "Historical snapshots require persistent storage (planned). Currently returns the latest snapshot only.",
            });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
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
          try {
            const { exchange, exchangeId } = await resolveExchange(api, params.exchange as string);

            const balance = await exchange.fetchBalance();
            const total = balance.total as Record<string, number> | undefined;
            const free = balance.free as Record<string, number> | undefined;
            const used = balance.used as Record<string, number> | undefined;

            const balances: Array<{
              currency: string;
              total: number;
              free: number;
              used: number;
            }> = [];

            let totalUsd = 0;
            if (total) {
              for (const [coin, amount] of Object.entries(total)) {
                if (amount <= 0) continue;
                balances.push({
                  currency: coin,
                  total: amount,
                  free: free?.[coin] ?? 0,
                  used: used?.[coin] ?? 0,
                });
                if (["USDT", "USDC", "USD", "BUSD", "DAI"].includes(coin)) {
                  totalUsd += amount;
                }
              }
            }

            balances.sort((a, b) => b.total - a.total);

            return json({
              exchange: exchangeId,
              balances,
              totalStablecoinUsd: Number(totalUsd.toFixed(2)),
              timestamp: new Date().toISOString(),
            });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
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
          try {
            const exchangeFilter = params.exchange as string | undefined;
            const symbolFilter = params.symbol as string | undefined;

            let targets: Array<{ exchange: CcxtExchange; exchangeId: string }>;
            if (exchangeFilter) {
              const resolved = await resolveExchange(api, exchangeFilter);
              targets = [resolved];
            } else {
              targets = await resolveAllExchanges(api);
            }

            const allPositions: Array<{
              exchange: string;
              symbol: string;
              side: string;
              contracts: number;
              entryPrice: number;
              markPrice: number;
              unrealizedPnl: number;
              leverage: number;
              liquidationPrice: number | null;
              marginMode: string;
              percentage: number;
            }> = [];

            for (const { exchange, exchangeId } of targets) {
              try {
                const symbols = symbolFilter ? [symbolFilter] : undefined;
                const positions = await exchange.fetchPositions(symbols);

                for (const pos of positions) {
                  const p = pos as Record<string, unknown>;
                  const contracts = Number(p.contracts ?? 0);
                  if (contracts === 0) continue;

                  allPositions.push({
                    exchange: exchangeId,
                    symbol: String(p.symbol ?? ""),
                    side: String(p.side ?? ""),
                    contracts,
                    entryPrice: Number(p.entryPrice ?? 0),
                    markPrice: Number(p.markPrice ?? 0),
                    unrealizedPnl: Number(p.unrealizedPnl ?? 0),
                    leverage: Number(p.leverage ?? 1),
                    liquidationPrice:
                      p.liquidationPrice != null ? Number(p.liquidationPrice) : null,
                    marginMode: String(p.marginMode ?? "cross"),
                    percentage: Number(p.percentage ?? 0),
                  });
                }
              } catch (err) {
                api.logger.warn(
                  `fin-portfolio: failed to fetch positions from ${exchangeId}: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
            }

            return json({
              exchange: exchangeFilter ?? "all",
              symbol: symbolFilter ?? "all",
              count: allPositions.length,
              positions: allPositions,
            });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
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
          try {
            const exchangeFilter = params.exchange as string | undefined;
            const symbolFilter = params.symbol as string | undefined;
            const limit = (params.limit as number | undefined) ?? 50;
            const since = params.since as string | undefined;
            const sinceMs = since ? new Date(since).getTime() : undefined;

            let targets: Array<{ exchange: CcxtExchange; exchangeId: string }>;
            if (exchangeFilter) {
              const resolved = await resolveExchange(api, exchangeFilter);
              targets = [resolved];
            } else {
              targets = await resolveAllExchanges(api);
            }

            const allOrders: Array<{
              exchange: string;
              orderId: string;
              symbol: string;
              side: string;
              type: string;
              amount: number;
              price: number;
              cost: number;
              filled: number;
              status: string;
              timestamp: string;
            }> = [];

            for (const { exchange, exchangeId } of targets) {
              try {
                const orders = await exchange.fetchClosedOrders(symbolFilter, sinceMs, limit);

                for (const order of orders) {
                  const o = order as Record<string, unknown>;
                  allOrders.push({
                    exchange: exchangeId,
                    orderId: String(o.id ?? ""),
                    symbol: String(o.symbol ?? ""),
                    side: String(o.side ?? ""),
                    type: String(o.type ?? ""),
                    amount: Number(o.amount ?? 0),
                    price: Number(o.price ?? o.average ?? 0),
                    cost: Number(o.cost ?? 0),
                    filled: Number(o.filled ?? 0),
                    status: String(o.status ?? ""),
                    timestamp: (o.datetime as string) ?? new Date().toISOString(),
                  });
                }
              } catch (err) {
                api.logger.warn(
                  `fin-portfolio: failed to fetch orders from ${exchangeId}: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
            }

            // Sort by timestamp descending
            allOrders.sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
            );

            return json({
              exchange: exchangeFilter ?? "all",
              symbol: symbolFilter ?? "all",
              count: allOrders.length,
              limit,
              since: since ?? null,
              orders: allOrders.slice(0, limit),
            });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_order_history"] },
    );
  },
};

export default finPortfolioPlugin;
