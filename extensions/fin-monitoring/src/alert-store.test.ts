import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Alert, AlertCondition } from "./alert-engine.js";
import { AlertStore } from "./alert-store.js";

function tmpDbPath(): string {
  return join(tmpdir(), `alert-store-test-${randomUUID()}.sqlite`);
}

function makeAlert(id: string, condition: AlertCondition, overrides?: Partial<Alert>): Alert {
  return {
    id,
    condition,
    createdAt: new Date().toISOString(),
    notified: false,
    ...overrides,
  };
}

describe("AlertStore", () => {
  const paths: string[] = [];

  function createStore(): { store: AlertStore; dbPath: string } {
    const dbPath = tmpDbPath();
    paths.push(dbPath);
    return { store: new AlertStore(dbPath), dbPath };
  }

  afterEach(() => {
    for (const p of paths) {
      try {
        rmSync(p, { force: true });
        rmSync(`${p}-wal`, { force: true });
        rmSync(`${p}-shm`, { force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    paths.length = 0;
  });

  it("returns empty array from loadAll on fresh database", () => {
    const { store } = createStore();
    expect(store.loadAll()).toEqual([]);
    store.close();
  });

  it("inserts and loads alerts (basic CRUD)", () => {
    const { store } = createStore();

    const alert1 = makeAlert("alert-1", {
      kind: "price_above",
      symbol: "BTC/USDT",
      price: 100_000,
    });
    const alert2 = makeAlert("alert-2", { kind: "price_below", symbol: "ETH/USDT", price: 3000 });
    store.insert(alert1);
    store.insert(alert2);

    const loaded = store.loadAll();
    expect(loaded).toHaveLength(2);
    expect(loaded[0]!.id).toBe("alert-1");
    expect(loaded[1]!.id).toBe("alert-2");
    expect(loaded[0]!.condition).toEqual({
      kind: "price_above",
      symbol: "BTC/USDT",
      price: 100_000,
    });
    expect(loaded[1]!.condition).toEqual({ kind: "price_below", symbol: "ETH/USDT", price: 3000 });

    store.close();
  });

  it("removes alerts", () => {
    const { store } = createStore();

    store.insert(makeAlert("alert-1", { kind: "price_above", symbol: "AAPL", price: 200 }));
    store.insert(makeAlert("alert-2", { kind: "price_below", symbol: "GOOG", price: 100 }));

    expect(store.remove("alert-1")).toBe(true);
    expect(store.remove("alert-nonexistent")).toBe(false);

    const loaded = store.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.id).toBe("alert-2");

    store.close();
  });

  it("persists data across close and reopen", () => {
    const { store, dbPath } = createStore();

    const alert = makeAlert(
      "alert-5",
      { kind: "pnl_threshold", threshold: 500, direction: "loss" },
      {
        message: "Stop loss triggered",
      },
    );
    store.insert(alert);
    store.close();

    // Reopen same database
    const store2 = new AlertStore(dbPath);
    const loaded = store2.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.id).toBe("alert-5");
    expect(loaded[0]!.condition).toEqual({
      kind: "pnl_threshold",
      threshold: 500,
      direction: "loss",
    });
    expect(loaded[0]!.message).toBe("Stop loss triggered");
    expect(loaded[0]!.notified).toBe(false);
    expect(loaded[0]!.triggeredAt).toBeUndefined();

    store2.close();
  });

  it("updateTriggered persists and survives reopen", () => {
    const { store, dbPath } = createStore();

    store.insert(makeAlert("alert-3", { kind: "price_above", symbol: "BTC/USDT", price: 50_000 }));
    const triggeredAt = "2026-02-28T12:00:00.000Z";
    store.updateTriggered("alert-3", triggeredAt);

    // Verify in same session
    let loaded = store.loadAll();
    expect(loaded[0]!.triggeredAt).toBe(triggeredAt);
    store.close();

    // Verify after reopen
    const store2 = new AlertStore(dbPath);
    loaded = store2.loadAll();
    expect(loaded[0]!.triggeredAt).toBe(triggeredAt);
    store2.close();
  });

  it("serializes all condition kinds correctly", () => {
    const { store } = createStore();

    const conditions: AlertCondition[] = [
      { kind: "price_above", symbol: "BTC/USDT", price: 100_000 },
      { kind: "price_below", symbol: "ETH/USDT", price: 2000 },
      { kind: "pnl_threshold", threshold: 1000, direction: "gain" },
    ];

    for (let i = 0; i < conditions.length; i++) {
      store.insert(makeAlert(`alert-${i + 1}`, conditions[i]!));
    }

    const loaded = store.loadAll();
    expect(loaded).toHaveLength(conditions.length);

    for (let i = 0; i < conditions.length; i++) {
      expect(loaded[i]!.condition).toEqual(conditions[i]);
    }

    store.close();
  });

  it("handles alert with message and notified fields", () => {
    const { store } = createStore();

    const alert = makeAlert(
      "alert-10",
      { kind: "price_above", symbol: "TSLA", price: 300 },
      {
        message: "Tesla target hit!",
        notified: true,
      },
    );
    store.insert(alert);

    const loaded = store.loadAll();
    expect(loaded[0]!.message).toBe("Tesla target hit!");
    expect(loaded[0]!.notified).toBe(true);

    store.close();
  });

  it("handles alert without optional fields (message undefined, triggeredAt undefined)", () => {
    const { store } = createStore();

    const alert = makeAlert("alert-20", { kind: "price_below", symbol: "AMZN", price: 150 });
    store.insert(alert);

    const loaded = store.loadAll();
    expect(loaded[0]!.message).toBeUndefined();
    expect(loaded[0]!.triggeredAt).toBeUndefined();

    store.close();
  });
});
