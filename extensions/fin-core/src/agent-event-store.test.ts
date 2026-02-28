import { describe, expect, it, vi } from "vitest";
import { AgentEventStore } from "./agent-event-store.js";

describe("AgentEventStore", () => {
  it("adds events and assigns unique IDs", () => {
    const store = new AgentEventStore();
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
  });

  it("lists events in reverse chronological order", () => {
    const store = new AgentEventStore();
    store.addEvent({ type: "trade_executed", title: "First", detail: "", status: "completed" });
    store.addEvent({ type: "alert_triggered", title: "Second", detail: "", status: "completed" });

    const events = store.listEvents();
    expect(events).toHaveLength(2);
    expect(events[0]!.title).toBe("Second");
    expect(events[1]!.title).toBe("First");
  });

  it("filters events by type", () => {
    const store = new AgentEventStore();
    store.addEvent({ type: "trade_executed", title: "Trade", detail: "", status: "completed" });
    store.addEvent({ type: "alert_triggered", title: "Alert", detail: "", status: "completed" });
    store.addEvent({ type: "trade_executed", title: "Trade 2", detail: "", status: "completed" });

    const trades = store.listEvents({ type: "trade_executed" });
    expect(trades).toHaveLength(2);
    expect(trades.every((e) => e.type === "trade_executed")).toBe(true);
  });

  it("filters events by status", () => {
    const store = new AgentEventStore();
    store.addEvent({ type: "trade_pending", title: "Pending", detail: "", status: "pending" });
    store.addEvent({ type: "trade_executed", title: "Done", detail: "", status: "completed" });

    const pending = store.listEvents({ status: "pending" });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.title).toBe("Pending");
  });

  it("gets event by ID", () => {
    const store = new AgentEventStore();
    const event = store.addEvent({
      type: "system",
      title: "Test",
      detail: "detail",
      status: "completed",
    });

    expect(store.getEvent(event.id)).toBe(event);
    expect(store.getEvent("nonexistent")).toBeUndefined();
  });

  it("approves pending events", () => {
    const store = new AgentEventStore();
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
  });

  it("rejects pending events with reason", () => {
    const store = new AgentEventStore();
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
  });

  it("approve/reject returns undefined for non-pending events", () => {
    const store = new AgentEventStore();
    const event = store.addEvent({
      type: "trade_executed",
      title: "Done",
      detail: "",
      status: "completed",
    });

    expect(store.approve(event.id)).toBeUndefined();
    expect(store.reject(event.id)).toBeUndefined();
  });

  it("approve/reject returns undefined for non-existent events", () => {
    const store = new AgentEventStore();
    expect(store.approve("nope")).toBeUndefined();
    expect(store.reject("nope")).toBeUndefined();
  });

  it("notifies subscribers on new events", () => {
    const store = new AgentEventStore();
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
  });

  it("unsubscribe stops notifications", () => {
    const store = new AgentEventStore();
    const callback = vi.fn();
    const unsub = store.subscribe(callback);

    store.addEvent({ type: "system", title: "1", detail: "", status: "completed" });
    expect(callback).toHaveBeenCalledTimes(1);

    unsub();
    store.addEvent({ type: "system", title: "2", detail: "", status: "completed" });
    expect(callback).toHaveBeenCalledTimes(1); // Still 1, not 2
  });

  it("subscriber errors do not break the store", () => {
    const store = new AgentEventStore();
    const badCallback = vi.fn(() => {
      throw new Error("Subscriber error");
    });
    const goodCallback = vi.fn();

    store.subscribe(badCallback);
    store.subscribe(goodCallback);

    store.addEvent({ type: "system", title: "Test", detail: "", status: "completed" });

    expect(badCallback).toHaveBeenCalled();
    expect(goodCallback).toHaveBeenCalled(); // Should still be called despite first error
  });

  it("pendingCount returns correct count", () => {
    const store = new AgentEventStore();
    expect(store.pendingCount()).toBe(0);

    store.addEvent({ type: "trade_pending", title: "P1", detail: "", status: "pending" });
    store.addEvent({ type: "trade_pending", title: "P2", detail: "", status: "pending" });
    store.addEvent({ type: "trade_executed", title: "Done", detail: "", status: "completed" });

    expect(store.pendingCount()).toBe(2);

    store.approve(store.listEvents({ status: "pending" })[0]!.id);
    expect(store.pendingCount()).toBe(1);
  });

  it("enforces max event limit", () => {
    const store = new AgentEventStore();
    for (let i = 0; i < 550; i++) {
      store.addEvent({ type: "system", title: `Event ${i}`, detail: "", status: "completed" });
    }

    const events = store.listEvents();
    expect(events.length).toBeLessThanOrEqual(500);
  });
});
