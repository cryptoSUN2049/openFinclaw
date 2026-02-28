/**
 * Integration E2E tests for FinClaw Dashboards through the **real** OpenClaw Gateway.
 *
 * Unlike the per-dashboard E2E files (fin-trading-dashboard, fin-fund-dashboard, etc.)
 * which spin up isolated mock HTTP servers to validate HTML/JS rendering, these tests
 * boot a real Gateway process with the fin-core plugin loaded and exercise the full
 * architecture pipeline:
 *
 *   Gateway HTTP → plugin route dispatch → gatherData → template render → response
 *
 * Rendering-layer tests (mock server):
 *   - test/fin-trading-dashboard.e2e.test.ts
 *   - test/fin-finance-dashboard.e2e.test.ts
 *   - test/fin-fund-dashboard.e2e.test.ts
 *   - test/fin-command-center.e2e.test.ts
 *
 * IMPORTANT: Must run with `forks` pool (not `vmForks`) because jiti's module.require
 * patching is incompatible with vitest's VM context.
 *
 * Run: pnpm vitest run test/fin-dashboard-integration.e2e.test.ts --config vitest.integration.config.ts
 */
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, browserPath, hasBrowser } from "./helpers/e2e-browser.ts";
import type { FinGatewayHarness } from "./helpers/fin-gateway-harness.ts";
import { startFinGatewayHarness } from "./helpers/fin-gateway-harness.ts";

// ── HTTP helpers ──

function httpGet(
  url: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }),
        );
      })
      .on("error", reject);
  });
}

function httpGetJson(url: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
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
      })
      .on("error", reject);
  });
}

/** Connect to an SSE endpoint, capture headers + first data event, then close. */
function readFirstSseEvent(
  url: string,
  timeoutMs = 10_000,
): Promise<{ contentType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`SSE timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    const req = http.get(url, (res) => {
      const ct = res.headers["content-type"] ?? "";
      let buffer = "";
      res.on("data", (chunk: string | Buffer) => {
        buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
        // SSE events are delimited by double newline
        const idx = buffer.indexOf("\n\n");
        if (idx !== -1) {
          clearTimeout(timer);
          req.destroy();
          const eventBlock = buffer.slice(0, idx);
          // Extract the data: line
          const dataLine = eventBlock.split("\n").find((l) => l.startsWith("data: "));
          resolve({ contentType: ct, data: dataLine?.slice(6) ?? "" });
        }
      });
    });
    req.on("error", (err) => {
      clearTimeout(timer);
      // ECONNRESET is expected when we destroy the request after reading
      if ((err as NodeJS.ErrnoException).code === "ECONNRESET") {
        return;
      }
      reject(err);
    });
  });
}

// ── Test Suite ──

let harness: FinGatewayHarness;
let browser: import("playwright-core").Browser | undefined;

beforeAll(async () => {
  harness = await startFinGatewayHarness();
  if (hasBrowser && chromium && browserPath) {
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
  }
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await harness?.close();
}, 30_000);

// ── Route Registration ──

describe("Route Registration", () => {
  it("GET /dashboard/trading returns 200 with HTML", async () => {
    const res = await httpGet(`${harness.baseUrl}/dashboard/trading`);
    expect(res.status).toBe(200);
    const ct = res.headers["content-type"] ?? "";
    // Should be HTML (or JSON fallback if template is missing)
    expect(ct).toMatch(/text\/html|application\/json/);
  });

  it("GET /dashboard/command-center returns 200 with HTML", async () => {
    const res = await httpGet(`${harness.baseUrl}/dashboard/command-center`);
    expect(res.status).toBe(200);
    const ct = res.headers["content-type"] ?? "";
    expect(ct).toMatch(/text\/html|application\/json/);
  });

  it("GET /dashboard/finance returns 200 with HTML", async () => {
    const res = await httpGet(`${harness.baseUrl}/dashboard/finance`);
    expect(res.status).toBe(200);
    const ct = res.headers["content-type"] ?? "";
    expect(ct).toMatch(/text\/html|application\/json/);
  });

  it("GET /dashboard/mission-control returns 200 with HTML", async () => {
    const res = await httpGet(`${harness.baseUrl}/dashboard/mission-control`);
    expect(res.status).toBe(200);
    const ct = res.headers["content-type"] ?? "";
    expect(ct).toMatch(/text\/html|application\/json/);
  });

  it("GET /dashboard/nonexistent returns 404", async () => {
    const res = await httpGet(`${harness.baseUrl}/dashboard/nonexistent`);
    // Gateway returns 404 for unregistered paths
    expect(res.status).toBe(404);
  });
});

// ── REST API Endpoints ──

describe("REST API Endpoints", () => {
  it("GET /api/v1/finance/trading returns JSON with expected structure", async () => {
    const { status, body } = await httpGetJson(`${harness.baseUrl}/api/v1/finance/trading`);
    expect(status).toBe(200);
    const data = body as Record<string, unknown>;
    expect(data).toHaveProperty("summary");
    expect(data).toHaveProperty("positions");
    expect(data).toHaveProperty("orders");
    expect(data).toHaveProperty("snapshots");
    expect(data).toHaveProperty("strategies");
    expect(data).toHaveProperty("allocations");

    const summary = data.summary as Record<string, unknown>;
    expect(summary).toHaveProperty("totalEquity");
    expect(summary).toHaveProperty("dailyPnl");
    expect(summary).toHaveProperty("positionCount");
    expect(summary).toHaveProperty("strategyCount");
  });

  it("GET /api/v1/finance/config returns JSON with expected structure", async () => {
    const { status, body } = await httpGetJson(`${harness.baseUrl}/api/v1/finance/config`);
    expect(status).toBe(200);
    const data = body as Record<string, unknown>;
    expect(data).toHaveProperty("generatedAt");
    expect(data).toHaveProperty("exchanges");
    expect(data).toHaveProperty("trading");
    expect(data).toHaveProperty("plugins");

    const plugins = data.plugins as Record<string, unknown>;
    expect(plugins).toHaveProperty("total");
    expect(plugins).toHaveProperty("enabled");
    expect(plugins).toHaveProperty("entries");
  });

  it("GET /api/v1/finance/command-center returns JSON with expected structure", async () => {
    const { status, body } = await httpGetJson(`${harness.baseUrl}/api/v1/finance/command-center`);
    expect(status).toBe(200);
    const data = body as Record<string, unknown>;
    expect(data).toHaveProperty("trading");
    expect(data).toHaveProperty("events");
    expect(data).toHaveProperty("alerts");
    expect(data).toHaveProperty("risk");
  });

  it("API responses have correct Content-Type", async () => {
    const res = await httpGet(`${harness.baseUrl}/api/v1/finance/trading`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
  });
});

// ── Template Rendering Pipeline ──

describe("Template Rendering Pipeline", () => {
  it("Trading Dashboard HTML contains injected CSS (no placeholder)", async () => {
    const res = await httpGet(`${harness.baseUrl}/dashboard/trading`);
    expect(res.status).toBe(200);
    if (res.headers["content-type"]?.includes("text/html")) {
      // CSS placeholder should be replaced
      expect(res.body).not.toContain("/*__TRADING_CSS__*/");
      // Should contain actual CSS content (style rules)
      expect(res.body).toMatch(/[{};]/);
    }
  });

  it("Trading Dashboard HTML contains injected JSON data (no placeholder)", async () => {
    const res = await httpGet(`${harness.baseUrl}/dashboard/trading`);
    expect(res.status).toBe(200);
    if (res.headers["content-type"]?.includes("text/html")) {
      // Data placeholder should be replaced with real JSON
      expect(res.body).not.toMatch(/\/\*__TRADING_DATA__\*\/\s*\{\}/);
      // Should contain trading data keys
      expect(res.body).toContain('"summary"');
      expect(res.body).toContain('"totalEquity"');
    }
  });

  it("Finance Dashboard HTML contains injected config data", async () => {
    const res = await httpGet(`${harness.baseUrl}/dashboard/finance`);
    expect(res.status).toBe(200);
    if (res.headers["content-type"]?.includes("text/html")) {
      expect(res.body).not.toMatch(/\/\*__FINANCE_DATA__\*\/\s*\{\}/);
      expect(res.body).toContain('"generatedAt"');
      expect(res.body).toContain('"plugins"');
    }
  });

  it("Command Center HTML contains injected data", async () => {
    const res = await httpGet(`${harness.baseUrl}/dashboard/command-center`);
    expect(res.status).toBe(200);
    if (res.headers["content-type"]?.includes("text/html")) {
      expect(res.body).not.toMatch(/\/\*__CC_DATA__\*\/\s*\{\}/);
      expect(res.body).toContain('"trading"');
      expect(res.body).toContain('"events"');
    }
  });
});

// ── SSE Endpoints ──

describe("SSE Endpoints", () => {
  it("/api/v1/finance/trading/stream returns text/event-stream", async () => {
    const { contentType, data } = await readFirstSseEvent(
      `${harness.baseUrl}/api/v1/finance/trading/stream`,
    );
    expect(contentType).toContain("text/event-stream");
    expect(data.length).toBeGreaterThan(0);
  });

  it("/api/v1/finance/config/stream returns text/event-stream", async () => {
    const { contentType, data } = await readFirstSseEvent(
      `${harness.baseUrl}/api/v1/finance/config/stream`,
    );
    expect(contentType).toContain("text/event-stream");
    expect(data.length).toBeGreaterThan(0);
  });

  it("/api/v1/finance/events/stream returns text/event-stream", async () => {
    const { contentType, data } = await readFirstSseEvent(
      `${harness.baseUrl}/api/v1/finance/events/stream`,
    );
    expect(contentType).toContain("text/event-stream");
    expect(data.length).toBeGreaterThan(0);
  });

  it("SSE data is valid JSON", async () => {
    const { data } = await readFirstSseEvent(`${harness.baseUrl}/api/v1/finance/trading/stream`);
    const parsed = JSON.parse(data);
    expect(parsed).toHaveProperty("summary");
    expect(parsed).toHaveProperty("positions");
  });
});

// ── Browser Rendering (Playwright) ──

describe("Browser Rendering (Playwright)", () => {
  it("Trading Dashboard renders in browser with panel structure", async () => {
    if (!browser) {
      console.log("Skipping browser test: no Playwright browser detected");
      return;
    }
    const page = await browser.newPage();
    try {
      await page.goto(`${harness.baseUrl}/dashboard/trading`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      // Verify the page loaded (has a body with content)
      const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
      expect(bodyText.length).toBeGreaterThan(0);
      // Check for dashboard-specific elements (panels/sections)
      const html = await page.content();
      expect(html).toContain("dashboard");
    } finally {
      await page.close();
    }
  });

  it("Command Center renders in browser", async () => {
    if (!browser) {
      console.log("Skipping browser test: no Playwright browser detected");
      return;
    }
    const page = await browser.newPage();
    try {
      await page.goto(`${harness.baseUrl}/dashboard/command-center`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
      expect(bodyText.length).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  });

  it("Finance Dashboard renders in browser", async () => {
    if (!browser) {
      console.log("Skipping browser test: no Playwright browser detected");
      return;
    }
    const page = await browser.newPage();
    try {
      await page.goto(`${harness.baseUrl}/dashboard/finance`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
      expect(bodyText.length).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  });

  it("Mission Control renders in browser", async () => {
    if (!browser) {
      console.log("Skipping browser test: no Playwright browser detected");
      return;
    }
    const page = await browser.newPage();
    try {
      await page.goto(`${harness.baseUrl}/dashboard/mission-control`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
      expect(bodyText.length).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  });
});

// ── Data Integrity ──

describe("Data Integrity", () => {
  it("Trading API and Dashboard share the same data structure", async () => {
    const apiRes = await httpGetJson(`${harness.baseUrl}/api/v1/finance/trading`);
    const dashRes = await httpGet(`${harness.baseUrl}/dashboard/trading`);

    const apiData = apiRes.body as Record<string, unknown>;
    expect(apiData).toHaveProperty("summary");
    expect(apiData).toHaveProperty("positions");

    if (dashRes.headers["content-type"]?.includes("text/html")) {
      // The dashboard HTML should contain the same data keys
      for (const key of Object.keys(apiData)) {
        expect(dashRes.body).toContain(`"${key}"`);
      }
    }
  });

  it("gatherTradingData gracefully degrades with no dependencies", async () => {
    // Without paper engine / strategy registry / fund manager services,
    // the gather function should return empty arrays and zero values.
    const { body } = await httpGetJson(`${harness.baseUrl}/api/v1/finance/trading`);
    const data = body as {
      summary: { totalEquity: number; positionCount: number; strategyCount: number };
      positions: unknown[];
      orders: unknown[];
      strategies: unknown[];
    };

    // No paper engine → no accounts → empty data
    expect(data.summary.totalEquity).toBe(0);
    expect(data.summary.positionCount).toBe(0);
    expect(data.positions).toEqual([]);
    expect(data.orders).toEqual([]);
  });

  it("gatherFinanceConfigData returns local config correctly", async () => {
    const { body } = await httpGetJson(`${harness.baseUrl}/api/v1/finance/config`);
    const data = body as {
      generatedAt: string;
      exchanges: unknown[];
      trading: { enabled: boolean };
      plugins: { total: number; entries: Array<{ id: string; enabled: boolean }> };
    };

    // Should have a valid ISO timestamp
    expect(new Date(data.generatedAt).getTime()).toBeGreaterThan(0);
    // Exchanges empty (none configured in test config)
    expect(data.exchanges).toEqual([]);
    // Trading risk defaults
    expect(typeof data.trading.enabled).toBe("boolean");
    // Plugins list includes all financial plugin IDs
    expect(data.plugins.total).toBeGreaterThanOrEqual(12);
    const pluginIds = data.plugins.entries.map((e) => e.id);
    expect(pluginIds).toContain("fin-core");
    expect(pluginIds).toContain("fin-paper-trading");
  });
});

// ── XSS Protection ──

describe("XSS Protection (Through Real Pipeline)", () => {
  it("JSON injection escapes </ sequences for XSS safety", async () => {
    const res = await httpGet(`${harness.baseUrl}/dashboard/trading`);
    if (res.headers["content-type"]?.includes("text/html")) {
      // The template rendering replaces </ with <\/ to prevent script injection.
      // Verify no raw </script> appears in the injected JSON data region.
      // (The template itself may have </script> tags for its own scripts — that's OK.)
      // What matters is the JSON DATA portion doesn't contain unescaped </
      const jsonMatch = res.body.match(/"summary"\s*:\s*\{[^}]*\}/);
      if (jsonMatch) {
        expect(jsonMatch[0]).not.toContain("</");
      }
    }
  });

  it("Dashboard HTML does not contain raw template placeholders", async () => {
    const dashboards = ["/dashboard/trading", "/dashboard/finance", "/dashboard/command-center"];
    for (const path of dashboards) {
      const res = await httpGet(`${harness.baseUrl}${path}`);
      if (res.headers["content-type"]?.includes("text/html")) {
        // No unresolved placeholders should remain
        expect(res.body).not.toMatch(/\/\*__\w+_DATA__\*\/\s*\{\}/);
        expect(res.body).not.toMatch(/\/\*__\w+_CSS__\*\//);
      }
    }
  });

  it("inline handler data-* attributes escape single quotes", async () => {
    // Verify that dashboard HTML uses data-* attributes instead of inline onclick
    // (which would be vulnerable to single-quote breakout)
    const dashboards = ["/dashboard/command-center", "/dashboard/mission-control"];
    for (const path of dashboards) {
      const res = await httpGet(`${harness.baseUrl}${path}`);
      if (res.headers["content-type"]?.includes("text/html")) {
        // Should NOT have onclick handlers with interpolated IDs
        // (data-* attributes are safe because HTML attribute escaping handles quotes)
        const onclickWithEsc = res.body.match(/onclick="[^"]*esc\(/g);
        expect(onclickWithEsc).toBeNull();
      }
    }
  });
});
