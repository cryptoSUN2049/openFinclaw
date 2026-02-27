import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { ErrorBook } from "./src/error-book.js";
import { syncToMemory } from "./src/experience-sync.js";
import {
  buildFinancialContext,
  handleTradeToolCall,
  checkErrorBookConstraints,
} from "./src/hooks.js";
import { SuccessBook } from "./src/success-book.js";
import { TradeJournal } from "./src/trade-journal.js";
import type { TradeFilter } from "./src/types.js";

const json = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  details: payload,
});

const plugin = {
  id: "fin-strategy-memory",
  name: "Strategy Memory",
  description:
    "Trading memory — trade journal, error book, success book, and experience sync for learning from past trades",
  kind: "financial" as const,

  register(api: OpenClawPluginApi) {
    const journalPath = api.resolvePath("state/fin-trade-journal.jsonl");
    const errorBookPath = api.resolvePath("state/fin-error-book.json");
    const successBookPath = api.resolvePath("state/fin-success-book.json");
    const memoryDir = api.resolvePath("memory");

    const journal = new TradeJournal(journalPath);
    const errorBook = new ErrorBook(errorBookPath);
    const successBook = new SuccessBook(successBookPath);

    // Expose services for other fin-* plugins.
    api.registerService({
      id: "fin-trade-journal",
      start: () => {},
      instance: journal,
    } as Parameters<typeof api.registerService>[0]);

    api.registerService({
      id: "fin-error-book",
      start: () => {},
      instance: errorBook,
    } as Parameters<typeof api.registerService>[0]);

    api.registerService({
      id: "fin-success-book",
      start: () => {},
      instance: successBook,
    } as Parameters<typeof api.registerService>[0]);

    // ── Hooks ──

    const runtime = api.runtime as unknown as { services?: Map<string, unknown> };

    // Hook: Inject financial context into every agent conversation
    api.on(
      "before_prompt_build",
      async (_event: unknown, _ctx: unknown) => {
        const context = buildFinancialContext(runtime.services);
        if (context) {
          return { prependContext: context };
        }
      },
      { priority: 80 },
    );

    // Hook: Auto-record trades into journal after trade tool calls
    api.on(
      "after_tool_call",
      async (event: {
        toolName: string;
        params: Record<string, unknown>;
        result?: unknown;
        error?: string;
        durationMs?: number;
      }) => {
        handleTradeToolCall(event, journal);
      },
      { priority: 50 },
    );

    // Hook: Check error book constraints before trade tool calls
    api.on(
      "before_tool_call",
      async (event: { toolName: string; params: Record<string, unknown> }) => {
        const warnings = checkErrorBookConstraints(event, errorBook);
        if (warnings && warnings.length > 0) {
          return {
            params: {
              ...event.params,
              _errorBookWarnings: warnings,
            },
          };
        }
      },
      { priority: 90 },
    );

    // Tool: fin_review_trades
    api.registerTool({
      name: "fin_review_trades",
      label: "Review Trades",
      description:
        "Review past trades with optional filters. Returns trade history and summary statistics.",
      parameters: Type.Object({
        strategy_id: Type.Optional(Type.String({ description: "Filter by strategy ID" })),
        symbol: Type.Optional(
          Type.String({ description: "Filter by trading pair (e.g. BTC/USDT)" }),
        ),
        source: Type.Optional(
          Type.Unsafe<"live" | "paper" | "backtest">({
            type: "string",
            enum: ["live", "paper", "backtest"],
            description: "Filter by trade source",
          }),
        ),
        period: Type.Optional(Type.String({ description: "Time period (e.g. '7d', '30d', '1y')" })),
        limit: Type.Optional(Type.Number({ description: "Max trades to return", default: 50 })),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        try {
          const filter: TradeFilter = {};
          if (params.strategy_id) filter.strategyId = params.strategy_id as string;
          if (params.symbol) filter.symbol = params.symbol as string;
          if (params.source) filter.source = params.source as "live" | "paper" | "backtest";

          if (params.period) {
            const now = Date.now();
            const period = params.period as string;
            const match = period.match(/^(\d+)([dhmy])$/);
            if (match) {
              const [, n, unit] = match;
              const ms: Record<string, number> = {
                d: 86400000,
                h: 3600000,
                m: 2592000000,
                y: 31536000000,
              };
              filter.since = now - Number(n) * ms[unit!]!;
            }
          }

          const trades = journal.query(filter);
          const limited = trades.slice(-((params.limit as number) ?? 50));
          const summary = journal.summarize(params.strategy_id as string);

          return json({ trades: limited, summary, totalMatching: trades.length });
        } catch (err) {
          return json({ error: (err as Error).message });
        }
      },
    });

    // Tool: fin_error_book_query
    api.registerTool({
      name: "fin_error_book_query",
      label: "Error Book Query",
      description:
        "Query the error book for known failure patterns. Use to avoid repeating past mistakes.",
      parameters: Type.Object({
        symbol: Type.Optional(Type.String({ description: "Filter by symbol" })),
        category: Type.Optional(
          Type.Unsafe<string>({
            type: "string",
            enum: ["entry", "exit", "sizing", "timing", "risk"],
            description: "Error category",
          }),
        ),
        severity: Type.Optional(
          Type.Unsafe<string>({
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Minimum severity",
          }),
        ),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        try {
          let patterns = errorBook.all();
          if (params.symbol) {
            patterns = patterns.filter((p) => p.symbols.includes(params.symbol as string));
          }
          if (params.category) {
            patterns = patterns.filter((p) => p.category === params.category);
          }
          if (params.severity) {
            const levels = ["low", "medium", "high", "critical"];
            const minLevel = levels.indexOf(params.severity as string);
            patterns = patterns.filter((p) => levels.indexOf(p.severity) >= minLevel);
          }
          return json({ patterns, total: patterns.length });
        } catch (err) {
          return json({ error: (err as Error).message });
        }
      },
    });

    // Tool: fin_success_book_query
    api.registerTool({
      name: "fin_success_book_query",
      label: "Success Book Query",
      description:
        "Query the success book for proven winning patterns. Use to replicate past successes.",
      parameters: Type.Object({
        symbol: Type.Optional(Type.String({ description: "Filter by symbol" })),
        category: Type.Optional(
          Type.Unsafe<string>({
            type: "string",
            enum: ["entry", "exit", "sizing", "timing", "risk"],
            description: "Pattern category",
          }),
        ),
        confidence: Type.Optional(
          Type.Unsafe<string>({
            type: "string",
            enum: ["emerging", "confirmed", "proven"],
            description: "Minimum confidence level",
          }),
        ),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        try {
          let patterns = successBook.all();
          if (params.symbol) {
            patterns = patterns.filter((p) => p.symbols.includes(params.symbol as string));
          }
          if (params.category) {
            patterns = patterns.filter((p) => p.category === params.category);
          }
          if (params.confidence) {
            const levels = ["emerging", "confirmed", "proven"];
            const minLevel = levels.indexOf(params.confidence as string);
            patterns = patterns.filter((p) => levels.indexOf(p.confidence) >= minLevel);
          }
          return json({ patterns, total: patterns.length });
        } catch (err) {
          return json({ error: (err as Error).message });
        }
      },
    });

    // Tool: fin_experience_summary
    api.registerTool({
      name: "fin_experience_summary",
      label: "Experience Summary",
      description:
        "Get a combined summary of top error and success patterns. Also syncs insights to memory.",
      parameters: Type.Object({
        top_n: Type.Optional(
          Type.Number({ description: "Number of top patterns per category", default: 5 }),
        ),
        sync_memory: Type.Optional(
          Type.Unsafe<boolean>({
            type: "boolean",
            description: "Whether to sync markdown to memory directory (default true)",
          }),
        ),
      }),
      async execute(_id: string, params: Record<string, unknown>) {
        try {
          const topN = (params.top_n as number) ?? 5;
          const shouldSync = (params.sync_memory as boolean) ?? true;

          const topErrors = errorBook.topErrors(topN);
          const errorConstraints = errorBook.getConstraints();
          const topSuccesses = successBook.topSuccesses(topN);
          const successInsights = successBook.getInsights();

          if (shouldSync) {
            syncToMemory(journal, errorBook, successBook, memoryDir);
          }

          return json({
            topErrors,
            errorConstraints,
            totalErrorPatterns: errorBook.all().length,
            topSuccesses,
            successInsights,
            totalSuccessPatterns: successBook.all().length,
            memorySynced: shouldSync,
          });
        } catch (err) {
          return json({ error: (err as Error).message });
        }
      },
    });
  },
};

export default plugin;
