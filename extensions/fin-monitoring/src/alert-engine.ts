import type { AlertStore } from "./alert-store.js";

/** Alert condition types for the monitoring engine. */
export type AlertCondition =
  | { kind: "price_above"; symbol: string; price: number }
  | { kind: "price_below"; symbol: string; price: number }
  | { kind: "pnl_threshold"; threshold: number; direction: "loss" | "gain" };

export type Alert = {
  id: string;
  condition: AlertCondition;
  createdAt: string;
  triggeredAt?: string;
  notified: boolean;
  message?: string;
};

/**
 * Alert engine: manages, evaluates, and triggers financial alerts.
 * Optionally backed by an AlertStore for SQLite persistence.
 */
export class AlertEngine {
  private alerts = new Map<string, Alert>();
  private idCounter = 0;
  private store?: AlertStore;

  constructor(store?: AlertStore) {
    this.store = store;
    if (store) {
      const loaded = store.loadAll();
      for (const alert of loaded) {
        this.alerts.set(alert.id, alert);
        // Recover idCounter from existing "alert-N" ids
        const match = alert.id.match(/^alert-(\d+)$/);
        if (match) {
          const n = Number(match[1]);
          if (n > this.idCounter) this.idCounter = n;
        }
      }
    }
  }

  addAlert(condition: AlertCondition, message?: string): string {
    const id = `alert-${++this.idCounter}`;
    const alert: Alert = {
      id,
      condition,
      createdAt: new Date().toISOString(),
      notified: false,
      message,
    };
    this.alerts.set(id, alert);
    this.store?.insert(alert);
    return id;
  }

  removeAlert(id: string): boolean {
    const deleted = this.alerts.delete(id);
    if (deleted) this.store?.remove(id);
    return deleted;
  }

  listAlerts(): Alert[] {
    return Array.from(this.alerts.values());
  }

  /** Check a price update against all active price alerts. */
  checkPrice(symbol: string, currentPrice: number): Alert[] {
    const triggered: Alert[] = [];
    for (const alert of this.alerts.values()) {
      if (alert.triggeredAt) continue;

      const c = alert.condition;
      if (c.kind === "price_above" && c.symbol === symbol && currentPrice >= c.price) {
        alert.triggeredAt = new Date().toISOString();
        this.store?.updateTriggered(alert.id, alert.triggeredAt);
        triggered.push(alert);
      } else if (c.kind === "price_below" && c.symbol === symbol && currentPrice <= c.price) {
        alert.triggeredAt = new Date().toISOString();
        this.store?.updateTriggered(alert.id, alert.triggeredAt);
        triggered.push(alert);
      }
    }
    return triggered;
  }

  /** Check portfolio P&L against threshold alerts. */
  checkPnl(currentPnlUsd: number): Alert[] {
    const triggered: Alert[] = [];
    for (const alert of this.alerts.values()) {
      if (alert.triggeredAt) continue;

      const c = alert.condition;
      if (c.kind === "pnl_threshold") {
        if (c.direction === "loss" && currentPnlUsd <= -Math.abs(c.threshold)) {
          alert.triggeredAt = new Date().toISOString();
          this.store?.updateTriggered(alert.id, alert.triggeredAt);
          triggered.push(alert);
        } else if (c.direction === "gain" && currentPnlUsd >= c.threshold) {
          alert.triggeredAt = new Date().toISOString();
          this.store?.updateTriggered(alert.id, alert.triggeredAt);
          triggered.push(alert);
        }
      }
    }
    return triggered;
  }
}
