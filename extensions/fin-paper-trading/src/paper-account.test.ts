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
