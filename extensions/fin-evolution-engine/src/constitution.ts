/**
 * Constitution Enforcer — immutable safety rules that NO mutation may violate.
 *
 * Rules are split into:
 *   - hard: violation = block (passed=false)
 *   - soft: violation = warning only (passed still true)
 *
 * All thresholds come from THRESHOLDS — no hardcoded magic numbers.
 */

import {
  THRESHOLDS,
  type ConstitutionRuleId,
  type ConstitutionVerdict,
  ConstitutionVerdictSchema,
  type Gene,
} from "./schemas.ts";

// ─── Context ────────────────────────────────────────────────────────

export type ConstitutionContext = {
  leverage: number;
  positionPct: number;
  drawdown: number;
  tradeCount: number;
  forbiddenAssets: string[];
  symbols: string[];
  mutationsToday: number;
  sharpe: number;
  scenarioSharpes?: number[]; // for overfit detection
};

// ─── Helpers ────────────────────────────────────────────────────────

/** Standard deviation of a numeric array (population stddev). */
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sqDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((s, v) => s + v, 0) / values.length);
}

// ─── Built-in Rules ─────────────────────────────────────────────────

const BUILTIN_RULES: Array<{
  id: ConstitutionRuleId;
  name: string;
  severity: "hard" | "soft";
  check: (ctx: ConstitutionContext) => string | null; // null = passed, string = violation message
}> = [
  {
    id: "max_leverage",
    name: "Maximum Leverage",
    severity: "hard",
    check: (ctx) => {
      const max = THRESHOLDS.constitution.maxLeverage;
      return ctx.leverage > max ? `Leverage ${ctx.leverage} exceeds max ${max}` : null;
    },
  },
  {
    id: "max_position_pct",
    name: "Maximum Position Percentage",
    severity: "hard",
    check: (ctx) => {
      const max = THRESHOLDS.constitution.maxPositionPct;
      return ctx.positionPct > max
        ? `Position ${(ctx.positionPct * 100).toFixed(1)}% exceeds max ${(max * 100).toFixed(1)}%`
        : null;
    },
  },
  {
    id: "max_drawdown_halt",
    name: "Maximum Drawdown Halt",
    severity: "hard",
    check: (ctx) => {
      const max = THRESHOLDS.constitution.maxDrawdownHalt;
      return ctx.drawdown >= max
        ? `Drawdown ${(ctx.drawdown * 100).toFixed(1)}% reached halt threshold ${(max * 100).toFixed(1)}%`
        : null;
    },
  },
  {
    id: "min_trade_count",
    name: "Minimum Trade Count",
    severity: "hard",
    check: (ctx) => {
      const min = THRESHOLDS.constitution.minTradeCount;
      return ctx.tradeCount < min
        ? `Trade count ${ctx.tradeCount} below minimum ${min} required for promotion`
        : null;
    },
  },
  {
    id: "forbidden_assets",
    name: "Forbidden Assets",
    severity: "hard",
    check: (ctx) => {
      if (ctx.forbiddenAssets.length === 0) return null;
      const violations = ctx.symbols.filter((s) => ctx.forbiddenAssets.includes(s));
      return violations.length > 0 ? `Forbidden assets detected: ${violations.join(", ")}` : null;
    },
  },
  {
    id: "max_mutation_frequency",
    name: "Maximum Mutation Frequency",
    severity: "hard",
    check: (ctx) => {
      const max = THRESHOLDS.mutationGate.maxPerDay;
      return ctx.mutationsToday >= max
        ? `Mutations today ${ctx.mutationsToday} reached daily limit ${max}`
        : null;
    },
  },
  {
    id: "min_sharpe_floor",
    name: "Minimum Sharpe Floor",
    severity: "soft",
    check: (ctx) => {
      const min = THRESHOLDS.constitution.minSharpeFloor;
      return ctx.sharpe < min ? `Sharpe ${ctx.sharpe.toFixed(2)} below floor ${min}` : null;
    },
  },
  {
    id: "overfit_detection",
    name: "Overfit Detection",
    severity: "soft",
    check: (ctx) => {
      const sharpes = ctx.scenarioSharpes;
      if (!sharpes || sharpes.length < THRESHOLDS.constitution.overfitScenarioCount) {
        return null;
      }
      const avg = sharpes.reduce((s, v) => s + v, 0) / sharpes.length;
      const sd = stdDev(sharpes);
      if (
        avg > THRESHOLDS.constitution.overfitSharpeMin &&
        sd < THRESHOLDS.constitution.overfitStdDevMax
      ) {
        return `Suspiciously consistent scenario Sharpes (avg=${avg.toFixed(2)}, stddev=${sd.toFixed(4)}, n=${sharpes.length}) — possible overfit`;
      }
      return null;
    },
  },
];

// ─── Enforcer ───────────────────────────────────────────────────────

/**
 * Run all constitution rules against the given context.
 *
 * Returns a validated ConstitutionVerdict:
 *   - passed: true only when zero hard violations
 *   - hardViolations: array of {ruleId, violation}
 *   - softWarnings: array of {ruleId, warning}
 *   - checkedAt: ISO timestamp
 */
export function enforceConstitution(ctx: ConstitutionContext): ConstitutionVerdict {
  const hardViolations: Array<{ ruleId: ConstitutionRuleId; violation: string }> = [];
  const softWarnings: Array<{ ruleId: ConstitutionRuleId; warning: string }> = [];

  for (const rule of BUILTIN_RULES) {
    const message = rule.check(ctx);
    if (message === null) continue;

    if (rule.severity === "hard") {
      hardViolations.push({ ruleId: rule.id, violation: message });
    } else {
      softWarnings.push({ ruleId: rule.id, warning: message });
    }
  }

  return ConstitutionVerdictSchema.parse({
    passed: hardViolations.length === 0,
    hardViolations,
    softWarnings,
    checkedAt: new Date().toISOString(),
  });
}
