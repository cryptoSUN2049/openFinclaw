import { describe, expect, it, vi } from "vitest";
import { CcxtBridge, CcxtBridgeError } from "./ccxt-bridge.js";

function makeMockExchange(overrides: Record<string, unknown> = {}) {
  return {
    createOrder: vi.fn().mockResolvedValue({ id: "order-1", status: "open" }),
    cancelOrder: vi.fn().mockResolvedValue({ id: "order-1", status: "canceled" }),
    fetchPositions: vi.fn().mockResolvedValue([]),
    fetchBalance: vi.fn().mockResolvedValue({ USDT: { free: 1000, used: 0, total: 1000 } }),
    fetchTicker: vi.fn().mockResolvedValue({ last: 50000, symbol: "BTC/USDT" }),
    fetchOpenOrders: vi.fn().mockResolvedValue([]),
    fetchOrder: vi.fn().mockResolvedValue({ id: "order-1", status: "open" }),
    ...overrides,
  };
}

describe("CcxtBridge", () => {
  it("placeOrder delegates to exchange.createOrder", async () => {
    const ex = makeMockExchange();
    const bridge = new CcxtBridge(ex);

    const result = await bridge.placeOrder({
      symbol: "BTC/USDT",
      side: "buy",
      type: "market",
      amount: 0.001,
    });

    expect(ex.createOrder).toHaveBeenCalledWith(
      "BTC/USDT",
      "market",
      "buy",
      0.001,
      undefined,
      undefined,
    );
    expect(result).toEqual({ id: "order-1", status: "open" });
  });

  it("cancelOrder delegates to exchange.cancelOrder", async () => {
    const ex = makeMockExchange();
    const bridge = new CcxtBridge(ex);

    const result = await bridge.cancelOrder("order-1", "BTC/USDT");

    expect(ex.cancelOrder).toHaveBeenCalledWith("order-1", "BTC/USDT");
    expect(result).toEqual({ id: "order-1", status: "canceled" });
  });

  it("fetchBalance delegates to exchange.fetchBalance", async () => {
    const ex = makeMockExchange();
    const bridge = new CcxtBridge(ex);

    const result = await bridge.fetchBalance();
    expect(ex.fetchBalance).toHaveBeenCalled();
    expect(result.USDT).toBeDefined();
  });

  it("fetchTicker delegates to exchange.fetchTicker", async () => {
    const ex = makeMockExchange();
    const bridge = new CcxtBridge(ex);

    const result = await bridge.fetchTicker("BTC/USDT");
    expect(ex.fetchTicker).toHaveBeenCalledWith("BTC/USDT");
    expect(result.last).toBe(50000);
  });

  it("fetchOpenOrders delegates to exchange.fetchOpenOrders", async () => {
    const ex = makeMockExchange();
    const bridge = new CcxtBridge(ex);

    await bridge.fetchOpenOrders("BTC/USDT");
    expect(ex.fetchOpenOrders).toHaveBeenCalledWith("BTC/USDT");
  });

  it("fetchOrder delegates to exchange.fetchOrder", async () => {
    const ex = makeMockExchange();
    const bridge = new CcxtBridge(ex);

    const result = await bridge.fetchOrder("order-1", "BTC/USDT");
    expect(ex.fetchOrder).toHaveBeenCalledWith("order-1", "BTC/USDT");
    expect(result.id).toBe("order-1");
  });

  it("fetchPositions passes symbol array when symbol is provided", async () => {
    const ex = makeMockExchange();
    const bridge = new CcxtBridge(ex);

    await bridge.fetchPositions("BTC/USDT");
    expect(ex.fetchPositions).toHaveBeenCalledWith(["BTC/USDT"]);
  });

  it("fetchPositions passes undefined when no symbol", async () => {
    const ex = makeMockExchange();
    const bridge = new CcxtBridge(ex);

    await bridge.fetchPositions();
    expect(ex.fetchPositions).toHaveBeenCalledWith(undefined);
  });
});

describe("CcxtBridge error handling", () => {
  it("retries read calls once on RequestTimeout and then succeeds", async () => {
    class RequestTimeout extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "RequestTimeout";
        Object.setPrototypeOf(this, new.target.prototype);
      }
    }

    const fetchBalance = vi
      .fn()
      .mockRejectedValueOnce(new RequestTimeout("timed out"))
      .mockResolvedValue({ USDT: { free: 1000, used: 0, total: 1000 } });
    const ex = makeMockExchange({ fetchBalance });
    const bridge = new CcxtBridge(ex);

    const result = await bridge.fetchBalance();
    expect(result.USDT).toBeDefined();
    expect(fetchBalance).toHaveBeenCalledTimes(2);
  });

  it("does not retry write calls to avoid duplicate order creation", async () => {
    class NetworkError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "NetworkError";
        Object.setPrototypeOf(this, new.target.prototype);
      }
    }

    const createOrder = vi.fn().mockRejectedValue(new NetworkError("Connection refused"));
    const ex = makeMockExchange({ createOrder });
    const bridge = new CcxtBridge(ex);

    await expect(
      bridge.placeOrder({
        symbol: "BTC/USDT",
        side: "buy",
        type: "market",
        amount: 0.001,
      }),
    ).rejects.toMatchObject({
      category: "network",
    });
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it("wraps AuthenticationError as 'auth' category", async () => {
    class AuthenticationError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "AuthenticationError";
        Object.setPrototypeOf(this, new.target.prototype);
      }
    }
    const ex = makeMockExchange({
      fetchBalance: vi.fn().mockRejectedValue(new AuthenticationError("Invalid API key")),
    });
    const bridge = new CcxtBridge(ex);

    try {
      await bridge.fetchBalance();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CcxtBridgeError);
      expect((err as CcxtBridgeError).category).toBe("auth");
      expect((err as CcxtBridgeError).message).toContain("Authentication failed");
    }
  });

  it("wraps InsufficientFunds as 'insufficient_funds' category", async () => {
    class InsufficientFunds extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "InsufficientFunds";
        Object.setPrototypeOf(this, new.target.prototype);
      }
    }
    const ex = makeMockExchange({
      createOrder: vi.fn().mockRejectedValue(new InsufficientFunds("Not enough USDT")),
    });
    const bridge = new CcxtBridge(ex);

    try {
      await bridge.placeOrder({
        symbol: "BTC/USDT",
        side: "buy",
        type: "market",
        amount: 100,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CcxtBridgeError);
      expect((err as CcxtBridgeError).category).toBe("insufficient_funds");
    }
  });

  it("wraps RateLimitExceeded as 'rate_limit' category", async () => {
    class RateLimitExceeded extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "RateLimitExceeded";
        Object.setPrototypeOf(this, new.target.prototype);
      }
    }
    const ex = makeMockExchange({
      fetchTicker: vi.fn().mockRejectedValue(new RateLimitExceeded("Too many requests")),
    });
    const bridge = new CcxtBridge(ex);

    try {
      await bridge.fetchTicker("BTC/USDT");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CcxtBridgeError);
      expect((err as CcxtBridgeError).category).toBe("rate_limit");
    }
  });

  it("wraps NetworkError as 'network' category", async () => {
    class NetworkError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "NetworkError";
        Object.setPrototypeOf(this, new.target.prototype);
      }
    }
    const ex = makeMockExchange({
      fetchBalance: vi.fn().mockRejectedValue(new NetworkError("Connection refused")),
    });
    const bridge = new CcxtBridge(ex);

    try {
      await bridge.fetchBalance();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CcxtBridgeError);
      expect((err as CcxtBridgeError).category).toBe("network");
    }
  });

  it("wraps unknown errors as 'unknown' category", async () => {
    const ex = makeMockExchange({
      fetchBalance: vi.fn().mockRejectedValue(new Error("Something unexpected")),
    });
    const bridge = new CcxtBridge(ex);

    try {
      await bridge.fetchBalance();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CcxtBridgeError);
      expect((err as CcxtBridgeError).category).toBe("unknown");
    }
  });
});
