import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, afterEach, vi } from "vitest";
import { calculateCommission } from "./fill-simulation/commission-model.js";
import { PaperEngine } from "./paper-engine.js";
import { PaperStore } from "./paper-store.js";

function makeEngine(): { engine: PaperEngine; store: PaperStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "paper-engine-test-"));
  const store = new PaperStore(join(dir, "test.sqlite"));
  const engine = new PaperEngine({ store, slippageBps: 5, market: "crypto" });
  return { engine, store, dir };
}

describe("PaperEngine", () => {
  let engine: PaperEngine;
  let store: PaperStore;
  let dir: string;

  afterEach(() => {
    store?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("creates account and lists it", () => {
    ({ engine, store, dir } = makeEngine());

    const state = engine.createAccount("My Portfolio", 10_000);
    expect(state.name).toBe("My Portfolio");
    expect(state.initialCapital).toBe(10_000);
    expect(state.cash).toBe(10_000);
    expect(state.id).toMatch(/^paper-/);

    const list = engine.listAccounts();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("My Portfolio");
  });

  it("submits buy order with slippage and commission", () => {
    ({ engine, store, dir } = makeEngine());

    const acct = engine.createAccount("Test", 10_000);
    const order = engine.submitOrder(
      acct.id,
      { symbol: "BTC/USDT", side: "buy", type: "market", quantity: 0.1 },
      50_000,
    );

    expect(order.status).toBe("filled");
    expect(order.fillPrice).toBeDefined();
    // Fill price should be slightly above market due to slippage (buy side)
    expect(order.fillPrice!).toBeGreaterThan(50_000);
    expect(order.commission).toBeGreaterThan(0);
    expect(order.slippage).toBeGreaterThan(0);

    const state = engine.getAccountState(acct.id);
    expect(state).not.toBeNull();
    expect(state!.positions).toHaveLength(1);
    expect(state!.cash).toBeLessThan(10_000);
  });

  it("submits sell order after buy", () => {
    ({ engine, store, dir } = makeEngine());

    const acct = engine.createAccount("Test", 10_000);
    engine.submitOrder(
      acct.id,
      { symbol: "BTC/USDT", side: "buy", type: "market", quantity: 0.1 },
      50_000,
    );

    const sell = engine.submitOrder(
      acct.id,
      { symbol: "BTC/USDT", side: "sell", type: "market", quantity: 0.1 },
      55_000,
    );

    expect(sell.status).toBe("filled");
    // Fill price should be slightly below market due to slippage (sell side)
    expect(sell.fillPrice!).toBeLessThan(55_000);

    const state = engine.getAccountState(acct.id);
    expect(state!.positions).toHaveLength(0);
  });

  it("rejects order for non-existent account", () => {
    ({ engine, store, dir } = makeEngine());

    const order = engine.submitOrder(
      "nonexistent",
      { symbol: "BTC/USDT", side: "buy", type: "market", quantity: 1 },
      50_000,
    );

    expect(order.status).toBe("rejected");
    expect(order.reason).toBe("Account not found");
  });

  it("rejects sell when no position held", () => {
    ({ engine, store, dir } = makeEngine());

    const acct = engine.createAccount("Test", 10_000);
    const order = engine.submitOrder(
      acct.id,
      { symbol: "BTC/USDT", side: "sell", type: "market", quantity: 0.1 },
      50_000,
    );

    expect(order.status).toBe("rejected");
  });

  it("rejects us_equity orders when market is closed", () => {
    ({ engine, store, dir } = makeEngine());

    // Freeze time to Saturday 15:00 UTC — US market is closed on weekends
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 7, 15, 0))); // Saturday

    const acct = engine.createAccount("Test", 100_000);
    const order = engine.submitOrder(
      acct.id,
      { symbol: "AAPL", side: "buy", type: "market", quantity: 10 },
      150,
    );

    expect(order.status).toBe("rejected");
    expect(order.reason).toContain("closed");
    expect(order.market).toBe("us_equity");

    vi.useRealTimers();
  });

  it("returns pending for limit orders that are not yet triggered", () => {
    ({ engine, store, dir } = makeEngine());

    const acct = engine.createAccount("Test", 10_000);
    const order = engine.submitOrder(
      acct.id,
      { symbol: "BTC/USDT", side: "buy", type: "limit", quantity: 0.1, limitPrice: 48_000 },
      50_000,
    );

    expect(order.status).toBe("pending");
    expect(order.reason).toBe("Limit price not reached");
  });

  it("fills limit orders when price condition is met", () => {
    ({ engine, store, dir } = makeEngine());

    const acct = engine.createAccount("Test", 10_000);
    const order = engine.submitOrder(
      acct.id,
      { symbol: "BTC/USDT", side: "buy", type: "limit", quantity: 0.1, limitPrice: 51_000 },
      50_000, // current price 50000 <= limit 51000 → fill
    );

    expect(order.status).toBe("filled");
  });

  it("getMetrics returns healthy for new account with no snapshots", () => {
    ({ engine, store, dir } = makeEngine());

    const acct = engine.createAccount("Test", 10_000);
    const metrics = engine.getMetrics(acct.id);
    expect(metrics).not.toBeNull();
    expect(metrics!.decayLevel).toBe("healthy");
  });

  it("returns null for non-existent account metrics", () => {
    ({ engine, store, dir } = makeEngine());
    expect(engine.getMetrics("nonexistent")).toBeNull();
  });

  it("updatePrices updates position and persists", () => {
    ({ engine, store, dir } = makeEngine());

    const acct = engine.createAccount("Price Update Test", 10_000);
    engine.submitOrder(
      acct.id,
      { symbol: "BTC/USDT", side: "buy", type: "market", quantity: 0.1 },
      50_000,
    );

    const updated = engine.updatePrices(acct.id, { "BTC/USDT": 55_000 });
    expect(updated).not.toBeNull();
    expect(updated!.positions[0]!.currentPrice).toBe(55_000);
    expect(updated!.positions[0]!.unrealizedPnl).toBeGreaterThan(0);

    // Verify persistence: new engine should see updated price
    const engine2 = new PaperEngine({ store, slippageBps: 5, market: "crypto" });
    const reloaded = engine2.getAccountState(acct.id);
    expect(reloaded!.positions[0]!.currentPrice).toBe(55_000);
  });

  it("updatePrices returns null for non-existent account", () => {
    ({ engine, store, dir } = makeEngine());
    expect(engine.updatePrices("nonexistent", { "BTC/USDT": 50_000 })).toBeNull();
  });

  it("recordSnapshot saves equity snapshot retrievable by getMetrics", () => {
    ({ engine, store, dir } = makeEngine());

    const acct = engine.createAccount("Snapshot Test", 10_000);
    engine.recordSnapshot(acct.id);

    const snapshots = store.getSnapshots(acct.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.equity).toBe(10_000);
    expect(snapshots[0]!.accountId).toBe(acct.id);
  });

  it("persists account across engine instances", () => {
    ({ engine, store, dir } = makeEngine());

    const acct = engine.createAccount("Persistent", 25_000);
    engine.submitOrder(
      acct.id,
      { symbol: "ETH/USDT", side: "buy", type: "market", quantity: 1 },
      3_000,
    );

    // Create a new engine instance with the same store
    const engine2 = new PaperEngine({ store, slippageBps: 5, market: "crypto" });
    const loaded = engine2.getAccountState(acct.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Persistent");
    expect(loaded!.positions).toHaveLength(1);
    expect(loaded!.positions[0]!.symbol).toBe("ETH/USDT");
  });
});

// --- Multi-market integration tests ---

describe("PaperEngine multi-market rules", () => {
  let engine: PaperEngine;
  let store: PaperStore;
  let dir: string;

  afterEach(() => {
    if (store) {
      try {
        store.close();
      } catch {
        // Already closed
      }
    }
    if (dir) rmSync(dir, { recursive: true, force: true });
    // Reset to avoid double-close
    store = undefined as unknown as PaperStore;
    dir = undefined as unknown as string;
  });

  it("A-share buy must be 100 lot multiple", () => {
    ({ engine, store, dir } = makeEngine());

    // Freeze time to a weekday during CN A-share trading hours (10:00 Shanghai = 02:00 UTC)
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 2, 2, 0))); // Monday 10:00 Shanghai

    const acct = engine.createAccount("Test CN", 1_000_000);
    const order = engine.submitOrder(
      acct.id,
      { symbol: "600519.SH", side: "buy", type: "market", quantity: 150 },
      1800,
    );

    expect(order.status).toBe("rejected");
    expect(order.reason).toContain("multiple of 100");

    vi.useRealTimers();
  });

  it("A-share price limit rejects excessive price", () => {
    ({ engine, store, dir } = makeEngine());

    // Freeze time to a weekday during CN A-share trading hours
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 2, 2, 0))); // Monday 10:00 Shanghai

    const acct = engine.createAccount("Test CN Limit", 1_000_000);
    const order = engine.submitOrder(
      acct.id,
      {
        symbol: "600519.SH",
        side: "buy",
        type: "market",
        quantity: 100,
        prevClose: 100,
      },
      112, // exceeds +10%
    );

    expect(order.status).toBe("rejected");
    expect(order.reason).toContain("price limit");

    vi.useRealTimers();
  });

  it("crypto order always fills (24/7 market)", () => {
    ({ engine, store, dir } = makeEngine());
    const acct = engine.createAccount("Crypto Always Open", 100_000);
    const order = engine.submitOrder(
      acct.id,
      { symbol: "BTC/USDT", side: "buy", type: "market", quantity: 0.1 },
      50_000,
    );

    expect(order.status).toBe("filled");
    expect(order.market).toBe("crypto");
  });

  it("cn_a_share stamp duty applied on sell", () => {
    const buyResult = calculateCommission(100_000, "cn_a_share", { side: "buy" });
    const sellResult = calculateCommission(100_000, "cn_a_share", { side: "sell" });

    // Buy: no stamp duty, just commission
    expect(buyResult.commission).toBeCloseTo(100_000 * 0.0003, 2);
    // Sell: commission + stamp duty (0.1%)
    expect(sellResult.commission).toBeCloseTo(100_000 * 0.0003 + 100_000 * 0.001, 2);
    expect(sellResult.commission).toBeGreaterThan(buyResult.commission);
  });

  it("hk_equity stamp duty on sell", () => {
    const buyResult = calculateCommission(100_000, "hk_equity", { side: "buy" });
    const sellResult = calculateCommission(100_000, "hk_equity", { side: "sell" });

    // Buy: no stamp duty
    expect(buyResult.commission).toBeCloseTo(100_000 * 0.0005, 2);
    // Sell: commission + stamp duty
    expect(sellResult.commission).toBeCloseTo(100_000 * 0.0005 + 100_000 * 0.001, 2);
  });

  it("T+1 settlement: A-share bought today cannot be sold today", () => {
    ({ engine, store, dir } = makeEngine());

    // Freeze time to a weekday during CN A-share trading hours
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 2, 2, 0))); // Monday 10:00 Shanghai

    const acct = engine.createAccount("T+1 Test", 1_000_000);

    const buyOrder = engine.submitOrder(
      acct.id,
      { symbol: "600519.SH", side: "buy", type: "market", quantity: 100 },
      1800,
    );

    expect(buyOrder.status).toBe("filled");

    // Immediately try to sell — should be rejected due to T+1
    const sellOrder = engine.submitOrder(
      acct.id,
      { symbol: "600519.SH", side: "sell", type: "market", quantity: 100 },
      1800,
    );

    expect(sellOrder.status).toBe("rejected");
    expect(sellOrder.reason).toContain("T+1");

    vi.useRealTimers();
  });

  it("market field is persisted in order", () => {
    ({ engine, store, dir } = makeEngine());
    const acct = engine.createAccount("Market Field Test", 100_000);
    const order = engine.submitOrder(
      acct.id,
      { symbol: "BTC/USDT", side: "buy", type: "market", quantity: 0.01 },
      50_000,
    );

    expect(order.market).toBe("crypto");

    // Verify persistence
    const orders = engine.getOrders(acct.id);
    expect(orders[0]!.market).toBe("crypto");
  });
});
