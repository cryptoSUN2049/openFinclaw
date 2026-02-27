/**
 * E2E test: fin-trading × Binance Testnet
 *
 * Requires env vars:
 *   BINANCE_TESTNET_API_KEY
 *   BINANCE_TESTNET_SECRET
 *
 * Run:
 *   LIVE=1 pnpm test:live -- extensions/fin-trading/src/ccxt-bridge.live.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExchangeRegistry } from "../../fin-core/src/exchange-registry.js";
import { CcxtBridge, CcxtBridgeError } from "./ccxt-bridge.js";

const LIVE = process.env.LIVE === "1" || process.env.BINANCE_E2E === "1";
const API_KEY = process.env.BINANCE_TESTNET_API_KEY ?? "";
const SECRET = process.env.BINANCE_TESTNET_SECRET ?? "";

describe.skipIf(!LIVE || !API_KEY || !SECRET)("Binance Testnet E2E", () => {
  let registry: ExchangeRegistry;
  let bridge: CcxtBridge;

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
    bridge = new CcxtBridge(instance);
  });

  afterAll(async () => {
    await registry.closeAll();
  });

  // ---------------------------------------------------------------
  // 1. Connectivity: fetch ticker
  // ---------------------------------------------------------------
  it("fetches BTC/USDT ticker from testnet", async () => {
    const ticker = await bridge.fetchTicker("BTC/USDT");

    expect(ticker).toBeDefined();
    expect(ticker.symbol).toBe("BTC/USDT");
    expect(typeof ticker.last).toBe("number");
    expect(Number(ticker.last)).toBeGreaterThan(0);

    console.log(`  BTC/USDT last price: ${ticker.last}`);
  });

  // ---------------------------------------------------------------
  // 2. Balance: fetch testnet balance
  // ---------------------------------------------------------------
  it("fetches testnet balance", async () => {
    const balance = await bridge.fetchBalance();

    expect(balance).toBeDefined();
    // Testnet accounts typically have test USDT
    expect(balance.info || balance.total || balance.free).toBeDefined();

    const total = balance.total as Record<string, number> | undefined;
    if (total) {
      const nonZero = Object.entries(total).filter(([, v]) => Number(v) > 0);
      const preview = nonZero
        .slice(0, 10)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      const suffix = nonZero.length > 10 ? ` ... (+${nonZero.length - 10} more)` : "";
      console.log(`  Non-zero balances (${nonZero.length}): ${preview || "(none)"}${suffix}`);
    }
  });

  // ---------------------------------------------------------------
  // 3. Place order → query → cancel (full lifecycle)
  // ---------------------------------------------------------------
  it("places a limit buy, queries it, then cancels", async () => {
    // Use a price just below market so the order stays open but passes
    // Binance's PERCENT_PRICE_BY_SIDE filter (typically allows ~80% of market).
    const ticker = await bridge.fetchTicker("BTC/USDT");
    const currentPrice = Number(ticker.last ?? 50000);
    const lowPrice = Math.round(currentPrice * 0.85); // 15% below market

    // Place a small limit buy order
    const order = await bridge.placeOrder({
      symbol: "BTC/USDT",
      side: "buy",
      type: "limit",
      amount: 0.001,
      price: lowPrice,
    });

    expect(order).toBeDefined();
    expect(order.id).toBeDefined();
    expect(order.symbol).toBe("BTC/USDT");
    expect(order.side).toBe("buy");
    console.log(`  Placed order: ${order.id} @ ${lowPrice}`);

    const orderId = String(order.id);

    // Query the order
    const fetched = await bridge.fetchOrder(orderId, "BTC/USDT");
    expect(fetched).toBeDefined();
    expect(fetched.id).toBe(orderId);
    expect(fetched.status).toBe("open");
    console.log(`  Fetched order status: ${fetched.status}`);

    // Check it appears in open orders
    const openOrders = await bridge.fetchOpenOrders("BTC/USDT");
    const found = openOrders.find((o) => (o as Record<string, unknown>).id === orderId);
    expect(found).toBeDefined();
    console.log(`  Open orders for BTC/USDT: ${openOrders.length}`);

    // Cancel the order
    const cancelled = await bridge.cancelOrder(orderId, "BTC/USDT");
    expect(cancelled).toBeDefined();
    console.log(`  Cancelled order: ${orderId}`);

    // Verify it's no longer open
    const openAfter = await bridge.fetchOpenOrders("BTC/USDT");
    const stillThere = openAfter.find((o) => (o as Record<string, unknown>).id === orderId);
    expect(stillThere).toBeUndefined();
  });

  // ---------------------------------------------------------------
  // 4. Error handling: invalid symbol
  // ---------------------------------------------------------------
  it("throws CcxtBridgeError for invalid symbol", async () => {
    try {
      await bridge.fetchTicker("INVALID/PAIR");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CcxtBridgeError);
      console.log(`  Error category: ${(err as CcxtBridgeError).category}`);
      console.log(`  Error message: ${(err as CcxtBridgeError).message}`);
    }
  });

  // ---------------------------------------------------------------
  // 5. Error handling: cancel non-existent order
  // ---------------------------------------------------------------
  it("throws CcxtBridgeError for non-existent order cancellation", async () => {
    try {
      await bridge.cancelOrder("99999999999", "BTC/USDT");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CcxtBridgeError);
      console.log(`  Error category: ${(err as CcxtBridgeError).category}`);
    }
  });

  // ---------------------------------------------------------------
  // 6. ExchangeRegistry: listExchanges shows testnet flag
  // ---------------------------------------------------------------
  it("registry reports testnet flag correctly", () => {
    const list = registry.listExchanges();
    const entry = list.find((e) => e.id === "binance-testnet");

    expect(entry).toBeDefined();
    expect(entry!.exchange).toBe("binance");
    expect(entry!.testnet).toBe(true);
  });
});
