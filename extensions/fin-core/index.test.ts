import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";

// The plugin now stores instances on api.runtime.services Map.
function createMockApi(financialCfg?: Record<string, unknown>) {
  const runtimeServices = new Map<string, unknown>();
  return {
    config: { financial: financialCfg },
    runtime: { services: runtimeServices },
    registerService: vi.fn(),
    registerCli: vi.fn(),
    registerHook: vi.fn(),
    _services: runtimeServices,
  } as unknown as OpenClawPluginApi & { _services: Map<string, unknown> };
}

async function loadPlugin() {
  const mod = await import("./index.js");
  return mod.default;
}

describe("fin-core plugin", () => {
  describe("config hydration", () => {
    it("registers empty registry when no financial config exists", async () => {
      const api = createMockApi(undefined);
      const plugin = await loadPlugin();
      plugin.register(api);

      const registry = api._services.get("fin-exchange-registry") as {
        listExchanges: () => Array<{ id: string }>;
      };
      expect(registry).toBeDefined();
      expect(registry.listExchanges()).toEqual([]);
    });

    it("loads exchanges from config into registry on startup", async () => {
      const api = createMockApi({
        exchanges: {
          "my-binance": {
            exchange: "binance",
            apiKey: "key123",
            secret: "secret456",
            testnet: true,
          },
          "my-okx": {
            exchange: "okx",
            apiKey: "okxkey",
            secret: "okxsecret",
            passphrase: "okxpass",
          },
        },
      });

      const plugin = await loadPlugin();
      plugin.register(api);

      const registry = api._services.get("fin-exchange-registry") as {
        listExchanges: () => Array<{ id: string; exchange: string; testnet: boolean }>;
      };
      const list = registry.listExchanges();
      expect(list).toHaveLength(2);
      expect(list.find((e) => e.id === "my-binance")).toEqual({
        id: "my-binance",
        exchange: "binance",
        testnet: true,
      });
      expect(list.find((e) => e.id === "my-okx")).toEqual({
        id: "my-okx",
        exchange: "okx",
        testnet: false,
      });
    });

    it("defaults apiKey/secret to empty string when omitted in config", async () => {
      const api = createMockApi({
        exchanges: { "no-keys": { exchange: "bybit" } },
      });
      const plugin = await loadPlugin();
      plugin.register(api);

      const registry = api._services.get("fin-exchange-registry") as {
        listExchanges: () => Array<{ id: string; exchange: string; testnet: boolean }>;
      };
      expect(registry.listExchanges()).toEqual([
        { id: "no-keys", exchange: "bybit", testnet: false },
      ]);
    });

    it("loads trading risk config into risk controller", async () => {
      const api = createMockApi({
        trading: {
          enabled: true,
          maxAutoTradeUsd: 200,
          confirmThresholdUsd: 2000,
          maxDailyLossUsd: 800,
          blockedPairs: ["DOGE/USDT"],
        },
      });
      const plugin = await loadPlugin();
      plugin.register(api);

      const rc = api._services.get("fin-risk-controller") as {
        evaluate: (
          order: { exchange: string; symbol: string; side: string; type: string; amount: number },
          usd: number,
        ) => { tier: string; reason?: string };
      };
      expect(rc).toBeDefined();

      expect(
        rc.evaluate(
          { exchange: "binance", symbol: "BTC/USDT", side: "buy", type: "market", amount: 0.001 },
          100,
        ).tier,
      ).toBe("auto");

      expect(
        rc.evaluate(
          { exchange: "binance", symbol: "BTC/USDT", side: "buy", type: "market", amount: 0.01 },
          500,
        ).tier,
      ).toBe("confirm");

      expect(
        rc.evaluate(
          { exchange: "binance", symbol: "BTC/USDT", side: "buy", type: "market", amount: 1 },
          5000,
        ).tier,
      ).toBe("reject");

      const blocked = rc.evaluate(
        { exchange: "binance", symbol: "DOGE/USDT", side: "buy", type: "market", amount: 0.001 },
        10,
      );
      expect(blocked.tier).toBe("reject");
      expect(blocked.reason).toContain("blocked");
    });

    it("uses defaults when trading config is partial", async () => {
      const api = createMockApi({ trading: { enabled: true } });
      const plugin = await loadPlugin();
      plugin.register(api);

      const rc = api._services.get("fin-risk-controller") as {
        evaluate: (
          order: { exchange: string; symbol: string; side: string; type: string; amount: number },
          usd: number,
        ) => { tier: string };
      };
      // Default maxAutoTradeUsd=500, $300 → auto
      expect(
        rc.evaluate(
          { exchange: "binance", symbol: "ETH/USDT", side: "buy", type: "market", amount: 0.1 },
          300,
        ).tier,
      ).toBe("auto");
    });
  });

  describe("service registration", () => {
    it("registers both services on runtime.services Map", async () => {
      const api = createMockApi();
      const plugin = await loadPlugin();
      plugin.register(api);

      expect(api._services.has("fin-exchange-registry")).toBe(true);
      expect(api._services.has("fin-risk-controller")).toBe(true);
    });

    it("registers lifecycle services, CLI, and hook", async () => {
      const api = createMockApi();
      const plugin = await loadPlugin();
      plugin.register(api);

      // Two lifecycle services registered
      expect(api.registerService).toHaveBeenCalledTimes(2);
      expect(api.registerCli).toHaveBeenCalledOnce();
      expect(api.registerHook).toHaveBeenCalledOnce();
    });
  });
});
