import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
/**
 * E2E test: fin-strategy-engine × Binance Testnet — Multi-Pair Full Pipeline
 *
 * Pipeline per symbol:
 *   Fetch real OHLCV → Create strategy → Backtest → Verify metrics
 * Plus cross-symbol:
 *   Walk-Forward validation → Strategy Registry round-trip → Cost impact
 *
 * Requires env vars:
 *   BINANCE_TESTNET_API_KEY
 *   BINANCE_TESTNET_SECRET
 *
 * Run:
 *   LIVE=1 BINANCE_TESTNET_API_KEY=xxx BINANCE_TESTNET_SECRET=xxx \
 *     npx vitest run extensions/fin-strategy-engine/src/backtest-engine.live.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExchangeRegistry } from "../../fin-core/src/exchange-registry.js";
import type { OHLCV } from "../../fin-data-bus/src/types.js";
import { BacktestEngine } from "./backtest-engine.js";
import { createRsiMeanReversion } from "./builtin-strategies/rsi-mean-reversion.js";
import { createSmaCrossover } from "./builtin-strategies/sma-crossover.js";
import { StrategyRegistry } from "./strategy-registry.js";
import type { BacktestConfig, BacktestResult } from "./types.js";
import { WalkForward } from "./walk-forward.js";

const LIVE = process.env.LIVE === "1" || process.env.BINANCE_E2E === "1";
const API_KEY = process.env.BINANCE_TESTNET_API_KEY ?? "";
const SECRET = process.env.BINANCE_TESTNET_SECRET ?? "";

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"] as const;

type CcxtExchange = {
  fetchOHLCV: (
    symbol: string,
    timeframe: string,
    since?: number,
    limit?: number,
  ) => Promise<Array<[number, number, number, number, number, number]>>;
};

/** Convert raw CCXT OHLCV tuples to our OHLCV type. */
function toOHLCV(raw: Array<[number, number, number, number, number, number]>): OHLCV[] {
  return raw.map(([ts, open, high, low, close, volume]) => ({
    timestamp: ts,
    open,
    high,
    low,
    close,
    volume,
  }));
}

/** Common metric assertions applied to every backtest result. */
function assertValidMetrics(result: BacktestResult, symbol: string) {
  expect(result.equityCurve.length).toBeGreaterThan(0);
  expect(result.initialCapital).toBe(10000);
  expect(result.finalEquity).toBeGreaterThan(0);
  expect(typeof result.sharpe).toBe("number");
  expect(Number.isNaN(result.sharpe)).toBe(false);
  expect(typeof result.sortino).toBe("number");
  expect(typeof result.maxDrawdown).toBe("number");
  expect(result.maxDrawdown).toBeLessThanOrEqual(0);
  expect(typeof result.winRate).toBe("number");
  expect(typeof result.profitFactor).toBe("number");
  expect(result.dailyReturns.length).toBe(result.equityCurve.length - 1);

  // Equity curve should never go negative
  for (const eq of result.equityCurve) {
    expect(eq).toBeGreaterThanOrEqual(0);
  }

  // If there are trades, each trade must have valid fields
  for (const trade of result.trades) {
    expect(trade.symbol).toBe(symbol);
    expect(trade.entryPrice).toBeGreaterThan(0);
    expect(trade.exitPrice).toBeGreaterThan(0);
    expect(trade.quantity).toBeGreaterThan(0);
  }
}

function logResult(label: string, result: BacktestResult) {
  console.log(`  ${label}:`);
  console.log(
    `    Trades: ${result.totalTrades} | Return: ${result.totalReturn.toFixed(2)}% | Sharpe: ${result.sharpe.toFixed(3)}`,
  );
  console.log(
    `    MaxDD: ${result.maxDrawdown.toFixed(2)}% | WinRate: ${result.winRate.toFixed(1)}% | PF: ${result.profitFactor.toFixed(2)}`,
  );
  console.log(
    `    Equity: $${result.initialCapital.toFixed(0)} → $${result.finalEquity.toFixed(2)}`,
  );
}

describe.skipIf(!LIVE || !API_KEY || !SECRET)("Backtest E2E — Multi-Pair Binance Testnet", () => {
  let registry: ExchangeRegistry;
  const dataBySymbol = new Map<string, OHLCV[]>();
  const engine = new BacktestEngine();
  const config: BacktestConfig = {
    capital: 10000,
    commissionRate: 0.001,
    slippageBps: 5,
    market: "crypto",
  };
  let tempDir: string;

  // ---------------------------------------------------------------
  // Setup: connect to testnet, fetch OHLCV for all 3 symbols
  // ---------------------------------------------------------------
  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "fin-backtest-live-"));

    registry = new ExchangeRegistry();
    registry.addExchange("binance-testnet", {
      exchange: "binance",
      apiKey: API_KEY,
      secret: SECRET,
      testnet: true,
      defaultType: "spot",
    });

    const instance = await registry.getInstance("binance-testnet");
    const ccxt = instance as CcxtExchange;

    for (const symbol of SYMBOLS) {
      const raw = await ccxt.fetchOHLCV(symbol, "1h", undefined, 500);
      const ohlcv = toOHLCV(raw);
      dataBySymbol.set(symbol, ohlcv);

      const first = ohlcv[0]!;
      const last = ohlcv[ohlcv.length - 1]!;
      console.log(
        `  ${symbol}: ${ohlcv.length} bars | ` +
          `${new Date(first.timestamp).toISOString().slice(0, 10)} → ${new Date(last.timestamp).toISOString().slice(0, 10)} | ` +
          `$${Math.min(...ohlcv.map((d) => d.low)).toFixed(2)} – $${Math.max(...ohlcv.map((d) => d.high)).toFixed(2)}`,
      );
    }
  }, 60_000);

  afterAll(async () => {
    await registry.closeAll();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------
  // 1. SMA Crossover backtest × 3 symbols
  // ---------------------------------------------------------------
  for (const symbol of SYMBOLS) {
    it(`SMA Crossover backtest on ${symbol}`, async () => {
      const data = dataBySymbol.get(symbol)!;
      expect(data.length).toBeGreaterThanOrEqual(500);

      const strategy = createSmaCrossover({
        fastPeriod: 10,
        slowPeriod: 30,
        symbol,
      });
      const result = await engine.run(strategy, data, config);

      expect(result.strategyId).toBe("sma-crossover");
      expect(result.equityCurve.length).toBe(data.length);
      assertValidMetrics(result, symbol);
      logResult(`SMA Crossover [${symbol}]`, result);
    });
  }

  // ---------------------------------------------------------------
  // 2. RSI Mean Reversion backtest × 3 symbols
  // ---------------------------------------------------------------
  for (const symbol of SYMBOLS) {
    it(`RSI Mean Reversion backtest on ${symbol}`, async () => {
      const data = dataBySymbol.get(symbol)!;

      const strategy = createRsiMeanReversion({
        period: 14,
        oversold: 30,
        overbought: 70,
        symbol,
      });
      const result = await engine.run(strategy, data, config);

      expect(result.strategyId).toBe("rsi-mean-reversion");
      expect(result.equityCurve.length).toBe(data.length);
      assertValidMetrics(result, symbol);
      logResult(`RSI MeanRev [${symbol}]`, result);
    });
  }

  // ---------------------------------------------------------------
  // 3. Walk-Forward validation on BTC/USDT (SMA Crossover)
  // ---------------------------------------------------------------
  it("Walk-Forward validation on BTC/USDT", async () => {
    const data = dataBySymbol.get("BTC/USDT")!;
    const strategy = createSmaCrossover({ fastPeriod: 10, slowPeriod: 30, symbol: "BTC/USDT" });
    const wf = new WalkForward(engine);

    const result = await wf.validate(strategy, data, config, {
      windows: 3,
      threshold: 0.5,
    });

    expect(result.windows.length).toBe(3);
    expect(typeof result.combinedTestSharpe).toBe("number");
    expect(Number.isNaN(result.combinedTestSharpe)).toBe(false);
    expect(typeof result.avgTrainSharpe).toBe("number");
    expect(typeof result.ratio).toBe("number");
    expect(result.threshold).toBe(0.5);

    // Window boundaries must not overlap
    for (let i = 0; i < result.windows.length; i++) {
      const w = result.windows[i]!;
      expect(w.trainEnd).toBeLessThanOrEqual(w.testStart);
      if (i > 0) {
        const prev = result.windows[i - 1]!;
        expect(prev.testEnd).toBeLessThanOrEqual(w.trainStart);
      }
    }

    console.log(`  Walk-Forward BTC/USDT:`);
    console.log(
      `    Passed: ${result.passed} | Ratio: ${result.ratio.toFixed(3)} (threshold: ${result.threshold})`,
    );
    console.log(
      `    AvgTrainSharpe: ${result.avgTrainSharpe.toFixed(3)} | CombinedTestSharpe: ${result.combinedTestSharpe.toFixed(3)}`,
    );
    for (let i = 0; i < result.windows.length; i++) {
      const w = result.windows[i]!;
      console.log(
        `    Window ${i + 1}: train=${w.trainSharpe.toFixed(3)}, test=${w.testSharpe.toFixed(3)}`,
      );
    }
  });

  // ---------------------------------------------------------------
  // 4. Strategy Registry round-trip: create → backtest → store → read
  // ---------------------------------------------------------------
  it("Strategy Registry: create → backtest → persist → reload", async () => {
    const regPath = join(tempDir, "fin-strategies.json");
    const reg = new StrategyRegistry(regPath);

    // Create strategies for each symbol
    for (const symbol of SYMBOLS) {
      const def = createSmaCrossover({ fastPeriod: 10, slowPeriod: 30, symbol });
      def.id = `sma-${symbol.replace("/", "-").toLowerCase()}`;
      def.name = `SMA Crossover ${symbol}`;
      reg.create(def);
    }

    expect(reg.list().length).toBe(3);

    // Backtest and store results for each
    for (const symbol of SYMBOLS) {
      const id = `sma-${symbol.replace("/", "-").toLowerCase()}`;
      const record = reg.get(id)!;
      expect(record).toBeDefined();

      const data = dataBySymbol.get(symbol)!;
      const result = await engine.run(record.definition, data, config);
      reg.updateBacktest(id, result);
      reg.updateLevel(id, "L1_BACKTEST");
    }

    // Reload from disk and verify
    const reg2 = new StrategyRegistry(regPath);
    expect(reg2.list().length).toBe(3);

    const backtested = reg2.list({ level: "L1_BACKTEST" });
    expect(backtested.length).toBe(3);

    for (const record of backtested) {
      expect(record.lastBacktest).toBeDefined();
      expect(record.lastBacktest!.totalTrades).toBeGreaterThanOrEqual(0);
      expect(typeof record.lastBacktest!.sharpe).toBe("number");
      console.log(
        `  Registry [${record.name}]: level=${record.level} | ` +
          `return=${record.lastBacktest!.totalReturn.toFixed(2)}% | ` +
          `sharpe=${record.lastBacktest!.sharpe.toFixed(3)}`,
      );
    }
  });

  // ---------------------------------------------------------------
  // 5. Cost impact: with vs without commission/slippage per symbol
  // ---------------------------------------------------------------
  it("cost drag comparison across all symbols", async () => {
    const zeroCostConfig: BacktestConfig = {
      capital: 10000,
      commissionRate: 0,
      slippageBps: 0,
      market: "crypto",
    };

    for (const symbol of SYMBOLS) {
      const data = dataBySymbol.get(symbol)!;
      const strategy = createSmaCrossover({ fastPeriod: 10, slowPeriod: 30, symbol });

      const withCosts = await engine.run(strategy, data, config);
      const noCosts = await engine.run(strategy, data, zeroCostConfig);

      // Costs can only reduce or maintain returns, never improve them
      expect(noCosts.finalEquity).toBeGreaterThanOrEqual(withCosts.finalEquity - 0.01);

      const drag = noCosts.totalReturn - withCosts.totalReturn;
      console.log(
        `  ${symbol}: noCost=${noCosts.totalReturn.toFixed(2)}% | ` +
          `withCost=${withCosts.totalReturn.toFixed(2)}% | drag=${drag.toFixed(2)}%`,
      );
    }
  });
});
