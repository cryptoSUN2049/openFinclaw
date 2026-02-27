import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openfinclaw/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import plugin from "./index.js";
import { ErrorBook } from "./src/error-book.js";
import { SuccessBook } from "./src/success-book.js";
import { TradeJournal } from "./src/trade-journal.js";

function createFakeApi(stateDir: string) {
  const tools = new Map<
    string,
    { execute: (id: string, params: Record<string, unknown>) => Promise<unknown> }
  >();
  const services = new Map<string, unknown>();
  const api = {
    id: "fin-strategy-memory",
    name: "Strategy Memory",
    source: "test",
    config: {},
    pluginConfig: {},
    runtime: { version: "test", services },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    registerTool(tool: {
      name: string;
      execute: (id: string, params: Record<string, unknown>) => Promise<unknown>;
    }) {
      tools.set(tool.name, tool);
    },
    registerHook() {},
    registerHttpHandler() {},
    registerHttpRoute() {},
    registerChannel() {},
    registerGatewayMethod() {},
    registerCli() {},
    registerService(svc: { id: string; instance: unknown }) {
      services.set(svc.id, svc.instance);
    },
    registerProvider() {},
    registerCommand() {},
    resolvePath: (p: string) => join(stateDir, p),
    on() {},
  } as unknown as OpenClawPluginApi;
  return { api, tools, services };
}

function parseResult(result: unknown): unknown {
  const res = result as { content: Array<{ text: string }> };
  return JSON.parse(res.content[0]!.text);
}

describe("fin-strategy-memory plugin", () => {
  let tempDir: string;
  let tools: Map<
    string,
    { execute: (id: string, params: Record<string, unknown>) => Promise<unknown> }
  >;
  let services: Map<string, unknown>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "fin-strategy-memory-plugin-test-"));
    const fake = createFakeApi(tempDir);
    tools = fake.tools;
    services = fake.services;
    plugin.register(fake.api);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("registers all 4 tools", () => {
    expect(tools.has("fin_review_trades")).toBe(true);
    expect(tools.has("fin_error_book_query")).toBe(true);
    expect(tools.has("fin_success_book_query")).toBe(true);
    expect(tools.has("fin_experience_summary")).toBe(true);
  });

  it("registers all 3 services", () => {
    expect(services.has("fin-trade-journal")).toBe(true);
    expect(services.has("fin-error-book")).toBe(true);
    expect(services.has("fin-success-book")).toBe(true);

    expect(services.get("fin-trade-journal")).toBeInstanceOf(TradeJournal);
    expect(services.get("fin-error-book")).toBeInstanceOf(ErrorBook);
    expect(services.get("fin-success-book")).toBeInstanceOf(SuccessBook);
  });

  describe("fin_review_trades", () => {
    it("returns empty trades and summary when no data", async () => {
      const tool = tools.get("fin_review_trades")!;
      const result = parseResult(await tool.execute("call-1", {})) as Record<string, unknown>;

      expect(result.totalMatching).toBe(0);
      expect(result.trades).toEqual([]);
      expect(result.summary).toBeDefined();
    });

    it("returns trades after journal has data", async () => {
      const journal = services.get("fin-trade-journal") as TradeJournal;
      journal.append({
        id: "t-1",
        timestamp: Date.now(),
        symbol: "BTC/USDT",
        side: "buy",
        price: 67500,
        quantity: 0.1,
        notional: 6750,
        source: "paper",
        pnl: 500,
      });
      journal.append({
        id: "t-2",
        timestamp: Date.now(),
        symbol: "ETH/USDT",
        side: "sell",
        price: 3400,
        quantity: 1,
        notional: 3400,
        source: "live",
        pnl: -200,
      });

      const tool = tools.get("fin_review_trades")!;
      const result = parseResult(await tool.execute("call-2", {})) as Record<string, unknown>;

      expect(result.totalMatching).toBe(2);
      expect((result.trades as unknown[]).length).toBe(2);
    });

    it("filters by symbol", async () => {
      const journal = services.get("fin-trade-journal") as TradeJournal;
      journal.append({
        id: "t-1",
        timestamp: Date.now(),
        symbol: "BTC/USDT",
        side: "buy",
        price: 67500,
        quantity: 0.1,
        notional: 6750,
        source: "paper",
      });
      journal.append({
        id: "t-2",
        timestamp: Date.now(),
        symbol: "ETH/USDT",
        side: "buy",
        price: 3400,
        quantity: 1,
        notional: 3400,
        source: "paper",
      });

      const tool = tools.get("fin_review_trades")!;
      const result = parseResult(await tool.execute("call-3", { symbol: "BTC/USDT" })) as Record<
        string,
        unknown
      >;

      expect(result.totalMatching).toBe(1);
    });
  });

  describe("fin_error_book_query", () => {
    it("returns empty when no patterns", async () => {
      const tool = tools.get("fin_error_book_query")!;
      const result = parseResult(await tool.execute("call-4", {})) as Record<string, unknown>;

      expect(result.total).toBe(0);
      expect(result.patterns).toEqual([]);
    });

    it("returns filtered patterns", async () => {
      const errorBook = services.get("fin-error-book") as ErrorBook;
      errorBook.record({
        id: "p1",
        description: "Entry error",
        category: "entry",
        loss: 100,
        tradeId: "t-1",
        symbol: "BTC/USDT",
      });
      errorBook.record({
        id: "p2",
        description: "Exit error",
        category: "exit",
        loss: 200,
        tradeId: "t-2",
        symbol: "ETH/USDT",
      });

      const tool = tools.get("fin_error_book_query")!;

      const bySymbol = parseResult(await tool.execute("call-5", { symbol: "BTC/USDT" })) as Record<
        string,
        unknown
      >;
      expect(bySymbol.total).toBe(1);

      const byCategory = parseResult(await tool.execute("call-6", { category: "exit" })) as Record<
        string,
        unknown
      >;
      expect(byCategory.total).toBe(1);
    });
  });

  describe("fin_success_book_query", () => {
    it("returns empty when no patterns", async () => {
      const tool = tools.get("fin_success_book_query")!;
      const result = parseResult(await tool.execute("call-7", {})) as Record<string, unknown>;

      expect(result.total).toBe(0);
      expect(result.patterns).toEqual([]);
    });

    it("returns filtered patterns by symbol", async () => {
      const successBook = services.get("fin-success-book") as SuccessBook;
      successBook.record({
        id: "s1",
        description: "Good entry",
        category: "entry",
        profit: 500,
        tradeId: "t-1",
        symbol: "BTC/USDT",
      });
      successBook.record({
        id: "s2",
        description: "Good exit",
        category: "exit",
        profit: 300,
        tradeId: "t-2",
        symbol: "ETH/USDT",
      });

      const tool = tools.get("fin_success_book_query")!;

      const bySymbol = parseResult(await tool.execute("call-8", { symbol: "BTC/USDT" })) as Record<
        string,
        unknown
      >;
      expect(bySymbol.total).toBe(1);
    });

    it("filters by confidence level", async () => {
      const successBook = services.get("fin-success-book") as SuccessBook;

      // Build a confirmed pattern (5 occ, >$1000)
      for (let i = 0; i < 5; i++) {
        successBook.record({
          id: "confirmed-pattern",
          description: "Confirmed",
          category: "entry",
          profit: 300,
          tradeId: `t-${i}`,
          symbol: "BTC/USDT",
        });
      }

      // Emerging pattern
      successBook.record({
        id: "emerging-pattern",
        description: "Emerging",
        category: "exit",
        profit: 50,
        tradeId: "t-x",
        symbol: "ETH/USDT",
      });

      const tool = tools.get("fin_success_book_query")!;

      const confirmed = parseResult(
        await tool.execute("call-9", { confidence: "confirmed" }),
      ) as Record<string, unknown>;
      expect(confirmed.total).toBe(1);
      expect((confirmed.patterns as Array<{ id: string }>)[0]!.id).toBe("confirmed-pattern");
    });
  });

  describe("fin_experience_summary", () => {
    it("returns combined error and success patterns", async () => {
      const errorBook = services.get("fin-error-book") as ErrorBook;
      errorBook.record({
        id: "err1",
        description: "Bad entry",
        category: "entry",
        loss: 500,
        tradeId: "t-1",
        symbol: "BTC/USDT",
        constraint: "Do not chase",
      });

      const successBook = services.get("fin-success-book") as SuccessBook;
      successBook.record({
        id: "suc1",
        description: "Good entry",
        category: "entry",
        profit: 800,
        tradeId: "t-2",
        symbol: "ETH/USDT",
        insight: "Patience pays",
      });

      const tool = tools.get("fin_experience_summary")!;
      const result = parseResult(await tool.execute("call-10", { top_n: 3 })) as Record<
        string,
        unknown
      >;

      expect(result.totalErrorPatterns).toBe(1);
      expect(result.totalSuccessPatterns).toBe(1);
      expect((result.topErrors as unknown[]).length).toBe(1);
      expect((result.topSuccesses as unknown[]).length).toBe(1);
      expect(result.errorConstraints).toEqual(["Do not chase"]);
      expect(result.successInsights).toEqual(["Patience pays"]);
      expect(result.memorySynced).toBe(true);
    });

    it("syncs markdown files to memory directory", async () => {
      const journal = services.get("fin-trade-journal") as TradeJournal;
      journal.append({
        id: "t-1",
        timestamp: Date.now(),
        symbol: "BTC/USDT",
        side: "buy",
        price: 67500,
        quantity: 0.1,
        notional: 6750,
        source: "paper",
        pnl: 1000,
      });

      const tool = tools.get("fin_experience_summary")!;
      await tool.execute("call-11", {});

      const memoryDir = join(tempDir, "memory");
      expect(existsSync(join(memoryDir, "fin-trade-insights.md"))).toBe(true);
      expect(existsSync(join(memoryDir, "fin-error-patterns.md"))).toBe(true);
      expect(existsSync(join(memoryDir, "fin-success-patterns.md"))).toBe(true);

      const insights = readFileSync(join(memoryDir, "fin-trade-insights.md"), "utf-8");
      expect(insights).toContain("Total trades: 1");
    });

    it("skips memory sync when sync_memory=false", async () => {
      const tool = tools.get("fin_experience_summary")!;
      const result = parseResult(await tool.execute("call-12", { sync_memory: false })) as Record<
        string,
        unknown
      >;

      expect(result.memorySynced).toBe(false);

      const memoryDir = join(tempDir, "memory");
      expect(existsSync(join(memoryDir, "fin-trade-insights.md"))).toBe(false);
    });
  });
});
