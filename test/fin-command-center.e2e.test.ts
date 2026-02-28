import { readFileSync } from "node:fs";
/**
 * E2E test for the FinClaw Command Center dashboard + REST API — **rendering layer** (mock server).
 *
 * Spins up a lightweight HTTP server with mock endpoints (trading, events,
 * alerts, orders, strategies, emergency-stop, SSE streams), then uses
 * Playwright to verify the full user-interaction flow.
 *
 * Architecture mirrors fin-fund-dashboard.e2e.test.ts.
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
} from "./helpers/e2e-browser.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CC_DIR = join(__dirname, "../extensions/fin-core/dashboard");
const CSS_PATH = join(CC_DIR, "command-center.css");
const HTML_PATH = join(CC_DIR, "command-center.html");

// ── Mock data ──

const MOCK_CC_DATA = {
  trading: {
    summary: {
      totalEquity: 125430.5,
      dailyPnl: 2890.3,
      dailyPnlPct: 2.3,
      positionCount: 3,
      strategyCount: 4,
      avgSharpe: 1.42,
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
        level: "L3_LIVE",
        status: "running",
        totalReturn: 0.35,
        sharpe: 1.8,
        totalTrades: 120,
      },
      {
        id: "mean-revert-eth",
        name: "MeanRevertETH",
        level: "L2_PAPER",
        status: "running",
        totalReturn: 0.18,
        sharpe: 1.2,
        totalTrades: 80,
      },
      {
        id: "grid-sol",
        name: "GridSOL",
        level: "L1_BACKTEST",
        status: "paused",
        totalReturn: 0.05,
        sharpe: 0.6,
        totalTrades: 40,
      },
      {
        id: "arb-dex",
        name: "ArbDEX",
        level: "L0_INCUBATE",
        status: "running",
        totalReturn: 0,
        sharpe: 0,
        totalTrades: 0,
      },
    ],
  },
  events: {
    events: [
      {
        id: "EVT-001",
        type: "trade_pending",
        status: "pending",
        title: "Buy 0.5 BTC @ $68,000",
        detail: "Momentum strategy triggered buy signal",
        timestamp: Date.now() - 120000,
      },
      {
        id: "EVT-002",
        type: "trade_executed",
        status: "resolved",
        title: "Sold 2 ETH @ $3,400",
        detail: "Mean revert strategy exit",
        timestamp: Date.now() - 600000,
      },
      {
        id: "EVT-003",
        type: "system",
        status: "resolved",
        title: "Strategy GridSOL paused",
        detail: "Risk limit reached - daily drawdown 4.2%",
        timestamp: Date.now() - 3600000,
      },
    ],
    pendingCount: 1,
  },
  alerts: [
    {
      id: "ALT-1",
      condition: { kind: "price_above", symbol: "BTC/USDT", price: 70000 },
      createdAt: "2026-02-28T10:00:00.000Z",
      triggeredAt: null,
    },
  ],
  risk: {
    enabled: true,
    maxOrderValue: 10000,
    requireApproval: true,
    approvalThreshold: 5000,
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

interface CCServer {
  server: http.Server;
  capturedRequests: Map<string, unknown[]>;
  sseConnections: http.ServerResponse[];
}

function createCCServer(mockData: typeof MOCK_CC_DATA = MOCK_CC_DATA): CCServer {
  const template = readFileSync(HTML_PATH, "utf-8");
  const css = readFileSync(CSS_PATH, "utf-8");
  const capturedRequests = new Map<string, unknown[]>();
  const sseConnections: http.ServerResponse[] = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;

    // ── SSE Streams ──
    if (path === "/api/v1/finance/trading/stream" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify(mockData.trading)}\n\n`);
      sseConnections.push(res);
      req.on("close", () => {
        const idx = sseConnections.indexOf(res);
        if (idx >= 0) {
          sseConnections.splice(idx, 1);
        }
      });
      return;
    }

    if (path === "/api/v1/finance/events/stream" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify(mockData.events)}\n\n`);
      sseConnections.push(res);
      req.on("close", () => {
        const idx = sseConnections.indexOf(res);
        if (idx >= 0) {
          sseConnections.splice(idx, 1);
        }
      });
      return;
    }

    // ── POST endpoints (capture body) ──
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        let parsed: unknown = {};
        try {
          parsed = JSON.parse(body);
        } catch {
          /* empty */
        }
        const list = capturedRequests.get(path) ?? [];
        list.push(parsed);
        capturedRequests.set(path, list);

        res.writeHead(200, { "Content-Type": "application/json" });

        if (path === "/api/v1/finance/orders") {
          res.end(JSON.stringify({ status: "filled", orderId: "ORD-123" }));
        } else if (path === "/api/v1/finance/emergency-stop") {
          res.end(JSON.stringify({ message: "All trading stopped" }));
        } else if (path === "/api/v1/finance/strategies/pause") {
          res.end(JSON.stringify({ paused: true }));
        } else if (path === "/api/v1/finance/strategies/resume") {
          res.end(JSON.stringify({ resumed: true }));
        } else if (path === "/api/v1/finance/strategies/kill") {
          res.end(JSON.stringify({ killed: true }));
        } else if (path === "/api/v1/finance/strategies/promote") {
          res.end(JSON.stringify({ from: "L1", to: "L2" }));
        } else if (path === "/api/v1/finance/events/approve") {
          res.end(JSON.stringify({ approved: true }));
        } else if (path === "/api/v1/finance/alerts/create") {
          res.end(JSON.stringify({ id: "ALT-new" }));
        } else if (path === "/api/v1/finance/alerts/remove") {
          res.end(JSON.stringify({ removed: true }));
        } else if (path === "/api/v1/finance/positions/close") {
          res.end(JSON.stringify({ closed: true }));
        } else {
          res.end(JSON.stringify({ ok: true }));
        }
      });
      return;
    }

    // ── GET endpoints ──
    if (path === "/api/v1/finance/command-center") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(mockData));
      return;
    }

    if (path === "/api/v1/finance/alerts") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ alerts: mockData.alerts }));
      return;
    }

    // ── Dashboard HTML ──
    if (path === "/dashboard/command-center") {
      const safeJson = JSON.stringify(mockData).replace(/<\//g, "<\\/");
      const html = template.replace("/*__CC_CSS__*/", css).replace("/*__CC_DATA__*/ {}", safeJson);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  return { server, capturedRequests, sseConnections };
}

// ── Tests ──

const E2E_TIMEOUT = 60_000;

describe("fin-command-center E2E", () => {
  let ccServer: CCServer;
  let baseUrl: string;

  beforeAll(async () => {
    const port = await getFreePort();
    ccServer = createCCServer();
    await new Promise<void>((resolve) => ccServer.server.listen(port, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    // Close all SSE connections before closing the server
    for (const conn of ccServer.sseConnections) {
      try {
        conn.end();
      } catch {
        /* ignore */
      }
    }
    await new Promise<void>((resolve, reject) => {
      ccServer.server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ═══════════════════════════════════════════
  // 1. REST API Tests (no browser needed)
  // ═══════════════════════════════════════════

  describe("REST API", () => {
    it("GET /api/v1/finance/command-center returns full JSON", async () => {
      const { status, body } = await fetchJson(`${baseUrl}/api/v1/finance/command-center`);
      expect(status).toBe(200);

      const data = body as typeof MOCK_CC_DATA;
      expect(data.trading.summary.totalEquity).toBe(125430.5);
      expect(data.trading.positions).toHaveLength(3);
      expect(data.trading.strategies).toHaveLength(4);
      expect(data.events.pendingCount).toBe(1);
      expect(data.alerts).toHaveLength(1);
    });

    it("GET /dashboard/command-center returns HTML with injected data", async () => {
      const { status, body } = await fetchJson(`${baseUrl}/dashboard/command-center`);
      expect(status).toBe(200);

      const html = body as string;
      expect(html).toContain("OpenFinClaw");
      expect(html).not.toContain("/*__CC_DATA__*/ {}");
      expect(html).toContain("125430.5");
    });

    it("POST /api/v1/finance/orders captures request body", async () => {
      const payload = {
        symbol: "BTC/USDT",
        side: "buy",
        type: "market",
        quantity: 0.1,
      };
      const { status, body } = await fetchPost(`${baseUrl}/api/v1/finance/orders`, payload);
      expect(status).toBe(200);
      expect((body as Record<string, unknown>).status).toBe("filled");

      const reqs = ccServer.capturedRequests.get("/api/v1/finance/orders") ?? [];
      expect(reqs.length).toBeGreaterThanOrEqual(1);
      expect(reqs[reqs.length - 1]).toMatchObject(payload);
    });

    it("GET unknown path returns 404", async () => {
      const { status } = await fetchJson(`${baseUrl}/api/v1/finance/unknown`);
      expect(status).toBe(404);
    });

    it("Content-Type: JSON for API, HTML for dashboard", async () => {
      const apiRes = await new Promise<http.IncomingMessage>((resolve) => {
        const parsed = new URL(`${baseUrl}/api/v1/finance/command-center`);
        http.get(
          {
            hostname: parsed.hostname,
            port: Number(parsed.port),
            path: parsed.pathname,
          },
          resolve,
        );
      });
      expect(apiRes.headers["content-type"]).toContain("application/json");

      const dashRes = await new Promise<http.IncomingMessage>((resolve) => {
        const parsed = new URL(`${baseUrl}/dashboard/command-center`);
        http.get(
          {
            hostname: parsed.hostname,
            port: Number(parsed.port),
            path: parsed.pathname,
          },
          resolve,
        );
      });
      expect(dashRes.headers["content-type"]).toContain("text/html");

      apiRes.resume();
      dashRes.resume();
    });
  });

  // ═══════════════════════════════════════════
  // 2. Page Rendering (Playwright)
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Page Rendering (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
      });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/command-center`, {
        waitUntil: "load",
        timeout: 30000,
      });
      // Wait for JS to populate equity (not the default "$0")
      await page.waitForFunction(() => document.getElementById("tbEquity")?.textContent !== "$0", {
        timeout: 15000,
      });
      return page;
    }

    it("renders three-column layout", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const colL = await page.locator(".col-l").isVisible();
      const colC = await page.locator(".col-c").isVisible();
      const colR = await page.locator(".col-r").isVisible();
      expect(colL).toBe(true);
      expect(colC).toBe(true);
      expect(colR).toBe(true);

      await page.close();
    });

    it("top bar shows correct equity", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const equity = await page.locator("#tbEquity").textContent();
      // fmtUsd formats 125430.5 as $125.4K
      expect(equity).toContain("125");

      await page.close();
    });

    it("stat pills show correct values", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const positions = await page.locator("#spPositions").textContent();
      expect(positions).toBe("3");

      const strategies = await page.locator("#spStrategies").textContent();
      expect(strategies).toBe("4");

      const pending = await page.locator("#spPending").textContent();
      expect(pending).toBe("1");

      await page.close();
    });

    it("pending pill has pending style", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const pillClass = await page.locator("#spPendingPill").getAttribute("class");
      expect(pillClass).toContain("stat-pill--pending");

      await page.close();
    });

    it("strategy raceboard has correct rows", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const rows = await page.locator("#stratBody tr").count();
      expect(rows).toBe(4);

      // First row should be sorted by totalReturn (MomentumBTC highest)
      const firstRow = await page.locator("#stratBody tr").first().textContent();
      expect(firstRow).toContain("MomentumBTC");

      await page.close();
    });

    it("pipeline shows L0-L3 counts", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const counts = await page.locator(".pipe-stage__count").allTextContents();
      // L0=1, L1=1, L2=1, L3=1
      expect(counts).toEqual(["1", "1", "1", "1"]);

      await page.close();
    });

    it("event feed shows event cards", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // Wait for feed cards to animate in
      await page.waitForSelector(".fcard", { timeout: 10000 });
      const cards = await page.locator(".fcard").count();
      expect(cards).toBe(3);

      await page.close();
    });

    it("bottom bar shows AI message", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const msg = await page.locator("#aiMsg").textContent();
      // After SSE connects, it shows "Connected. Monitoring markets."
      expect(msg).toBeTruthy();
      expect(msg!.length).toBeGreaterThan(0);

      await page.close();
    });

    it("has correct page title", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const title = await page.title();
      expect(title).toContain("Command Center");

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 3. Order Form Flow (Playwright)
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Order Form Flow (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
      });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/command-center`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(() => document.getElementById("tbEquity")?.textContent !== "$0", {
        timeout: 15000,
      });
      return page;
    }

    it("Place Order button opens slide-over panel", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // Click "Place Order" button
      await page.click('button:has-text("Place Order")');
      await page.waitForSelector(".slideover-backdrop.open", {
        timeout: 5000,
      });

      const isOpen = await page
        .locator(".slideover-backdrop")
        .evaluate((el) => el.classList.contains("open"));
      expect(isOpen).toBe(true);

      // Title should say "Place Order"
      const title = await page.locator("#slideTitle").textContent();
      expect(title).toBe("Place Order");

      await page.close();
    });

    it("submits order via slide-over form", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      // Clear captured requests for this test
      ccServer.capturedRequests.delete("/api/v1/finance/orders");
      const page = await openDashboard();

      // Open order slide-over
      await page.click('button:has-text("Place Order")');
      await page.waitForSelector(".slideover-backdrop.open");

      // Fill form
      await page.fill("[name=symbol]", "BTC/USDT");
      await page.fill("[name=quantity]", "0.5");
      await page.fill("[name=price]", "68000");

      // Submit
      await page.click('button:has-text("Submit Order")');

      // Wait for toast
      await page.waitForSelector(".toast.show", { timeout: 10000 });

      // Verify POST was captured
      const reqs = ccServer.capturedRequests.get("/api/v1/finance/orders") ?? [];
      expect(reqs).toHaveLength(1);
      expect(reqs[0]).toMatchObject({
        symbol: "BTC/USDT",
        side: "buy",
        quantity: 0.5,
      });

      await page.close();
    });

    it("slide-over closes after successful order", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      await page.click('button:has-text("Place Order")');
      await page.waitForSelector(".slideover-backdrop.open");

      await page.fill("[name=symbol]", "ETH/USDT");
      await page.fill("[name=quantity]", "1");

      await page.click('button:has-text("Submit Order")');
      await page.waitForSelector(".toast.show", { timeout: 10000 });

      // Slide-over should be closed
      const isOpen = await page
        .locator(".slideover-backdrop")
        .evaluate((el) => el.classList.contains("open"));
      expect(isOpen).toBe(false);

      await page.close();
    });

    it("BUY/SELL toggle switches side", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      ccServer.capturedRequests.delete("/api/v1/finance/orders");
      const page = await openDashboard();

      await page.click('button:has-text("Place Order")');
      await page.waitForSelector(".slideover-backdrop.open");

      // Click SELL toggle
      await page.click('.bs-toggle__btn:has-text("SELL")');

      // Verify SELL button is active
      const sellClass = await page
        .locator('.bs-toggle__btn:has-text("SELL")')
        .getAttribute("class");
      expect(sellClass).toContain("active-sell");

      // Submit with SELL
      await page.fill("[name=symbol]", "BTC/USDT");
      await page.fill("[name=quantity]", "0.1");
      await page.click('button:has-text("Submit Order")');
      await page.waitForSelector(".toast.show", { timeout: 10000 });

      const reqs = ccServer.capturedRequests.get("/api/v1/finance/orders") ?? [];
      expect(reqs).toHaveLength(1);
      expect((reqs[0] as Record<string, unknown>).side).toBe("sell");

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 4. Alert CRUD (Playwright)
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Alert CRUD (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
      });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/command-center`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(() => document.getElementById("tbEquity")?.textContent !== "$0", {
        timeout: 15000,
      });
      return page;
    }

    it("Set Alert opens slide-over with alert form", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      await page.click('button:has-text("Set Alert")');
      await page.waitForSelector(".slideover-backdrop.open");

      const title = await page.locator("#slideTitle").textContent();
      expect(title).toBe("Set Alert");

      // Alert form should be present
      const form = await page.locator("#alertForm").count();
      expect(form).toBe(1);

      await page.close();
    });

    it("submits alert creation", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      ccServer.capturedRequests.delete("/api/v1/finance/alerts/create");
      const page = await openDashboard();

      await page.click('button:has-text("Set Alert")');
      await page.waitForSelector(".slideover-backdrop.open");

      // Fill alert form
      await page.selectOption("[name=alertKind]", "price_above");
      await page.fill("[name=alertSymbol]", "ETH/USDT");
      await page.fill("[name=alertPrice]", "4000");

      await page.click('button:has-text("Create Alert")');
      await page.waitForSelector(".toast.show", { timeout: 10000 });

      const reqs = ccServer.capturedRequests.get("/api/v1/finance/alerts/create") ?? [];
      expect(reqs).toHaveLength(1);
      expect(reqs[0]).toMatchObject({
        kind: "price_above",
        symbol: "ETH/USDT",
        price: 4000,
      });

      await page.close();
    });

    it("alert list renders alert rows", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // Wait for alerts to be fetched and rendered
      await page.waitForSelector(".alert-row", { timeout: 10000 });
      const rows = await page.locator(".alert-row").count();
      expect(rows).toBeGreaterThanOrEqual(1);

      await page.close();
    });

    it("alert remove button sends POST", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      ccServer.capturedRequests.delete("/api/v1/finance/alerts/remove");
      const page = await openDashboard();

      // Wait for alert rows
      await page.waitForSelector(".alert-row", { timeout: 10000 });

      // Hover to reveal delete button, then click
      await page.locator(".alert-row").first().hover();
      await page.locator(".alert-row__rm").first().click();
      await page.waitForSelector(".toast.show", { timeout: 10000 });

      const reqs = ccServer.capturedRequests.get("/api/v1/finance/alerts/remove") ?? [];
      expect(reqs).toHaveLength(1);
      expect(reqs[0]).toMatchObject({ id: "ALT-1" });

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 5. Strategy Control (Playwright)
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Strategy Control (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
      });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/command-center`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(() => document.getElementById("tbEquity")?.textContent !== "$0", {
        timeout: 15000,
      });
      return page;
    }

    it("Pause button sends POST with strategy id", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      ccServer.capturedRequests.delete("/api/v1/finance/strategies/pause");
      const page = await openDashboard();

      // Click pause button on the first running strategy (⏸)
      const pauseBtn = page.locator(".race-act--pause").first();
      await pauseBtn.click();
      await page.waitForSelector(".toast.show", { timeout: 10000 });

      const reqs = ccServer.capturedRequests.get("/api/v1/finance/strategies/pause") ?? [];
      expect(reqs).toHaveLength(1);
      expect(reqs[0]).toHaveProperty("id");

      await page.close();
    });

    it("Resume button sends POST", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      ccServer.capturedRequests.delete("/api/v1/finance/strategies/resume");
      const page = await openDashboard();

      // GridSOL is paused, so it should have a resume button (▶)
      const resumeBtn = page.locator(".race-act--play").first();
      await resumeBtn.click();
      await page.waitForSelector(".toast.show", { timeout: 10000 });

      const reqs = ccServer.capturedRequests.get("/api/v1/finance/strategies/resume") ?? [];
      expect(reqs).toHaveLength(1);
      expect(reqs[0]).toHaveProperty("id");

      await page.close();
    });

    it("Kill button shows confirm dialog then sends POST", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      ccServer.capturedRequests.delete("/api/v1/finance/strategies/kill");
      const page = await openDashboard();

      // Accept the browser confirm dialog
      page.on("dialog", (dialog) => dialog.accept());

      const killBtn = page.locator(".race-act--kill").first();
      await killBtn.click();
      await page.waitForSelector(".toast.show", { timeout: 10000 });

      const reqs = ccServer.capturedRequests.get("/api/v1/finance/strategies/kill") ?? [];
      expect(reqs).toHaveLength(1);
      expect(reqs[0]).toHaveProperty("id");

      await page.close();
    });

    it("Promote button sends POST", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      ccServer.capturedRequests.delete("/api/v1/finance/strategies/promote");
      const page = await openDashboard();

      // Promote button (⬆) should exist for non-L3 strategies
      const promoteBtn = page.locator(".race-act--promote").first();
      await promoteBtn.click();
      await page.waitForSelector(".toast.show", { timeout: 10000 });

      const reqs = ccServer.capturedRequests.get("/api/v1/finance/strategies/promote") ?? [];
      expect(reqs).toHaveLength(1);
      expect(reqs[0]).toHaveProperty("id");

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 6. Event Approval (Playwright)
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Event Approval (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
      });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/command-center`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(() => document.getElementById("tbEquity")?.textContent !== "$0", {
        timeout: 15000,
      });
      return page;
    }

    it("pending event shows Approve and Reject buttons", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      await page.waitForSelector(".fcard", { timeout: 10000 });

      const approveBtn = await page.locator(".fcard__btn--approve").count();
      const rejectBtn = await page.locator(".fcard__btn--reject").count();
      expect(approveBtn).toBeGreaterThanOrEqual(1);
      expect(rejectBtn).toBeGreaterThanOrEqual(1);

      await page.close();
    });

    it("Approve sends POST with correct payload", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      ccServer.capturedRequests.delete("/api/v1/finance/events/approve");
      const page = await openDashboard();

      await page.waitForSelector(".fcard__btn--approve", { timeout: 10000 });
      await page.locator(".fcard__btn--approve").first().click();
      await page.waitForSelector(".toast.show", { timeout: 10000 });

      const reqs = ccServer.capturedRequests.get("/api/v1/finance/events/approve") ?? [];
      expect(reqs).toHaveLength(1);
      expect(reqs[0]).toMatchObject({
        id: "EVT-001",
        action: "approve",
      });

      await page.close();
    });

    it("Reject sends POST with correct payload", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      ccServer.capturedRequests.delete("/api/v1/finance/events/approve");
      const page = await openDashboard();

      await page.waitForSelector(".fcard__btn--reject", { timeout: 10000 });
      await page.locator(".fcard__btn--reject").first().click();
      await page.waitForSelector(".toast.show", { timeout: 10000 });

      const reqs = ccServer.capturedRequests.get("/api/v1/finance/events/approve") ?? [];
      expect(reqs).toHaveLength(1);
      expect(reqs[0]).toMatchObject({
        id: "EVT-001",
        action: "reject",
      });

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 7. Emergency Stop (Playwright)
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Emergency Stop (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
      });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/command-center`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(() => document.getElementById("tbEquity")?.textContent !== "$0", {
        timeout: 15000,
      });
      return page;
    }

    it("STOP button opens modal", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      await page.click("#estopBtn");
      await page.waitForSelector("#estopModal.open", { timeout: 5000 });

      const isOpen = await page
        .locator("#estopModal")
        .evaluate((el) => el.classList.contains("open"));
      expect(isOpen).toBe(true);

      await page.close();
    });

    it("Cancel closes modal without POST", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      ccServer.capturedRequests.delete("/api/v1/finance/emergency-stop");
      const page = await openDashboard();

      await page.click("#estopBtn");
      await page.waitForSelector("#estopModal.open");

      // Click Cancel
      await page.click(".modal-btn--cancel");

      // Modal should close
      const isOpen = await page
        .locator("#estopModal")
        .evaluate((el) => el.classList.contains("open"));
      expect(isOpen).toBe(false);

      // No POST should have been sent
      const reqs = ccServer.capturedRequests.get("/api/v1/finance/emergency-stop") ?? [];
      expect(reqs).toHaveLength(0);

      await page.close();
    });

    it("CONFIRM STOP sends POST and updates UI", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      ccServer.capturedRequests.delete("/api/v1/finance/emergency-stop");
      const page = await openDashboard();

      await page.click("#estopBtn");
      await page.waitForSelector("#estopModal.open");

      // Click CONFIRM STOP
      await page.click("#estopConfirm");

      // Wait for toast
      await page.waitForSelector(".toast.show", { timeout: 10000 });

      // Verify POST was sent
      const reqs = ccServer.capturedRequests.get("/api/v1/finance/emergency-stop") ?? [];
      expect(reqs).toHaveLength(1);

      // Risk halo should turn danger
      const haloClass = await page.locator("#riskHalo").getAttribute("class");
      expect(haloClass).toContain("danger");

      // Risk badge should show "STOPPED"
      const badge = await page.locator("#riskBadge").textContent();
      expect(badge).toBe("STOPPED");

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 8. Feed Filtering (Playwright)
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Feed Filtering (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
      });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/command-center`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(() => document.getElementById("tbEquity")?.textContent !== "$0", {
        timeout: 15000,
      });
      return page;
    }

    it("All chip active by default shows all events", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      await page.waitForSelector(".fcard", { timeout: 10000 });

      // "All" chip should be active
      const allChipClass = await page.locator('.fchip[data-ef="all"]').getAttribute("class");
      expect(allChipClass).toContain("active");

      // All 3 events visible
      const cards = await page.locator(".fcard").count();
      expect(cards).toBe(3);

      await page.close();
    });

    it("Pending chip filters to pending events only", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      await page.waitForSelector(".fcard", { timeout: 10000 });

      // Click Pending chip
      await page.click('.fchip[data-ef="trade_pending"]');

      // Only 1 trade_pending event
      const cards = await page.locator(".fcard").count();
      expect(cards).toBe(1);

      // Pending chip should now be active
      const chipClass = await page.locator('.fchip[data-ef="trade_pending"]').getAttribute("class");
      expect(chipClass).toContain("active");

      await page.close();
    });

    it("Trades chip filters to executed events", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      await page.waitForSelector(".fcard", { timeout: 10000 });

      await page.click('.fchip[data-ef="trade_executed"]');

      const cards = await page.locator(".fcard").count();
      expect(cards).toBe(1);

      await page.close();
    });

    it("clicking All restores all events", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      await page.waitForSelector(".fcard", { timeout: 10000 });

      // Filter first
      await page.click('.fchip[data-ef="system"]');
      let cards = await page.locator(".fcard").count();
      expect(cards).toBe(1);

      // Back to All
      await page.click('.fchip[data-ef="all"]');
      cards = await page.locator(".fcard").count();
      expect(cards).toBe(3);

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 9. SSE Real-time Updates (Playwright)
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("SSE Real-time Updates (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
      });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/command-center`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(() => document.getElementById("tbEquity")?.textContent !== "$0", {
        timeout: 15000,
      });
      return page;
    }

    it("SSE status indicator shows connected", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // Wait for SSE connection to establish and update the indicator
      await page.waitForFunction(
        () => document.getElementById("sseStatus")?.textContent === "SSE Connected",
        { timeout: 15000 },
      );

      const status = await page.locator("#sseStatus").textContent();
      expect(status).toBe("SSE Connected");

      // Dot should not have "off" class
      const dotClass = await page.locator("#sseDot").getAttribute("class");
      expect(dotClass).not.toContain("off");

      await page.close();
    });

    it("SSE trading stream updates equity", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // Wait for initial data
      await page.waitForFunction(
        () => document.getElementById("sseStatus")?.textContent === "SSE Connected",
        { timeout: 15000 },
      );

      // Push new trading data via SSE
      const newTrading = {
        ...MOCK_CC_DATA.trading,
        summary: { ...MOCK_CC_DATA.trading.summary, totalEquity: 200000 },
      };
      for (const conn of ccServer.sseConnections) {
        try {
          conn.write(`data: ${JSON.stringify(newTrading)}\n\n`);
        } catch {
          /* connection may have closed */
        }
      }

      // Wait for equity to update (fmtUsd(200000) = $200.0K)
      await page.waitForFunction(
        () => {
          const eq = document.getElementById("tbEquity")?.textContent;
          return eq && eq.includes("200");
        },
        { timeout: 15000 },
      );

      const eq = await page.locator("#tbEquity").textContent();
      expect(eq).toContain("200");

      await page.close();
    });

    it("SSE events stream adds new event card", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      await page.waitForSelector(".fcard", { timeout: 10000 });
      const initialCount = await page.locator(".fcard").count();

      // Send new event via SSE events stream
      // The events SSE handler checks for msg.type === 'new_event'
      const newEvent = {
        type: "new_event",
        event: {
          id: "EVT-NEW",
          type: "trade_executed",
          status: "resolved",
          title: "New trade from SSE",
          detail: "SSE pushed event",
          timestamp: Date.now(),
        },
        pendingCount: 1,
      };

      // Need to find which SSE connections are for events stream
      // Since we can't differentiate easily, send to all
      for (const conn of ccServer.sseConnections) {
        try {
          conn.write(`data: ${JSON.stringify(newEvent)}\n\n`);
        } catch {
          /* connection may have closed */
        }
      }

      // Wait for new card to appear
      await page.waitForFunction(
        (expected) => document.querySelectorAll(".fcard").length > expected,
        initialCount,
        { timeout: 15000 },
      );

      const newCount = await page.locator(".fcard").count();
      expect(newCount).toBeGreaterThan(initialCount);

      await page.close();
    });
  });
});

// ═══════════════════════════════════════════
// 10. Edge Cases (separate servers)
// ═══════════════════════════════════════════

describe.skipIf(!hasBrowser)("Command Center edge cases (Playwright)", () => {
  let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

  beforeAll(async () => {
    if (!chromium) {
      return;
    }
    browser = await chromium.launch({
      executablePath: browserPath,
      headless: true,
    });
  }, E2E_TIMEOUT);

  afterAll(async () => {
    await browser?.close();
  });

  function createEdgeCaseServer(mockData: Record<string, unknown>): CCServer {
    const template = readFileSync(HTML_PATH, "utf-8");
    const css = readFileSync(CSS_PATH, "utf-8");
    const capturedRequests = new Map<string, unknown[]>();
    const sseConnections: http.ServerResponse[] = [];

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
      const path = url.pathname;

      // SSE streams (minimal, just for page to not error)
      if (path === "/api/v1/finance/trading/stream" || path === "/api/v1/finance/events/stream") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        const streamData =
          path === "/api/v1/finance/trading/stream"
            ? (mockData.trading ?? {})
            : (mockData.events ?? {});
        res.write(`data: ${JSON.stringify(streamData)}\n\n`);
        sseConnections.push(res);
        req.on("close", () => {
          const idx = sseConnections.indexOf(res);
          if (idx >= 0) {
            sseConnections.splice(idx, 1);
          }
        });
        return;
      }

      if (path === "/api/v1/finance/alerts") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ alerts: mockData.alerts ?? [] }));
        return;
      }

      if (path === "/dashboard/command-center") {
        const safeJson = JSON.stringify(mockData).replace(/<\//g, "<\\/");
        const html = template
          .replace("/*__CC_CSS__*/", css)
          .replace("/*__CC_DATA__*/ {}", safeJson);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    return { server, capturedRequests, sseConnections };
  }

  async function withEdgeServer(
    mockData: Record<string, unknown>,
    fn: (baseUrl: string, srv: CCServer) => Promise<void>,
  ) {
    const port = await getFreePort();
    const ccSrv = createEdgeCaseServer(mockData);
    await new Promise<void>((resolve) => ccSrv.server.listen(port, "127.0.0.1", resolve));
    try {
      await fn(`http://127.0.0.1:${port}`, ccSrv);
    } finally {
      for (const conn of ccSrv.sseConnections) {
        try {
          conn.end();
        } catch {
          /* ignore */
        }
      }
      await new Promise<void>((resolve, reject) =>
        ccSrv.server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  }

  async function openDashboardAt(url: string) {
    const page = await browser!.newPage();
    await page.goto(`${url}/dashboard/command-center`, {
      waitUntil: "load",
      timeout: 30000,
    });
    // For edge cases, data may be zero/empty, so wait for page load + script execution
    await page.waitForFunction(
      () => {
        // Wait for script to run (clock will be updated from "--:--")
        const clock = document.getElementById("clock");
        return clock && clock.textContent !== "--:--";
      },
      { timeout: 15000 },
    );
    return page;
  }

  it("empty data shows empty state messages", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        trading: {
          summary: {
            totalEquity: 0,
            dailyPnl: 0,
            dailyPnlPct: 0,
            positionCount: 0,
            strategyCount: 0,
            avgSharpe: 0,
          },
          positions: [],
          strategies: [],
        },
        events: { events: [], pendingCount: 0 },
        alerts: [],
      },
      async (url) => {
        const page = await openDashboardAt(url);

        // Positions list should show empty state
        const posEmpty = await page.locator("#positionsList .empty").textContent();
        expect(posEmpty).toContain("No open positions");

        // Events feed should show empty state
        const feedEmpty = await page.locator("#eventFeed .empty").textContent();
        expect(feedEmpty).toContain("No events");

        // Strategy raceboard should show empty
        const stratEmpty = await page.locator("#stratEmpty").isVisible();
        expect(stratEmpty).toBe(true);

        await page.close();
      },
    );
  });

  it("XSS prevention: script tag in symbol is escaped", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        trading: {
          summary: {
            totalEquity: 100000,
            dailyPnl: 0,
            dailyPnlPct: 0,
            positionCount: 1,
            strategyCount: 1,
            avgSharpe: 0,
          },
          positions: [
            {
              symbol: "<script>alert(1)</script>",
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
              level: "L3_LIVE",
              status: "running",
              totalReturn: 0,
              sharpe: 1.0,
              totalTrades: 10,
            },
          ],
        },
        events: { events: [], pendingCount: 0 },
        alerts: [],
      },
      async (url) => {
        const page = await openDashboardAt(url);

        // Wait for positions to render
        await page.waitForSelector(".pos-row", { timeout: 10000 });

        // Script tag should be escaped in position
        const posText = await page.locator(".pos-row").first().textContent();
        expect(posText).toContain("<script>");

        // No actual script execution — check no alerts fired
        const scriptCount = await page.locator("#positionsList script").count();
        expect(scriptCount).toBe(0);

        // Strategy name should also be escaped
        await page.waitForSelector("#stratBody tr", { timeout: 10000 });
        const stratText = await page.locator("#stratBody tr").first().textContent();
        expect(stratText).toContain("<img");

        const imgCount = await page.locator("#stratBody img").count();
        expect(imgCount).toBe(0);

        await page.close();
      },
    );
  });

  it("negative PnL shows loss class", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        trading: {
          summary: {
            totalEquity: 95000,
            dailyPnl: -5000,
            dailyPnlPct: -5.0,
            positionCount: 1,
            strategyCount: 0,
            avgSharpe: 0,
          },
          positions: [
            {
              symbol: "BTC/USDT",
              side: "long",
              quantity: 1,
              avgPrice: 70000,
              currentPrice: 65000,
              unrealizedPnl: -5000,
            },
          ],
          strategies: [],
        },
        events: { events: [], pendingCount: 0 },
        alerts: [],
      },
      async (url) => {
        const page = await openDashboardAt(url);

        // Top bar change should have loss class
        const chgClass = await page.locator("#tbChange").getAttribute("class");
        expect(chgClass).toContain("loss");

        // Position PnL should have loss class
        await page.waitForSelector(".pos-row__pnl", { timeout: 10000 });
        const pnlClass = await page.locator(".pos-row__pnl").first().getAttribute("class");
        expect(pnlClass).toContain("loss");

        await page.close();
      },
    );
  });

  it("dark theme: body background is correct", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        trading: {
          summary: {
            totalEquity: 100000,
            dailyPnl: 0,
            dailyPnlPct: 0,
            positionCount: 0,
            strategyCount: 0,
            avgSharpe: 0,
          },
          positions: [],
          strategies: [],
        },
        events: { events: [], pendingCount: 0 },
        alerts: [],
      },
      async (url) => {
        const page = await openDashboardAt(url);

        const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        // --bg: #0b0d12 = rgb(11, 13, 18)
        expect(bgColor).toBe("rgb(11, 13, 18)");

        await page.close();
      },
    );
  });
});

// ═══════════════════════════════════════════
// 11. Settings Slide-over (config refactor verification)
// ═══════════════════════════════════════════

describe("fin-command-center Settings Slide-over", () => {
  let server: http.Server;
  let baseUrl: string;
  const sseConnections: http.ServerResponse[] = [];

  beforeAll(async () => {
    const template = readFileSync(HTML_PATH, "utf-8");
    const css = readFileSync(CSS_PATH, "utf-8");
    const port = await getFreePort();

    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
      const path = url.pathname;

      if (path.endsWith("/stream")) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        const data =
          path === "/api/v1/finance/trading/stream" ? MOCK_CC_DATA.trading : MOCK_CC_DATA.events;
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        sseConnections.push(res);
        req.on("close", () => {
          const idx = sseConnections.indexOf(res);
          if (idx >= 0) {
            sseConnections.splice(idx, 1);
          }
        });
        return;
      }
      if (path === "/api/v1/finance/alerts") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ alerts: MOCK_CC_DATA.alerts }));
        return;
      }
      if (path === "/dashboard/command-center") {
        const safeJson = JSON.stringify(MOCK_CC_DATA).replace(/<\//g, "<\\/");
        const html = template
          .replace("/*__CC_CSS__*/", css)
          .replace("/*__CC_DATA__*/ {}", safeJson);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      res.writeHead(404);
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    for (const c of sseConnections) {
      try {
        c.end();
      } catch {
        /* ignore */
      }
    }
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  // ── HTML structure tests (no browser needed) ──

  it("HTML contains Settings button in Quick Actions", async () => {
    const { body } = await fetchJson(`${baseUrl}/dashboard/command-center`);
    const html = body as string;
    expect(html).toContain("qa-btn--settings");
    expect(html).toContain("Settings");
    expect(html).toContain("openSlide('settings')");
  });

  it("HTML contains SettingsBridge script", async () => {
    const { body } = await fetchJson(`${baseUrl}/dashboard/command-center`);
    const html = body as string;
    expect(html).toContain("SettingsBridge");
    expect(html).toContain("fin-config-get");
    expect(html).toContain("fin-config-patch");
  });

  it("HTML contains settings form field IDs for trading config", async () => {
    const rawHtml = readFileSync(HTML_PATH, "utf-8");
    // Risk controls
    expect(rawHtml).toContain('id="s_enabled"');
    expect(rawHtml).toContain('id="s_maxAutoTradeUsd"');
    expect(rawHtml).toContain('id="s_confirmationThresholdUsd"');
    expect(rawHtml).toContain('id="s_dailyLossLimitUsd"');
    expect(rawHtml).toContain('id="s_maxPositionPct"');
    expect(rawHtml).toContain('id="s_maxLeverage"');
    // Pair filters
    expect(rawHtml).toContain('id="s_allowPairs"');
    expect(rawHtml).toContain('id="s_blockPairs"');
    // Paper trading engine
    expect(rawHtml).toContain('id="s_defaultCapital"');
    expect(rawHtml).toContain('id="s_slippageModel"');
    expect(rawHtml).toContain('id="s_constantSlippageBps"');
    expect(rawHtml).toContain('id="s_signalCheckIntervalSec"');
    // Market adapters
    expect(rawHtml).toContain('id="s_usAdapter"');
    expect(rawHtml).toContain('id="s_hkAdapter"');
    expect(rawHtml).toContain('id="s_cnAdapter"');
  });

  // ── Playwright browser interaction tests ──

  describe.skipIf(!hasBrowser)("Browser interaction (Playwright)", () => {
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
      await page.goto(`${baseUrl}/dashboard/command-center`, {
        waitUntil: "load",
        timeout: 30000,
      });
      await page.waitForFunction(() => document.getElementById("tbEquity")?.textContent !== "$0", {
        timeout: 15000,
      });
      return page;
    }

    /**
     * Inject a mock postMessage responder that simulates the host UI's
     * fin-config-get / fin-config-patch handler. Since the dashboard is
     * loaded outside an iframe in tests, window.parent === window.
     */
    async function injectMockBridge(
      page: Awaited<ReturnType<NonNullable<typeof chromium>["newPage"]>>,
      mockConfig: Record<string, Record<string, unknown>> = {},
    ) {
      await page.evaluate((cfg) => {
        const w = window as unknown as {
          __mockBridgePatches: Array<{ section: string; values: Record<string, unknown> }>;
        };
        w.__mockBridgePatches = [];
        window.addEventListener("message", (ev) => {
          const d = ev.data;
          if (!d || typeof d !== "object") {
            return;
          }
          if (d.type === "fin-config-get") {
            window.postMessage(
              {
                type: "fin-config-get-result",
                _reqId: d._reqId,
                ok: true,
                values: (cfg as Record<string, Record<string, unknown>>)[d.section] ?? {},
              },
              "*",
            );
          } else if (d.type === "fin-config-patch") {
            w.__mockBridgePatches.push({ section: d.section, values: d.values });
            window.postMessage(
              { type: "fin-config-patch-result", _reqId: d._reqId, ok: true },
              "*",
            );
          }
        });
      }, mockConfig);
    }

    it(
      "Settings button opens slide-over with 'Trading Settings' title",
      { timeout: E2E_TIMEOUT },
      async () => {
        if (!browser) {
          return;
        }
        const page = await openDashboard();

        // Inject mock bridge so loadSettings() doesn't hang
        await injectMockBridge(page);

        // Click settings button
        await page.click(".qa-btn--settings");
        await page.waitForSelector(".slideover-backdrop.open", { timeout: 5000 });

        // Title should be "Trading Settings"
        const title = await page.locator("#slideTitle").textContent();
        expect(title).toBe("Trading Settings");

        await page.close();
      },
    );

    it("settings form renders all risk control fields", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();
      await injectMockBridge(page);
      await page.click(".qa-btn--settings");
      await page.waitForSelector(".slideover-backdrop.open", { timeout: 5000 });

      // Risk Controls section
      const enabled = await page.locator("#s_enabled").count();
      expect(enabled).toBe(1);
      const maxAuto = await page.locator("#s_maxAutoTradeUsd").count();
      expect(maxAuto).toBe(1);
      const dailyLoss = await page.locator("#s_dailyLossLimitUsd").count();
      expect(dailyLoss).toBe(1);
      const maxPos = await page.locator("#s_maxPositionPct").count();
      expect(maxPos).toBe(1);
      const maxLev = await page.locator("#s_maxLeverage").count();
      expect(maxLev).toBe(1);

      // Pair Filters
      const allow = await page.locator("#s_allowPairs").count();
      expect(allow).toBe(1);
      const block = await page.locator("#s_blockPairs").count();
      expect(block).toBe(1);

      // Save button
      const saveBtn = await page.locator('#settingsForm button[type="submit"]').textContent();
      expect(saveBtn).toContain("Save");

      await page.close();
    });

    it(
      "Paper Trading Engine and Market Adapters are collapsible <details>",
      { timeout: E2E_TIMEOUT },
      async () => {
        if (!browser) {
          return;
        }
        const page = await openDashboard();
        await injectMockBridge(page);
        await page.click(".qa-btn--settings");
        await page.waitForSelector(".slideover-backdrop.open", { timeout: 5000 });

        // Two <details> elements should exist
        const detailsCount = await page.locator("#settingsForm details.settings-details").count();
        expect(detailsCount).toBe(2);

        // Paper Trading Engine details — initially closed
        const ptOpen = await page
          .locator("#settingsForm details.settings-details")
          .first()
          .evaluate((el) => (el as HTMLDetailsElement).open);
        expect(ptOpen).toBe(false);

        // Click to expand Paper Trading Engine
        await page.locator("#settingsForm details.settings-details summary").first().click();
        const ptOpenAfter = await page
          .locator("#settingsForm details.settings-details")
          .first()
          .evaluate((el) => (el as HTMLDetailsElement).open);
        expect(ptOpenAfter).toBe(true);

        // Paper Trading fields should be visible
        const capital = await page.locator("#s_defaultCapital").isVisible();
        expect(capital).toBe(true);

        await page.close();
      },
    );

    it(
      "loadSettings() populates form fields from postMessage bridge",
      { timeout: E2E_TIMEOUT },
      async () => {
        if (!browser) {
          return;
        }
        const page = await openDashboard();

        // Inject mock bridge with known config values
        await injectMockBridge(page, {
          trading: {
            enabled: true,
            maxAutoTradeUsd: 250,
            confirmationThresholdUsd: 500,
            dailyLossLimitUsd: 1000,
            maxPositionPct: 25,
            maxLeverage: 2,
            allowPairs: ["BTC/USDT", "ETH/USDT"],
            blockPairs: ["DOGE/USDT"],
          },
          paperTrading: {
            defaultCapital: 100000,
            slippageModel: "constant",
            constantSlippageBps: 5,
            signalCheckIntervalSec: 10,
          },
        });

        // Open settings — triggers CC.loadSettings()
        await page.click(".qa-btn--settings");
        await page.waitForSelector(".slideover-backdrop.open", { timeout: 5000 });

        // Wait for bridge to respond and form to be populated
        await page.waitForFunction(
          () => {
            const el = document.getElementById("s_maxAutoTradeUsd") as HTMLInputElement | null;
            return el && el.value !== "";
          },
          { timeout: 10000 },
        );

        // Verify populated values
        const maxAuto = await page.locator("#s_maxAutoTradeUsd").inputValue();
        expect(maxAuto).toBe("250");

        const dailyLoss = await page.locator("#s_dailyLossLimitUsd").inputValue();
        expect(dailyLoss).toBe("1000");

        const maxLev = await page.locator("#s_maxLeverage").inputValue();
        expect(maxLev).toBe("2");

        const enabled = await page.locator("#s_enabled").isChecked();
        expect(enabled).toBe(true);

        const allowPairs = await page.locator("#s_allowPairs").inputValue();
        expect(allowPairs).toContain("BTC/USDT");

        await page.close();
      },
    );

    it(
      "saveSettings() sends fin-config-patch via postMessage bridge",
      { timeout: E2E_TIMEOUT },
      async () => {
        if (!browser) {
          return;
        }
        const page = await openDashboard();
        await injectMockBridge(page, {
          trading: { maxAutoTradeUsd: 100 },
          paperTrading: { defaultCapital: 50000 },
        });

        await page.click(".qa-btn--settings");
        await page.waitForSelector(".slideover-backdrop.open", { timeout: 5000 });

        // Wait for form to be populated
        await page.waitForFunction(
          () => {
            const el = document.getElementById("s_maxAutoTradeUsd") as HTMLInputElement | null;
            return el && el.value !== "";
          },
          { timeout: 10000 },
        );

        // Modify a field
        await page.fill("#s_maxAutoTradeUsd", "300");
        await page.fill("#s_dailyLossLimitUsd", "2000");

        // Click Save
        await page.click('#settingsForm button[type="submit"]');

        // Wait for bridge to process
        await page.waitForFunction(
          () =>
            ((window as unknown as { __mockBridgePatches: unknown[] }).__mockBridgePatches || [])
              .length >= 2,
          { timeout: 10000 },
        );

        // Verify patches were sent
        const patches = await page.evaluate(
          () =>
            (
              window as unknown as {
                __mockBridgePatches: Array<{ section: string; values: Record<string, unknown> }>;
              }
            ).__mockBridgePatches,
        );

        // Should have patches for "trading" and "paperTrading"
        const tradingPatch = patches.find((p) => p.section === "trading");
        expect(tradingPatch).toBeDefined();
        expect(tradingPatch!.values.maxAutoTradeUsd).toBe(300);
        expect(tradingPatch!.values.dailyLossLimitUsd).toBe(2000);

        const ptPatch = patches.find((p) => p.section === "paperTrading");
        expect(ptPatch).toBeDefined();

        await page.close();
      },
    );

    it("slide-over closes after successful save", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();
      await injectMockBridge(page, { trading: {}, paperTrading: {} });

      await page.click(".qa-btn--settings");
      await page.waitForSelector(".slideover-backdrop.open", { timeout: 5000 });

      // Submit
      await page.click('#settingsForm button[type="submit"]');

      // Wait for bridge to process and panel to close
      await page.waitForFunction(
        () => !document.getElementById("slideBackdrop")?.classList.contains("open"),
        { timeout: 10000 },
      );

      const isOpen = await page
        .locator("#slideBackdrop")
        .evaluate((el) => el.classList.contains("open"));
      expect(isOpen).toBe(false);

      await page.close();
    });
  });
});
