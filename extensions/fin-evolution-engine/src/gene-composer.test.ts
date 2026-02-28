import { describe, expect, it } from "vitest";
import { composeSignal } from "./gene-composer.ts";
import { GeneComposerResultSchema } from "./schemas.ts";
import { mockGene, mockGenes } from "./test-utils.ts";

describe("GeneComposer — composeSignal", () => {
  // ── Basic signal composition ────────────────────────────────────

  it("returns BUY when all signal genes point up", () => {
    const genes = [
      mockGene({ id: "g1", direction: 1, confidence: 0.8, type: "signal" }),
      mockGene({ id: "g2", direction: 1, confidence: 0.6, type: "signal" }),
    ];
    const result = composeSignal({ genes });
    expect(result.signal).toBe("BUY");
    expect(result.norm).toBe(1);
    expect(result.strength).toBe(1);
    expect(result.geneIds).toEqual(["g1", "g2"]);
  });

  it("returns SELL when all signal genes point down", () => {
    const genes = [
      mockGene({ id: "g1", direction: -1, confidence: 0.9, type: "signal" }),
      mockGene({ id: "g2", direction: -1, confidence: 0.7, type: "signal" }),
    ];
    const result = composeSignal({ genes });
    expect(result.signal).toBe("SELL");
    expect(result.norm).toBe(-1);
    expect(result.strength).toBe(1);
  });

  it("returns HOLD when signals cancel out", () => {
    const genes = [
      mockGene({ id: "g1", direction: 1, confidence: 0.8, type: "signal" }),
      mockGene({ id: "g2", direction: -1, confidence: 0.8, type: "signal" }),
    ];
    const result = composeSignal({ genes });
    expect(result.signal).toBe("HOLD");
    expect(result.norm).toBe(0);
    expect(result.strength).toBe(0);
  });

  it("returns HOLD when norm is below threshold", () => {
    // One strong bearish + one weak bullish → small negative norm
    const genes = [
      mockGene({ id: "g1", direction: -1, confidence: 0.6, type: "signal" }),
      mockGene({ id: "g2", direction: 1, confidence: 0.5, type: "signal" }),
    ];
    const result = composeSignal({ genes, threshold: 0.5 });
    // norm = (-0.6 + 0.5) / (0.6 + 0.5) ≈ -0.0909
    expect(result.signal).toBe("HOLD");
    expect(Math.abs(result.norm)).toBeLessThan(0.5);
  });

  // ── Edge cases ──────────────────────────────────────────────────

  it("returns HOLD with empty geneIds when no signal genes", () => {
    const genes = [
      mockGene({ id: "g1", type: "sizing", direction: 0 }),
      mockGene({ id: "g2", type: "exit", direction: 0 }),
    ];
    const result = composeSignal({ genes });
    expect(result.signal).toBe("HOLD");
    expect(result.geneIds).toEqual([]);
    expect(result.norm).toBe(0);
  });

  it("filters non-signal genes from calculation", () => {
    const genes = mockGenes(5); // 2 signal + sizing + filter + exit
    const result = composeSignal({ genes });
    // Only gene-rsi-1 and gene-macd-1 are signal type
    expect(result.geneIds).toEqual(["gene-rsi-1", "gene-macd-1"]);
    expect(result.geneIds).not.toContain("gene-atr-1");
  });

  // ── Weight overrides ───────────────────────────────────────────

  it("respects custom weight overrides", () => {
    const genes = [
      mockGene({ id: "g1", direction: 1, confidence: 0.5, type: "signal" }),
      mockGene({ id: "g2", direction: -1, confidence: 0.5, type: "signal" }),
    ];
    // Override g1 to have much higher weight
    const result = composeSignal({
      genes,
      weights: { g1: 0.9, g2: 0.1 },
    });
    // norm = (1*0.9 + (-1)*0.1) / (0.9 + 0.1) = 0.8
    expect(result.signal).toBe("BUY");
    expect(result.norm).toBe(0.8);
    expect(result.weights.g1).toBe(0.9);
    expect(result.weights.g2).toBe(0.1);
  });

  it("uses gene.confidence as default weight when no override", () => {
    const genes = [mockGene({ id: "g1", direction: 1, confidence: 0.3, type: "signal" })];
    const result = composeSignal({ genes });
    expect(result.weights.g1).toBe(0.3);
  });

  // ── Threshold tuning ───────────────────────────────────────────

  it("uses custom threshold correctly", () => {
    const genes = [
      mockGene({ id: "g1", direction: 1, confidence: 0.6, type: "signal" }),
      mockGene({ id: "g2", direction: -1, confidence: 0.4, type: "signal" }),
    ];
    // norm = (0.6 - 0.4) / (0.6 + 0.4) = 0.2
    // With threshold 0.1 → BUY; with threshold 0.3 → HOLD
    const buyResult = composeSignal({ genes, threshold: 0.1 });
    expect(buyResult.signal).toBe("BUY");

    const holdResult = composeSignal({ genes, threshold: 0.3 });
    expect(holdResult.signal).toBe("HOLD");
  });

  // ── Schema compliance ──────────────────────────────────────────

  it("output passes GeneComposerResultSchema validation", () => {
    const genes = mockGenes(3);
    const result = composeSignal({ genes });
    expect(() => GeneComposerResultSchema.parse(result)).not.toThrow();
  });

  it("norm is clamped to [-1, 1]", () => {
    // Single gene with direction 1 → norm should be exactly 1
    const genes = [mockGene({ id: "g1", direction: 1, confidence: 1.0, type: "signal" })];
    const result = composeSignal({ genes });
    expect(result.norm).toBeLessThanOrEqual(1);
    expect(result.norm).toBeGreaterThanOrEqual(-1);
  });
});
