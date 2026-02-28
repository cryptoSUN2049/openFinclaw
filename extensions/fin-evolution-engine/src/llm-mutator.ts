/**
 * LlmMutator — LLM-powered diagnose & mutate with rule-based fallback.
 *
 * Uses native `fetch` to call OpenAI-compatible `/v1/chat/completions`.
 * Falls back to rule-based logic when:
 *   - No API key configured
 *   - LLM request fails
 *   - LLM output fails Zod validation
 */

import type {
  DiagnoseResult,
  DistillResult,
  Gene,
  MutationCandidate,
  MutationType,
} from "./schemas.ts";
import { DiagnoseResultSchema, DistillResultSchema } from "./schemas.ts";

// ─── Types ──────────────────────────────────────────────────────────

export interface LlmConfig {
  apiKey: string;
  baseUrl?: string; // default: "https://api.openai.com"
  model?: string; // default: "gpt-4o-mini"
  timeoutMs?: number; // default: 30_000
}

export interface DiagnoseContext {
  strategyName: string;
  genes: Gene[];
  fitness: number;
  decayLevel: string;
  sharpeRatio: number;
  survivalTier: string;
  recentCycleCount: number;
}

export interface MutateContext {
  genes: Gene[];
  candidate: MutationCandidate;
  diagnoseResult: DiagnoseResult;
}

// ─── LLM response schemas (internal) ───────────────────────────────

interface LlmDiagnoseResponse {
  rootCause: string;
  confidence: number;
  historicalContext: string;
  suggestedParams?: Record<string, Record<string, number>>;
}

interface LlmMutateResponse {
  adjustments: Array<{
    geneId: string;
    paramName: string;
    newValue: number;
  }>;
}

// ─── Class ──────────────────────────────────────────────────────────

export class LlmMutator {
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: LlmConfig | null) {
    this.apiKey = config?.apiKey ?? null;
    this.baseUrl = config?.baseUrl ?? "https://api.openai.com";
    this.model = config?.model ?? "gpt-4o-mini";
    this.timeoutMs = config?.timeoutMs ?? 30_000;
  }

  get isLlmAvailable(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  // ── Public API ──────────────────────────────────────────────────

  async diagnose(ctx: DiagnoseContext): Promise<DiagnoseResult> {
    if (!this.isLlmAvailable) return this.diagnoseRuleBased(ctx);

    try {
      const prompt = this.buildDiagnosePrompt(ctx);
      const raw = await this.callLlm(prompt);
      const parsed = JSON.parse(raw) as LlmDiagnoseResponse;

      // Build mutation candidates from LLM analysis
      const mutationType: MutationType = this.inferMutationType(ctx.survivalTier);
      const candidate: MutationCandidate = {
        id: `mut-llm-${Date.now().toString(36)}`,
        type: mutationType,
        description: parsed.rootCause,
        affectedGeneIds: ctx.genes.map((g) => g.id),
        estimatedFitnessGain: 0.05,
        riskLevel:
          mutationType === "architecture-change"
            ? "high"
            : mutationType === "parameter-tune"
              ? "low"
              : "medium",
      };

      const result: DiagnoseResult = {
        rootCause: parsed.rootCause,
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
        suggestedMutations: [candidate],
        historicalContext: parsed.historicalContext,
      };

      // Validate via Zod
      return DiagnoseResultSchema.parse(result);
    } catch {
      // LLM failed → rule-based fallback
      return this.diagnoseRuleBased(ctx);
    }
  }

  async mutate(ctx: MutateContext): Promise<Gene[]> {
    if (!this.isLlmAvailable) return this.mutateRuleBased(ctx.genes, ctx.candidate);

    try {
      const prompt = this.buildMutatePrompt(ctx);
      const raw = await this.callLlm(prompt);
      const parsed = JSON.parse(raw) as LlmMutateResponse;

      if (!Array.isArray(parsed.adjustments) || parsed.adjustments.length === 0) {
        return this.mutateRuleBased(ctx.genes, ctx.candidate);
      }

      // Apply LLM-suggested parameter adjustments within ±30% bounds
      const newGenes = ctx.genes.map((gene) => {
        if (!ctx.candidate.affectedGeneIds.includes(gene.id)) return gene;

        const newParams = { ...gene.params };
        for (const adj of parsed.adjustments) {
          if (adj.geneId === gene.id && adj.paramName in newParams) {
            const original = newParams[adj.paramName];
            // Clamp to ±30% of original value
            const minVal = original * 0.7;
            const maxVal = original * 1.3;
            newParams[adj.paramName] =
              Math.round(Math.max(minVal, Math.min(maxVal, adj.newValue)) * 10000) / 10000;
          }
        }

        return { ...gene, params: newParams };
      });

      return newGenes;
    } catch {
      // LLM failed → rule-based fallback
      return this.mutateRuleBased(ctx.genes, ctx.candidate);
    }
  }

  // ── Rule-based fallbacks (public for direct use) ────────────────

  diagnoseRuleBased(ctx: DiagnoseContext): DiagnoseResult {
    const mutationType = this.inferMutationType(ctx.survivalTier);

    return DiagnoseResultSchema.parse({
      rootCause: `Strategy ${ctx.strategyName} showing ${ctx.decayLevel} decay (Sharpe ratio ${ctx.sharpeRatio.toFixed(2)})`,
      confidence: ctx.decayLevel === "red" ? 0.9 : 0.7,
      suggestedMutations: [
        {
          id: `mut-rb-${Date.now().toString(36)}`,
          type: mutationType,
          description: `Apply ${mutationType} to address ${ctx.decayLevel} decay`,
          affectedGeneIds: ctx.genes.map((g) => g.id),
          estimatedFitnessGain: 0.05,
          riskLevel:
            mutationType === "architecture-change"
              ? "high"
              : mutationType === "parameter-tune"
                ? "low"
                : "medium",
        },
      ],
      historicalContext: `Current fitness: ${ctx.fitness.toFixed(3)}, tier: ${ctx.survivalTier}`,
    });
  }

  mutateRuleBased(genes: Gene[], candidate: MutationCandidate): Gene[] {
    return genes.map((gene) => {
      if (!candidate.affectedGeneIds.includes(gene.id)) return gene;

      const newParams = { ...gene.params };
      for (const [key, value] of Object.entries(newParams)) {
        switch (candidate.type) {
          case "parameter-tune":
            newParams[key] = value * (1 + (Math.random() * 0.2 - 0.1));
            break;
          case "signal-change":
            newParams[key] = value * (1 + (Math.random() * 0.4 - 0.2));
            break;
          case "risk-adjustment":
            newParams[key] = value * (1 - Math.random() * 0.15);
            break;
          case "architecture-change":
            newParams[key] = value * (1 + (Math.random() * 0.6 - 0.3));
            break;
        }
        newParams[key] = Math.round(newParams[key] * 10000) / 10000;
      }

      return {
        ...gene,
        params: newParams,
        confidence: Math.min(1, Math.max(0, gene.confidence + (Math.random() * 0.1 - 0.05))),
      };
    });
  }

  // ── Distill helper ──────────────────────────────────────────────

  buildDistillResult(success: boolean, regime: string, improvement: number): DistillResult {
    const safeRegime = (
      ["bull", "bear", "sideways", "volatile", "crash", "recovery"].includes(regime)
        ? regime
        : "sideways"
    ) as DistillResult["successPatterns"][number]["regime"];

    return DistillResultSchema.parse({
      errorPatterns: success
        ? []
        : [
            {
              category: "signal" as const,
              severity: improvement < -0.05 ? ("high" as const) : ("medium" as const),
              description: `Mutation failed with improvement ${(improvement * 100).toFixed(1)}%`,
              lesson: "Consider less aggressive parameter changes or different mutation type",
            },
          ],
      successPatterns: success
        ? [
            {
              pattern: `Successful ${regime} regime adaptation`,
              regime: safeRegime,
              avgReturn: Math.max(0, improvement),
              occurrences: 1,
            },
          ]
        : [],
      soulUpdates: success
        ? [
            `Adapted successfully in ${regime} regime with ${(improvement * 100).toFixed(1)}% improvement`,
          ]
        : [`Failed mutation in ${regime} regime — review parameter bounds`],
    });
  }

  // ── Private helpers ─────────────────────────────────────────────

  private inferMutationType(survivalTier: string): MutationType {
    if (survivalTier === "critical" || survivalTier === "stopped") return "architecture-change";
    if (survivalTier === "stressed") return "risk-adjustment";
    return "parameter-tune";
  }

  private buildDiagnosePrompt(ctx: DiagnoseContext): string {
    const genesDesc = ctx.genes
      .map(
        (g) =>
          `  ${g.name} (${g.type}): direction=${g.direction}, confidence=${g.confidence}, params=${JSON.stringify(g.params)}`,
      )
      .join("\n");

    return `You are a quantitative trading strategy analyst. Diagnose this strategy's decay.

Strategy: ${ctx.strategyName}
Fitness: ${ctx.fitness.toFixed(3)}
Decay Level: ${ctx.decayLevel}
Sharpe Ratio: ${ctx.sharpeRatio.toFixed(2)}
Survival Tier: ${ctx.survivalTier}
Recent Cycles: ${ctx.recentCycleCount}

Genes:
${genesDesc}

Respond in JSON with exactly these fields:
{
  "rootCause": "string — what's causing the decay",
  "confidence": number (0-1),
  "historicalContext": "string — relevant market context"
}`;
  }

  private buildMutatePrompt(ctx: MutateContext): string {
    const genesDesc = ctx.genes
      .filter((g) => ctx.candidate.affectedGeneIds.includes(g.id))
      .map((g) => `  ${g.id} (${g.name}): params=${JSON.stringify(g.params)}`)
      .join("\n");

    return `You are a quantitative trading strategy optimizer. Suggest parameter adjustments.

Mutation type: ${ctx.candidate.type}
Root cause: ${ctx.diagnoseResult.rootCause}

Affected genes:
${genesDesc}

Rules:
- Only adjust numeric parameters within ±30% of current values
- Focus on the most impactful parameters

Respond in JSON with exactly these fields:
{
  "adjustments": [
    { "geneId": "string", "paramName": "string", "newValue": number }
  ]
}`;
  }

  private async callLlm(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 500,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices[0].message.content;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────

/** Read API key from environment with fallback chain */
export function readEvolutionApiKey(): string | undefined {
  const keys = ["OPENFINCLAW_EVOLUTION_API_KEY", "OPENCLAW_EVOLUTION_API_KEY", "OPENAI_API_KEY"];
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** Create LlmMutator from environment variables */
export function createLlmMutator(): LlmMutator {
  const apiKey = readEvolutionApiKey();
  if (!apiKey) return new LlmMutator(null);

  return new LlmMutator({
    apiKey,
    baseUrl: process.env.OPENFINCLAW_EVOLUTION_API_BASE?.trim() || undefined,
    model: process.env.OPENFINCLAW_EVOLUTION_MODEL?.trim() || undefined,
  });
}
