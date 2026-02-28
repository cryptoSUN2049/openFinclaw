/**
 * E2E test for the FinClaw Finance Dashboard — **rendering layer** (mock server).
 *
 * Spins up a lightweight HTTP server serving the finance dashboard HTML
 * with mock configuration data, SSE streams, and REST endpoints, then
 * uses Playwright to verify rendering of all 4 sections, XSS protection,
 * and SSE/polling behavior.
 *
 * This file validates the HTML/JS rendering behaviour in isolation.
 * For integration tests that exercise the full Gateway → Plugin → Route pipeline,
 * see: test/fin-dashboard-integration.e2e.test.ts
 *
 * Run: pnpm vitest run test/fin-finance-dashboard.e2e.test.ts --config vitest.e2e.config.ts
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
} from "./helpers/e2e-browser.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = join(__dirname, "../extensions/fin-core/dashboard");
const CSS_PATH = join(DASHBOARD_DIR, "finance-dashboard.css");
const HTML_PATH = join(DASHBOARD_DIR, "finance-dashboard.html");

// ── Mock data ──

const MOCK_FINANCE_DATA = {
  exchanges: [
    { id: "binance-main", exchange: "binance", testnet: false },
    { id: "bybit-test", exchange: "bybit", testnet: true },
  ],
  plugins: {
    enabled: 3,
    total: 5,
    entries: [
      { id: "fin-market-data", enabled: true },
      { id: "fin-portfolio", enabled: true },
      { id: "fin-trading", enabled: true },
      { id: "fin-expert-sdk", enabled: false },
      { id: "fin-info-feed", enabled: false },
    ],
  },
  trading: {
    enabled: true,
    maxAutoTradeUsd: 5000,
    confirmThresholdUsd: 1000,
    maxDailyLossUsd: 2500,
    maxPositionPct: 25,
    maxLeverage: 3,
  },
  generatedAt: "2026-02-28T12:00:00.000Z",
};

// ── Test Server ──

interface FinanceServer {
  server: http.Server;
  sseConnections: http.ServerResponse[];
}

function createFinanceServer(
  mockData: Record<string, unknown> = MOCK_FINANCE_DATA as unknown as Record<string, unknown>,
): FinanceServer {
  const template = readFileSync(HTML_PATH, "utf-8");
  const css = readFileSync(CSS_PATH, "utf-8");
  const sseConnections: http.ServerResponse[] = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;

    // SSE stream
    if (path === "/api/v1/finance/config/stream" && req.method === "GET") {
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
    if (path === "/api/v1/finance/config" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(mockData));
      return;
    }

    // Dashboard HTML
    if (path === "/dashboard/finance") {
      const safeJson = JSON.stringify(mockData).replace(/<\//g, "<\\/");
      const html = template
        .replace("/*__FINANCE_CSS__*/", css)
        .replace("/*__FINANCE_DATA__*/ {}", safeJson);
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

describe("fin-finance-dashboard E2E", () => {
  let financeServer: FinanceServer;
  let baseUrl: string;

  beforeAll(async () => {
    const port = await getFreePort();
    financeServer = createFinanceServer();
    await new Promise<void>((resolve) => financeServer.server.listen(port, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    for (const conn of financeServer.sseConnections) {
      try {
        conn.end();
      } catch {
        /* ignore */
      }
    }
    await new Promise<void>((resolve, reject) => {
      financeServer.server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ═══════════════════════════════════════════
  // 1. REST API / HTML serving
  // ═══════════════════════════════════════════

  describe("REST API", () => {
    it("GET /api/v1/finance/config returns full config JSON", async () => {
      const { status, body } = await fetchJson(`${baseUrl}/api/v1/finance/config`);
      expect(status).toBe(200);
      const data = body as typeof MOCK_FINANCE_DATA;
      expect(data.exchanges).toHaveLength(2);
      expect(data.plugins.enabled).toBe(3);
      expect(data.trading.enabled).toBe(true);
    });

    it("GET /dashboard/finance serves HTML with injected data", async () => {
      const { status, body } = await fetchJson(`${baseUrl}/dashboard/finance`);
      expect(status).toBe(200);
      const html = body as string;
      expect(html).toContain("Finance Dashboard");
      expect(html).not.toContain("/*__FINANCE_DATA__*/ {}");
      expect(html).toContain("binance");
    });

    it("GET unknown path returns 404", async () => {
      const { status } = await fetchJson(`${baseUrl}/api/v1/unknown`);
      expect(status).toBe(404);
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
      await page.goto(`${baseUrl}/dashboard/finance`, { waitUntil: "load", timeout: 30000 });
      // Wait for inline script to render (summary panel gets populated)
      await page.waitForFunction(
        () => {
          const summary = document.getElementById("summary");
          return summary && summary.innerHTML.includes("Exchanges");
        },
        { timeout: 15000 },
      );
      return page;
    }

    it("all 4 sections are rendered", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      expect(await page.locator("#summary").isVisible()).toBe(true);
      expect(await page.locator("#trading").isVisible()).toBe(true);
      expect(await page.locator("#exchanges").isVisible()).toBe(true);
      expect(await page.locator("#plugins").isVisible()).toBe(true);

      await page.close();
    });

    it("summary shows exchanges count and plugin counts", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const summary = await page.locator("#summary").textContent();
      expect(summary).toContain("2"); // 2 exchanges
      expect(summary).toContain("3/5"); // 3 enabled / 5 total
      expect(summary).toContain("Enabled"); // trading enabled

      await page.close();
    });

    it("page title contains 'Finance'", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();
      const title = await page.title();
      expect(title).toContain("Finance");
      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 3. Trading Section
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Trading Section (Playwright)", () => {
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
      await page.goto(`${baseUrl}/dashboard/finance`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(
        () => {
          const el = document.getElementById("trading");
          return el && el.innerHTML.includes("Auto trade limit");
        },
        { timeout: 15000 },
      );
      return page;
    }

    it(
      "renders trading risk limits (maxAutoTrade, confirmThreshold, etc.)",
      { timeout: E2E_TIMEOUT },
      async () => {
        if (!browser) {
          return;
        }
        const page = await openDashboard();

        const tradingText = await page.locator("#trading").textContent();
        expect(tradingText).toContain("Auto trade limit");
        expect(tradingText).toContain("$5,000");
        expect(tradingText).toContain("Confirm threshold");
        expect(tradingText).toContain("$1,000");
        expect(tradingText).toContain("Daily loss limit");
        expect(tradingText).toContain("$2,500");
        expect(tradingText).toContain("25%");
        expect(tradingText).toContain("3x");

        await page.close();
      },
    );
  });

  // ═══════════════════════════════════════════
  // 4. Exchanges Section
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Exchanges Section (Playwright)", () => {
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
      await page.goto(`${baseUrl}/dashboard/finance`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(
        () => {
          const el = document.getElementById("exchanges");
          return el && el.innerHTML.includes("Exchanges");
        },
        { timeout: 15000 },
      );
      return page;
    }

    it("renders exchange table with 2 rows", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const rows = await page.locator("#exchanges table tbody tr").count();
      expect(rows).toBe(2);

      const tableText = await page.locator("#exchanges table").textContent();
      expect(tableText).toContain("binance-main");
      expect(tableText).toContain("binance");
      expect(tableText).toContain("bybit-test");
      expect(tableText).toContain("bybit");

      await page.close();
    });

    it("testnet column shows yes/no correctly", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      // First row: binance-main, testnet=false → "no"
      const row1 = await page.locator("#exchanges table tbody tr").first().textContent();
      expect(row1).toContain("no");

      // Second row: bybit-test, testnet=true → "yes"
      const row2 = await page.locator("#exchanges table tbody tr").nth(1).textContent();
      expect(row2).toContain("yes");

      await page.close();
    });
  });

  // ═══════════════════════════════════════════
  // 5. Plugins Section
  // ═══════════════════════════════════════════

  describe.skipIf(!hasBrowser)("Plugins Section (Playwright)", () => {
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
      await page.goto(`${baseUrl}/dashboard/finance`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(
        () => {
          const el = document.getElementById("plugins");
          return el && el.innerHTML.includes("Plugin Matrix");
        },
        { timeout: 15000 },
      );
      return page;
    }

    it("renders plugin list with 5 entries", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }
      const page = await openDashboard();

      const items = await page.locator("#plugins .plugin-list li").count();
      expect(items).toBe(5);

      await page.close();
    });

    it(
      "enabled plugins have 'ok' class, disabled have 'off'",
      { timeout: E2E_TIMEOUT },
      async () => {
        if (!browser) {
          return;
        }
        const page = await openDashboard();

        const okCount = await page.locator("#plugins .plugin-list li.ok").count();
        expect(okCount).toBe(3);

        const offCount = await page.locator("#plugins .plugin-list li.off").count();
        expect(offCount).toBe(2);

        await page.close();
      },
    );
  });

  // ═══════════════════════════════════════════
  // 6. SSE / Polling
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

    it("SSE updates config display", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser) {
        return;
      }

      const page = await browser.newPage();
      await page.goto(`${baseUrl}/dashboard/finance`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction(
        () => {
          const el = document.getElementById("summary");
          return el && el.innerHTML.includes("Exchanges");
        },
        { timeout: 15000 },
      );

      // Push updated config via SSE (add a third exchange)
      const updatedData = {
        ...MOCK_FINANCE_DATA,
        exchanges: [
          ...MOCK_FINANCE_DATA.exchanges,
          { id: "okx-live", exchange: "okx", testnet: false },
        ],
      };
      for (const conn of financeServer.sseConnections) {
        try {
          conn.write(`data: ${JSON.stringify(updatedData)}\n\n`);
        } catch {
          /* connection may have closed */
        }
      }

      // Wait for summary to update (exchanges count → 3)
      await page.waitForFunction(
        () => {
          const el = document.getElementById("summary");
          return el && el.textContent && el.textContent.includes("3");
        },
        { timeout: 15000 },
      );

      // Verify exchanges table now has 3 rows
      const rows = await page.locator("#exchanges table tbody tr").count();
      expect(rows).toBe(3);

      await page.close();
    });

    it("SSE disconnect falls back to polling", { timeout: E2E_TIMEOUT }, async () => {
      if (!browser || !chromium) {
        return;
      }

      const pollingData = {
        ...MOCK_FINANCE_DATA,
        exchanges: [{ id: "kraken-poll", exchange: "kraken", testnet: false }],
      };

      const port = await getFreePort();
      const template = readFileSync(HTML_PATH, "utf-8");
      const css = readFileSync(CSS_PATH, "utf-8");

      const srv = http.createServer((req, res) => {
        const path = req.url ?? "/";

        if (path === "/api/v1/finance/config/stream") {
          res.writeHead(500);
          res.end();
          return;
        }
        if (path === "/api/v1/finance/config") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(pollingData));
          return;
        }
        if (path === "/dashboard/finance") {
          const safeJson = JSON.stringify(MOCK_FINANCE_DATA).replace(/<\//g, "<\\/");
          const html = template
            .replace("/*__FINANCE_CSS__*/", css)
            .replace("/*__FINANCE_DATA__*/ {}", safeJson);
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
        await page.goto(`http://127.0.0.1:${port}/dashboard/finance`, {
          waitUntil: "load",
          timeout: 30000,
        });

        // Initial render from injected data
        await page.waitForFunction(
          () => {
            const el = document.getElementById("summary");
            return el && el.innerHTML.includes("Exchanges");
          },
          { timeout: 15000 },
        );

        // After SSE fails, polling kicks in every 30s with pollingData (kraken)
        await page.waitForFunction(
          () => {
            const el = document.getElementById("exchanges");
            return el && el.textContent && el.textContent.includes("kraken");
          },
          { timeout: 40000 },
        );

        const exchangeText = await page.locator("#exchanges").textContent();
        expect(exchangeText).toContain("kraken");

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
// Edge Cases & XSS (separate servers)
// ═══════════════════════════════════════════

describe.skipIf(!hasBrowser)("Finance Dashboard edge cases (Playwright)", () => {
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

  function createEdgeCaseServer(mockData: Record<string, unknown>): FinanceServer {
    const template = readFileSync(HTML_PATH, "utf-8");
    const css = readFileSync(CSS_PATH, "utf-8");
    const sseConnections: http.ServerResponse[] = [];

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
      const path = url.pathname;

      if (path === "/api/v1/finance/config/stream") {
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

      if (path === "/dashboard/finance") {
        const safeJson = JSON.stringify(mockData).replace(/<\//g, "<\\/");
        const html = template
          .replace("/*__FINANCE_CSS__*/", css)
          .replace("/*__FINANCE_DATA__*/ {}", safeJson);
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
    await page.goto(`${url}/dashboard/finance`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(
      () => {
        const el = document.getElementById("summary");
        return el && el.innerHTML.length > 10;
      },
      { timeout: 15000 },
    );
    return page;
  }

  it("no exchanges shows empty state", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        exchanges: [],
        plugins: { enabled: 0, total: 0, entries: [] },
        trading: {
          enabled: false,
          maxAutoTradeUsd: 0,
          confirmThresholdUsd: 0,
          maxDailyLossUsd: 0,
          maxPositionPct: 0,
          maxLeverage: 1,
        },
        generatedAt: new Date().toISOString(),
      },
      async (url) => {
        const page = await openDashboardAt(url);

        const exchangeText = await page.locator("#exchanges").textContent();
        expect(exchangeText).toContain("No exchanges configured");

        await page.close();
      },
    );
  });

  it("trading disabled shows 'Disabled'", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        exchanges: [],
        plugins: { enabled: 0, total: 0, entries: [] },
        trading: {
          enabled: false,
          maxAutoTradeUsd: 0,
          confirmThresholdUsd: 0,
          maxDailyLossUsd: 0,
          maxPositionPct: 0,
          maxLeverage: 1,
        },
        generatedAt: new Date().toISOString(),
      },
      async (url) => {
        const page = await openDashboardAt(url);

        const summaryText = await page.locator("#summary").textContent();
        expect(summaryText).toContain("Disabled");

        await page.close();
      },
    );
  });

  it(
    "esc() function correctly escapes HTML special characters",
    { timeout: E2E_TIMEOUT },
    async () => {
      if (!browser) {
        return;
      }

      await withEdgeServer(
        {
          exchanges: [{ id: "test<>&\"'", exchange: "binance", testnet: false }],
          plugins: { enabled: 0, total: 1, entries: [{ id: "test-plugin", enabled: true }] },
          trading: {
            enabled: true,
            maxAutoTradeUsd: 1000,
            confirmThresholdUsd: 500,
            maxDailyLossUsd: 500,
            maxPositionPct: 10,
            maxLeverage: 1,
          },
          generatedAt: new Date().toISOString(),
        },
        async (url) => {
          const page = await openDashboardAt(url);

          // The exchange id with HTML chars should be escaped
          const exchangeHtml = await page
            .locator("#exchanges table tbody tr")
            .first()
            .textContent();
          expect(exchangeHtml).toContain("test<>&");

          // No actual HTML interpretation
          const scriptCount = await page.locator("#exchanges script").count();
          expect(scriptCount).toBe(0);

          await page.close();
        },
      );
    },
  );

  it("XSS: fund name with <img onerror> is escaped", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        exchanges: [{ id: '<img src=x onerror="alert(1)">', exchange: "xss-test", testnet: false }],
        plugins: {
          enabled: 1,
          total: 1,
          entries: [{ id: '<script>alert("xss")</script>', enabled: true }],
        },
        trading: {
          enabled: true,
          maxAutoTradeUsd: 1000,
          confirmThresholdUsd: 500,
          maxDailyLossUsd: 500,
          maxPositionPct: 10,
          maxLeverage: 1,
        },
        generatedAt: new Date().toISOString(),
      },
      async (url) => {
        const page = await openDashboardAt(url);

        // Exchange id with img tag should be text, not rendered
        const exchangeText = await page.locator("#exchanges table tbody tr").first().textContent();
        expect(exchangeText).toContain("<img");

        const imgCount = await page.locator("#exchanges img").count();
        expect(imgCount).toBe(0);

        // Plugin id with script should be text, not executed
        const pluginText = await page.locator("#plugins .plugin-list li").first().textContent();
        expect(pluginText).toContain("<script>");

        const pluginScriptCount = await page.locator("#plugins script").count();
        expect(pluginScriptCount).toBe(0);

        await page.close();
      },
    );
  });

  it("XSS: exchange name with script injection is escaped", { timeout: E2E_TIMEOUT }, async () => {
    if (!browser) {
      return;
    }

    await withEdgeServer(
      {
        exchanges: [
          {
            id: "normal-id",
            exchange: '"><script>document.cookie</script>',
            testnet: false,
          },
        ],
        plugins: { enabled: 0, total: 0, entries: [] },
        trading: {
          enabled: true,
          maxAutoTradeUsd: 1000,
          confirmThresholdUsd: 500,
          maxDailyLossUsd: 500,
          maxPositionPct: 10,
          maxLeverage: 1,
        },
        generatedAt: new Date().toISOString(),
      },
      async (url) => {
        const page = await openDashboardAt(url);

        // Exchange type with script injection should be escaped
        const row = await page.locator("#exchanges table tbody tr").first().textContent();
        expect(row).toContain("<script>");

        const scriptCount = await page.locator("#exchanges script").count();
        expect(scriptCount).toBe(0);

        await page.close();
      },
    );
  });
});
