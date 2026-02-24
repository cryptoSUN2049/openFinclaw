/**
 * Lifecycle engine for FinClaw Commons entries.
 *
 * Manages growth tiers and operational status via a state machine.
 * Tiers reflect maturity (seedling → growing → established) based on FCS score.
 * Status tracks operational health (active / degrading / archived / delisted).
 */

import type {
  BacktestResult,
  ConnectorHealth,
  LifecycleState,
  LifecycleThresholds,
  UsageMetrics,
} from "./types.fcs.js";
import type { CommonsEntryType } from "./types.js";

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

export type LifecycleEntryData = {
  updatedAt: string;
  backtest?: BacktestResult;
  connectorHealth?: ConnectorHealth;
  usage?: UsageMetrics;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysSince(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

function addHistory(state: LifecycleState, reason?: string): LifecycleState {
  return {
    ...state,
    tierHistory: [
      ...state.tierHistory,
      {
        tier: state.tier,
        status: state.status,
        changedAt: new Date().toISOString(),
        reason,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create initial lifecycle state for a newly published entry. */
export function createInitialLifecycle(): LifecycleState {
  return {
    tier: "seedling",
    status: "active",
    tierHistory: [
      {
        tier: "seedling",
        status: "active",
        changedAt: new Date().toISOString(),
        reason: "Initial publish",
      },
    ],
  };
}

/** Check type-specific degradation signals. */
export function checkDegradationSignals(
  entryType: CommonsEntryType,
  data: LifecycleEntryData,
): { shouldDegrade: boolean; reason?: string } {
  switch (entryType) {
    case "strategy": {
      if (data.backtest) {
        if (data.backtest.sharpeRatio < 0) {
          return { shouldDegrade: true, reason: "Negative Sharpe ratio" };
        }
        if (data.backtest.maxDrawdownPct > 50) {
          return { shouldDegrade: true, reason: "Excessive drawdown (>50%)" };
        }
        if (data.backtest.verifiedAt && daysSince(data.backtest.verifiedAt) > 180) {
          return { shouldDegrade: true, reason: "No backtest update in 180 days" };
        }
      }
      if (!data.backtest && daysSince(data.updatedAt) > 180) {
        return { shouldDegrade: true, reason: "No backtest update in 180 days" };
      }
      break;
    }
    case "connector": {
      if (data.connectorHealth) {
        if (data.connectorHealth.uptimePct < 80) {
          return { shouldDegrade: true, reason: "Low uptime (<80%)" };
        }
        if (data.connectorHealth.errorRate > 0.1) {
          return { shouldDegrade: true, reason: "High error rate (>10%)" };
        }
        if (daysSince(data.connectorHealth.lastCheckedAt) > 30) {
          return { shouldDegrade: true, reason: "No health check in 30 days" };
        }
      }
      break;
    }
    case "skill": {
      if (data.usage) {
        if (
          data.usage.invocationCount30d === 0 &&
          data.usage.lastUsedAt &&
          daysSince(data.usage.lastUsedAt) > 90
        ) {
          return { shouldDegrade: true, reason: "No invocations in 90 days" };
        }
        if (data.usage.activeInstalls30d === 0) {
          return { shouldDegrade: true, reason: "Zero active installations" };
        }
      }
      break;
    }
    case "knowledge-pack": {
      if (daysSince(data.updatedAt) > 365) {
        return { shouldDegrade: true, reason: "Not updated in 365 days" };
      }
      break;
    }
    case "compliance-ruleset": {
      if (daysSince(data.updatedAt) > 365) {
        return { shouldDegrade: true, reason: "Regulatory references may be outdated" };
      }
      break;
    }
    case "persona":
    case "workspace": {
      if (data.usage && data.usage.activeInstalls30d === 0) {
        if (data.usage.lastUsedAt && daysSince(data.usage.lastUsedAt) > 180) {
          return { shouldDegrade: true, reason: "No installations in 180 days" };
        }
      }
      break;
    }
  }

  return { shouldDegrade: false };
}

/** Evaluate and update lifecycle state based on current FCS score and entry data. */
export function evaluateLifecycle(
  current: LifecycleState,
  fcsTotal: number,
  entryType: CommonsEntryType,
  entryData: LifecycleEntryData,
  thresholds: LifecycleThresholds,
): LifecycleState {
  // Delisted entries require manual action — no automatic changes.
  if (current.status === "delisted") {
    return current;
  }

  // Archived entries require manual restore — no automatic changes.
  if (current.status === "archived") {
    return current;
  }

  let state = { ...current, tierHistory: [...current.tierHistory] };

  // Check type-specific degradation signals.
  const signals = checkDegradationSignals(entryType, entryData);

  // Degradation: FCS below threshold or type-specific signal fires.
  if (
    state.status === "active" &&
    (signals.shouldDegrade || fcsTotal < thresholds.degradationThreshold)
  ) {
    state.status = "degrading";
    state.degradedAt = new Date().toISOString();
    const reason = signals.reason ?? `FCS below ${thresholds.degradationThreshold}`;
    state = addHistory(state, reason);
    return state;
  }

  // Recovery: degrading → active when FCS recovers.
  if (state.status === "degrading" && fcsTotal >= 30 && !signals.shouldDegrade) {
    state.status = "active";
    state.degradedAt = undefined;
    state = addHistory(state, "FCS recovered");
    // Fall through to check tier promotions.
  }

  // Archival: degrading too long without recovery.
  if (state.status === "degrading" && state.degradedAt) {
    if (daysSince(state.degradedAt) > thresholds.archivalGracePeriodDays) {
      state.status = "archived";
      state.archivedAt = new Date().toISOString();
      state = addHistory(state, "Grace period expired");
      return state;
    }
  }

  // Tier promotions (only while active).
  if (state.status === "active") {
    if (state.tier === "seedling" && fcsTotal >= thresholds.seedlingToGrowingThreshold) {
      state.tier = "growing";
      state.promotedAt = new Date().toISOString();
      state = addHistory(state, "Promoted to growing");
    }
    if (state.tier === "growing" && fcsTotal >= thresholds.growingToEstablishedThreshold) {
      state.tier = "established";
      state.promotedAt = new Date().toISOString();
      state = addHistory(state, "Promoted to established");
    }
  }

  return state;
}

/** Delist an entry (emergency compliance action). */
export function delistEntry(current: LifecycleState, reason: string): LifecycleState {
  let state: LifecycleState = {
    ...current,
    tierHistory: [...current.tierHistory],
    status: "delisted",
    delistReason: reason,
  };
  state = addHistory(state, `Delisted: ${reason}`);
  return state;
}

/** Restore an archived or delisted entry. Returns seedling+active if FCS qualifies, null otherwise. */
export function restoreEntry(
  current: LifecycleState,
  currentFcs: number,
  minFcs: number,
): LifecycleState | null {
  if (currentFcs < minFcs) {
    return null;
  }

  let state: LifecycleState = {
    tier: "seedling",
    status: "active",
    tierHistory: [...current.tierHistory],
    degradedAt: undefined,
    archivedAt: undefined,
    delistReason: undefined,
  };
  state = addHistory(state, "Restored");
  return state;
}
