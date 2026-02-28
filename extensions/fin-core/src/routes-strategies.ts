/**
 * Strategy management HTTP route handlers (list, pause, resume, kill, promote).
 */

import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import type { AgentEventSqliteStore } from "./agent-event-sqlite-store.js";
import type { HttpReq, HttpRes, RuntimeServices, StrategyRegistryLike } from "./types-http.js";
import { parseJsonBody, jsonResponse, errorResponse } from "./types-http.js";

export function registerStrategyRoutes(
  api: OpenClawPluginApi,
  runtime: RuntimeServices,
  eventStore: AgentEventSqliteStore,
): void {
  // GET /api/v1/finance/strategies -- List all strategies
  api.registerHttpRoute({
    path: "/api/v1/finance/strategies",
    handler: async (_req: unknown, res: HttpRes) => {
      const strategyRegistry = runtime.services?.get?.("fin-strategy-registry") as
        | StrategyRegistryLike
        | undefined;
      if (!strategyRegistry) {
        jsonResponse(res, 200, { strategies: [] });
        return;
      }
      jsonResponse(res, 200, { strategies: strategyRegistry.list() });
    },
  });

  // POST /api/v1/finance/strategies/pause -- Pause a strategy
  api.registerHttpRoute({
    path: "/api/v1/finance/strategies/pause",
    handler: async (req: HttpReq, res: HttpRes) => {
      try {
        const body = await parseJsonBody(req);
        const { id } = body as { id?: string };

        if (!id) {
          errorResponse(res, 400, "Missing required field: id");
          return;
        }

        const strategyRegistry = runtime.services?.get?.("fin-strategy-registry") as
          | StrategyRegistryLike
          | undefined;
        if (!strategyRegistry?.updateStatus) {
          errorResponse(res, 503, "Strategy registry not available");
          return;
        }

        const strategy = strategyRegistry.get?.(id);
        if (!strategy) {
          errorResponse(res, 404, `Strategy ${id} not found`);
          return;
        }

        strategyRegistry.updateStatus(id, "paused");

        eventStore.addEvent({
          type: "system",
          title: `Strategy paused: ${strategy.name}`,
          detail: `${strategy.name} (${strategy.level}) paused by user`,
          status: "completed",
        });

        jsonResponse(res, 200, { status: "paused", id });
      } catch (err) {
        errorResponse(res, 500, (err as Error).message);
      }
    },
  });

  // POST /api/v1/finance/strategies/resume -- Resume a paused strategy
  api.registerHttpRoute({
    path: "/api/v1/finance/strategies/resume",
    handler: async (req: HttpReq, res: HttpRes) => {
      try {
        const body = await parseJsonBody(req);
        const { id } = body as { id?: string };

        if (!id) {
          errorResponse(res, 400, "Missing required field: id");
          return;
        }

        const strategyRegistry = runtime.services?.get?.("fin-strategy-registry") as
          | StrategyRegistryLike
          | undefined;
        if (!strategyRegistry?.updateStatus) {
          errorResponse(res, 503, "Strategy registry not available");
          return;
        }

        strategyRegistry.updateStatus(id, "running");
        jsonResponse(res, 200, { status: "running", id });
      } catch (err) {
        errorResponse(res, 500, (err as Error).message);
      }
    },
  });

  // POST /api/v1/finance/strategies/kill -- Kill a strategy
  api.registerHttpRoute({
    path: "/api/v1/finance/strategies/kill",
    handler: async (req: HttpReq, res: HttpRes) => {
      try {
        const body = await parseJsonBody(req);
        const { id } = body as { id?: string };

        if (!id) {
          errorResponse(res, 400, "Missing required field: id");
          return;
        }

        const strategyRegistry = runtime.services?.get?.("fin-strategy-registry") as
          | StrategyRegistryLike
          | undefined;
        if (!strategyRegistry?.updateLevel) {
          errorResponse(res, 503, "Strategy registry not available");
          return;
        }

        const strategy = strategyRegistry.get?.(id);
        if (!strategy) {
          errorResponse(res, 404, `Strategy ${id} not found`);
          return;
        }

        strategyRegistry.updateLevel(id, "KILLED");
        strategyRegistry.updateStatus?.(id, "stopped");

        eventStore.addEvent({
          type: "strategy_killed",
          title: `Strategy killed: ${strategy.name}`,
          detail: `${strategy.name} permanently killed by user`,
          status: "completed",
        });

        jsonResponse(res, 200, { status: "killed", id });
      } catch (err) {
        errorResponse(res, 500, (err as Error).message);
      }
    },
  });

  // POST /api/v1/finance/strategies/promote -- Promote a strategy to next level
  api.registerHttpRoute({
    path: "/api/v1/finance/strategies/promote",
    handler: async (req: HttpReq, res: HttpRes) => {
      try {
        const body = await parseJsonBody(req);
        const { id, targetLevel } = body as { id?: string; targetLevel?: string };

        if (!id) {
          errorResponse(res, 400, "Missing required field: id");
          return;
        }

        const strategyRegistry = runtime.services?.get?.("fin-strategy-registry") as
          | StrategyRegistryLike
          | undefined;
        if (!strategyRegistry?.updateLevel) {
          errorResponse(res, 503, "Strategy registry not available");
          return;
        }

        const strategy = strategyRegistry.get?.(id);
        if (!strategy) {
          errorResponse(res, 404, `Strategy ${id} not found`);
          return;
        }

        // Determine next level if not specified
        const levelOrder = ["L0_INCUBATE", "L1_BACKTEST", "L2_PAPER", "L3_LIVE"];
        const currentIdx = levelOrder.indexOf(strategy.level);
        const nextLevel =
          targetLevel ??
          (currentIdx >= 0 && currentIdx < levelOrder.length - 1
            ? levelOrder[currentIdx + 1]
            : undefined);

        if (!nextLevel) {
          errorResponse(res, 400, `Strategy ${id} is already at highest level or level is invalid`);
          return;
        }

        strategyRegistry.updateLevel(id, nextLevel);

        eventStore.addEvent({
          type: "strategy_promoted",
          title: `${strategy.name} → ${nextLevel}`,
          detail: `Strategy promoted from ${strategy.level} to ${nextLevel}`,
          status: "completed",
        });

        jsonResponse(res, 200, { status: "promoted", id, from: strategy.level, to: nextLevel });
      } catch (err) {
        errorResponse(res, 500, (err as Error).message);
      }
    },
  });
}
