import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";

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
          symbol: Type.String({ description: "Trading pair symbol (e.g. BTC/USDT, AAPL)" }),
          exchange: Type.Optional(
            Type.String({ description: "Exchange ID to query (e.g. binance, okx). Uses default if omitted." }),
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
          const symbol = params.symbol as string;
          const exchange = (params.exchange as string | undefined) ?? "default";
          const timeframe = (params.timeframe as string | undefined) ?? "1h";
          const limit = (params.limit as number | undefined) ?? 100;

          // TODO: Wire up to ExchangeRegistry from fin-core to fetch real market data.
          // Placeholder response until exchange adapters are connected.
          const placeholder = {
            symbol,
            exchange,
            timeframe,
            limit,
            price: null,
            candles: [],
            notice: "Placeholder: exchange registry not yet wired. Connect fin-core ExchangeRegistry to fetch real data.",
          };

          return {
            content: [{ type: "text", text: JSON.stringify(placeholder, null, 2) }],
          };
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
          "Get market overview including major indices, sector performance, and sentiment indicators",
        parameters: Type.Object({
          sector: Type.Optional(
            Type.Unsafe<"crypto" | "stocks" | "forex" | "commodities">({
              type: "string",
              enum: ["crypto", "stocks", "forex", "commodities"],
              description: "Market sector to focus on",
            }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          const sector = (params.sector as string | undefined) ?? "crypto";

          // TODO: Aggregate overview data from multiple sources/exchanges.
          const placeholder = {
            sector,
            indices: [],
            sectorPerformance: [],
            sentiment: null,
            notice: "Placeholder: market overview data sources not yet connected.",
          };

          return {
            content: [{ type: "text", text: JSON.stringify(placeholder, null, 2) }],
          };
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
            Type.Number({ description: "Depth limit — number of price levels per side (default 25)" }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          const symbol = params.symbol as string;
          const exchange = (params.exchange as string | undefined) ?? "default";
          const limit = (params.limit as number | undefined) ?? 25;

          // TODO: Fetch real orderbook via ExchangeRegistry / ccxt.
          const placeholder = {
            symbol,
            exchange,
            limit,
            bids: [],
            asks: [],
            timestamp: null,
            notice: "Placeholder: orderbook fetch not yet wired to exchange registry.",
          };

          return {
            content: [{ type: "text", text: JSON.stringify(placeholder, null, 2) }],
          };
        },
      },
      { names: ["fin_orderbook"] },
    );

    // --- fin_ticker_info ---
    api.registerTool(
      {
        name: "fin_ticker_info",
        label: "Ticker Info",
        description:
          "Get detailed ticker information including 24h volume, price change, high/low",
        parameters: Type.Object({
          symbol: Type.String({ description: "Trading pair symbol (e.g. BTC/USDT, ETH/BTC)" }),
          exchange: Type.Optional(
            Type.String({ description: "Exchange ID to query. Uses default if omitted." }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          const symbol = params.symbol as string;
          const exchange = (params.exchange as string | undefined) ?? "default";

          // TODO: Fetch real ticker via ExchangeRegistry / ccxt.
          const placeholder = {
            symbol,
            exchange,
            last: null,
            bid: null,
            ask: null,
            high24h: null,
            low24h: null,
            volume24h: null,
            change24h: null,
            changePct24h: null,
            timestamp: null,
            notice: "Placeholder: ticker fetch not yet wired to exchange registry.",
          };

          return {
            content: [{ type: "text", text: JSON.stringify(placeholder, null, 2) }],
          };
        },
      },
      { names: ["fin_ticker_info"] },
    );
  },
};

export default finMarketDataPlugin;
