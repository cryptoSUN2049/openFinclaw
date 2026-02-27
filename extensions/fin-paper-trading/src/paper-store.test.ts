import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { PaperStore } from "./paper-store.js";
import type { PaperAccountState, PaperOrder, EquitySnapshot } from "./types.js";

function makeTempStore(): { store: PaperStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "paper-store-test-"));
  const store = new PaperStore(join(dir, "test.sqlite"));
  return { store, dir };
}

describe("PaperStore", () => {
  let store: PaperStore;
  let dir: string;

  afterEach(() => {
    store?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("saves and loads account with data integrity", () => {
    ({ store, dir } = makeTempStore());

    const state: PaperAccountState = {
      id: "acct-1",
      name: "Test",
      initialCapital: 10_000,
      cash: 8_000,
      equity: 10_500,
      positions: [
        {
          symbol: "BTC/USDT",
          side: "long",
          quantity: 0.05,
          entryPrice: 50_000,
          currentPrice: 50_000,
          unrealizedPnl: 0,
          openedAt: Date.now(),
        },
      ],
      orders: [],
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now(),
    };

    store.saveAccount(state);
    const loaded = store.loadAccount("acct-1");

    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe("acct-1");
    expect(loaded!.name).toBe("Test");
    expect(loaded!.initialCapital).toBe(10_000);
    expect(loaded!.cash).toBe(8_000);
    expect(loaded!.positions).toHaveLength(1);
    expect(loaded!.positions[0]!.symbol).toBe("BTC/USDT");
  });

  it("returns null for non-existent account", () => {
    ({ store, dir } = makeTempStore());
    expect(store.loadAccount("nonexistent")).toBeNull();
  });

  it("saves and queries orders", () => {
    ({ store, dir } = makeTempStore());

    const orders: PaperOrder[] = [
      {
        id: "o-1",
        accountId: "acct-1",
        symbol: "BTC/USDT",
        side: "buy",
        type: "market",
        quantity: 0.1,
        status: "filled",
        fillPrice: 50_000,
        commission: 5,
        slippage: 2.5,
        createdAt: Date.now() - 2000,
        filledAt: Date.now() - 2000,
      },
      {
        id: "o-2",
        accountId: "acct-1",
        symbol: "ETH/USDT",
        side: "buy",
        type: "market",
        quantity: 1,
        status: "filled",
        fillPrice: 3_000,
        commission: 3,
        slippage: 1.5,
        createdAt: Date.now() - 1000,
        filledAt: Date.now() - 1000,
      },
      {
        id: "o-3",
        accountId: "acct-1",
        symbol: "BTC/USDT",
        side: "sell",
        type: "market",
        quantity: 0.05,
        status: "filled",
        fillPrice: 52_000,
        commission: 2.6,
        slippage: 1.3,
        createdAt: Date.now(),
        filledAt: Date.now(),
      },
    ];

    for (const o of orders) store.saveOrder(o);

    const all = store.getOrders("acct-1");
    expect(all).toHaveLength(3);

    const limited = store.getOrders("acct-1", 2);
    expect(limited).toHaveLength(2);
  });

  it("saves and retrieves equity snapshots with since filter", () => {
    ({ store, dir } = makeTempStore());

    const now = Date.now();
    const day = 86400000;

    const snapshots: EquitySnapshot[] = [
      {
        accountId: "acct-1",
        timestamp: now - 3 * day,
        equity: 10_000,
        cash: 10_000,
        positionsValue: 0,
        dailyPnl: 0,
        dailyPnlPct: 0,
      },
      {
        accountId: "acct-1",
        timestamp: now - 2 * day,
        equity: 10_100,
        cash: 5_000,
        positionsValue: 5_100,
        dailyPnl: 100,
        dailyPnlPct: 1,
      },
      {
        accountId: "acct-1",
        timestamp: now - 1 * day,
        equity: 9_800,
        cash: 5_000,
        positionsValue: 4_800,
        dailyPnl: -300,
        dailyPnlPct: -2.97,
      },
      {
        accountId: "acct-1",
        timestamp: now,
        equity: 10_200,
        cash: 5_000,
        positionsValue: 5_200,
        dailyPnl: 400,
        dailyPnlPct: 4.08,
      },
    ];

    for (const s of snapshots) store.saveSnapshot(s);

    const all = store.getSnapshots("acct-1");
    expect(all).toHaveLength(4);

    const recent = store.getSnapshots("acct-1", now - 1.5 * day);
    expect(recent).toHaveLength(2);
    expect(recent[0]!.dailyPnl).toBe(-300);
  });

  it("lists accounts", () => {
    ({ store, dir } = makeTempStore());

    store.saveAccount({
      id: "a-1",
      name: "One",
      initialCapital: 10_000,
      cash: 10_000,
      equity: 10_000,
      positions: [],
      orders: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    store.saveAccount({
      id: "a-2",
      name: "Two",
      initialCapital: 50_000,
      cash: 50_000,
      equity: 50_000,
      positions: [],
      orders: [],
      createdAt: Date.now(),
      updatedAt: Date.now() + 1,
    });

    const list = store.listAccounts();
    expect(list).toHaveLength(2);
    expect(list[0]!.name).toBe("Two"); // most recently updated first
    expect(list[1]!.name).toBe("One");
  });

  it("auto-creates tables on new DB", () => {
    ({ store, dir } = makeTempStore());
    // If we get here without error, tables were created
    store.saveAccount({
      id: "x",
      name: "X",
      initialCapital: 1000,
      cash: 1000,
      equity: 1000,
      positions: [],
      orders: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(store.loadAccount("x")).not.toBeNull();
  });
});
