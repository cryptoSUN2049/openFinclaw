import type { CryptoAdapter } from "./adapters/crypto-adapter.js";
import type { RegimeDetector } from "./regime-detector.js";
import type { MarketInfo, MarketRegime, MarketType, OHLCV, Ticker } from "./types.js";

export class UnifiedDataProvider {
  constructor(
    private cryptoAdapter: CryptoAdapter,
    private regimeDetector: RegimeDetector,
  ) {}

  async getOHLCV(params: {
    symbol: string;
    market: MarketType;
    timeframe: string;
    since?: number;
    limit?: number;
  }): Promise<OHLCV[]> {
    if (params.market !== "crypto") {
      throw new Error(`Market "${params.market}" not yet supported. Phase 1 supports crypto only.`);
    }
    return this.cryptoAdapter.getOHLCV(params);
  }

  async getTicker(symbol: string, market: MarketType): Promise<Ticker> {
    if (market !== "crypto") {
      throw new Error(`Market "${market}" not yet supported. Phase 1 supports crypto only.`);
    }
    return this.cryptoAdapter.getTicker(symbol);
  }

  async detectRegime(params: {
    symbol: string;
    market: MarketType;
    timeframe: string;
  }): Promise<MarketRegime> {
    const ohlcv = await this.getOHLCV({
      symbol: params.symbol,
      market: params.market,
      timeframe: params.timeframe,
      limit: 300,
    });
    return this.regimeDetector.detect(ohlcv);
  }

  getSupportedMarkets(): MarketInfo[] {
    return [
      { market: "crypto", symbols: [], available: true },
      { market: "equity", symbols: [], available: false },
      { market: "commodity", symbols: [], available: false },
    ];
  }
}
