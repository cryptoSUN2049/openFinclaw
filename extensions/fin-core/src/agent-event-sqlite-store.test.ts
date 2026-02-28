import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentEventSqliteStore } from "./agent-event-sqlite-store.js";

function tmpDbPath(): string {
  return join(tmpdir(), `test-events-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
}

function cleanup(dbPath: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(dbPath + suffix);
    } catch {
      // File may not exist.
    }
  }
}

describe("AgentEventSqliteStore", () => {
  let dbPath: string;

  afterEach(() => {
    if (dbPath) cleanup(dbPath);
  });

  // ── Tests mirrored from AgentEventStore (in-memory) ──

  it("[SQLite] adds events and assigns unique IDs", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    const e1 = store.addEvent({
      type: "trade_executed",
      title: "BUY BTC",
      detail: "Bought 0.1 BTC",
      status: "completed",
    });
    const e2 = store.addEvent({
      type: "alert_triggered",
      title: "BTC above 70k",
      detail: "Price alert triggered",
      status: "completed",
    });

    expect(e1.id).toBeDefined();
    expect(e2.id).toBeDefined();
    expect(e1.id).not.toBe(e2.id);
    expect(e1.timestamp).toBeGreaterThan(0);
    store.close();
  });

  it("[SQLite] lists events in reverse chronological order", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    store.addEvent({ type: "trade_executed", title: "First", detail: "", status: "completed" });
    store.addEvent({ type: "alert_triggered", title: "Second", detail: "", status: "completed" });

    const events = store.listEvents();
    expect(events).toHaveLength(2);
    expect(events[0]!.title).toBe("Second");
    expect(events[1]!.title).toBe("First");
    store.close();
  });

  it("[SQLite] filters events by type", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    store.addEvent({ type: "trade_executed", title: "Trade", detail: "", status: "completed" });
    store.addEvent({ type: "alert_triggered", title: "Alert", detail: "", status: "completed" });
    store.addEvent({ type: "trade_executed", title: "Trade 2", detail: "", status: "completed" });

    const trades = store.listEvents({ type: "trade_executed" });
    expect(trades).toHaveLength(2);
    expect(trades.every((e) => e.type === "trade_executed")).toBe(true);
    store.close();
  });

  it("[SQLite] filters events by status", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    store.addEvent({ type: "trade_pending", title: "Pending", detail: "", status: "pending" });
    store.addEvent({ type: "trade_executed", title: "Done", detail: "", status: "completed" });

    const pending = store.listEvents({ status: "pending" });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.title).toBe("Pending");
    store.close();
  });

  it("[SQLite] gets event by ID", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    const event = store.addEvent({
      type: "system",
      title: "Test",
      detail: "detail",
      status: "completed",
    });

    const found = store.getEvent(event.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(event.id);
    expect(store.getEvent("nonexistent")).toBeUndefined();
    store.close();
  });

  it("[SQLite] approves pending events", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    const event = store.addEvent({
      type: "trade_pending",
      title: "BUY ETH",
      detail: "Needs approval",
      status: "pending",
      actionParams: { symbol: "ETH/USDT", side: "buy" },
    });

    const approved = store.approve(event.id);
    expect(approved).toBeDefined();
    expect(approved!.status).toBe("approved");
    expect(approved!.actionParams).toEqual({ symbol: "ETH/USDT", side: "buy" });

    // Should also create a notification event
    const events = store.listEvents();
    expect(events.length).toBe(2);
    expect(events[0]!.type).toBe("system");
    expect(events[0]!.title).toContain("Approved");
    store.close();
  });

  it("[SQLite] rejects pending events with reason", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    const event = store.addEvent({
      type: "trade_pending",
      title: "BUY SOL",
      detail: "Needs approval",
      status: "pending",
    });

    const rejected = store.reject(event.id, "Too risky");
    expect(rejected).toBeDefined();
    expect(rejected!.status).toBe("rejected");

    const events = store.listEvents();
    expect(events[0]!.detail).toBe("Too risky");
    store.close();
  });

  it("[SQLite] approve/reject returns undefined for non-pending events", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    const event = store.addEvent({
      type: "trade_executed",
      title: "Done",
      detail: "",
      status: "completed",
    });

    expect(store.approve(event.id)).toBeUndefined();
    expect(store.reject(event.id)).toBeUndefined();
    store.close();
  });

  it("[SQLite] approve/reject returns undefined for non-existent events", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    expect(store.approve("nope")).toBeUndefined();
    expect(store.reject("nope")).toBeUndefined();
    store.close();
  });

  it("[SQLite] notifies subscribers on new events", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    const callback = vi.fn();
    store.subscribe(callback);

    const event = store.addEvent({
      type: "system",
      title: "Test",
      detail: "",
      status: "completed",
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(event);
    store.close();
  });

  it("[SQLite] unsubscribe stops notifications", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    const callback = vi.fn();
    const unsub = store.subscribe(callback);

    store.addEvent({ type: "system", title: "1", detail: "", status: "completed" });
    expect(callback).toHaveBeenCalledTimes(1);

    unsub();
    store.addEvent({ type: "system", title: "2", detail: "", status: "completed" });
    expect(callback).toHaveBeenCalledTimes(1); // Still 1, not 2
    store.close();
  });

  it("[SQLite] subscriber errors do not break the store", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    const badCallback = vi.fn(() => {
      throw new Error("Subscriber error");
    });
    const goodCallback = vi.fn();

    store.subscribe(badCallback);
    store.subscribe(goodCallback);

    store.addEvent({ type: "system", title: "Test", detail: "", status: "completed" });

    expect(badCallback).toHaveBeenCalled();
    expect(goodCallback).toHaveBeenCalled(); // Should still be called despite first error
    store.close();
  });

  it("[SQLite] pendingCount returns correct count", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    expect(store.pendingCount()).toBe(0);

    store.addEvent({ type: "trade_pending", title: "P1", detail: "", status: "pending" });
    store.addEvent({ type: "trade_pending", title: "P2", detail: "", status: "pending" });
    store.addEvent({ type: "trade_executed", title: "Done", detail: "", status: "completed" });

    expect(store.pendingCount()).toBe(2);

    store.approve(store.listEvents({ status: "pending" })[0]!.id);
    expect(store.pendingCount()).toBe(1);
    store.close();
  });

  it("[SQLite] enforces max event limit", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    for (let i = 0; i < 550; i++) {
      store.addEvent({ type: "system", title: `Event ${i}`, detail: "", status: "completed" });
    }

    const events = store.listEvents();
    expect(events.length).toBeLessThanOrEqual(500);
    store.close();
  });

  // ── Persistence-specific tests ──

  it("[SQLite] persists events across close + reopen", () => {
    dbPath = tmpDbPath();
    let store = new AgentEventSqliteStore(dbPath);
    store.addEvent({
      type: "trade_executed",
      title: "Persisted",
      detail: "data",
      status: "completed",
    });
    store.addEvent({
      type: "alert_triggered",
      title: "Alert",
      detail: "info",
      status: "completed",
    });
    store.close();

    store = new AgentEventSqliteStore(dbPath);
    const events = store.listEvents();
    expect(events).toHaveLength(2);
    expect(events[0]!.title).toBe("Alert");
    expect(events[1]!.title).toBe("Persisted");
    store.close();
  });

  it("[SQLite] counter continues incrementing after reopen (no duplicate IDs)", () => {
    dbPath = tmpDbPath();
    let store = new AgentEventSqliteStore(dbPath);
    const e1 = store.addEvent({ type: "system", title: "First", detail: "", status: "completed" });
    const e2 = store.addEvent({ type: "system", title: "Second", detail: "", status: "completed" });
    store.close();

    store = new AgentEventSqliteStore(dbPath);
    const e3 = store.addEvent({ type: "system", title: "Third", detail: "", status: "completed" });

    // Extract numeric portions to verify monotonic increase.
    const numOf = (id: string) => Number.parseInt(/^evt-(\d+)-/.exec(id)![1]!, 10);
    expect(numOf(e2.id)).toBeGreaterThan(numOf(e1.id));
    expect(numOf(e3.id)).toBeGreaterThan(numOf(e2.id));
    store.close();
  });

  it("[SQLite] status updates persist across reopen", () => {
    dbPath = tmpDbPath();
    let store = new AgentEventSqliteStore(dbPath);
    const event = store.addEvent({
      type: "trade_pending",
      title: "Approve me",
      detail: "",
      status: "pending",
    });
    store.approve(event.id);
    store.close();

    store = new AgentEventSqliteStore(dbPath);
    const reloaded = store.getEvent(event.id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.status).toBe("approved");
    store.close();
  });

  it("[SQLite] MAX_EVENTS disk cleanup", () => {
    dbPath = tmpDbPath();
    const store = new AgentEventSqliteStore(dbPath);
    for (let i = 0; i < 550; i++) {
      store.addEvent({ type: "system", title: `Evt ${i}`, detail: "", status: "completed" });
    }
    store.close();

    // Reopen and verify disk has at most MAX_EVENTS rows.
    const store2 = new AgentEventSqliteStore(dbPath);
    const events = store2.listEvents();
    expect(events.length).toBeLessThanOrEqual(500);
    store2.close();
  });
});
