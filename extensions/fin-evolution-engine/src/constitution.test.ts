import { describe, it, expect } from "vitest";
import { enforceConstitution, type ConstitutionContext } from "./constitution.ts";

/** Healthy context — all rules pass */
function healthyCtx(overrides?: Partial<ConstitutionContext>): ConstitutionContext {
  return {
    leverage: 1.5,
    positionPct: 0.1,
    drawdown: 0.08,
    tradeCount: 50,
    forbiddenAssets: [],
    symbols: ["BTC/USDT", "ETH/USDT"],
    mutationsToday: 3,
    sharpe: 1.2,
    ...overrides,
  };
}

describe("enforceConstitution", () => {
  // ── Happy path ──────────────────────────────────────────────────

  it("all rules pass with healthy context", () => {
    const verdict = enforceConstitution(healthyCtx());
    expect(verdict.passed).toBe(true);
    expect(verdict.hardViolations).toHaveLength(0);
    expect(verdict.softWarnings).toHaveLength(0);
    expect(verdict.checkedAt).toBeTruthy();
  });

  // ── Hard violations ─────────────────────────────────────────────

  it("max_leverage: leverage=4.0 → hard violation", () => {
    const verdict = enforceConstitution(healthyCtx({ leverage: 4.0 }));
    expect(verdict.passed).toBe(false);
    expect(verdict.hardViolations).toHaveLength(1);
    expect(verdict.hardViolations[0].ruleId).toBe("max_leverage");
    expect(verdict.hardViolations[0].violation).toContain("4");
    expect(verdict.hardViolations[0].violation).toContain("3");
  });

  it("max_position_pct: positionPct=0.35 → hard violation", () => {
    const verdict = enforceConstitution(healthyCtx({ positionPct: 0.35 }));
    expect(verdict.passed).toBe(false);
    expect(verdict.hardViolations).toHaveLength(1);
    expect(verdict.hardViolations[0].ruleId).toBe("max_position_pct");
    expect(verdict.hardViolations[0].violation).toContain("35.0%");
  });

  it("max_drawdown_halt: drawdown=0.35 → hard violation", () => {
    const verdict = enforceConstitution(healthyCtx({ drawdown: 0.35 }));
    expect(verdict.passed).toBe(false);
    expect(verdict.hardViolations).toHaveLength(1);
    expect(verdict.hardViolations[0].ruleId).toBe("max_drawdown_halt");
    expect(verdict.hardViolations[0].violation).toContain("35.0%");
  });

  it("min_trade_count: tradeCount=10 → hard violation", () => {
    const verdict = enforceConstitution(healthyCtx({ tradeCount: 10 }));
    expect(verdict.passed).toBe(false);
    expect(verdict.hardViolations).toHaveLength(1);
    expect(verdict.hardViolations[0].ruleId).toBe("min_trade_count");
    expect(verdict.hardViolations[0].violation).toContain("10");
    expect(verdict.hardViolations[0].violation).toContain("30");
  });

  it("forbidden_assets: symbol in forbidden list → hard violation", () => {
    const verdict = enforceConstitution(
      healthyCtx({
        symbols: ["BTC/USDT", "ETH/USDT"],
        forbiddenAssets: ["BTC/USDT"],
      }),
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.hardViolations).toHaveLength(1);
    expect(verdict.hardViolations[0].ruleId).toBe("forbidden_assets");
    expect(verdict.hardViolations[0].violation).toContain("BTC/USDT");
  });

  it("forbidden_assets: no overlap → pass", () => {
    const verdict = enforceConstitution(
      healthyCtx({
        symbols: ["BTC/USDT"],
        forbiddenAssets: ["DOGE/USDT"],
      }),
    );
    expect(verdict.passed).toBe(true);
    const forbiddenViolation = verdict.hardViolations.find((v) => v.ruleId === "forbidden_assets");
    expect(forbiddenViolation).toBeUndefined();
  });

  it("max_mutation_frequency: mutationsToday=12 → hard violation", () => {
    const verdict = enforceConstitution(healthyCtx({ mutationsToday: 12 }));
    expect(verdict.passed).toBe(false);
    expect(verdict.hardViolations).toHaveLength(1);
    expect(verdict.hardViolations[0].ruleId).toBe("max_mutation_frequency");
    expect(verdict.hardViolations[0].violation).toContain("12");
    expect(verdict.hardViolations[0].violation).toContain("10");
  });

  // ── Soft warnings ───────────────────────────────────────────────

  it("min_sharpe_floor: sharpe=-1.5 → soft warning, still passed", () => {
    const verdict = enforceConstitution(healthyCtx({ sharpe: -1.5 }));
    expect(verdict.passed).toBe(true);
    expect(verdict.hardViolations).toHaveLength(0);
    expect(verdict.softWarnings).toHaveLength(1);
    expect(verdict.softWarnings[0].ruleId).toBe("min_sharpe_floor");
    expect(verdict.softWarnings[0].warning).toContain("-1.50");
  });

  it("overfit_detection: suspiciously consistent sharpes → soft warning", () => {
    const verdict = enforceConstitution(
      healthyCtx({
        scenarioSharpes: [3.5, 3.5, 3.5, 3.5, 3.5],
      }),
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.hardViolations).toHaveLength(0);
    expect(verdict.softWarnings).toHaveLength(1);
    expect(verdict.softWarnings[0].ruleId).toBe("overfit_detection");
    expect(verdict.softWarnings[0].warning).toContain("overfit");
  });

  // ── Multiple violations ─────────────────────────────────────────

  it("multiple hard + soft violations collected together", () => {
    const verdict = enforceConstitution({
      leverage: 5.0, // hard
      positionPct: 0.5, // hard
      drawdown: 0.4, // hard
      tradeCount: 5, // hard
      forbiddenAssets: ["BTC/USDT"],
      symbols: ["BTC/USDT"], // hard
      mutationsToday: 15, // hard
      sharpe: -2.0, // soft
      scenarioSharpes: [3.5, 3.5, 3.5, 3.5], // soft
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.hardViolations).toHaveLength(6);
    expect(verdict.softWarnings).toHaveLength(2);

    // Verify all hard rule IDs present
    const hardIds = verdict.hardViolations.map((v) => v.ruleId);
    expect(hardIds).toContain("max_leverage");
    expect(hardIds).toContain("max_position_pct");
    expect(hardIds).toContain("max_drawdown_halt");
    expect(hardIds).toContain("min_trade_count");
    expect(hardIds).toContain("forbidden_assets");
    expect(hardIds).toContain("max_mutation_frequency");

    // Verify all soft rule IDs present
    const softIds = verdict.softWarnings.map((w) => w.ruleId);
    expect(softIds).toContain("min_sharpe_floor");
    expect(softIds).toContain("overfit_detection");
  });

  // ── Edge cases ──────────────────────────────────────────────────

  it("empty forbiddenAssets → pass", () => {
    const verdict = enforceConstitution(
      healthyCtx({
        forbiddenAssets: [],
        symbols: ["BTC/USDT", "ETH/USDT", "DOGE/USDT"],
      }),
    );
    expect(verdict.passed).toBe(true);
    const forbiddenViolation = verdict.hardViolations.find((v) => v.ruleId === "forbidden_assets");
    expect(forbiddenViolation).toBeUndefined();
  });

  it("no scenarioSharpes → overfit check passes", () => {
    const verdict = enforceConstitution(healthyCtx({ scenarioSharpes: undefined }));
    expect(verdict.passed).toBe(true);
    const overfitWarning = verdict.softWarnings.find((w) => w.ruleId === "overfit_detection");
    expect(overfitWarning).toBeUndefined();
  });

  it("scenarioSharpes with fewer than 4 entries → overfit check passes", () => {
    const verdict = enforceConstitution(healthyCtx({ scenarioSharpes: [3.5, 3.5, 3.5] }));
    expect(verdict.passed).toBe(true);
    const overfitWarning = verdict.softWarnings.find((w) => w.ruleId === "overfit_detection");
    expect(overfitWarning).toBeUndefined();
  });

  it("scenarioSharpes with high avg but high stddev → not overfit", () => {
    const verdict = enforceConstitution(healthyCtx({ scenarioSharpes: [4.0, 1.0, 5.0, 2.0] }));
    const overfitWarning = verdict.softWarnings.find((w) => w.ruleId === "overfit_detection");
    expect(overfitWarning).toBeUndefined();
  });

  it("boundary: leverage exactly at max (3.0) → pass", () => {
    const verdict = enforceConstitution(healthyCtx({ leverage: 3.0 }));
    expect(verdict.passed).toBe(true);
  });

  it("boundary: positionPct exactly at max (0.25) → pass", () => {
    const verdict = enforceConstitution(healthyCtx({ positionPct: 0.25 }));
    expect(verdict.passed).toBe(true);
  });

  it("boundary: drawdown exactly at halt (0.3) → hard violation", () => {
    // >= threshold triggers halt
    const verdict = enforceConstitution(healthyCtx({ drawdown: 0.3 }));
    expect(verdict.passed).toBe(false);
    expect(verdict.hardViolations[0].ruleId).toBe("max_drawdown_halt");
  });

  it("boundary: tradeCount exactly at min (30) → pass", () => {
    const verdict = enforceConstitution(healthyCtx({ tradeCount: 30 }));
    expect(verdict.passed).toBe(true);
  });

  it("boundary: mutationsToday exactly at max (10) → hard violation", () => {
    // >= threshold triggers
    const verdict = enforceConstitution(healthyCtx({ mutationsToday: 10 }));
    expect(verdict.passed).toBe(false);
    expect(verdict.hardViolations[0].ruleId).toBe("max_mutation_frequency");
  });

  it("boundary: sharpe exactly at floor (-1.0) → pass", () => {
    const verdict = enforceConstitution(healthyCtx({ sharpe: -1.0 }));
    const sharpeWarning = verdict.softWarnings.find((w) => w.ruleId === "min_sharpe_floor");
    expect(sharpeWarning).toBeUndefined();
  });

  it("returns valid Zod-parsed verdict with checkedAt timestamp", () => {
    const verdict = enforceConstitution(healthyCtx());
    // checkedAt should be a valid ISO datetime
    expect(() => new Date(verdict.checkedAt).toISOString()).not.toThrow();
  });
});
