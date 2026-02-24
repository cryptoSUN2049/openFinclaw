import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { AlertEngine } from "./src/alert-engine.js";
import type { AlertCondition } from "./src/alert-engine.js";

const finMonitoringPlugin = {
  id: "fin-monitoring",
  name: "Financial Monitoring",
  description:
    "Proactive financial monitoring: price alerts, portfolio health checks, scheduled reports",
  kind: "financial" as const,

  register(api: OpenClawPluginApi) {
    const alertEngine = new AlertEngine();

    // Expose the alert engine for other fin-* plugins to consume.
    api.registerService({
      id: "fin-alert-engine",
      instance: alertEngine,
    });

    // --- fin_set_alert ---
    api.registerTool(
      {
        name: "fin_set_alert",
        label: "Set Alert",
        description:
          "Create a price or P&L alert. Supported kinds: price_above, price_below, pnl_threshold.",
        parameters: Type.Object({
          kind: Type.Unsafe<"price_above" | "price_below" | "pnl_threshold">({
            type: "string",
            enum: ["price_above", "price_below", "pnl_threshold"],
            description: "Alert condition kind",
          }),
          symbol: Type.Optional(
            Type.String({
              description: "Trading pair symbol (e.g. BTC/USDT). Required for price alerts.",
            }),
          ),
          price: Type.Optional(
            Type.Number({
              description:
                "Target price that triggers the alert. Required for price_above / price_below.",
            }),
          ),
          threshold: Type.Optional(
            Type.Number({
              description: "P&L threshold in USD. Required for pnl_threshold.",
            }),
          ),
          direction: Type.Optional(
            Type.Unsafe<"loss" | "gain">({
              type: "string",
              enum: ["loss", "gain"],
              description: "P&L direction for pnl_threshold alerts.",
            }),
          ),
          message: Type.Optional(
            Type.String({ description: "Custom message to include when the alert fires." }),
          ),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          const kind = params.kind as string;
          const message = params.message as string | undefined;

          let condition: AlertCondition;

          if (kind === "price_above" || kind === "price_below") {
            const symbol = params.symbol as string | undefined;
            const price = params.price as number | undefined;
            if (!symbol || price == null) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      error: "symbol and price are required for price alerts",
                    }),
                  },
                ],
              };
            }
            condition = { kind, symbol, price };
          } else if (kind === "pnl_threshold") {
            const threshold = params.threshold as number | undefined;
            const direction = (params.direction as "loss" | "gain" | undefined) ?? "loss";
            if (threshold == null) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      error: "threshold is required for pnl_threshold alerts",
                    }),
                  },
                ],
              };
            }
            condition = { kind, threshold, direction };
          } else {
            return {
              content: [
                { type: "text", text: JSON.stringify({ error: `Unknown alert kind: ${kind}` }) },
              ],
            };
          }

          const id = alertEngine.addAlert(condition, message);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ id, condition, message, status: "active" }, null, 2),
              },
            ],
          };
        },
      },
      { names: ["fin_set_alert"] },
    );

    // --- fin_list_alerts ---
    api.registerTool(
      {
        name: "fin_list_alerts",
        label: "List Alerts",
        description: "List all active and triggered financial alerts.",
        parameters: Type.Object({}),
        async execute() {
          const alerts = alertEngine.listAlerts();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    total: alerts.length,
                    active: alerts.filter((a) => !a.triggeredAt).length,
                    triggered: alerts.filter((a) => !!a.triggeredAt).length,
                    alerts,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        },
      },
      { names: ["fin_list_alerts"] },
    );

    // --- fin_remove_alert ---
    api.registerTool(
      {
        name: "fin_remove_alert",
        label: "Remove Alert",
        description: "Remove an alert by its ID.",
        parameters: Type.Object({
          id: Type.String({ description: "Alert ID to remove (e.g. alert-1)" }),
        }),
        async execute(_id: string, params: Record<string, unknown>) {
          const alertId = params.id as string;
          const removed = alertEngine.removeAlert(alertId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  id: alertId,
                  removed,
                  message: removed ? "Alert removed" : "Alert not found",
                }),
              },
            ],
          };
        },
      },
      { names: ["fin_remove_alert"] },
    );

    // --- Cron tasks (TODO: wire to gateway cron API when available) ---
    // fin:price-alerts    — every 5 min — evaluate all price alerts against latest market data
    // fin:portfolio-check  — daily 9:00 and 17:00 — run portfolio health check
    // fin:daily-digest     — daily 7:00 — generate morning digest of market events and portfolio status
    // fin:weekly-report    — weekly Sunday 10:00 — comprehensive weekly performance report
  },
};

export default finMonitoringPlugin;
