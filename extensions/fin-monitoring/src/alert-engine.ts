/** Alert condition types for the monitoring engine. */
export type AlertCondition =
  | { kind: "price_above"; symbol: string; price: number }
  | { kind: "price_below"; symbol: string; price: number }
  | { kind: "pnl_threshold"; threshold: number; direction: "loss" | "gain" }
  | { kind: "volatility_spike"; symbol: string; threshold: number }
  | { kind: "news_keyword"; keywords: string[] }
  | { kind: "calendar_event"; eventType: string; daysBefore: number };

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
 */
export class AlertEngine {
  private alerts = new Map<string, Alert>();
  private idCounter = 0;

  addAlert(condition: AlertCondition, message?: string): string {
    const id = `alert-${++this.idCounter}`;
    this.alerts.set(id, {
      id,
      condition,
      createdAt: new Date().toISOString(),
      notified: false,
      message,
    });
    return id;
  }

  removeAlert(id: string): boolean {
    return this.alerts.delete(id);
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
        triggered.push(alert);
      } else if (c.kind === "price_below" && c.symbol === symbol && currentPrice <= c.price) {
        alert.triggeredAt = new Date().toISOString();
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
          triggered.push(alert);
        } else if (c.direction === "gain" && currentPnlUsd >= c.threshold) {
          alert.triggeredAt = new Date().toISOString();
          triggered.push(alert);
        }
      }
    }
    return triggered;
  }
}
