import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";

type ExchangeRegistry = {
  getInstance: (id: string) => Promise<unknown>;
  listExchanges: () => Array<{ id: string; exchange: string; testnet: boolean }>;
};

type CcxtExchange = {
  fetchTicker: (symbol: string) => Promise<Record<string, unknown>>;
  fetchOHLCV: (
    symbol: string,
    timeframe: string,
    since?: number,
    limit?: number,
  ) => Promise<Array<[number, number, number, number, number, number]>>;
  fetchOrderBook: (symbol: string, limit?: number) => Promise<Record<string, unknown>>;
  fetchTickers: (symbols?: string[]) => Promise<Record<string, Record<string, unknown>>>;
};

const json = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  details: payload,
});

/** Resolve the ExchangeRegistry service from fin-core. */
function getRegistry(api: OpenClawPluginApi): ExchangeRegistry {
  const runtime = api.runtime as unknown as { services?: Map<string, unknown> };
  const registry = runtime.services?.get?.("fin-exchange-registry") as ExchangeRegistry | undefined;
  if (!registry) {
    throw new Error("fin-core plugin not loaded — exchange registry unavailable");
  }
  return registry;
}

/** Resolve a CCXT exchange instance, falling back to the first configured exchange. */
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

const finMarketDataPlugin = {
  id: "fin-market-data",
  name: "Market Data",
  description: "Real-time and historical market data tools: prices, orderbooks, tickers",
  kind: "financial" as const,

  register(api: OpenClawPluginApi) {
    // --- fin_market_price ---
    api.registerTool(
      {
        name: "fin_market_price",
        label: "Market Price",
        description: "Fetch current price or historical OHLCV candles for a trading pair",
        parameters: Type.Object({
          symbol: Type.String({ description: "Trading pair symbol (e.g. BTC/USDT, ETH/USDT)" }),
          exchange: Type.Optional(
            Type.String({
              description: "Exchange ID to query (e.g. binance, okx). Uses default if omitted.",
            }),
          ),
          timeframe: Type.Optional(
            Type.Unsafe<"1m" | "5m" | "1h" | "4h" | "1d">({
              type: "string",
              enum: ["1m", "5m", "1h", "4h", "1d"],
              description: "Candle timeframe for historical OHLCV data",
            }),
          ),
          limit: Type.Optional(
            Type.Number({ description: "Number of candles to return (default 100)" }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          try {
            const symbol = params.symbol as string;
            const timeframe = (params.timeframe as string | undefined) ?? "1h";
            const limit = (params.limit as number | undefined) ?? 100;

            const { exchange, exchangeId } = await resolveExchange(
              api,
              params.exchange as string | undefined,
            );

            // Fetch current ticker for latest price
            const ticker = await exchange.fetchTicker(symbol);

            // Fetch OHLCV candles
            const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
            const formattedCandles = candles.map(([ts, open, high, low, close, volume]) => ({
              timestamp: new Date(ts).toISOString(),
              open,
              high,
              low,
              close,
              volume,
            }));

            return json({
              symbol,
              exchange: exchangeId,
              price: ticker.last,
              change24h: ticker.change,
              changePct24h: ticker.percentage,
              high24h: ticker.high,
              low24h: ticker.low,
              volume24h: ticker.quoteVolume,
              timeframe,
              candles: formattedCandles,
            });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_market_price"] },
    );

    // --- fin_market_overview ---
    api.registerTool(
      {
        name: "fin_market_overview",
        label: "Market Overview",
        description:
          "Get market overview with top movers, volume leaders, and market summary from an exchange",
        parameters: Type.Object({
          exchange: Type.Optional(
            Type.String({ description: "Exchange ID to query. Uses default if omitted." }),
          ),
          sort_by: Type.Optional(
            Type.Unsafe<"change" | "volume" | "price">({
              type: "string",
              enum: ["change", "volume", "price"],
              description: "Sort tickers by: change (24h %), volume, or price (default: volume)",
            }),
          ),
          limit: Type.Optional(
            Type.Number({ description: "Number of top tickers to return (default 20)" }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          try {
            const sortBy = (params.sort_by as string | undefined) ?? "volume";
            const limit = (params.limit as number | undefined) ?? 20;

            const { exchange, exchangeId } = await resolveExchange(
              api,
              params.exchange as string | undefined,
            );

            const tickers = await exchange.fetchTickers();
            const tickerList = Object.values(tickers)
              .filter((t) => t.last != null && t.quoteVolume != null)
              .map((t) => ({
                symbol: t.symbol as string,
                price: t.last as number,
                change24h: (t.change as number) ?? 0,
                changePct24h: (t.percentage as number) ?? 0,
                volume24h: (t.quoteVolume as number) ?? 0,
                high24h: t.high as number | null,
                low24h: t.low as number | null,
              }));

            // Sort
            if (sortBy === "change") {
              tickerList.sort((a, b) => Math.abs(b.changePct24h) - Math.abs(a.changePct24h));
            } else if (sortBy === "price") {
              tickerList.sort((a, b) => b.price - a.price);
            } else {
              tickerList.sort((a, b) => b.volume24h - a.volume24h);
            }

            const topTickers = tickerList.slice(0, limit);

            // Compute summary stats
            const gainers = tickerList.filter((t) => t.changePct24h > 0).length;
            const losers = tickerList.filter((t) => t.changePct24h < 0).length;
            const totalVolume = tickerList.reduce((sum, t) => sum + t.volume24h, 0);

            return json({
              exchange: exchangeId,
              totalTickers: tickerList.length,
              summary: {
                gainers,
                losers,
                unchanged: tickerList.length - gainers - losers,
                totalVolume24h: totalVolume,
              },
              sortedBy: sortBy,
              tickers: topTickers,
            });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_market_overview"] },
    );

    // --- fin_orderbook ---
    api.registerTool(
      {
        name: "fin_orderbook",
        label: "Order Book",
        description: "Fetch order book depth showing bids and asks for a trading pair",
        parameters: Type.Object({
          symbol: Type.String({ description: "Trading pair symbol (e.g. BTC/USDT)" }),
          exchange: Type.Optional(
            Type.String({ description: "Exchange ID to query. Uses default if omitted." }),
          ),
          limit: Type.Optional(
            Type.Number({
              description: "Depth limit — number of price levels per side (default 25)",
            }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          try {
            const symbol = params.symbol as string;
            const limit = (params.limit as number | undefined) ?? 25;

            const { exchange, exchangeId } = await resolveExchange(
              api,
              params.exchange as string | undefined,
            );

            const book = await exchange.fetchOrderBook(symbol, limit);

            const bids = (book.bids as Array<[number, number]>).map(([price, amount]) => ({
              price,
              amount,
            }));
            const asks = (book.asks as Array<[number, number]>).map(([price, amount]) => ({
              price,
              amount,
            }));

            const bidTotal = bids.reduce((s, b) => s + b.price * b.amount, 0);
            const askTotal = asks.reduce((s, a) => s + a.price * a.amount, 0);
            const spread =
              asks.length > 0 && bids.length > 0 ? asks[0]!.price - bids[0]!.price : null;
            const spreadPct =
              spread != null && bids[0]!.price > 0 ? (spread / bids[0]!.price) * 100 : null;

            return json({
              symbol,
              exchange: exchangeId,
              timestamp: book.timestamp
                ? new Date(book.timestamp as number).toISOString()
                : new Date().toISOString(),
              spread,
              spreadPct: spreadPct != null ? Number(spreadPct.toFixed(4)) : null,
              bidDepthUsd: Number(bidTotal.toFixed(2)),
              askDepthUsd: Number(askTotal.toFixed(2)),
              bids,
              asks,
            });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_orderbook"] },
    );

    // --- fin_ticker_info ---
    api.registerTool(
      {
        name: "fin_ticker_info",
        label: "Ticker Info",
        description: "Get detailed ticker information including 24h volume, price change, high/low",
        parameters: Type.Object({
          symbol: Type.String({
            description: "Trading pair symbol (e.g. BTC/USDT, ETH/BTC)",
          }),
          exchange: Type.Optional(
            Type.String({ description: "Exchange ID to query. Uses default if omitted." }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          try {
            const symbol = params.symbol as string;

            const { exchange, exchangeId } = await resolveExchange(
              api,
              params.exchange as string | undefined,
            );

            const ticker = await exchange.fetchTicker(symbol);

            return json({
              symbol,
              exchange: exchangeId,
              last: ticker.last,
              bid: ticker.bid,
              ask: ticker.ask,
              high24h: ticker.high,
              low24h: ticker.low,
              open24h: ticker.open,
              close24h: ticker.close,
              volume24h: ticker.baseVolume,
              quoteVolume24h: ticker.quoteVolume,
              change24h: ticker.change,
              changePct24h: ticker.percentage,
              vwap: ticker.vwap,
              timestamp: ticker.datetime ?? new Date().toISOString(),
            });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) });
          }
        },
      },
      { names: ["fin_ticker_info"] },
    );
  },
};

export default finMarketDataPlugin;
