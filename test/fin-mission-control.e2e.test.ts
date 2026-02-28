import { readFileSync } from "node:fs";
/**
 * E2E test for the FinClaw Mission Control unified dashboard — **rendering layer** (mock server).
 *
 * Spins up a lightweight HTTP server with mock endpoints for the 4 SSE streams
 * (trading, fund, config, events), REST API, and POST actions (orders, strategies,
 * emergency-stop, events/approve), then uses Playwright to verify the full
 * three-column layout, data rendering, SSE updates, and user interactions.
 *
 * Architecture mirrors fin-trading-dashboard.e2e.test.ts / fin-command-center.e2e.test.ts.
 *
 * This file validates the HTML/JS rendering behaviour in isolation.
 * For integration tests that exercise the full Gateway → Plugin → Route pipeline,
 * see: test/fin-dashboard-integration.e2e.test.ts
 *
 * Run: pnpm test:e2e (or directly with vitest --config vitest.e2e.config.ts)
 */
import http from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chromium,
  browserPath,
  hasBrowser,
  getFreePort,
  fetchJson,
  stripChartJsCdn,
} from "./helpers/e2e-browser.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MC_DIR = join(__dirname, "../extensions/fin-core/dashboard");
const CSS_PATH = join(MC_DIR, "mission-control.css");
const HTML_PATH = join(MC_DIR, "mission-control.html");

// ── Mock data ──

const MOCK_MC_DATA = {
  trading: {
    summary: {
      totalEquity: 125430.5,
      dailyPnl: 2890.3,
      dailyPnlPct: 2.3,
    },
    positions: [
      {
        symbol: "BTC/USDT",
        side: "long",
        quantity: 0.5,
        avgPrice: 64000,
        currentPrice: 68500,
        unrealizedPnl: 2250,
      },
      {
        symbol: "ETH/USDT",
        side: "long",
        quantity: 5,
        avgPrice: 3200,
        currentPrice: 3350,
        unrealizedPnl: 750,
      },
      {
        symbol: "SOL/USDT",
        side: "short",
        quantity: 20,
        avgPrice: 180,
        currentPrice: 175,
        unrealizedPnl: 100,
      },
    ],
    strategies: [
      {
        id: "momentum-btc",
        name: "MomentumBTC",
        level: 3,
        fitness: 0.82,
        status: "running",
        market: "crypto",
        timeframe: "4h",
        symbols: ["BTC/USDT"],
        totalReturn: 35.2,
        sharpe: 1.8,
        winRate: 65.3,
        maxDrawdown: 12.3,
        tradeCount: 120,
      },
      {
        id: "mean-revert-eth",
        name: "MeanRevertETH",
        level: 2,
        fitness: 0.65,
        status: "running",
        market: "crypto",
        timeframe: "1h",
        symbols: ["ETH/USDT"],
        totalReturn: 18.5,
        sharpe: 1.2,
        winRate: 58.1,
        maxDrawdown: 8.1,
        tradeCount: 80,
      },
      {
        id: "grid-sol",
        name: "GridSOL",
        level: 1,
        fitness: 0.35,
        status: "paused",
        market: "crypto",
        timeframe: "15m",
        symbols: ["SOL/USDT"],
        totalReturn: 5.2,
        sharpe: 0.6,
        winRate: 42.0,
        maxDrawdown: 15.0,
        tradeCount: 40,
      },
    ],
    snapshots: [
      { timestamp: "2026-02-28T00:00:00Z", equity: 120000 },
      { timestamp: "2026-02-28T06:00:00Z", equity: 122500 },
      { timestamp: "2026-02-28T12:00:00Z", equity: 125430.5 },
    ],
    allocations: {
      byAsset: [
        { name: "BTC", pct: 45.2, value: 56700, change: 3.2 },
        { name: "ETH", pct: 28.1, value: 35200, change: 1.5 },
        { name: "SOL", pct: 12.4, value: 15560, change: -2.1 },
        { name: "USDT", pct: 14.3, value: 17970, change: 0 },
      ],
      byExchange: [
        { name: "Binance", pct: 60, value: 75258, change: 2.1 },
        { name: "Coinbase", pct: 40, value: 50172, change: 1.8 },
      ],
    },
  },
  events: {
    events: [
      {
        id: "EVT-001",
        type: "approval",
        status: "pending",
        needsApproval: true,
        title: "Promote GridSOL to L2 Paper",
        description: "Strategy passed backtest threshold",
        timestamp: Date.now() - 120000,
      },
      {
        id: "EVT-002",
        type: "trade_executed",
        status: "resolved",
        title: "Bought 0.5 BTC @ $64,000",
        description: "Momentum strategy entry signal",
        timestamp: Date.now() - 600000,
      },
      {
        id: "EVT-003",
        type: "evolution",
        status: "resolved",
        title: "MomentumBTC v2 → v3 mutation",
        description: "RSI period adjusted: 14 → 21",
        fitness: 0.82,
        fitnessBefore: 0.75,
        timestamp: Date.now() - 1800000,
      },
      {
        id: "EVT-004",
        type: "alert",
        status: "resolved",
        title: "BTC/USDT near stop loss",
        description: "Price within 2% of stop loss level",
        timestamp: Date.now() - 3600000,
      },
    ],
    pendingCount: 1,
  },
  alerts: [
    {
      id: "ALT-1",
      symbol: "BTC/USDT",
      condition: "price > 70000",
      description: "BTC/USDT above $70,000",
      triggered: false,
    },
    {
      id: "ALT-2",
      symbol: "ETH/USDT",
      condition: "price < 3000",
      description: "ETH/USDT below $3,000",
      triggered: true,
    },
  ],
  risk: {
    enabled: true,
    maxOrderValue: 10000,
    requireApproval: true,
    approvalThreshold: 5000,
  },
  fund: {
    riskLevel: "NORMAL",
    allocations: [
      { strategyId: "momentum-btc", capitalUsd: 30000 },
      { strategyId: "mean-revert-eth", capitalUsd: 20000 },
    ],
    totalCapital: 125430.5,
  },
};

// ── Helpers ──

function fetchPost(url: string, payload: unknown): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port),
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let body: unknown = data;
          try {
            body = JSON.parse(data);
          } catch {
            /* raw text */
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on("error", reject);
    req.end(bodyStr);
  });
}

// ── Test Server ──

interface MCServer {
  server: http.Server;
  capturedPosts: Map<string, unknown[]>;
  sseConnections: Map<string, http.ServerResponse[]>;
}

function createMCServer(
  mockData: Record<string, unknown> = MOCK_MC_DATA as unknown as Record<string, unknown>,
): MCServer {
  const template = stripChartJsCdn(readFileSync(HTML_PATH, "utf-8"));
  const css = readFileSync(CSS_PATH, "utf-8");
  const capturedPosts = new Map<string, unknown[]>();
  const sseConnections = new Map<string, http.ServerResponse[]>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;

    // ── SSE streams ──
    const sseRoutes: Record<string, string> = {
      "/api/v1/finance/trading/stream": "trade",
      "/api/v1/fund/stream": "fund",
      "/api/v1/finance/config/stream": "config",
      "/api/v1/finance/events/stream": "events",
    };
    if (sseRoutes[path] && req.method === "GET") {
      const name = sseRoutes[path];
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      // Send initial data for trading stream
      if (name === "trade") {
        res.write(`data: ${JSON.stringify((mockData as typeof MOCK_MC_DATA).trading)}\n\n`);
      } else if (name === "fund") {
        res.write(`data: ${JSON.stringify((mockData as typeof MOCK_MC_DATA).fund)}\n\n`);
      }
      const conns = sseConnections.get(name) ?? [];
      conns.push(res);
      sseConnections.set(name, conns);
      req.on("close", () => {
        const idx = conns.indexOf(res);
        if (idx >= 0) {
          conns.splice(idx, 1);
        }
      });
      return;
    }

    // ── JSON endpoints ──
    if (path === "/api/v1/finance/mission-control" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(mockData));
      return;
    }

    // ── POST endpoints ──
    const postRoutes = [
      "/api/v1/finance/orders",
      "/api/v1/finance/strategies/pause",
      "/api/v1/finance/strategies/resume",
      "/api/v1/finance/strategies/promote",
      "/api/v1/finance/strategies/kill",
      "/api/v1/finance/strategies/backtest-all",
      "/api/v1/finance/strategies/pause-all",
      "/api/v1/finance/events/approve",
      "/api/v1/finance/emergency-stop",
    ];
    if (postRoutes.includes(path) && req.method === "POST") {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        let parsed: unknown = {};
        try {
          parsed = JSON.parse(body);
        } catch {
          /* empty */
        }
        const list = capturedPosts.get(path) ?? [];
        list.push(parsed);
        capturedPosts.set(path, list);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // ── Dashboard HTML ──
    if (path === "/dashboard/mission-control") {
      const safeJson = JSON.stringify(mockData).replace(/<\//g, "<\\/");
      const html = template.replace("/*__MC_CSS__*/", css).replace("/*__MC_DATA__*/ {}", safeJson);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  return { server, capturedPosts, sseConnections };
}

// ── Tests ──

const E2E_TIMEOUT = 60_000;

describe("fin-mission-control E2E", () => {
  let mcServer: MCServer;
  let baseUrl: string;

  beforeAll(async () => {
    const port = await getFreePort();
    mcServer = createMCServer();
    await new Promise<void>((resolve) => mcServer.server.listen(port, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    for (const [, conns] of mcServer.sseConnections) {
      for (const conn of conns) {
        try {
          conn.end();
        } catch {
          /* ignore */
        }
      }
    }
    await new Promise<void>((resolve, reject) => {
      mcServer.server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ═══════════════════════════════════════════
  // 1. REST API / HTML serving
  // ═══════════════════════════════════════════

  describe("REST API", () => {
    it("GET /api/v1/finance/mission-control returns aggregated JSON", async () => {
      const { status, body } = await fetchJson(`${baseUrl}/api/v1/finance/mission-control`);
      expect(status).toBe(200);
      const data = body as typeof MOCK_MC_DATA;
      expect(data.trading.summary.totalEquity).toBe(125430.5);
      expect(data.trading.positions).toHaveLength(3);
      expect(data.trading.strategies).toHaveLength(3);
      expect(data.events.events).toHaveLength(4);
      expect(data.events.pendingCount).toBe(1);
      expect(data.alerts).toHaveLength(2);
      expect(data.risk.enabled).toBe(true);
      expect(data.fund.totalCapital).toBe(125430.5);
    });

    it("GET /dashboard/mission-control serves HTML with injected data", async () => {
      const { status, body } = await fetchJson(`${baseUrl}/dashboard/mission-control`);
      expect(status).toBe(200);
      const html = body as string;
      expect(html).toContain("Mission Control");
      expect(html).not.toContain("/*__MC_DATA__*/ {}");
      expect(html).toContain("125430.5");
    });

    it("GET unknown path returns 404", async () => {
      const { status } = await fetchJson(`${baseUrl}/api/v1/unknown`);
      expect(status).toBe(404);
    });

    it("Content-Type: JSON for API, HTML for dashboard", async () => {
      const apiRes = await new Promise<http.IncomingMessage>((resolve) => {
        const parsed = new URL(`${baseUrl}/api/v1/finance/mission-control`);
        http.get(
          { hostname: parsed.hostname, port: Number(parsed.port), path: parsed.pathname },
          resolve,
        );
      });
      expect(apiRes.headers["content-type"]).toContain("application/json");

      const dashRes = await new Promise<http.IncomingMessage>((resolve) => {
        const parsed = new URL(`${baseUrl}/dashboard/mission-control`);
        http.get(
          { hostname: parsed.hostname, port: Number(parsed.port), path: parsed.pathname },
          resolve,
        );
      });
      expect(dashRes.headers["content-type"]).toContain("text/html");
      apiRes.resume();
      dashRes.resume();
    });

    it("POST /api/v1/finance/emergency-stop returns ok", async () => {
      const { status, body } = await fetchPost(`${baseUrl}/api/v1/finance/emergency-stop`, {});
      expect(status).toBe(200);
      expect((body as { ok: boolean }).ok).toBe(true);
    });

    it("POST /api/v1/finance/orders captures request body", async () => {
      const order = { side: "buy", symbol: "BTC/USDT", type: "market", amount: 0.1 };
      const { status } = await fetchPost(`${baseUrl}/api/v1/finance/orders`, order);
      expect(status).toBe(200);
      const captured = mcServer.capturedPosts.get("/api/v1/finance/orders");
      expect(captured).toBeDefined();
      expect(captured!.length).toBeGreaterThanOrEqual(1);
      const last = captured![captured!.length - 1] as typeof order;
      expect(last.side).toBe("buy");
      expect(last.symbol).toBe("BTC/USDT");
    });

    it("POST /api/v1/finance/strategies/pause captures request", async () => {
      const { status } = await fetchPost(`${baseUrl}/api/v1/finance/strategies/pause`, {
        strategyId: "momentum-btc",
      });
      expect(status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════
  // 2. Static Rendering — Three-column Layout (Playwright)
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Static Rendering (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({ executablePath: browserPath, headless: true });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    async function openMC() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/mission-control`, {
        waitUntil: "load",
        timeout: 30000,
      });
      // Wait for initial renderAll() to complete — equity value populated
      await page.waitForFunction(
        () => {
          const eq = document.getElementById("eqVal");
          return eq && eq.textContent !== "--";
        },
        { timeout: 15000 },
      );
      return page;
    }

    it("page title contains 'Mission Control'", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();
      expect(await page.title()).toContain("Mission Control");
      await page.close();
    });

    it("three-column layout is visible", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      expect(await page.locator(".col-l").isVisible()).toBe(true);
      expect(await page.locator(".col-c").isVisible()).toBe(true);
      expect(await page.locator(".col-r").isVisible()).toBe(true);

      await page.close();
    });

    it("top bar shows equity and daily P&L", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      const eqVal = await page.locator("#eqVal").textContent();
      expect(eqVal).toContain("125,430");

      const eqChg = await page.locator("#eqChg").textContent();
      expect(eqChg).toContain("+");
      expect(eqChg).toContain("2,890");

      await page.close();
    });

    it("top bar shows risk badge with NORMAL level", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      const riskText = await page.locator("#riskBadge").textContent();
      expect(riskText).toBe("NORMAL");
      // Should NOT have danger/warning class
      const riskClass = await page.locator("#riskBadge").getAttribute("class");
      expect(riskClass).not.toContain("danger");
      expect(riskClass).not.toContain("warning");

      await page.close();
    });

    it("top bar shows SSE indicator dots", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      expect(await page.locator("#sseTrade").count()).toBe(1);
      expect(await page.locator("#sseFund").count()).toBe(1);
      expect(await page.locator("#sseConfig").count()).toBe(1);
      expect(await page.locator("#sseEvents").count()).toBe(1);

      await page.close();
    });

    it("STOP button and clock are visible", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      expect(await page.locator("#estopBtn").isVisible()).toBe(true);
      expect(await page.locator("#estopBtn").textContent()).toContain("STOP");

      const clock = await page.locator("#clock").textContent();
      // Clock should show HH:MM format (not "--:--" after init)
      expect(clock).toMatch(/\d{2}:\d{2}/);

      await page.close();
    });

    it("bottom bar shows status message", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      const botMsg = await page.locator("#botMsg").textContent();
      expect(botMsg).toContain("Mission Control online");

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 3. Left Column — Equity, Stats, Positions, Alerts
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Left Column (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({ executablePath: browserPath, headless: true });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    async function openMC() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/mission-control`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(() => document.getElementById("eqVal")?.textContent !== "--", {
        timeout: 15000,
      });
      return page;
    }

    it("equity mini shows total equity", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      const miniVal = await page.locator("#eqMiniVal").textContent();
      expect(miniVal).toContain("125,430");

      const miniChg = await page.locator("#eqMiniChg").textContent();
      expect(miniChg).toContain("today");

      await page.close();
    });

    it("stat pills show position count and strategy count", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      expect(await page.locator("#spPositions").textContent()).toBe("3");
      expect(await page.locator("#spStrategies").textContent()).toBe("3");

      await page.close();
    });

    it("stat pills show alert count and pending count", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      expect(await page.locator("#spAlerts").textContent()).toBe("2");
      expect(await page.locator("#spPending").textContent()).toBe("1");

      // Pending > 0 → pill should have pending class
      const pillClass = await page.locator("#spPendingPill").getAttribute("class");
      expect(pillClass).toContain("stat-pill--pending");

      await page.close();
    });

    it("renders 3 position rows with correct sides", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      const rows = await page.locator("#positionsList .pos-row").count();
      expect(rows).toBe(3);

      // BTC long
      const btcRow = await page.locator("#positionsList .pos-row").first().textContent();
      expect(btcRow).toContain("BTC/USDT");
      expect(btcRow).toContain("LONG");

      // SOL short
      const solRow = await page.locator("#positionsList .pos-row").nth(2).textContent();
      expect(solRow).toContain("SOL/USDT");
      expect(solRow).toContain("SHORT");

      // Total P&L visible
      expect(await page.locator("#posTotal").isVisible()).toBe(true);

      await page.close();
    });

    it("renders 2 alert rows", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      const rows = await page.locator("#alertsList .alert-row").count();
      expect(rows).toBe(2);

      const alertText = await page.locator("#alertsList").textContent();
      expect(alertText).toContain("BTC/USDT");

      await page.close();
    });

    it("quick action buttons are visible", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      const buttons = await page.locator(".qa-grid .qa-btn").count();
      expect(buttons).toBe(2);

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 4. Center Column — Chart, Holdings, Pipeline, Raceboard
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Center Column (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({ executablePath: browserPath, headless: true });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    async function openMC() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/mission-control`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(() => document.getElementById("eqVal")?.textContent !== "--", {
        timeout: 15000,
      });
      return page;
    }

    it("equity chart canvas exists", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      expect(await page.locator("#equityChart").count()).toBe(1);
      expect(await page.locator("#equityChartWrap").isVisible()).toBe(true);

      await page.close();
    });

    it("period pills are rendered (7D, 30D, YTD)", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      const pills = await page.locator(".period-pill").count();
      expect(pills).toBe(3);

      // 30D should be active by default
      const activeText = await page.locator(".period-pill.active").textContent();
      expect(activeText).toBe("30D");

      await page.close();
    });

    it("holdings renders asset bars", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      const holdRows = await page.locator("#holdAsset .hold-row").count();
      expect(holdRows).toBe(4); // BTC, ETH, SOL, USDT

      const btcName = await page
        .locator("#holdAsset .hold-row")
        .first()
        .locator(".hold-name")
        .textContent();
      expect(btcName).toBe("BTC");

      await page.close();
    });

    it("pipeline shows L0–L3 counts", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      // 3 strategies: L3=1, L2=1, L1=1, L0=0
      expect(await page.locator("#pipeL0").textContent()).toBe("0");
      expect(await page.locator("#pipeL1").textContent()).toBe("1");
      expect(await page.locator("#pipeL2").textContent()).toBe("1");
      expect(await page.locator("#pipeL3").textContent()).toBe("1");

      await page.close();
    });

    it(
      "raceboard renders 3 strategy rows sorted by fitness",
      { timeout: E2E_TIMEOUT },
      async () => {
        if (!browser) {
          return;
        }
        const page = await openMC();

        const rows = await page.locator("#raceBody tr").count();
        expect(rows).toBe(3);

        // First row should be MomentumBTC (highest fitness 0.82)
        const firstRow = await page.locator("#raceBody tr").first().textContent();
        expect(firstRow).toContain("MomentumBTC");
        expect(firstRow).toContain("0.82");

        // Last row should be GridSOL (lowest fitness 0.35)
        const lastRow = await page.locator("#raceBody tr").last().textContent();
        expect(lastRow).toContain("GridSOL");
        expect(lastRow).toContain("0.35");

        // Race count shows total
        expect(await page.locator("#raceCount").textContent()).toContain("3 strategies");

        await page.close();
      },
    );

    it("raceboard shows level badges", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      // First row (MomentumBTC) should have L3 badge
      const firstBadge = await page
        .locator("#raceBody tr")
        .first()
        .locator(".level-badge")
        .textContent();
      expect(firstBadge).toContain("L3");

      await page.close();
    });

    it("raceboard shows action buttons", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      // Each row has action buttons
      const actions = await page.locator("#raceBody tr").first().locator(".race-act").count();
      expect(actions).toBeGreaterThanOrEqual(2);

      await page.close();
    });

    it("raceboard shows status dots", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      // MomentumBTC is running
      const runningDots = await page
        .locator("#raceBody tr")
        .first()
        .locator(".status-dot--running")
        .count();
      expect(runningDots).toBe(1);

      // GridSOL is paused (last row)
      const pausedDots = await page
        .locator("#raceBody tr")
        .last()
        .locator(".status-dot--paused")
        .count();
      expect(pausedDots).toBe(1);

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 5. Right Column — Agent Activity Feed
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Right Column — Feed (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({ executablePath: browserPath, headless: true });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    async function openMC() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/mission-control`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(() => document.getElementById("eqVal")?.textContent !== "--", {
        timeout: 15000,
      });
      return page;
    }

    it("renders 4 feed cards", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      const cards = await page.locator("#feedList .fcard").count();
      expect(cards).toBe(4);

      await page.close();
    });

    it("feed cards show correct type badges", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      // Should have at least one of each type
      const typeTexts = await page.locator("#feedList .fcard__type").allTextContents();
      const hasApproval = typeTexts.some((t) => t.includes("APPROVAL"));
      const hasEvolution = typeTexts.some((t) => t.includes("EVOLUTION"));
      const hasAlert = typeTexts.some((t) => t.includes("ALERT"));
      expect(hasApproval).toBe(true);
      expect(hasEvolution).toBe(true);
      expect(hasAlert).toBe(true);

      await page.close();
    });

    it("pending event shows Approve/Reject buttons", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      // EVT-001 is pending and should have action buttons
      const approveBtn = await page.locator(".fcard__btn--approve").count();
      expect(approveBtn).toBeGreaterThanOrEqual(1);

      const rejectBtn = await page.locator(".fcard__btn--reject").count();
      expect(rejectBtn).toBeGreaterThanOrEqual(1);

      await page.close();
    });

    it("evolution card shows fitness bump", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      const fitnessBumps = await page.locator(".fitness-bump").count();
      expect(fitnessBumps).toBeGreaterThanOrEqual(1);

      const bumpText = await page.locator(".fitness-bump").first().textContent();
      expect(bumpText).toContain("0.75");
      expect(bumpText).toContain("0.82");

      await page.close();
    });

    it("filter chips are visible", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      const chips = await page.locator("#feedFilters .fchip").count();
      expect(chips).toBe(5); // All, Decisions, Trades, Evolution, Alerts

      // "All" should be active by default
      const activeChip = await page.locator("#feedFilters .fchip.active").textContent();
      expect(activeChip).toBe("All");

      await page.close();
    });

    it("clicking filter chip filters feed cards", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      // Click "Evolution" filter
      await page.locator('.fchip[data-f="evolution"]').click();
      await page.waitForTimeout(200);

      // Should only show evolution cards
      const visibleCards = await page.locator("#feedList .fcard").count();
      expect(visibleCards).toBe(1);

      const cardText = await page.locator("#feedList .fcard").first().textContent();
      expect(cardText).toContain("mutation");

      // Click "All" to restore
      await page.locator('.fchip[data-f="all"]').click();
      await page.waitForTimeout(200);

      const allCards = await page.locator("#feedList .fcard").count();
      expect(allCards).toBe(4);

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 6. Interactions — Modals, Slide-overs, Actions
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Interactions (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({ executablePath: browserPath, headless: true });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    async function openMC() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/mission-control`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(() => document.getElementById("eqVal")?.textContent !== "--", {
        timeout: 15000,
      });
      return page;
    }

    it("STOP button opens emergency stop modal", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      // Modal initially hidden
      const modalClass = await page.locator("#estopModal").getAttribute("class");
      expect(modalClass).not.toContain("open");

      // Click STOP button
      await page.locator("#estopBtn").click();
      await page.waitForTimeout(200);

      // Modal should now be open
      const openModalClass = await page.locator("#estopModal").getAttribute("class");
      expect(openModalClass).toContain("open");

      // Modal shows "Emergency Stop" title
      const modalTitle = await page.locator(".modal-box__title").textContent();
      expect(modalTitle).toContain("Emergency Stop");

      // Cancel closes modal
      await page.locator(".modal-btn--cancel").click();
      await page.waitForTimeout(200);

      const closedClass = await page.locator("#estopModal").getAttribute("class");
      expect(closedClass).not.toContain("open");

      await page.close();
    });

    it("Place Order button opens order slide-over", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      // Slide-over initially hidden
      const slideClass = await page.locator("#slideOrder").getAttribute("class");
      expect(slideClass).not.toContain("open");

      // Click Place Order
      await page.locator('.qa-btn--primary:has-text("Place Order")').click();
      await page.waitForTimeout(300);

      // Slide-over should be open
      const openClass = await page.locator("#slideOrder").getAttribute("class");
      expect(openClass).toContain("open");

      // Should show order form elements
      expect(await page.locator("#orderSymbol").isVisible()).toBe(true);
      expect(await page.locator("#orderAmount").isVisible()).toBe(true);

      // Buy/Sell toggle present
      expect(await page.locator("#buyBtn").isVisible()).toBe(true);
      expect(await page.locator("#sellBtn").isVisible()).toBe(true);

      // Close button works
      await page.locator("#slideOrder .slideover__close").click();
      await page.waitForTimeout(300);

      const closedClass = await page.locator("#slideOrder").getAttribute("class");
      expect(closedClass).not.toContain("open");

      await page.close();
    });

    it("Buy/Sell toggle switches active class", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openMC();

      // Open order slide-over first
      await page.locator('.qa-btn--primary:has-text("Place Order")').click();
      await page.waitForTimeout(300);

      // Buy should be active by default
      const buyClass = await page.locator("#buyBtn").getAttribute("class");
      expect(buyClass).toContain("active-buy");

      // Click Sell
      await page.locator("#sellBtn").click();
      await page.waitForTimeout(100);

      const sellClass = await page.locator("#sellBtn").getAttribute("class");
      expect(sellClass).toContain("active-sell");

      const buyClassAfter = await page.locator("#buyBtn").getAttribute("class");
      expect(buyClassAfter).not.toContain("active-buy");

      await page.close();
    });

    it(
      "holdings toggle switches between Asset and Exchange views",
      { timeout: E2E_TIMEOUT },
      async () => {
        if (!browser) {
          return;
        }
        const page = await openMC();

        // Asset view is visible by default
        expect(await page.locator("#holdAsset").isVisible()).toBe(true);
        expect(await page.locator("#holdExchange").isHidden()).toBe(true);

        // Click Exchange toggle
        await page.locator('.toggle-btn[data-view="exchange"]').click();
        await page.waitForTimeout(200);

        expect(await page.locator("#holdAsset").isHidden()).toBe(true);
        expect(await page.locator("#holdExchange").isVisible()).toBe(true);

        // Exchange view shows exchange rows
        const exchRows = await page.locator("#holdExchange .hold-row").count();
        expect(exchRows).toBe(2); // Binance, Coinbase

        await page.close();
      },
    );
  });

  // ═══════════════════════════════════════════
  // 7. SSE Updates
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("SSE Updates (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({ executablePath: browserPath, headless: true });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    it("SSE trading stream updates equity", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }

      const page = await browser.newPage();
      await page.goto(`${baseUrl}/dashboard/mission-control`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(() => document.getElementById("eqVal")?.textContent !== "--", {
        timeout: 15000,
      });

      // Push updated data via SSE
      const newData = {
        ...MOCK_MC_DATA.trading,
        summary: { ...MOCK_MC_DATA.trading.summary, totalEquity: 200000 },
      };
      const tradeConns = mcServer.sseConnections.get("trade") ?? [];
      for (const conn of tradeConns) {
        try {
          conn.write(`data: ${JSON.stringify(newData)}\n\n`);
        } catch {
          /* connection may have closed */
        }
      }

      // Wait for equity to update
      await page.waitForFunction(
        () => {
          const eq = document.getElementById("eqVal")?.textContent;
          return eq && eq.includes("200,000");
        },
        { timeout: 15000 },
      );

      const eq = await page.locator("#eqVal").textContent();
      expect(eq).toContain("200,000");

      await page.close();
    });

    it("SSE disconnect falls back to polling", { timeout: 90_000 }, async () => {
      if (!browser || !chromium) {
        return;
      }

      const port = await getFreePort();
      const template = stripChartJsCdn(readFileSync(HTML_PATH, "utf-8"));
      const css = readFileSync(CSS_PATH, "utf-8");

      // Create server that rejects SSE but serves polling + dashboard
      const pollingData = {
        ...MOCK_MC_DATA,
        trading: {
          ...MOCK_MC_DATA.trading,
          summary: { ...MOCK_MC_DATA.trading.summary, totalEquity: 999999 },
        },
      };

      const srv = http.createServer((req, res) => {
        const path = req.url ?? "/";

        // SSE streams → immediately close (triggers fallback after 3 failures)
        if (path.includes("/stream")) {
          res.writeHead(500);
          res.end();
          return;
        }

        // Polling endpoint (used as fallback by connectSSE after 3 SSE failures)
        if (path === "/api/v1/finance/trading") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(pollingData.trading));
          return;
        }

        // Other polling endpoints (return empty data)
        if (
          path === "/api/v1/fund" ||
          path === "/api/v1/finance/config" ||
          path === "/api/v1/finance/events"
        ) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({}));
          return;
        }

        // Dashboard HTML
        if (path === "/dashboard/mission-control") {
          const safeJson = JSON.stringify(MOCK_MC_DATA).replace(/<\//g, "<\\/");
          const html = template
            .replace("/*__MC_CSS__*/", css)
            .replace("/*__MC_DATA__*/ {}", safeJson);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
          return;
        }

        res.writeHead(404);
        res.end("Not Found");
      });

      await new Promise<void>((resolve) => srv.listen(port, "127.0.0.1", resolve));

      try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${port}/dashboard/mission-control`, {
          waitUntil: "load",
          timeout: 30000,
        });

        // Initial render shows injected data ($125,430.50)
        await page.waitForFunction(() => document.getElementById("eqVal")?.textContent !== "--", {
          timeout: 15000,
        });

        // After 3 SSE failures (2s + 4s + 8s ≈ 14s), polling kicks in with $999,999
        // Allow up to 40s for retries + initial poll
        await page.waitForFunction(
          () => {
            const eq = document.getElementById("eqVal")?.textContent;
            return eq && eq.includes("999,999");
          },
          { timeout: 40000 },
        );

        const eq = await page.locator("#eqVal").textContent();
        expect(eq).toContain("999,999");

        await page.close();
      } finally {
        await new Promise<void>((resolve, reject) =>
          srv.close((err) => (err ? reject(err) : resolve())),
        );
      }
    });
  });
});

// ═══════════════════════════════════════════
// Edge Cases (separate servers)
// ═══════════════════════════════════════════

describe.skipIf(!hasBrowser)("Mission Control edge cases (Playwright)", () => {
  let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

  beforeAll(async () => {
    if (!chromium) {
      return;
    }
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
  }, E2E_TIMEOUT);

  afterAll(async () => {
    await browser?.close();
  });

  function createEdgeCaseServer(mockData: Record<string, unknown>): MCServer {
    const template = stripChartJsCdn(readFileSync(HTML_PATH, "utf-8"));
    const css = readFileSync(CSS_PATH, "utf-8");
    const capturedPosts = new Map<string, unknown[]>();
    const sseConnections = new Map<string, http.ServerResponse[]>();

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
      const path = url.pathname;

      if (path.includes("/stream")) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        if (path.includes("trading")) {
          res.write(`data: ${JSON.stringify((mockData as typeof MOCK_MC_DATA).trading || {})}\n\n`);
        }
        const conns = sseConnections.get("sse") ?? [];
        conns.push(res);
        sseConnections.set("sse", conns);
        req.on("close", () => {
          const idx = conns.indexOf(res);
          if (idx >= 0) {
            conns.splice(idx, 1);
          }
        });
        return;
      }

      if (path === "/dashboard/mission-control") {
        const safeJson = JSON.stringify(mockData).replace(/<\//g, "<\\/");
        const html = template
          .replace("/*__MC_CSS__*/", css)
          .replace("/*__MC_DATA__*/ {}", safeJson);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    return { server, capturedPosts, sseConnections };
  }

  async function withEdgeServer(
    mockData: Record<string, unknown>,
    fn: (baseUrl: string) => Promise<void>,
  ) {
    const port = await getFreePort();
    const srv = createEdgeCaseServer(mockData);
    await new Promise<void>((resolve) => srv.server.listen(port, "127.0.0.1", resolve));
    try {
      await fn(`http://127.0.0.1:${port}`);
    } finally {
      for (const [, conns] of srv.sseConnections) {
        for (const conn of conns) {
          try {
            conn.end();
          } catch {
            /* ignore */
          }
        }
      }
      await new Promise<void>((resolve, reject) =>
        srv.server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  }

  async function openMCAt(url: string) {
    const page = await browser!.newPage();
    await page.goto(`${url}/dashboard/mission-control`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(
      () => {
        const bot = document.getElementById("botMsg");
        return bot && bot.textContent !== "Connecting to Mission Control...";
      },
      { timeout: 15000 },
    );
    return page;
  }

  it("empty data shows empty state placeholders", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        trading: {
          summary: { totalEquity: 0, dailyPnl: 0, dailyPnlPct: 0 },
          positions: [],
          strategies: [],
          snapshots: [],
          allocations: {},
        },
        events: { events: [], pendingCount: 0 },
        alerts: [],
        risk: { enabled: false },
        fund: {},
      },
      async (url) => {
        const page = await openMCAt(url);

        // Positions should show "No open positions"
        const posText = await page.locator("#positionsList").textContent();
        expect(posText).toContain("No open positions");

        // Alerts should show "No active alerts"
        const alertText = await page.locator("#alertsList").textContent();
        expect(alertText).toContain("No active alerts");

        // Raceboard should show "No strategies registered"
        const raceText = await page.locator("#raceBody").textContent();
        expect(raceText).toContain("No strategies registered");

        // Feed should show "No agent activity"
        const feedText = await page.locator("#feedList").textContent();
        expect(feedText).toContain("No agent activity");

        // Pipeline counts should all be 0
        expect(await page.locator("#pipeL0").textContent()).toBe("0");
        expect(await page.locator("#pipeL1").textContent()).toBe("0");
        expect(await page.locator("#pipeL2").textContent()).toBe("0");
        expect(await page.locator("#pipeL3").textContent()).toBe("0");

        await page.close();
      },
    );
  });

  it("high risk level shows danger styling", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        trading: {
          summary: { totalEquity: 50000, dailyPnl: -5000, dailyPnlPct: -9.1 },
          positions: [],
          strategies: [],
          snapshots: [],
          allocations: {},
        },
        events: { events: [], pendingCount: 0 },
        alerts: [],
        risk: { enabled: true },
        fund: { riskLevel: "CRITICAL" },
      },
      async (url) => {
        const page = await openMCAt(url);

        const riskText = await page.locator("#riskBadge").textContent();
        expect(riskText).toBe("CRITICAL");

        const riskClass = await page.locator("#riskBadge").getAttribute("class");
        expect(riskClass).toContain("topbar__risk--danger");

        await page.close();
      },
    );
  });

  it("warning risk level shows warning styling", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        trading: {
          summary: { totalEquity: 80000, dailyPnl: -1200, dailyPnlPct: -1.5 },
          positions: [],
          strategies: [],
          snapshots: [],
          allocations: {},
        },
        events: { events: [], pendingCount: 0 },
        alerts: [],
        risk: { enabled: true },
        fund: { riskLevel: "ELEVATED" },
      },
      async (url) => {
        const page = await openMCAt(url);

        const riskText = await page.locator("#riskBadge").textContent();
        expect(riskText).toBe("ELEVATED");

        const riskClass = await page.locator("#riskBadge").getAttribute("class");
        expect(riskClass).toContain("topbar__risk--warning");

        await page.close();
      },
    );
  });

  it("XSS prevention: symbol with <script> tag is escaped", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        trading: {
          summary: { totalEquity: 100000, dailyPnl: 0, dailyPnlPct: 0 },
          positions: [
            {
              symbol: "<script>alert('xss')</script>",
              side: "long",
              quantity: 1,
              avgPrice: 100,
              currentPrice: 100,
              unrealizedPnl: 0,
            },
          ],
          strategies: [
            {
              id: "xss-test",
              name: "<img src=x onerror=alert(1)>",
              level: 3,
              fitness: 0.5,
              status: "running",
              market: "crypto",
              timeframe: "1h",
              symbols: [],
              totalReturn: 0,
              sharpe: 1.0,
              winRate: 50,
              maxDrawdown: 5,
              tradeCount: 10,
            },
          ],
          snapshots: [],
          allocations: {},
        },
        events: { events: [], pendingCount: 0 },
        alerts: [],
        risk: { enabled: false },
        fund: {},
      },
      async (url) => {
        const page = await openMCAt(url);

        // Wait for positions to render
        await page.waitForFunction(
          () => document.querySelectorAll("#positionsList .pos-row").length > 0,
          { timeout: 10000 },
        );

        // Script tag in symbol should appear as text, not executed
        const posText = await page.locator("#positionsList").textContent();
        expect(posText).toContain("<script>");

        // No script elements injected
        const scriptCount = await page.locator("#positionsList script").count();
        expect(scriptCount).toBe(0);

        // Strategy name with <img onerror> should not create img elements
        await page.waitForFunction(() => document.querySelectorAll("#raceBody tr").length > 0, {
          timeout: 10000,
        });
        const raceText = await page.locator("#raceBody").textContent();
        expect(raceText).toContain("<img");
        const imgCount = await page.locator("#raceBody img").count();
        expect(imgCount).toBe(0);

        await page.close();
      },
    );
  });

  it("negative equity and P&L render correctly", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        trading: {
          summary: { totalEquity: -5000, dailyPnl: -8000, dailyPnlPct: -15 },
          positions: [],
          strategies: [],
          snapshots: [],
          allocations: {},
        },
        events: { events: [], pendingCount: 0 },
        alerts: [],
        risk: { enabled: false },
        fund: {},
      },
      async (url) => {
        const page = await openMCAt(url);

        const chgClass = await page.locator("#eqChg").getAttribute("class");
        expect(chgClass).toContain("loss");

        const chgText = await page.locator("#eqChg").textContent();
        expect(chgText).toContain("-");
        expect(chgText).toContain("8,000");

        await page.close();
      },
    );
  });

  it("large equity formats with commas", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        trading: {
          summary: { totalEquity: 999999999.99, dailyPnl: 1234567.89, dailyPnlPct: 5.5 },
          positions: [],
          strategies: [],
          snapshots: [],
          allocations: {},
        },
        events: { events: [], pendingCount: 0 },
        alerts: [],
        risk: { enabled: false },
        fund: {},
      },
      async (url) => {
        const page = await openMCAt(url);

        const eqText = await page.locator("#eqVal").textContent();
        expect(eqText).toContain("999,999,999");

        await page.close();
      },
    );
  });
});
