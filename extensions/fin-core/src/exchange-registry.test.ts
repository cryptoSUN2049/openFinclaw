import { describe, expect, it, vi } from "vitest";
import { ExchangeRegistry } from "./exchange-registry.js";
import type { ExchangeConfig } from "./types.js";

// Mock ccxt to avoid real exchange connections in tests.
vi.mock("ccxt", () => {
  return {
    default: {},
    binance: class MockBinance {
      apiKey: string;
      secret: string;
      options: Record<string, unknown>;
      setSandboxMode = vi.fn();
      close = vi.fn();

      constructor(opts: Record<string, unknown>) {
        this.apiKey = opts.apiKey as string;
        this.secret = opts.secret as string;
        this.options = (opts.options ?? {}) as Record<string, unknown>;
      }
    },
    okx: class MockOkx {
      options: Record<string, unknown>;
      setSandboxMode = vi.fn();
      close = vi.fn();

      constructor(opts: Record<string, unknown>) {
        this.options = (opts.options ?? {}) as Record<string, unknown>;
      }
    },
  };
});

describe("ExchangeRegistry", () => {
  it("addExchange and listExchanges", () => {
    const registry = new ExchangeRegistry();
    registry.addExchange("test-binance", {
      exchange: "binance",
      apiKey: "key",
      secret: "secret",
      testnet: true,
    });

    const list = registry.listExchanges();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      id: "test-binance",
      exchange: "binance",
      testnet: true,
    });
  });

  it("removeExchange returns true for existing, false for missing", () => {
    const registry = new ExchangeRegistry();
    registry.addExchange("ex1", {
      exchange: "binance",
      apiKey: "k",
      secret: "s",
    });

    expect(registry.removeExchange("ex1")).toBe(true);
    expect(registry.removeExchange("ex1")).toBe(false);
    expect(registry.listExchanges()).toHaveLength(0);
  });

  it("getInstance creates exchange with correct options", async () => {
    const registry = new ExchangeRegistry();
    registry.addExchange("spot-binance", {
      exchange: "binance",
      apiKey: "mykey",
      secret: "mysecret",
      testnet: false,
      defaultType: "spot",
    });

    const instance = (await registry.getInstance("spot-binance")) as Record<string, unknown>;
    expect(instance.apiKey).toBe("mykey");
    expect(instance.secret).toBe("mysecret");
    // defaultType should be passed through to options
    const opts = instance.options as Record<string, unknown>;
    expect(opts.defaultType).toBe("spot");
  });

  it("getInstance defaults to spot when no defaultType", async () => {
    const registry = new ExchangeRegistry();
    registry.addExchange("test", {
      exchange: "binance",
      apiKey: "k",
      secret: "s",
    });

    const instance = (await registry.getInstance("test")) as Record<string, unknown>;
    const opts = instance.options as Record<string, unknown>;
    expect(opts.defaultType).toBe("spot");
  });

  it("getInstance uses configured defaultType", async () => {
    const registry = new ExchangeRegistry();
    registry.addExchange("swap-test", {
      exchange: "binance",
      apiKey: "k",
      secret: "s",
      defaultType: "swap",
    });

    const instance = (await registry.getInstance("swap-test")) as Record<string, unknown>;
    const opts = instance.options as Record<string, unknown>;
    expect(opts.defaultType).toBe("swap");
  });

  it("getInstance enables sandbox mode for testnet", async () => {
    const registry = new ExchangeRegistry();
    registry.addExchange("testnet", {
      exchange: "binance",
      apiKey: "k",
      secret: "s",
      testnet: true,
    });

    const instance = (await registry.getInstance("testnet")) as {
      setSandboxMode: ReturnType<typeof vi.fn>;
    };
    expect(instance.setSandboxMode).toHaveBeenCalledWith(true);
  });

  it("getInstance caches instances", async () => {
    const registry = new ExchangeRegistry();
    registry.addExchange("cached", {
      exchange: "binance",
      apiKey: "k",
      secret: "s",
    });

    const first = await registry.getInstance("cached");
    const second = await registry.getInstance("cached");
    expect(first).toBe(second);
  });

  it("getInstance throws for unconfigured exchange", async () => {
    const registry = new ExchangeRegistry();
    await expect(registry.getInstance("nonexistent")).rejects.toThrow(
      'Exchange "nonexistent" not configured',
    );
  });

  it("addExchange clears cached instance", async () => {
    const registry = new ExchangeRegistry();
    const config: ExchangeConfig = {
      exchange: "binance",
      apiKey: "k1",
      secret: "s1",
    };
    registry.addExchange("reconfigure", config);

    const first = await registry.getInstance("reconfigure");

    // Re-add with different config — should clear cache.
    registry.addExchange("reconfigure", { ...config, apiKey: "k2" });
    const second = await registry.getInstance("reconfigure");

    expect(first).not.toBe(second);
    expect((second as Record<string, unknown>).apiKey).toBe("k2");
  });

  it("closeAll closes all instances", async () => {
    const registry = new ExchangeRegistry();
    registry.addExchange("a", { exchange: "binance", apiKey: "k", secret: "s" });
    registry.addExchange("b", { exchange: "okx", apiKey: "k", secret: "s" });

    await registry.getInstance("a");
    await registry.getInstance("b");

    await registry.closeAll();

    // After closeAll, getInstance should create new instances
    const newA = await registry.getInstance("a");
    expect(newA).toBeDefined();
  });
});
