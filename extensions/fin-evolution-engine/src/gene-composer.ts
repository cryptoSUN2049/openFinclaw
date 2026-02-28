/**
 * GeneComposer — weighted signal combination.
 *
 * Takes an array of Gene objects, filters for type === "signal",
 * computes a normalized weighted sum, and returns BUY / SELL / HOLD.
 */

import type { Gene, GeneComposerResult } from "./schemas.ts";
import { GeneComposerResultSchema } from "./schemas.ts";

export interface ComposeSignalParams {
  genes: Gene[];
  /** Per-gene weight overrides keyed by gene.id. Default: gene.confidence */
  weights?: Record<string, number>;
  /** Signal activation threshold (default 0.3) */
  threshold?: number;
}

/**
 * Compose a trading signal from weighted gene directions.
 *
 * Only genes with `type === "signal"` participate.
 * `norm = Σ(direction × weight) / Σ(|weight|)`, clamped to [-1, 1].
 * When `|norm| >= threshold` → BUY (positive) or SELL (negative), else HOLD.
 */
export function composeSignal(params: ComposeSignalParams): GeneComposerResult {
  const { genes, weights: weightOverrides, threshold = 0.3 } = params;

  const signalGenes = genes.filter((g) => g.type === "signal");

  // No signal genes → neutral HOLD
  if (signalGenes.length === 0) {
    return GeneComposerResultSchema.parse({
      norm: 0,
      threshold,
      signal: "HOLD",
      strength: 0,
      geneIds: [],
      weights: {},
    });
  }

  // Resolve weights: override > gene.confidence
  const resolvedWeights: Record<string, number> = {};
  for (const gene of signalGenes) {
    resolvedWeights[gene.id] = weightOverrides?.[gene.id] ?? gene.confidence;
  }

  // Weighted sum and absolute weight sum
  let weightedSum = 0;
  let absWeightSum = 0;
  for (const gene of signalGenes) {
    const w = resolvedWeights[gene.id];
    weightedSum += gene.direction * w;
    absWeightSum += Math.abs(w);
  }

  // Normalize to [-1, 1]
  const norm = absWeightSum > 0 ? Math.max(-1, Math.min(1, weightedSum / absWeightSum)) : 0;

  // Determine signal
  const absNorm = Math.abs(norm);
  const signal: "BUY" | "SELL" | "HOLD" =
    absNorm >= threshold ? (norm > 0 ? "BUY" : "SELL") : "HOLD";

  return GeneComposerResultSchema.parse({
    norm: Math.round(norm * 10000) / 10000,
    threshold,
    signal,
    strength: signal === "HOLD" ? 0 : Math.round(absNorm * 10000) / 10000,
    geneIds: signalGenes.map((g) => g.id),
    weights: resolvedWeights,
  });
}
