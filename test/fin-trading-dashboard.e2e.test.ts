/**
 * E2E test for the FinClaw Trading Dashboard — **rendering layer** (mock server).
 *
 * Spins up a lightweight HTTP server serving the trading dashboard HTML
 * with mock data, SSE streams, and REST endpoints, then uses Playwright
 * to verify rendering of all 7 panels, SSE updates, and edge cases.
 *
 * This file validates the HTML/JS rendering behaviour in isolation.
 * For integration tests that exercise the full Gateway → Plugin → Route pipeline,
 * see: test/fin-dashboard-integration.e2e.test.ts
 *
 * Run: pnpm vitest run test/fin-trading-dashboard.e2e.test.ts --config vitest.e2e.config.ts
 */
import { readFileSync } from "node:fs";
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
const DASHBOARD_DIR = join(__dirname, "../extensions/fin-core/dashboard");
const CSS_PATH = join(DASHBOARD_DIR, "trading-dashboard.css");
const HTML_PATH = join(DASHBOARD_DIR, "trading-dashboard.html");

// ── Mock data ──

const MOCK_TRADING_DATA = {
  summary: {
    totalEquity: 125430.5,
    dailyPnl: 2890.3,
    dailyPnlPct: 2.3,
    winRate: 62.5,
    avgSharpe: 1.42,
  },
  positions: [
    {
      symbol: "BTC/USDT",
      side: "long",
      quantity: 0.5,
      entryPrice: 64000,
      currentPrice: 68500,
      unrealizedPnl: 2250,
    },
    {
      symbol: "ETH/USDT",
      side: "long",
      quantity: 5,
      entryPrice: 3200,
      currentPrice: 3350,
      unrealizedPnl: 750,
    },
    {
      symbol: "SOL/USDT",
      side: "short",
      quantity: 20,
      entryPrice: 180,
      currentPrice: 175,
      unrealizedPnl: 100,
    },
  ],
  orders: [
    {
      filledAt: "2026-02-28T10:30:00Z",
      symbol: "BTC/USDT",
      side: "buy",
      quantity: 0.5,
      fillPrice: 64000,
      status: "filled",
      commission: 6.4,
      strategyId: "momentum-btc",
    },
    {
      createdAt: "2026-02-28T11:00:00Z",
      symbol: "ETH/USDT",
      side: "sell",
      quantity: 2,
      fillPrice: null,
      status: "pending",
      commission: null,
      strategyId: "mean-revert-eth",
    },
  ],
  snapshots: [
    { timestamp: "2026-02-28T00:00:00Z", equity: 120000 },
    { timestamp: "2026-02-28T06:00:00Z", equity: 122500 },
    { timestamp: "2026-02-28T12:00:00Z", equity: 125430.5 },
  ],
  strategies: [
    {
      id: "momentum-btc",
      name: "MomentumBTC",
      level: "L3_LIVE",
      totalReturn: 35.2,
      sharpe: 1.8,
      maxDrawdown: 12.3,
      totalTrades: 120,
    },
    {
      id: "mean-revert-eth",
      name: "MeanRevertETH",
      level: "L2_PAPER",
      totalReturn: 18.5,
      sharpe: 1.2,
      maxDrawdown: 8.1,
      totalTrades: 80,
    },
    {
      id: "grid-sol",
      name: "GridSOL",
      level: "L1_BACKTEST",
      totalReturn: 5.2,
      sharpe: 0.6,
      maxDrawdown: 15.0,
      totalTrades: 40,
    },
  ],
  backtests: [
    {
      strategyId: "momentum-btc",
      totalReturn: 42.5,
      sharpe: 1.95,
      sortino: 2.8,
      maxDrawdown: 11.2,
      winRate: 65.3,
      profitFactor: 2.1,
      totalTrades: 200,
      finalEquity: 142500,
      initialCapital: 100000,
    },
  ],
  allocations: {
    items: [
      { strategyId: "momentum-btc", capitalUsd: 30000 },
      { strategyId: "mean-revert-eth", capitalUsd: 20000 },
    ],
    cashReserve: 75430.5,
  },
};

// ── Test Server ──

interface TradingServer {
  server: http.Server;
  sseConnections: http.ServerResponse[];
}

function createTradingServer(
  mockData: Record<string, unknown> = MOCK_TRADING_DATA as unknown as Record<string, unknown>,
): TradingServer {
  const template = stripChartJsCdn(readFileSync(HTML_PATH, "utf-8"));
  const css = readFileSync(CSS_PATH, "utf-8");
  const sseConnections: http.ServerResponse[] = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;

    // SSE stream
    if (path === "/api/v1/finance/trading/stream" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify(mockData)}\n\n`);
      sseConnections.push(res);
      req.on("close", () => {
        const idx = sseConnections.indexOf(res);
        if (idx >= 0) {
          sseConnections.splice(idx, 1);
        }
      });
      return;
    }

    // Polling endpoint
    if (path === "/api/v1/finance/trading" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(mockData));
      return;
    }

    // Dashboard HTML
    if (path === "/dashboard/trading") {
      const safeJson = JSON.stringify(mockData).replace(/<\//g, "<\\/");
      const html = template
        .replace("/*__TRADING_CSS__*/", css)
        .replace("/*__TRADING_DATA__*/ {}", safeJson);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  return { server, sseConnections };
}

// ── Tests ──

const E2E_TIMEOUT = 60_000;

describe("fin-trading-dashboard E2E", () => {
  let tradingServer: TradingServer;
  let baseUrl: string;

  beforeAll(async () => {
    const port = await getFreePort();
    tradingServer = createTradingServer();
    await new Promise<void>((resolve) => tradingServer.server.listen(port, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    for (const conn of tradingServer.sseConnections) {
      try {
        conn.end();
      } catch {
        /* ignore */
      }
    }
    await new Promise<void>((resolve, reject) => {
      tradingServer.server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ═══════════════════════════════════════════
  // 1. REST API / HTML serving
  // ═══════════════════════════════════════════

  describe("REST API", () => {
    it("GET /api/v1/finance/trading returns full trading JSON", async () => {
      const { status, body } = await fetchJson(`${baseUrl}/api/v1/finance/trading`);
      expect(status).toBe(200);
      const data = body as typeof MOCK_TRADING_DATA;
      expect(data.summary.totalEquity).toBe(125430.5);
      expect(data.positions).toHaveLength(3);
      expect(data.strategies).toHaveLength(3);
      expect(data.orders).toHaveLength(2);
      expect(data.backtests).toHaveLength(1);
    });

    it("GET /dashboard/trading serves HTML with injected data", async () => {
      const { status, body } = await fetchJson(`${baseUrl}/dashboard/trading`);
      expect(status).toBe(200);
      const html = body as string;
      expect(html).toContain("OpenFinClaw Trading Dashboard");
      expect(html).not.toContain("/*__TRADING_DATA__*/ {}");
      expect(html).toContain("125430.5");
    });

    it("GET unknown path returns 404", async () => {
      const { status } = await fetchJson(`${baseUrl}/api/v1/unknown`);
      expect(status).toBe(404);
    });

    it("Content-Type: JSON for API, HTML for dashboard", async () => {
      const apiRes = await new Promise<http.IncomingMessage>((resolve) => {
        const parsed = new URL(`${baseUrl}/api/v1/finance/trading`);
        http.get(
          { hostname: parsed.hostname, port: Number(parsed.port), path: parsed.pathname },
          resolve,
        );
      });
      expect(apiRes.headers["content-type"]).toContain("application/json");

      const dashRes = await new Promise<http.IncomingMessage>((resolve) => {
        const parsed = new URL(`${baseUrl}/dashboard/trading`);
        http.get(
          { hostname: parsed.hostname, port: Number(parsed.port), path: parsed.pathname },
          resolve,
        );
      });
      expect(dashRes.headers["content-type"]).toContain("text/html");
      apiRes.resume();
      dashRes.resume();
    });
  });

  // ═══════════════════════════════════════════
  // 2. Static Rendering (Playwright)
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

    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/trading`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(
        () => document.getElementById("hero-equity")?.textContent !== "$0.00",
        { timeout: 15000 },
      );
      return page;
    }

    it("all 7 panels are visible with full data", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      expect(await page.locator("#panel-hero").isVisible()).toBe(true);
      expect(await page.locator("#equity-chart-container").isVisible()).toBe(true);
      // alloc-chart canvas exists (legend is empty without Chart.js CDN)
      expect(await page.locator("#alloc-chart").count()).toBe(1);
      expect(await page.locator("#positions-table").isVisible()).toBe(true);
      expect(await page.locator("#strategy-grid").isVisible()).toBe(true);
      expect(await page.locator("#orders-table").isVisible()).toBe(true);
      expect(await page.locator("#backtest-table").isVisible()).toBe(true);

      await page.close();
    });

    it(
      "hero panel shows totalEquity, dailyPnl, dailyPnlPct",
      { timeout: E2E_TIMEOUT },
      async () => {
        if (!browser) {
          return;
        }
        const page = await openDashboard();

        const equity = await page.locator("#hero-equity").textContent();
        expect(equity).toContain("125,430");

        const pnl = await page.locator("#hero-pnl").textContent();
        expect(pnl).toContain("+");
        expect(pnl).toContain("2,890");
        expect(pnl).toContain("2.30%");

        await page.close();
      },
    );

    it("hero shows positions count and strategies count", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      expect(await page.locator("#hero-positions").textContent()).toBe("3");
      expect(await page.locator("#hero-strategies").textContent()).toBe("3");

      await page.close();
    });

    it("hero shows win rate and Sharpe ratio", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const winRate = await page.locator("#hero-win-rate").textContent();
      expect(winRate).toContain("62.50%");

      const sharpe = await page.locator("#hero-sharpe").textContent();
      expect(sharpe).toContain("1.42");

      await page.close();
    });

    it("page title contains 'Trading Dashboard'", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const title = await page.title();
      expect(title).toContain("Trading Dashboard");

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 3. Positions Panel
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Positions Panel (Playwright)", () => {
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

    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/trading`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(
        () => document.getElementById("hero-equity")?.textContent !== "$0.00",
        { timeout: 15000 },
      );
      return page;
    }

    it("renders positions table with 3 rows", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const rows = await page.locator("#positions-table tbody tr").count();
      expect(rows).toBe(3);

      // First row: BTC/USDT
      const firstRow = await page.locator("#positions-table tbody tr").first().textContent();
      expect(firstRow).toContain("BTC/USDT");
      expect(firstRow).toContain("LONG");

      // Empty message should be hidden
      expect(await page.locator("#positions-empty").isVisible()).toBe(false);

      await page.close();
    });

    it("correctly handles short-side PnL% inversion", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // SOL/USDT is short: entry=180, current=175
      // Raw pnlPct = (175-180)/180*100 = -2.78%, negated for short = +2.78%
      const solRow = await page.locator("#positions-table tbody tr").nth(2).textContent();
      expect(solRow).toContain("SOL/USDT");
      expect(solRow).toContain("SHORT");
      // PnL% should be positive for a profitable short
      expect(solRow).toContain("+2.78%");

      await page.close();
    });

    it("long/short side colors are different", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // BTC is long → side-long class
      const btcSide = page.locator("#positions-table tbody tr").first().locator("td").nth(1);
      expect(await btcSide.getAttribute("class")).toContain("side-long");

      // SOL is short → side-short class
      const solSide = page.locator("#positions-table tbody tr").nth(2).locator("td").nth(1);
      expect(await solSide.getAttribute("class")).toContain("side-short");

      await page.close();
    });

    it(
      "PnL positive/negative values have correct color classes",
      { timeout: E2E_TIMEOUT },
      async () => {
        if (!browser) {
          return;
        }
        const page = await openDashboard();

        // BTC unrealizedPnl = 2250 → pnl-positive
        const btcPnl = page
          .locator("#positions-table tbody tr")
          .first()
          .locator(".pnl-cell")
          .first();
        expect(await btcPnl.getAttribute("class")).toContain("pnl-positive");

        await page.close();
      },
    );
  });

  // ═══════════════════════════════════════════
  // 4. Strategies Panel
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Strategies Panel (Playwright)", () => {
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

    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/trading`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(
        () => document.getElementById("hero-equity")?.textContent !== "$0.00",
        { timeout: 15000 },
      );
      return page;
    }

    it("renders 3 strategy cards", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const cards = await page.locator(".strategy-card").count();
      expect(cards).toBe(3);

      // First card: MomentumBTC
      const firstName = await page
        .locator(".strategy-card")
        .first()
        .locator(".strategy-card-name")
        .textContent();
      expect(firstName).toBe("MomentumBTC");

      // Empty state should be hidden
      expect(await page.locator("#strategies-empty").isVisible()).toBe(false);

      await page.close();
    });

    it("strategy cards show level badges", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const firstBadge = await page
        .locator(".strategy-card")
        .first()
        .locator(".level-badge")
        .textContent();
      expect(firstBadge).toBe("L3");

      const secondBadge = await page
        .locator(".strategy-card")
        .nth(1)
        .locator(".level-badge")
        .textContent();
      expect(secondBadge).toBe("L2");

      await page.close();
    });

    it("Sharpe >= 1 has sharpe-good class", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // MomentumBTC sharpe = 1.8 → sharpe-good
      const sharpeEl = page.locator(".strategy-card").first().locator(".stat-value.sharpe-good");
      expect(await sharpeEl.count()).toBeGreaterThanOrEqual(1);

      await page.close();
    });

    it("Sharpe < 1 does not have sharpe-good", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // GridSOL sharpe = 0.6 → sharpe-ok (not sharpe-good)
      const gridCard = page.locator(".strategy-card").nth(2);
      const sharpeBad = await gridCard.locator(".stat-value.sharpe-good").count();
      expect(sharpeBad).toBe(0);

      const sharpeOk = await gridCard.locator(".stat-value.sharpe-ok").count();
      expect(sharpeOk).toBeGreaterThanOrEqual(1);

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 5. Orders Panel
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Orders Panel (Playwright)", () => {
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

    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/trading`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(
        () => document.getElementById("hero-equity")?.textContent !== "$0.00",
        { timeout: 15000 },
      );
      return page;
    }

    it("renders 2 order rows", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const rows = await page.locator("#orders-table tbody tr").count();
      expect(rows).toBe(2);

      const firstRow = await page.locator("#orders-table tbody tr").first().textContent();
      expect(firstRow).toContain("BTC/USDT");
      expect(firstRow).toContain("BUY");
      expect(firstRow).toContain("FILLED");

      expect(await page.locator("#orders-empty").isVisible()).toBe(false);

      await page.close();
    });

    it("order status badges have correct classes", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const filledBadge = page.locator(".status-badge.status-filled").first();
      expect(await filledBadge.textContent()).toBe("FILLED");

      const pendingBadge = page.locator(".status-badge.status-pending").first();
      expect(await pendingBadge.textContent()).toBe("PENDING");

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 6. Backtests Panel
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Backtests Panel (Playwright)", () => {
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

    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/trading`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(
        () => document.getElementById("hero-equity")?.textContent !== "$0.00",
        { timeout: 15000 },
      );
      return page;
    }

    it("renders 1 backtest result row", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const rows = await page.locator("#backtest-table tbody tr").count();
      expect(rows).toBe(1);

      const row = await page.locator("#backtest-table tbody tr").first().textContent();
      expect(row).toContain("momentum-btc");
      expect(row).toContain("42.50%");
      expect(row).toContain("1.950");

      expect(await page.locator("#backtest-empty").isVisible()).toBe(false);

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 7. SSE / Polling
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("SSE / Polling (Playwright)", () => {
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

    it("SSE stream updates DOM with new equity", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }

      const page = await browser.newPage();
      await page.goto(`${baseUrl}/dashboard/trading`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(
        () => document.getElementById("hero-equity")?.textContent !== "$0.00",
        { timeout: 15000 },
      );

      // Push updated data via SSE
      const newData = {
        ...MOCK_TRADING_DATA,
        summary: { ...MOCK_TRADING_DATA.summary, totalEquity: 200000 },
      };
      for (const conn of tradingServer.sseConnections) {
        try {
          conn.write(`data: ${JSON.stringify(newData)}\n\n`);
        } catch {
          /* connection may have closed */
        }
      }

      // Wait for equity to update
      await page.waitForFunction(
        () => {
          const eq = document.getElementById("hero-equity")?.textContent;
          return eq && eq.includes("200,000");
        },
        { timeout: 15000 },
      );

      const eq = await page.locator("#hero-equity").textContent();
      expect(eq).toContain("200,000");

      await page.close();
    });

    it("SSE disconnect falls back to polling", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser || !chromium) {
        return;
      }

      // Create a server that rejects SSE but serves polling + dashboard
      const pollingData = {
        ...MOCK_TRADING_DATA,
        summary: { ...MOCK_TRADING_DATA.summary, totalEquity: 999999 },
      };

      const port = await getFreePort();
      const template = stripChartJsCdn(readFileSync(HTML_PATH, "utf-8"));
      const css = readFileSync(CSS_PATH, "utf-8");

      const srv = http.createServer((req, res) => {
        const path = req.url ?? "/";

        if (path === "/api/v1/finance/trading/stream") {
          // Immediately close SSE → triggers onerror → fallback to polling
          res.writeHead(500);
          res.end();
          return;
        }
        if (path === "/api/v1/finance/trading") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(pollingData));
          return;
        }
        if (path === "/dashboard/trading") {
          const safeJson = JSON.stringify(MOCK_TRADING_DATA).replace(/<\//g, "<\\/");
          const html = template
            .replace("/*__TRADING_CSS__*/", css)
            .replace("/*__TRADING_DATA__*/ {}", safeJson);
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
        await page.goto(`http://127.0.0.1:${port}/dashboard/trading`, {
          waitUntil: "load",
          timeout: 30000,
        });

        // Initial render shows injected data ($125,430.50)
        await page.waitForFunction(
          () => document.getElementById("hero-equity")?.textContent !== "$0.00",
          { timeout: 15000 },
        );

        // After SSE fails, polling kicks in with $999,999 (polling interval is 10s)
        // We wait up to 20s for polling to update
        await page.waitForFunction(
          () => {
            const eq = document.getElementById("hero-equity")?.textContent;
            return eq && eq.includes("999,999");
          },
          { timeout: 20000 },
        );

        const eq = await page.locator("#hero-equity").textContent();
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

describe.skipIf(!hasBrowser)("Trading Dashboard edge cases (Playwright)", () => {
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

  function createEdgeCaseServer(mockData: Record<string, unknown>): TradingServer {
    const template = stripChartJsCdn(readFileSync(HTML_PATH, "utf-8"));
    const css = readFileSync(CSS_PATH, "utf-8");
    const sseConnections: http.ServerResponse[] = [];

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
      const path = url.pathname;

      if (path === "/api/v1/finance/trading/stream") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(`data: ${JSON.stringify(mockData)}\n\n`);
        sseConnections.push(res);
        req.on("close", () => {
          const idx = sseConnections.indexOf(res);
          if (idx >= 0) {
            sseConnections.splice(idx, 1);
          }
        });
        return;
      }

      if (path === "/dashboard/trading") {
        const safeJson = JSON.stringify(mockData).replace(/<\//g, "<\\/");
        const html = template
          .replace("/*__TRADING_CSS__*/", css)
          .replace("/*__TRADING_DATA__*/ {}", safeJson);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    return { server, sseConnections };
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
      for (const conn of srv.sseConnections) {
        try {
          conn.end();
        } catch {
          /* ignore */
        }
      }
      await new Promise<void>((resolve, reject) =>
        srv.server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  }

  async function openDashboardAt(url: string) {
    const page = await browser!.newPage();
    await page.goto(`${url}/dashboard/trading`, { waitUntil: "load", timeout: 30000 });
    // Wait for inline script to execute (timestamp updates on every run)
    await page.waitForFunction(
      () => {
        const ts = document.getElementById("timestamp");
        return ts && ts.textContent !== "";
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
        summary: { totalEquity: 0, dailyPnl: 0, dailyPnlPct: 0 },
        positions: [],
        orders: [],
        snapshots: [],
        strategies: [],
        backtests: [],
        allocations: { items: [], cashReserve: 0 },
      },
      async (url) => {
        const page = await openDashboardAt(url);

        expect(await page.locator("#positions-empty").isVisible()).toBe(true);
        expect(await page.locator("#strategies-empty").isVisible()).toBe(true);
        expect(await page.locator("#orders-empty").isVisible()).toBe(true);
        expect(await page.locator("#backtest-empty").isVisible()).toBe(true);

        // Tables should be hidden
        expect(await page.locator("#positions-table").isVisible()).toBe(false);
        expect(await page.locator("#orders-table").isVisible()).toBe(false);
        expect(await page.locator("#backtest-table").isVisible()).toBe(false);

        await page.close();
      },
    );
  });

  it("no open positions shows 'No open positions'", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        summary: { totalEquity: 100000, dailyPnl: 0, dailyPnlPct: 0 },
        positions: [],
        orders: [],
        snapshots: [],
        strategies: [],
        backtests: [],
        allocations: { items: [], cashReserve: 100000 },
      },
      async (url) => {
        const page = await openDashboardAt(url);

        const emptyText = await page.locator("#positions-empty").textContent();
        expect(emptyText).toContain("No open positions");

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
        summary: { totalEquity: 100000, dailyPnl: 0, dailyPnlPct: 0 },
        positions: [
          {
            symbol: "<script>alert('xss')</script>",
            side: "long",
            quantity: 1,
            entryPrice: 100,
            currentPrice: 100,
            unrealizedPnl: 0,
          },
        ],
        orders: [],
        snapshots: [],
        strategies: [
          {
            id: "xss-test",
            name: "<img src=x onerror=alert(1)>",
            level: "L3_LIVE",
            totalReturn: 0,
            sharpe: 1.0,
            maxDrawdown: 5,
            totalTrades: 10,
          },
        ],
        backtests: [],
        allocations: { items: [], cashReserve: 100000 },
      },
      async (url) => {
        const page = await openDashboardAt(url);

        // Wait for positions to render
        await page.waitForFunction(
          () => document.querySelectorAll("#positions-table tbody tr").length > 0,
          { timeout: 10000 },
        );

        // Script tag in symbol should appear as text, not executed
        const posText = await page.locator("#positions-table tbody tr").first().textContent();
        expect(posText).toContain("<script>");

        // No script elements should be injected into the table
        const scriptCount = await page.locator("#positions-table script").count();
        expect(scriptCount).toBe(0);

        // Strategy name with <img onerror> should not create img elements
        await page.waitForSelector(".strategy-card", { timeout: 10000 });
        const stratText = await page.locator(".strategy-card-name").first().textContent();
        expect(stratText).toContain("<img");
        const imgCount = await page.locator(".strategy-card img").count();
        expect(imgCount).toBe(0);

        await page.close();
      },
    );
  });

  it("super large equity formats correctly", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        summary: { totalEquity: 999999999.99, dailyPnl: 1234567.89, dailyPnlPct: 5.5 },
        positions: [],
        orders: [],
        snapshots: [],
        strategies: [],
        backtests: [],
        allocations: { items: [], cashReserve: 999999999.99 },
      },
      async (url) => {
        const page = await openDashboardAt(url);

        const equity = await page.locator("#hero-equity").textContent();
        expect(equity).toContain("999,999,999");

        await page.close();
      },
    );
  });

  it("negative equity renders correctly", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        summary: { totalEquity: -5000, dailyPnl: -8000, dailyPnlPct: -15 },
        positions: [],
        orders: [],
        snapshots: [],
        strategies: [],
        backtests: [],
        allocations: { items: [], cashReserve: 0 },
      },
      async (url) => {
        const page = await openDashboardAt(url);

        const pnlClass = await page.locator("#hero-pnl").getAttribute("class");
        expect(pnlClass).toContain("pnl-negative");

        const pnlText = await page.locator("#hero-pnl").textContent();
        expect(pnlText).toContain("-");
        expect(pnlText).toContain("8,000");

        await page.close();
      },
    );
  });

  it("NaN/undefined fields do not crash", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        summary: { totalEquity: 100000 },
        positions: [
          {
            symbol: "TEST/USD",
            side: "long",
            quantity: 1,
            entryPrice: 0,
            currentPrice: 100,
            unrealizedPnl: undefined,
          },
        ],
        orders: [],
        snapshots: [],
        strategies: [
          {
            id: "no-stats",
            name: "NoStats",
            level: "L0_INCUBATE",
            totalReturn: null,
            sharpe: null,
            maxDrawdown: null,
            totalTrades: null,
          },
        ],
        backtests: [],
        allocations: { items: [], cashReserve: 100000 },
      },
      async (url) => {
        const page = await openDashboardAt(url);

        // Page should load without crashing
        const equity = await page.locator("#hero-equity").textContent();
        expect(equity).toContain("100,000");

        // Strategy with null stats should show "--"
        await page.waitForSelector(".strategy-card", { timeout: 10000 });
        const statValues = await page.locator(".strategy-card .stat-value").allTextContents();
        expect(statValues.some((v) => v === "--")).toBe(true);

        // Win rate should show "--" when null
        const winRate = await page.locator("#hero-win-rate").textContent();
        expect(winRate).toBe("--");

        // Sharpe should show "--" when null
        const sharpe = await page.locator("#hero-sharpe").textContent();
        expect(sharpe).toBe("--");

        await page.close();
      },
    );
  });

  it("winRate null shows '--', avgSharpe null shows '--'", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        summary: {
          totalEquity: 50000,
          dailyPnl: 0,
          dailyPnlPct: 0,
          winRate: null,
          avgSharpe: null,
        },
        positions: [],
        orders: [],
        snapshots: [],
        strategies: [],
        backtests: [],
        allocations: { items: [], cashReserve: 50000 },
      },
      async (url) => {
        const page = await openDashboardAt(url);

        expect(await page.locator("#hero-win-rate").textContent()).toBe("--");
        expect(await page.locator("#hero-sharpe").textContent()).toBe("--");

        await page.close();
      },
    );
  });
});
