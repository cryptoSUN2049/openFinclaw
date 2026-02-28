import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmMutator, readEvolutionApiKey } from "./llm-mutator.ts";
import { DiagnoseResultSchema, DistillResultSchema } from "./schemas.ts";
import { mockGene, mockMutationCandidate } from "./test-utils.ts";

// ─── Helpers ────────────────────────────────────────────────────────

function makeDiagnoseCtx() {
  return {
    strategyName: "RSI Momentum Alpha",
    genes: [
      mockGene({ id: "g1", type: "signal", params: { period: 14, threshold: 30 } }),
      mockGene({ id: "g2", type: "signal", params: { fast: 12, slow: 26 } }),
    ],
    fitness: 0.45,
    decayLevel: "yellow",
    sharpeRatio: 0.72,
    survivalTier: "stressed",
    recentCycleCount: 3,
  };
}

function makeMutateCtx() {
  const genes = [mockGene({ id: "g1", type: "signal", params: { period: 14, threshold: 30 } })];
  const candidate = mockMutationCandidate({
    affectedGeneIds: ["g1"],
    type: "parameter-tune",
  });
  const diagnoseResult = {
    rootCause: "RSI threshold too high for current regime",
    confidence: 0.8,
    suggestedMutations: [candidate],
    historicalContext: "Current fitness: 0.450",
  };
  return { genes, candidate, diagnoseResult };
}

// ─── No API key (rule-based fallback) ───────────────────────────────

describe("LlmMutator — no API key", () => {
  it("isLlmAvailable returns false when no config", () => {
    const mutator = new LlmMutator(null);
    expect(mutator.isLlmAvailable).toBe(false);
  });

  it("isLlmAvailable returns false when empty apiKey", () => {
    const mutator = new LlmMutator({ apiKey: "" });
    expect(mutator.isLlmAvailable).toBe(false);
  });

  it("isLlmAvailable returns true when apiKey is set", () => {
    const mutator = new LlmMutator({ apiKey: "sk-test-123" });
    expect(mutator.isLlmAvailable).toBe(true);
  });

  it("diagnose falls back to rule-based when no key", async () => {
    const mutator = new LlmMutator(null);
    const ctx = makeDiagnoseCtx();
    const result = await mutator.diagnose(ctx);

    expect(result.rootCause).toContain("yellow decay");
    expect(result.confidence).toBe(0.7);
    expect(result.suggestedMutations).toHaveLength(1);
    expect(() => DiagnoseResultSchema.parse(result)).not.toThrow();
  });

  it("mutate falls back to rule-based when no key", async () => {
    const mutator = new LlmMutator(null);
    const ctx = makeMutateCtx();
    const result = await mutator.mutate(ctx);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("g1");
    // Params should be different from original (mutated)
    const originalPeriod = ctx.genes[0].params.period;
    // Rule-based mutation is random, just verify structure
    expect(typeof result[0].params.period).toBe("number");
    expect(typeof result[0].params.threshold).toBe("number");
  });
});

// ─── Rule-based diagnose ──────────────────────────────────────────

describe("LlmMutator — diagnoseRuleBased", () => {
  it("returns high confidence for red decay", () => {
    const mutator = new LlmMutator(null);
    const ctx = makeDiagnoseCtx();
    ctx.decayLevel = "red";
    const result = mutator.diagnoseRuleBased(ctx);
    expect(result.confidence).toBe(0.9);
    expect(result.rootCause).toContain("red decay");
  });

  it("suggests architecture-change for critical tier", () => {
    const mutator = new LlmMutator(null);
    const ctx = makeDiagnoseCtx();
    ctx.survivalTier = "critical";
    const result = mutator.diagnoseRuleBased(ctx);
    expect(result.suggestedMutations[0].type).toBe("architecture-change");
    expect(result.suggestedMutations[0].riskLevel).toBe("high");
  });

  it("suggests parameter-tune for healthy tier", () => {
    const mutator = new LlmMutator(null);
    const ctx = makeDiagnoseCtx();
    ctx.survivalTier = "healthy";
    const result = mutator.diagnoseRuleBased(ctx);
    expect(result.suggestedMutations[0].type).toBe("parameter-tune");
    expect(result.suggestedMutations[0].riskLevel).toBe("low");
  });

  it("output passes Zod validation", () => {
    const mutator = new LlmMutator(null);
    const ctx = makeDiagnoseCtx();
    const result = mutator.diagnoseRuleBased(ctx);
    expect(() => DiagnoseResultSchema.parse(result)).not.toThrow();
  });
});

// ─── Rule-based mutate ───────────────────────────────────────────

describe("LlmMutator — mutateRuleBased", () => {
  it("preserves gene IDs and structure", () => {
    const mutator = new LlmMutator(null);
    const ctx = makeMutateCtx();
    const result = mutator.mutateRuleBased(ctx.genes, ctx.candidate);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("g1");
    expect(result[0].name).toBe(ctx.genes[0].name);
    expect(result[0].type).toBe(ctx.genes[0].type);
  });

  it("does not mutate genes not in affectedGeneIds", () => {
    const mutator = new LlmMutator(null);
    const genes = [
      mockGene({ id: "g1", params: { period: 14 } }),
      mockGene({ id: "g2", params: { fast: 12 } }),
    ];
    const candidate = mockMutationCandidate({ affectedGeneIds: ["g1"] });
    const result = mutator.mutateRuleBased(genes, candidate);
    // g2 should be unchanged
    expect(result[1].params.fast).toBe(12);
  });

  it("rounds parameter values to 4 decimal places", () => {
    const mutator = new LlmMutator(null);
    const ctx = makeMutateCtx();
    const result = mutator.mutateRuleBased(ctx.genes, ctx.candidate);
    for (const val of Object.values(result[0].params)) {
      const decimals = val.toString().split(".")[1]?.length ?? 0;
      expect(decimals).toBeLessThanOrEqual(4);
    }
  });
});

// ─── LLM integration with mock fetch ──────────────────────────────

describe("LlmMutator — LLM mock", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("diagnose calls LLM and parses response", async () => {
    const llmResponse = {
      rootCause: "RSI threshold misaligned with current volatility regime",
      confidence: 0.85,
      historicalContext: "Volatile market since Feb 2026",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(llmResponse) } }],
      }),
    });

    const mutator = new LlmMutator({ apiKey: "sk-test" });
    const result = await mutator.diagnose(makeDiagnoseCtx());

    expect(result.rootCause).toBe(llmResponse.rootCause);
    expect(result.confidence).toBe(0.85);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(() => DiagnoseResultSchema.parse(result)).not.toThrow();
  });

  it("diagnose falls back to rule-based on LLM error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const mutator = new LlmMutator({ apiKey: "sk-test" });
    const result = await mutator.diagnose(makeDiagnoseCtx());

    // Should still return valid result via fallback
    expect(result.rootCause).toContain("decay");
    expect(() => DiagnoseResultSchema.parse(result)).not.toThrow();
  });

  it("diagnose falls back on invalid JSON from LLM", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "not json at all" } }],
      }),
    });

    const mutator = new LlmMutator({ apiKey: "sk-test" });
    const result = await mutator.diagnose(makeDiagnoseCtx());
    expect(result.rootCause).toContain("decay");
  });

  it("mutate applies LLM-suggested adjustments within ±30%", async () => {
    const llmResponse = {
      adjustments: [
        { geneId: "g1", paramName: "period", newValue: 16 }, // +14%
        { geneId: "g1", paramName: "threshold", newValue: 25 }, // -17%
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(llmResponse) } }],
      }),
    });

    const mutator = new LlmMutator({ apiKey: "sk-test" });
    const ctx = makeMutateCtx();
    const result = await mutator.mutate(ctx);

    expect(result[0].params.period).toBe(16);
    expect(result[0].params.threshold).toBe(25);
  });

  it("mutate clamps LLM adjustments to ±30% bounds", async () => {
    const llmResponse = {
      adjustments: [
        { geneId: "g1", paramName: "period", newValue: 100 }, // way beyond +30%
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(llmResponse) } }],
      }),
    });

    const mutator = new LlmMutator({ apiKey: "sk-test" });
    const ctx = makeMutateCtx();
    const result = await mutator.mutate(ctx);

    // Original period is 14, max is 14 * 1.3 = 18.2
    expect(result[0].params.period).toBeLessThanOrEqual(14 * 1.3);
    expect(result[0].params.period).toBeGreaterThanOrEqual(14 * 0.7);
  });

  it("mutate falls back on empty adjustments", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ adjustments: [] }) } }],
      }),
    });

    const mutator = new LlmMutator({ apiKey: "sk-test" });
    const ctx = makeMutateCtx();
    const result = await mutator.mutate(ctx);
    // Falls back to rule-based → still returns mutated genes
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("g1");
  });
});

// ─── Distill helper ────────────────────────────────────────────────

describe("LlmMutator — buildDistillResult", () => {
  it("returns success patterns on success", () => {
    const mutator = new LlmMutator(null);
    const result = mutator.buildDistillResult(true, "bull", 0.08);
    expect(result.successPatterns).toHaveLength(1);
    expect(result.errorPatterns).toHaveLength(0);
    expect(result.soulUpdates).toHaveLength(1);
    expect(result.successPatterns[0].regime).toBe("bull");
    expect(() => DistillResultSchema.parse(result)).not.toThrow();
  });

  it("returns error patterns on failure", () => {
    const mutator = new LlmMutator(null);
    const result = mutator.buildDistillResult(false, "bear", -0.03);
    expect(result.errorPatterns).toHaveLength(1);
    expect(result.successPatterns).toHaveLength(0);
    expect(result.errorPatterns[0].severity).toBe("medium");
    expect(() => DistillResultSchema.parse(result)).not.toThrow();
  });

  it("uses high severity for large negative improvement", () => {
    const mutator = new LlmMutator(null);
    const result = mutator.buildDistillResult(false, "crash", -0.1);
    expect(result.errorPatterns[0].severity).toBe("high");
  });

  it("defaults to sideways for unknown regime", () => {
    const mutator = new LlmMutator(null);
    const result = mutator.buildDistillResult(true, "unknown_regime", 0.05);
    expect(result.successPatterns[0].regime).toBe("sideways");
  });
});

// ─── Environment variable reading ──────────────────────────────────

describe("readEvolutionApiKey", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.OPENFINCLAW_EVOLUTION_API_KEY;
    delete process.env.OPENCLAW_EVOLUTION_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns undefined when no keys set", () => {
    expect(readEvolutionApiKey()).toBeUndefined();
  });

  it("prefers OPENFINCLAW_EVOLUTION_API_KEY", () => {
    process.env.OPENFINCLAW_EVOLUTION_API_KEY = "key-1";
    process.env.OPENAI_API_KEY = "key-3";
    expect(readEvolutionApiKey()).toBe("key-1");
  });

  it("falls back to OPENCLAW_EVOLUTION_API_KEY", () => {
    process.env.OPENCLAW_EVOLUTION_API_KEY = "key-2";
    process.env.OPENAI_API_KEY = "key-3";
    expect(readEvolutionApiKey()).toBe("key-2");
  });

  it("falls back to OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "key-3";
    expect(readEvolutionApiKey()).toBe("key-3");
  });

  it("trims whitespace from key", () => {
    process.env.OPENAI_API_KEY = "  sk-trimmed  ";
    expect(readEvolutionApiKey()).toBe("sk-trimmed");
  });
});
