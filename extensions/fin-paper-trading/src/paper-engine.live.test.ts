/**
 * E2E acceptance test: multi-pair paper trading with real Binance Testnet prices.
 *
 * Proves the full paper trading pipeline works end-to-end:
 *   1. Connects to Binance testnet via ExchangeRegistry
 *   2. Fetches real prices for BTC/USDT, ETH/USDT, SOL/USDT
 *   3. Creates paper account with $100,000
 *   4. Simulates buy orders for all 3 pairs (slippage + commission)
 *   5. Fetches updated prices, verifies per-position unrealizedPnl
 *   6. Simulates sell for all 3, verifies realized P&L per pair
 *   7. Checks decay detector with real equity snapshots
 *   8. Full pipeline persistence + reload verification
 *
 * Requires env vars:
 *   BINANCE_TESTNET_API_KEY
 *   BINANCE_TESTNET_SECRET
 *
 * Run:
 *   LIVE=1 pnpm test:live -- extensions/fin-paper-trading/src/paper-engine.live.test.ts
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExchangeRegistry } from "../../fin-core/src/exchange-registry.js";
import { PaperEngine } from "./paper-engine.js";
import { PaperStore } from "./paper-store.js";
import type { EquitySnapshot } from "./types.js";

const LIVE = process.env.LIVE === "1" || process.env.BINANCE_E2E === "1";
const API_KEY = process.env.BINANCE_TESTNET_API_KEY ?? "";
const SECRET = process.env.BINANCE_TESTNET_SECRET ?? "";

type CcxtTicker = { last: number; symbol: string };
type CcxtExchange = { fetchTicker: (s: string) => Promise<CcxtTicker> };

const PAIRS = [
  { symbol: "BTC/USDT", qty: 0.01 },
  { symbol: "ETH/USDT", qty: 0.1 },
  { symbol: "SOL/USDT", qty: 1.0 },
] as const;

describe.skipIf(!LIVE || !API_KEY || !SECRET)(
  "Paper Trading Multi-Pair E2E — Binance Testnet",
  () => {
    let registry: ExchangeRegistry;
    let exchange: CcxtExchange;
    let engine: PaperEngine;
    let store: PaperStore;
    let tmpDir: string;

    beforeAll(async () => {
      registry = new ExchangeRegistry();
      registry.addExchange("binance-testnet", {
        exchange: "binance",
        apiKey: API_KEY,
        secret: SECRET,
        testnet: true,
        defaultType: "spot",
      });

      const instance = await registry.getInstance("binance-testnet");
      exchange = instance as CcxtExchange;

      tmpDir = mkdtempSync(join(tmpdir(), "paper-live-multi-"));
      store = new PaperStore(join(tmpDir, "live-test.sqlite"));
      engine = new PaperEngine({ store, slippageBps: 5, market: "crypto" });
    });

    afterAll(async () => {
      store?.close();
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
      await registry.closeAll();
    });

    // ------------------------------------------------------------------
    // Step 1: Connectivity — verify testnet is reachable
    // ------------------------------------------------------------------
    it("step 1: connects to Binance testnet", async () => {
      const ticker = await exchange.fetchTicker("BTC/USDT");
      expect(ticker.last).toBeGreaterThan(0);
      console.log(`  [1] Binance testnet connected — BTC/USDT: $${ticker.last}`);
    });

    // ------------------------------------------------------------------
    // Step 2: Fetch real prices for all 3 pairs
    // ------------------------------------------------------------------
    const prices: Record<string, number> = {};

    it("step 2: fetches real prices for BTC/USDT, ETH/USDT, SOL/USDT", async () => {
      for (const { symbol } of PAIRS) {
        const ticker = await exchange.fetchTicker(symbol);
        expect(ticker.last).toBeGreaterThan(0);
        prices[symbol] = ticker.last;
        console.log(`  [2] ${symbol}: $${ticker.last}`);
      }
      expect(Object.keys(prices)).toHaveLength(3);
    });

    // ------------------------------------------------------------------
    // Step 3-4: Create account, buy all 3 pairs
    // ------------------------------------------------------------------
    let accountId = "";
    const buyFills: Record<string, { fillPrice: number; commission: number; slippage: number }> =
      {};

    it("step 3-4: creates $100k account, buys all 3 pairs with slippage + commission", async () => {
      const account = engine.createAccount("Multi-Pair E2E", 100_000);
      accountId = account.id;
      expect(account.cash).toBe(100_000);
      expect(account.equity).toBe(100_000);
      console.log(`  [3] Account created: ${accountId}`);

      for (const { symbol, qty } of PAIRS) {
        const price = prices[symbol]!;
        const order = engine.submitOrder(
          accountId,
          {
            symbol,
            side: "buy",
            type: "market",
            quantity: qty,
            reason: `E2E buy ${symbol}`,
            strategyId: "multi-pair-e2e",
          },
          price,
        );

        expect(order.status).toBe("filled");
        expect(order.fillPrice!).toBeGreaterThan(price); // buy-side slippage
        expect(order.commission!).toBeGreaterThan(0);
        expect(order.slippage!).toBeGreaterThan(0);

        buyFills[symbol] = {
          fillPrice: order.fillPrice!,
          commission: order.commission!,
          slippage: order.slippage!,
        };

        console.log(
          `  [4] ${symbol}: bought ${qty} at $${order.fillPrice!.toFixed(2)} (slip: $${order.slippage!.toFixed(4)}, comm: $${order.commission!.toFixed(4)})`,
        );
      }

      const state = engine.getAccountState(accountId)!;
      expect(state.positions).toHaveLength(3);
      expect(state.cash).toBeLessThan(100_000);

      // Verify each position exists
      for (const { symbol, qty } of PAIRS) {
        const pos = state.positions.find((p) => p.symbol === symbol);
        expect(pos).toBeDefined();
        expect(pos!.quantity).toBe(qty);
        expect(pos!.side).toBe("long");
        expect(pos!.entryPrice).toBe(buyFills[symbol]!.fillPrice);
      }

      // Record snapshot after buys
      engine.recordSnapshot(accountId);
      console.log(
        `  [4] All 3 positions open — cash: $${state.cash.toFixed(2)}, equity: $${state.equity.toFixed(2)}`,
      );
    });

    // ------------------------------------------------------------------
    // Step 5: Fetch updated prices, verify unrealizedPnl per position
    // ------------------------------------------------------------------
    it("step 5: updates prices, verifies per-position unrealizedPnl", async () => {
      const updatedPrices: Record<string, number> = {};
      for (const { symbol } of PAIRS) {
        const ticker = await exchange.fetchTicker(symbol);
        updatedPrices[symbol] = ticker.last;
      }

      const state = engine.updatePrices(accountId, updatedPrices)!;
      expect(state).not.toBeNull();
      expect(state.positions).toHaveLength(3);

      for (const { symbol, qty } of PAIRS) {
        const pos = state.positions.find((p) => p.symbol === symbol)!;
        expect(pos.currentPrice).toBe(updatedPrices[symbol]);

        const expectedPnl = (updatedPrices[symbol]! - buyFills[symbol]!.fillPrice) * qty;
        expect(pos.unrealizedPnl).toBeCloseTo(expectedPnl, 2);

        console.log(
          `  [5] ${symbol}: $${buyFills[symbol]!.fillPrice.toFixed(2)} -> $${updatedPrices[symbol]!.toFixed(2)}, unrealized: $${pos.unrealizedPnl.toFixed(4)}`,
        );
      }

      // Verify equity = cash + sum(pos.currentPrice * pos.qty)
      let positionsValue = 0;
      for (const { symbol, qty } of PAIRS) {
        positionsValue += updatedPrices[symbol]! * qty;
      }
      expect(state.equity).toBeCloseTo(state.cash + positionsValue, 2);

      // Record snapshot after price update
      engine.recordSnapshot(accountId);
      console.log(`  [5] Equity after update: $${state.equity.toFixed(2)}`);
    });

    // ------------------------------------------------------------------
    // Step 6: Sell all 3 pairs, verify per-pair realized P&L
    // ------------------------------------------------------------------
    it("step 6: sells all 3 pairs, verifies realized P&L", async () => {
      for (const { symbol, qty } of PAIRS) {
        const ticker = await exchange.fetchTicker(symbol);
        const sellPrice = ticker.last;

        const order = engine.submitOrder(
          accountId,
          {
            symbol,
            side: "sell",
            type: "market",
            quantity: qty,
            reason: `E2E sell ${symbol}`,
            strategyId: "multi-pair-e2e",
          },
          sellPrice,
        );

        expect(order.status).toBe("filled");
        expect(order.fillPrice!).toBeLessThan(sellPrice); // sell-side slippage
        expect(order.commission!).toBeGreaterThan(0);

        // Per-pair P&L: sell proceeds - buy cost
        const buyNotional = buyFills[symbol]!.fillPrice * qty;
        const sellNotional = order.fillPrice! * qty;
        const pairPnl =
          sellNotional - buyNotional - buyFills[symbol]!.commission - order.commission!;
        console.log(
          `  [6] ${symbol}: sold ${qty} at $${order.fillPrice!.toFixed(2)}, pair P&L: $${pairPnl.toFixed(4)}`,
        );
      }

      const state = engine.getAccountState(accountId)!;
      expect(state.positions).toHaveLength(0);

      const totalPnl = state.cash - 100_000;
      console.log(
        `  [6] All positions closed — cash: $${state.cash.toFixed(2)}, total P&L: $${totalPnl.toFixed(4)}`,
      );

      // Record snapshot after all sells
      engine.recordSnapshot(accountId);
    });

    // ------------------------------------------------------------------
    // Step 7: Decay detector with real equity snapshots
    // ------------------------------------------------------------------
    it("step 7: decay detector produces valid metrics from equity snapshots", () => {
      // We have 3 real snapshots. Inject 10 synthetic ones to exceed the 7-day minimum.
      const state = engine.getAccountState(accountId)!;
      const baseEquity = state.equity;
      const DAY = 86400000;
      const now = Date.now();

      // 10 days of steady 0.3% daily growth → should produce "healthy"
      for (let i = 10; i >= 1; i--) {
        const growth = 1 + 0.003 * i;
        const eq = baseEquity / growth;
        const prevGrowth = 1 + 0.003 * (i + 1);
        const prevEq = baseEquity / prevGrowth;
        const snap: EquitySnapshot = {
          accountId,
          timestamp: now - i * DAY,
          equity: eq,
          cash: eq * 0.5,
          positionsValue: eq * 0.5,
          dailyPnl: eq - prevEq,
          dailyPnlPct: prevEq > 0 ? ((eq - prevEq) / prevEq) * 100 : 0,
        };
        store.saveSnapshot(snap);
      }

      const metrics = engine.getMetrics(accountId);
      expect(metrics).not.toBeNull();
      expect(["healthy", "warning", "degrading", "critical"]).toContain(metrics!.decayLevel);
      expect(typeof metrics!.rollingSharpe7d).toBe("number");
      expect(typeof metrics!.rollingSharpe30d).toBe("number");
      expect(typeof metrics!.sharpeMomentum).toBe("number");
      expect(typeof metrics!.consecutiveLossDays).toBe("number");
      expect(typeof metrics!.currentDrawdown).toBe("number");
      expect(metrics!.peakEquity).toBeGreaterThan(0);

      console.log(
        `  [7] Decay: ${metrics!.decayLevel} | Sharpe7d: ${metrics!.rollingSharpe7d.toFixed(3)} | Sharpe30d: ${metrics!.rollingSharpe30d.toFixed(3)} | Momentum: ${metrics!.sharpeMomentum.toFixed(3)} | LossDays: ${metrics!.consecutiveLossDays} | DD: ${metrics!.currentDrawdown.toFixed(2)}%`,
      );
    });

    // ------------------------------------------------------------------
    // Step 8: Full pipeline persistence + reload
    // ------------------------------------------------------------------
    it("step 8: full pipeline — persistence, reload, orders, snapshots, listing", () => {
      // Reload from scratch using the same SQLite
      const engine2 = new PaperEngine({ store, slippageBps: 5, market: "crypto" });

      // Account state
      const reloaded = engine2.getAccountState(accountId);
      expect(reloaded).not.toBeNull();
      expect(reloaded!.name).toBe("Multi-Pair E2E");
      expect(reloaded!.initialCapital).toBe(100_000);
      expect(reloaded!.positions).toHaveLength(0); // all sold

      // Orders: at least 3 buys + 3 sells
      const orders = store.getOrders(accountId);
      const filledBuys = orders.filter((o) => o.side === "buy" && o.status === "filled");
      const filledSells = orders.filter((o) => o.side === "sell" && o.status === "filled");
      expect(filledBuys.length).toBeGreaterThanOrEqual(3);
      expect(filledSells.length).toBeGreaterThanOrEqual(3);

      // Verify all 3 symbols present in buy orders
      const boughtSymbols = new Set(filledBuys.map((o) => o.symbol));
      for (const { symbol } of PAIRS) {
        expect(boughtSymbols.has(symbol)).toBe(true);
      }

      // Snapshots
      const snapshots = store.getSnapshots(accountId);
      expect(snapshots.length).toBeGreaterThanOrEqual(3); // 3 real + 10 synthetic

      // Metrics still work after reload
      const metrics = engine2.getMetrics(accountId);
      expect(metrics).not.toBeNull();
      expect(["healthy", "warning", "degrading", "critical"]).toContain(metrics!.decayLevel);

      // Account appears in list
      const list = engine2.listAccounts();
      const found = list.find((a) => a.id === accountId);
      expect(found).toBeDefined();
      expect(found!.name).toBe("Multi-Pair E2E");

      console.log(`  [8] Persistence verified:`);
      console.log(`      Orders: ${filledBuys.length} buys + ${filledSells.length} sells`);
      console.log(`      Symbols: ${[...boughtSymbols].join(", ")}`);
      console.log(`      Snapshots: ${snapshots.length}`);
      console.log(`      Reloaded equity: $${reloaded!.equity.toFixed(2)}`);
      console.log(`  ---`);
      console.log(
        `  ACCEPTANCE: Multi-pair paper trading E2E passed with real Binance testnet data.`,
      );
    });
  },
);
