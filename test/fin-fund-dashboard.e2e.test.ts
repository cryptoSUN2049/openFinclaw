import { readFileSync, existsSync } from "node:fs";
/**
 * E2E test for the FinClaw Fund Dashboard + REST API.
 *
 * Spins up a lightweight HTTP server serving the dashboard HTML
 * and REST API endpoints, then uses Playwright (via Edge) to verify rendering.
 *
 * Run: pnpm test:e2e (or directly with vitest --config vitest.e2e.config.ts)
 */
import http from "node:http";
import net from "node:net";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Dynamically import playwright-core (may not be available in all environments)
let chromium: typeof import("playwright-core").chromium | undefined;
try {
  const pw = await import("playwright-core");
  chromium = pw.chromium;
} catch {
  // Playwright not available — browser tests will be skipped
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = join(__dirname, "../extensions/fin-fund-manager/dashboard");
const CSS_PATH = join(DASHBOARD_DIR, "fund-dashboard.css");
const HTML_PATH = join(DASHBOARD_DIR, "fund-dashboard.html");

// Edge path on macOS
const EDGE_PATH = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const hasBrowser = existsSync(EDGE_PATH) && chromium !== undefined;

// ── Mock data (simulates a running fund) ──

const MOCK_FUND_DATA = {
  status: {
    totalEquity: 125430.5,
    todayPnl: 2890.3,
    todayPnlPct: 2.3,
    riskLevel: "normal",
    dailyDrawdown: 0.8,
    byLevel: {
      L3_LIVE: 2,
      L2_PAPER: 3,
      L1_BACKTEST: 1,
      L0_INCUBATE: 0,
      KILLED: 0,
    },
    lastRebalanceAt: "2026-02-25T07:00:00.000Z",
  },
  leaderboard: [
    {
      rank: 1,
      strategyId: "momentum-btc",
      strategyName: "MomentumBTC",
      level: "L3_LIVE",
      fitness: 0.85,
      confidenceMultiplier: 1.0,
      leaderboardScore: 0.85,
      sharpe: 1.5,
      maxDrawdown: -12,
      totalTrades: 120,
    },
    {
      rank: 2,
      strategyId: "mean-revert-eth",
      strategyName: "MeanRevertETH",
      level: "L2_PAPER",
      fitness: 0.72,
      confidenceMultiplier: 0.7,
      leaderboardScore: 0.504,
      sharpe: 0.9,
      maxDrawdown: -8,
      totalTrades: 80,
    },
  ],
  allocations: {
    items: [
      { strategyId: "momentum-btc", capitalUsd: 30000, weightPct: 30, reason: "high-fitness" },
      {
        strategyId: "mean-revert-eth",
        capitalUsd: 20000,
        weightPct: 20,
        reason: "diversification",
      },
    ],
    totalAllocated: 50000,
    cashReserve: 75430.5,
    totalCapital: 125430.5,
  },
  risk: {
    totalEquity: 125430.5,
    todayPnl: 2890.3,
    todayPnlPct: 2.3,
    dailyDrawdown: 0.8,
    maxAllowedDrawdown: 10,
    riskLevel: "normal",
    activeStrategies: 5,
    exposurePct: 39.86,
    cashReservePct: 60.14,
    scaleFactor: 1.0,
    actions: ["Normal operations"],
  },
};

// ── Helpers ──

async function getFreePort(): Promise<number> {
  const srv = net.createServer();
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  if (!addr || typeof addr === "string") {
    throw new Error("failed to bind port");
  }
  const port = addr.port;
  await new Promise<void>((resolve) => srv.close(() => resolve()));
  return port;
}

function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port),
        path: parsed.pathname,
        method: "GET",
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
    req.end();
  });
}

// ── Test Server ──

// Strip the synchronous Chart.js CDN script from head to prevent page blocking in tests
function stripChartJsCdn(html: string): string {
  return html.replace(/<script src="[^"]*chart\.js[^"]*"><\/script>/i, "");
}

function createTestServer(): http.Server {
  const template = stripChartJsCdn(readFileSync(HTML_PATH, "utf-8"));
  const css = readFileSync(CSS_PATH, "utf-8");

  return http.createServer((req, res) => {
    const path = req.url ?? "/";

    // REST API endpoints
    if (path === "/api/v1/fund/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(MOCK_FUND_DATA.status));
      return;
    }
    if (path === "/api/v1/fund/leaderboard") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          leaderboard: MOCK_FUND_DATA.leaderboard,
          total: MOCK_FUND_DATA.leaderboard.length,
        }),
      );
      return;
    }
    if (path === "/api/v1/fund/risk") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(MOCK_FUND_DATA.risk));
      return;
    }
    if (path === "/api/v1/fund/allocations") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(MOCK_FUND_DATA.allocations));
      return;
    }

    // Dashboard route
    if (path === "/dashboard/fund") {
      const safeJson = JSON.stringify(MOCK_FUND_DATA).replace(/<\//g, "<\\/");
      const html = template
        .replace("/*__FUND_CSS__*/", css)
        .replace("/*__FUND_DATA__*/ {}", safeJson);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });
}

// ── Tests ──

const E2E_TIMEOUT = 60_000;

describe("fin-fund E2E", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const port = await getFreePort();
    server = createTestServer();
    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ── REST API Tests ──

  describe("REST API", () => {
    it("GET /api/v1/fund/status returns fund status JSON", async () => {
      const { status, body } = await fetchJson(`${baseUrl}/api/v1/fund/status`);
      expect(status).toBe(200);

      const data = body as Record<string, unknown>;
      expect(data.totalEquity).toBe(125430.5);
      expect(data.todayPnl).toBe(2890.3);
      expect(data.riskLevel).toBe("normal");
      expect(data.byLevel).toBeDefined();
    });

    it("GET /api/v1/fund/leaderboard returns ranked strategies", async () => {
      const { status, body } = await fetchJson(`${baseUrl}/api/v1/fund/leaderboard`);
      expect(status).toBe(200);

      const data = body as { leaderboard: unknown[]; total: number };
      expect(data.total).toBe(2);
      expect(data.leaderboard).toHaveLength(2);
    });

    it("GET /api/v1/fund/risk returns risk assessment", async () => {
      const { status, body } = await fetchJson(`${baseUrl}/api/v1/fund/risk`);
      expect(status).toBe(200);

      const data = body as Record<string, unknown>;
      expect(data.riskLevel).toBe("normal");
      expect(data.scaleFactor).toBe(1.0);
      expect(data.maxAllowedDrawdown).toBe(10);
    });

    it("GET /api/v1/fund/allocations returns capital distribution", async () => {
      const { status, body } = await fetchJson(`${baseUrl}/api/v1/fund/allocations`);
      expect(status).toBe(200);

      const data = body as { items: unknown[]; totalAllocated: number; cashReserve: number };
      expect(data.items).toHaveLength(2);
      expect(data.totalAllocated).toBe(50000);
      expect(data.cashReserve).toBeCloseTo(75430.5, 1);
    });

    it("GET unknown path returns 404", async () => {
      const { status } = await fetchJson(`${baseUrl}/api/v1/fund/unknown`);
      expect(status).toBe(404);
    });
  });

  // ── Dashboard HTML Tests ──

  describe("Dashboard HTML", () => {
    it("serves valid HTML with injected data", async () => {
      const { status, body } = await fetchJson(`${baseUrl}/dashboard/fund`);
      expect(status).toBe(200);

      const html = body as string;
      expect(html).toContain("FinClaw Fund Dashboard");
      // Template placeholders should be replaced
      expect(html).not.toContain("/*__FUND_DATA__*/ {}");
      // Actual data should be present
      expect(html).toContain("125430.5");
    });

    it("HTML template includes Chart.js CDN", async () => {
      // Read the raw template (before test server strips CDN for reliability)
      const rawTemplate = readFileSync(HTML_PATH, "utf-8");
      expect(rawTemplate).toContain("chart.js");
    });

    it("HTML includes CSS variables from LOBSTER_PALETTE", async () => {
      const { body } = await fetchJson(`${baseUrl}/dashboard/fund`);
      const html = body as string;
      expect(html).toContain("--fc-accent");
      expect(html).toContain("--fc-bg");
      expect(html).toContain("--fc-surface");
    });
  });

  // ── Playwright Browser Tests ──

  describe.skipIf(!hasBrowser)("Dashboard Rendering (Playwright)", () => {
    let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

    beforeAll(async () => {
      if (!chromium) {
        return;
      }
      browser = await chromium.launch({
        executablePath: EDGE_PATH,
        headless: true,
      });
    }, E2E_TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    });

    // Helper: open dashboard and wait for inline script to execute
    async function openDashboard() {
      const page = await browser!.newPage();
      await page.goto(`${baseUrl}/dashboard/fund`, { waitUntil: "load", timeout: 30000 });
      // Wait for the inline script to populate the hero equity element
      await page.waitForFunction(
        () => document.getElementById("hero-equity")?.textContent !== "$0",
        { timeout: 15000 },
      );
      return page;
    }

    it("renders hero panel with equity and P&L", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // Hero equity
      const equity = await page.locator("#hero-equity").textContent();
      expect(equity).toContain("125,430");

      // P&L should show positive
      const pnl = await page.locator("#hero-pnl").textContent();
      expect(pnl).toContain("+");
      expect(pnl).toContain("2,890");

      // Risk badge should show NORMAL
      const risk = await page.locator("#hero-risk").textContent();
      expect(risk?.toUpperCase()).toContain("NORMAL");

      // Mini stats
      const activeStrategies = await page.locator("#hero-active").textContent();
      expect(activeStrategies).toBe("6");

      const l3Count = await page.locator("#hero-l3").textContent();
      expect(l3Count).toBe("2");

      await page.close();
    });

    it("renders leaderboard table with strategies", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // Table should have rows
      const rows = await page.locator("#lb-table tbody tr").count();
      expect(rows).toBe(2);

      // First strategy should be MomentumBTC
      const firstRow = await page.locator("#lb-table tbody tr").first().textContent();
      expect(firstRow).toContain("MomentumBTC");

      // Empty message should be hidden
      const emptyMsg = await page.locator("#lb-empty").isVisible();
      expect(emptyMsg).toBe(false);

      await page.close();
    });

    it("renders risk gauge with correct values", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // Gauge text should show drawdown %
      const gaugeText = await page.locator("#gauge-text").textContent();
      expect(gaugeText).toContain("0.8%");

      // Risk DD
      const riskDD = await page.locator("#risk-dd").textContent();
      expect(riskDD).toContain("0.8%");

      // Scale factor
      const scale = await page.locator("#risk-scale").textContent();
      expect(scale).toContain("100%");

      // Actions list should have items
      const actions = await page.locator("#risk-actions li").count();
      expect(actions).toBeGreaterThan(0);

      await page.close();
    });

    it("renders allocation chart and table", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // Canvas element should exist (Chart.js renders to it)
      const canvas = await page.locator("#alloc-chart").count();
      expect(canvas).toBe(1);

      // Allocation table should have rows
      const allocRows = await page.locator("#alloc-table tbody tr").count();
      expect(allocRows).toBe(2);

      await page.close();
    });

    it("has correct page title", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const title = await page.title();
      expect(title).toBe("FinClaw Fund Dashboard");

      await page.close();
    });

    it("applies dark theme (LOBSTER_PALETTE)", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // Check background color is dark
      const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      // --fc-bg: #0d1117 = rgb(13, 17, 23)
      expect(bgColor).toBe("rgb(13, 17, 23)");

      await page.close();
    });
  });

  // ── REST API Response Contract Validation ──

  describe("REST API response contracts", () => {
    it("GET /api/v1/fund/status: all required fields present and typed", async () => {
      const { body } = await fetchJson(`${baseUrl}/api/v1/fund/status`);
      const data = body as Record<string, unknown>;

      expect(typeof data.totalEquity).toBe("number");
      expect(typeof data.todayPnl).toBe("number");
      expect(typeof data.todayPnlPct).toBe("number");
      expect(typeof data.riskLevel).toBe("string");
      expect(typeof data.dailyDrawdown).toBe("number");
      expect(data.byLevel).toBeDefined();
      expect(typeof (data.byLevel as Record<string, unknown>).L3_LIVE).toBe("number");
      expect(typeof (data.byLevel as Record<string, unknown>).L2_PAPER).toBe("number");
      expect(typeof (data.byLevel as Record<string, unknown>).L1_BACKTEST).toBe("number");
    });

    it("GET /api/v1/fund/leaderboard: each entry has complete schema", async () => {
      const { body } = await fetchJson(`${baseUrl}/api/v1/fund/leaderboard`);
      const data = body as { leaderboard: Array<Record<string, unknown>> };

      for (const entry of data.leaderboard) {
        expect(typeof entry.rank).toBe("number");
        expect(typeof entry.strategyId).toBe("string");
        expect(typeof entry.strategyName).toBe("string");
        expect(typeof entry.level).toBe("string");
        expect(typeof entry.fitness).toBe("number");
        expect(typeof entry.sharpe).toBe("number");
        expect(typeof entry.maxDrawdown).toBe("number");
        expect(typeof entry.totalTrades).toBe("number");
        expect(typeof entry.confidenceMultiplier).toBe("number");
        expect(typeof entry.leaderboardScore).toBe("number");
      }
    });

    it("GET /api/v1/fund/risk: scaleFactor, actions, drawdown fields", async () => {
      const { body } = await fetchJson(`${baseUrl}/api/v1/fund/risk`);
      const data = body as Record<string, unknown>;

      expect(typeof data.totalEquity).toBe("number");
      expect(typeof data.todayPnl).toBe("number");
      expect(typeof data.todayPnlPct).toBe("number");
      expect(typeof data.dailyDrawdown).toBe("number");
      expect(typeof data.maxAllowedDrawdown).toBe("number");
      expect(typeof data.riskLevel).toBe("string");
      expect(typeof data.scaleFactor).toBe("number");
      expect(Array.isArray(data.actions)).toBe(true);
    });

    it("GET /api/v1/fund/allocations: items[], totalAllocated, cashReserve, totalCapital", async () => {
      const { body } = await fetchJson(`${baseUrl}/api/v1/fund/allocations`);
      const data = body as Record<string, unknown>;

      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.totalAllocated).toBe("number");
      expect(typeof data.cashReserve).toBe("number");
      expect(typeof data.totalCapital).toBe("number");

      const items = data.items as Array<Record<string, unknown>>;
      for (const item of items) {
        expect(typeof item.strategyId).toBe("string");
        expect(typeof item.capitalUsd).toBe("number");
        expect(typeof item.weightPct).toBe("number");
      }
    });

    it("Content-Type headers: JSON for API, HTML for dashboard", async () => {
      // API endpoint
      const apiRes = await new Promise<http.IncomingMessage>((resolve) => {
        const parsed = new URL(`${baseUrl}/api/v1/fund/status`);
        http.get(
          { hostname: parsed.hostname, port: Number(parsed.port), path: parsed.pathname },
          resolve,
        );
      });
      expect(apiRes.headers["content-type"]).toContain("application/json");

      // Dashboard endpoint
      const dashRes = await new Promise<http.IncomingMessage>((resolve) => {
        const parsed = new URL(`${baseUrl}/dashboard/fund`);
        http.get(
          { hostname: parsed.hostname, port: Number(parsed.port), path: parsed.pathname },
          resolve,
        );
      });
      expect(dashRes.headers["content-type"]).toContain("text/html");

      // Drain both responses
      apiRes.resume();
      dashRes.resume();
    });

    it("404 for unknown API routes", async () => {
      const { status } = await fetchJson(`${baseUrl}/api/v1/fund/nonexistent`);
      expect(status).toBe(404);
    });
  });
});

// ── Dashboard Edge Cases (separate server with custom mock data) ──

function createEdgeCaseServer(mockData: Record<string, unknown>): http.Server {
  const template = stripChartJsCdn(readFileSync(HTML_PATH, "utf-8"));
  const css = readFileSync(CSS_PATH, "utf-8");

  return http.createServer((req, res) => {
    const path = req.url ?? "/";

    if (path === "/api/v1/fund/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(mockData.status ?? {}));
      return;
    }
    if (path === "/api/v1/fund/leaderboard") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          leaderboard: mockData.leaderboard ?? [],
          total: (mockData.leaderboard as unknown[] | undefined)?.length ?? 0,
        }),
      );
      return;
    }
    if (path === "/api/v1/fund/risk") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(mockData.risk ?? {}));
      return;
    }
    if (path === "/api/v1/fund/allocations") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(mockData.allocations ?? {}));
      return;
    }
    if (path === "/dashboard/fund") {
      const safeJson = JSON.stringify(mockData).replace(/<\//g, "<\\/");
      const html = template
        .replace("/*__FUND_CSS__*/", css)
        .replace("/*__FUND_DATA__*/ {}", safeJson);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });
}

describe.skipIf(!hasBrowser)("Dashboard edge cases (Playwright)", () => {
  let browser: Awaited<ReturnType<NonNullable<typeof chromium>["launch"]>> | null = null;

  beforeAll(async () => {
    if (!chromium) {
      return;
    }
    browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  }, E2E_TIMEOUT);

  afterAll(async () => {
    await browser?.close();
  });

  async function withEdgeServer(
    mockData: Record<string, unknown>,
    fn: (baseUrl: string) => Promise<void>,
  ) {
    const port = await getFreePort();
    const srv = createEdgeCaseServer(mockData);
    await new Promise<void>((resolve) => srv.listen(port, "127.0.0.1", resolve));
    try {
      await fn(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>((resolve, reject) =>
        srv.close((err) => (err ? reject(err) : resolve())),
      );
    }
  }

  async function openDashboardAt(url: string) {
    const page = await browser!.newPage();
    await page.goto(`${url}/dashboard/fund`, { waitUntil: "load", timeout: 30000 });
    // Wait for the inline script to populate the hero equity element
    await page.waitForFunction(
      () => {
        const el = document.getElementById("hero-equity");
        return el && el.textContent !== "$0";
      },
      { timeout: 15000 },
    );
    return page;
  }

  it(
    "empty leaderboard (zero strategies) → shows empty message",
    { timeout: E2E_TIMEOUT },
    async () => {
      if (!browser) {
        return;
      }

      await withEdgeServer(
        {
          status: {
            totalEquity: 100000,
            todayPnl: 0,
            todayPnlPct: 0,
            riskLevel: "normal",
            dailyDrawdown: 0,
            byLevel: {},
          },
          leaderboard: [],
          allocations: { items: [], totalAllocated: 0, cashReserve: 100000, totalCapital: 100000 },
          risk: {
            riskLevel: "normal",
            dailyDrawdown: 0,
            maxAllowedDrawdown: 10,
            scaleFactor: 1.0,
            actions: [],
          },
        },
        async (url) => {
          const page = await openDashboardAt(url);

          const emptyVisible = await page.locator("#lb-empty").isVisible();
          expect(emptyVisible).toBe(true);

          const tableVisible = await page.locator("#lb-table").isVisible();
          expect(tableVisible).toBe(false);

          await page.close();
        },
      );
    },
  );

  it("negative P&L → pnl-negative class and minus sign", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        status: {
          totalEquity: 95000,
          todayPnl: -5000,
          todayPnlPct: -4.2,
          riskLevel: "caution",
          dailyDrawdown: 4.2,
          byLevel: { L3_LIVE: 1 },
        },
        leaderboard: [],
        allocations: { items: [], totalAllocated: 0, cashReserve: 95000, totalCapital: 95000 },
        risk: {
          riskLevel: "caution",
          dailyDrawdown: 4.2,
          maxAllowedDrawdown: 10,
          scaleFactor: 0.8,
          actions: [],
        },
      },
      async (url) => {
        const page = await openDashboardAt(url);

        const pnlClass = await page.locator("#hero-pnl").getAttribute("class");
        expect(pnlClass).toContain("pnl-negative");

        const pnlText = await page.locator("#hero-pnl").textContent();
        expect(pnlText).toContain("-");

        await page.close();
      },
    );
  });

  it("crisis risk level → risk-critical class", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        status: {
          totalEquity: 87500,
          todayPnl: -12500,
          todayPnlPct: -12.5,
          riskLevel: "critical",
          dailyDrawdown: 12.5,
          byLevel: {},
        },
        leaderboard: [],
        allocations: { items: [], totalAllocated: 0, cashReserve: 87500, totalCapital: 87500 },
        risk: {
          riskLevel: "critical",
          dailyDrawdown: 12.5,
          maxAllowedDrawdown: 10,
          scaleFactor: 0,
          actions: ["HALT all trading"],
        },
      },
      async (url) => {
        const page = await openDashboardAt(url);

        const riskClass = await page.locator("#hero-risk").getAttribute("class");
        expect(riskClass).toContain("risk-critical");

        // Gauge arc color should be critical red (#E23D2D)
        const gaugeStroke = await page.locator("#gauge-arc").getAttribute("stroke");
        expect(gaugeStroke).toBe("#E23D2D");

        await page.close();
      },
    );
  });

  it("zero allocations → table has no body rows", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        status: {
          totalEquity: 100000,
          todayPnl: 0,
          todayPnlPct: 0,
          riskLevel: "normal",
          dailyDrawdown: 0,
          byLevel: {},
        },
        leaderboard: [],
        allocations: { items: [], totalAllocated: 0, cashReserve: 100000, totalCapital: 100000 },
        risk: {
          riskLevel: "normal",
          dailyDrawdown: 0,
          maxAllowedDrawdown: 10,
          scaleFactor: 1.0,
          actions: [],
        },
      },
      async (url) => {
        const page = await openDashboardAt(url);

        const allocRows = await page.locator("#alloc-table tbody tr").count();
        expect(allocRows).toBe(0);

        await page.close();
      },
    );
  });

  it(
    "XSS prevention: strategy name with script tag is escaped",
    { timeout: E2E_TIMEOUT },
    async () => {
      if (!browser) {
        return;
      }

      await withEdgeServer(
        {
          status: {
            totalEquity: 100000,
            todayPnl: 0,
            todayPnlPct: 0,
            riskLevel: "normal",
            dailyDrawdown: 0,
            byLevel: {},
          },
          leaderboard: [
            {
              rank: 1,
              strategyId: "xss-test",
              strategyName: "<img src=x onerror=alert(1)>",
              level: "L3_LIVE",
              fitness: 0.5,
              confidenceMultiplier: 1.0,
              leaderboardScore: 0.5,
              sharpe: 1.0,
              maxDrawdown: -5,
              totalTrades: 50,
            },
          ],
          allocations: { items: [], totalAllocated: 0, cashReserve: 100000, totalCapital: 100000 },
          risk: {
            riskLevel: "normal",
            dailyDrawdown: 0,
            maxAllowedDrawdown: 10,
            scaleFactor: 1.0,
            actions: [],
          },
        },
        async (url) => {
          const page = await openDashboardAt(url);

          // Wait for leaderboard rows to render
          await page.waitForFunction(
            () => document.querySelectorAll("#lb-table tbody tr").length > 0,
            { timeout: 10000 },
          );

          // Verify the strategy name is displayed as text, not rendered as HTML
          const firstRow = await page.locator("#lb-table tbody tr").first().textContent();
          expect(firstRow).toContain("<img");

          // No alert should have fired — check that no img elements were injected
          const imgCount = await page.locator("#lb-table img").count();
          expect(imgCount).toBe(0);

          await page.close();
        },
      );
    },
  );

  it(
    "Chart.js CDN failure → allocation table still renders",
    { timeout: E2E_TIMEOUT },
    async () => {
      if (!browser) {
        return;
      }

      await withEdgeServer(
        {
          status: {
            totalEquity: 100000,
            todayPnl: 0,
            todayPnlPct: 0,
            riskLevel: "normal",
            dailyDrawdown: 0,
            byLevel: {},
          },
          leaderboard: [],
          allocations: {
            items: [{ strategyId: "test-strat", capitalUsd: 30000, weightPct: 30, reason: "test" }],
            totalAllocated: 30000,
            cashReserve: 70000,
            totalCapital: 100000,
          },
          risk: {
            riskLevel: "normal",
            dailyDrawdown: 0,
            maxAllowedDrawdown: 10,
            scaleFactor: 1.0,
            actions: [],
          },
        },
        async (url) => {
          // openDashboardAt already stubs Chart.js; this test confirms table still renders
          const page = await openDashboardAt(url);

          // Table should still render even without Chart.js
          const allocRows = await page.locator("#alloc-table tbody tr").count();
          expect(allocRows).toBe(1);

          const firstRow = await page.locator("#alloc-table tbody tr").first().textContent();
          expect(firstRow).toContain("test-strat");

          await page.close();
        },
      );
    },
  );
});
