import { describe, expect, it } from "vitest";
import { PaperAccount } from "./paper-account.js";

describe("PaperAccount", () => {
  function makeAccount(capital = 10_000) {
    return new PaperAccount({ id: "test-1", name: "Test Account", initialCapital: capital });
  }

  it("initializes with correct state", () => {
    const account = makeAccount();
    const state = account.getState();
    expect(state.id).toBe("test-1");
    expect(state.name).toBe("Test Account");
    expect(state.initialCapital).toBe(10_000);
    expect(state.cash).toBe(10_000);
    expect(state.equity).toBe(10_000);
    expect(state.positions).toHaveLength(0);
    expect(state.orders).toHaveLength(0);
  });

  it("buy reduces cash and creates position", () => {
    const account = makeAccount();
    const order = account.executeBuy({
      symbol: "BTC/USDT",
      quantity: 0.1,
      fillPrice: 50_000,
      commission: 5,
      slippage: 2.5,
    });

    expect(order.status).toBe("filled");
    expect(order.side).toBe("buy");

    const state = account.getState();
    // cost = 0.1 * 50000 + 5 = 5005
    expect(state.cash).toBe(10_000 - 5_005);
    expect(state.positions).toHaveLength(1);

    const pos = state.positions[0]!;
    expect(pos.symbol).toBe("BTC/USDT");
    expect(pos.side).toBe("long");
    expect(pos.quantity).toBe(0.1);
    expect(pos.entryPrice).toBe(50_000);
  });

  it("price increase updates unrealized P&L and equity", () => {
    const account = makeAccount();
    account.executeBuy({
      symbol: "BTC/USDT",
      quantity: 0.1,
      fillPrice: 50_000,
      commission: 5,
      slippage: 0,
    });

    account.updatePrices({ "BTC/USDT": 55_000 });

    const pos = account.getPosition("BTC/USDT");
    expect(pos).toBeDefined();
    // unrealized = (55000 - 50000) * 0.1 = 500
    expect(pos!.unrealizedPnl).toBe(500);

    // equity = cash (4995) + position value (55000 * 0.1 = 5500) = 10495
    expect(account.getEquity()).toBeCloseTo(10_495, 2);
  });

  it("sell adds cash and removes position", () => {
    const account = makeAccount();
    account.executeBuy({
      symbol: "BTC/USDT",
      quantity: 0.1,
      fillPrice: 50_000,
      commission: 5,
      slippage: 0,
    });

    const sellOrder = account.executeSell({
      symbol: "BTC/USDT",
      quantity: 0.1,
      fillPrice: 55_000,
      commission: 5.5,
      slippage: 0,
    });

    expect(sellOrder.status).toBe("filled");
    expect(sellOrder.side).toBe("sell");

    const state = account.getState();
    // sell proceeds = 0.1 * 55000 - 5.5 = 5494.5
    // cash after buy = 10000 - 5005 = 4995
    // cash after sell = 4995 + 5494.5 = 10489.5
    expect(state.cash).toBeCloseTo(10_489.5, 2);
    expect(state.positions).toHaveLength(0);
  });

  it("rejects buy when insufficient cash", () => {
    const account = makeAccount(100);
    const order = account.executeBuy({
      symbol: "BTC/USDT",
      quantity: 1,
      fillPrice: 50_000,
      commission: 50,
      slippage: 0,
    });

    expect(order.status).toBe("rejected");
    expect(account.getState().cash).toBe(100);
    expect(account.getState().positions).toHaveLength(0);
  });

  it("rejects sell when insufficient position", () => {
    const account = makeAccount();
    const order = account.executeSell({
      symbol: "BTC/USDT",
      quantity: 1,
      fillPrice: 50_000,
      commission: 0,
      slippage: 0,
    });

    expect(order.status).toBe("rejected");
  });

  it("rejects sell when quantity exceeds position", () => {
    const account = makeAccount();
    account.executeBuy({
      symbol: "BTC/USDT",
      quantity: 0.1,
      fillPrice: 50_000,
      commission: 0,
      slippage: 0,
    });

    const order = account.executeSell({
      symbol: "BTC/USDT",
      quantity: 0.5,
      fillPrice: 50_000,
      commission: 0,
      slippage: 0,
    });

    expect(order.status).toBe("rejected");
  });

  it("tracks multiple positions and calculates total equity", () => {
    const account = makeAccount(100_000);
    account.executeBuy({
      symbol: "BTC/USDT",
      quantity: 0.1,
      fillPrice: 50_000,
      commission: 5,
      slippage: 0,
    });
    account.executeBuy({
      symbol: "ETH/USDT",
      quantity: 1,
      fillPrice: 3_000,
      commission: 3,
      slippage: 0,
    });

    // cash = 100000 - 5005 - 3003 = 91992
    expect(account.getState().cash).toBeCloseTo(91_992, 2);

    account.updatePrices({ "BTC/USDT": 52_000, "ETH/USDT": 3_200 });

    // positions value: 0.1 * 52000 + 1 * 3200 = 5200 + 3200 = 8400
    // equity = 91992 + 8400 = 100392
    expect(account.getEquity()).toBeCloseTo(100_392, 2);
    expect(account.getState().positions).toHaveLength(2);
  });

  it("averages into existing position", () => {
    const account = makeAccount(100_000);
    account.executeBuy({
      symbol: "BTC/USDT",
      quantity: 0.1,
      fillPrice: 50_000,
      commission: 0,
      slippage: 0,
    });
    account.executeBuy({
      symbol: "BTC/USDT",
      quantity: 0.1,
      fillPrice: 60_000,
      commission: 0,
      slippage: 0,
    });

    const pos = account.getPosition("BTC/USDT");
    expect(pos).toBeDefined();
    expect(pos!.quantity).toBe(0.2);
    // avg entry = (50000*0.1 + 60000*0.1) / 0.2 = 55000
    expect(pos!.entryPrice).toBe(55_000);
  });

  it("getOrderHistory returns only filled orders", () => {
    const account = makeAccount(100);
    // This will be rejected (insufficient cash)
    account.executeBuy({
      symbol: "BTC/USDT",
      quantity: 1,
      fillPrice: 50_000,
      commission: 0,
      slippage: 0,
    });
    // This will be filled
    account.executeBuy({
      symbol: "BTC/USDT",
      quantity: 0.001,
      fillPrice: 50_000,
      commission: 0,
      slippage: 0,
    });

    const history = account.getOrderHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.status).toBe("filled");
  });

  // --- T+1 lot tracking tests ---

  it("locked lot cannot be sold (T+1)", () => {
    const account = makeAccount(100_000);
    const futureTime = Date.now() + 86_400_000; // 1 day ahead
    account.executeBuy({
      symbol: "600519.SH",
      quantity: 100,
      fillPrice: 1800,
      commission: 0,
      slippage: 0,
      settlableAfter: futureTime,
    });

    // Position exists but sellable quantity is 0 (lot is locked)
    expect(account.getSellableQuantity("600519.SH")).toBe(0);
  });

  it("settled lot can be sold", () => {
    const account = makeAccount(500_000);
    const pastTime = Date.now() - 1000; // already settled
    account.executeBuy({
      symbol: "600519.SH",
      quantity: 100,
      fillPrice: 1800,
      commission: 0,
      slippage: 0,
      settlableAfter: pastTime,
    });

    expect(account.getSellableQuantity("600519.SH")).toBe(100);
  });

  it("FIFO lot consumption on sell", () => {
    const account = makeAccount(1_000_000);
    const pastTime = Date.now() - 1000;
    // Two lots
    account.executeBuy({
      symbol: "600519.SH",
      quantity: 100,
      fillPrice: 1800,
      commission: 0,
      slippage: 0,
      settlableAfter: pastTime,
    });
    account.executeBuy({
      symbol: "600519.SH",
      quantity: 200,
      fillPrice: 1900,
      commission: 0,
      slippage: 0,
      settlableAfter: pastTime,
    });

    expect(account.getSellableQuantity("600519.SH")).toBe(300);

    // Sell 150: consumes first lot (100) entirely, second lot partially (50)
    account.executeSell({
      symbol: "600519.SH",
      quantity: 150,
      fillPrice: 2000,
      commission: 0,
      slippage: 0,
    });

    const pos = account.getPosition("600519.SH");
    expect(pos).toBeDefined();
    expect(pos!.quantity).toBe(150);
    expect(pos!.lots).toHaveLength(1);
    expect(pos!.lots![0]!.quantity).toBe(150); // remaining from second lot
  });

  it("mixed lots: locked + settled", () => {
    const account = makeAccount(1_000_000);
    const pastTime = Date.now() - 1000;
    const futureTime = Date.now() + 86_400_000;

    account.executeBuy({
      symbol: "600519.SH",
      quantity: 100,
      fillPrice: 1800,
      commission: 0,
      slippage: 0,
      settlableAfter: pastTime,
    });
    account.executeBuy({
      symbol: "600519.SH",
      quantity: 200,
      fillPrice: 1900,
      commission: 0,
      slippage: 0,
      settlableAfter: futureTime,
    });

    // Total quantity is 300 but only 100 sellable
    expect(account.getPosition("600519.SH")!.quantity).toBe(300);
    expect(account.getSellableQuantity("600519.SH")).toBe(100);
  });

  it("no lots means all quantity is sellable", () => {
    const account = makeAccount(100_000);
    account.executeBuy({
      symbol: "BTC/USDT",
      quantity: 0.5,
      fillPrice: 50_000,
      commission: 0,
      slippage: 0,
      // no settlableAfter
    });

    expect(account.getSellableQuantity("BTC/USDT")).toBe(0.5);
  });

  it("fromState restores lots correctly", () => {
    const account = makeAccount(500_000);
    const futureTime = Date.now() + 86_400_000;
    account.executeBuy({
      symbol: "600519.SH",
      quantity: 100,
      fillPrice: 1800,
      commission: 0,
      slippage: 0,
      settlableAfter: futureTime,
    });

    const state = account.getState();
    const restored = PaperAccount.fromState(state);
    expect(restored.getSellableQuantity("600519.SH")).toBe(0);
    expect(restored.getPosition("600519.SH")!.lots).toHaveLength(1);
    expect(restored.getPosition("600519.SH")!.lots![0]!.settlableAfter).toBe(futureTime);
  });

  it("fromState restores account correctly", () => {
    const account = makeAccount();
    account.executeBuy({
      symbol: "BTC/USDT",
      quantity: 0.1,
      fillPrice: 50_000,
      commission: 5,
      slippage: 0,
    });

    const state = account.getState();
    const restored = PaperAccount.fromState(state);
    const restoredState = restored.getState();

    expect(restoredState.id).toBe(state.id);
    expect(restoredState.cash).toBe(state.cash);
    expect(restoredState.positions).toHaveLength(1);
    expect(restoredState.positions[0]!.symbol).toBe("BTC/USDT");
    expect(restoredState.equity).toBeCloseTo(state.equity, 2);
  });
});
