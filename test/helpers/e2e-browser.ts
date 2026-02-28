/**
 * Shared E2E helpers for Playwright-based dashboard tests.
 *
 * Provides browser detection, free port allocation, HTTP helpers,
 * and Chart.js CDN stripping for offline test environments.
 */
import { existsSync, readdirSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Playwright (optional) ──

let chromium: typeof import("playwright-core").chromium | undefined;
try {
  const pw = await import("playwright-core");
  chromium = pw.chromium;
} catch {
  // Playwright not available — browser tests will be skipped
}

/**
 * Detect a usable Chromium-family browser for Playwright.
 * Vitest may override HOME to a temp dir, so we use the real homedir() and
 * check known Playwright cache + system browser locations.
 */
function findBrowserPath(): string | undefined {
  const home = homedir();

  // 1. Playwright bundled Chromium (macOS cache location)
  const pwCache = join(home, "Library/Caches/ms-playwright");
  if (existsSync(pwCache)) {
    try {
      const dirs = readdirSync(pwCache)
        .filter((d) => d.startsWith("chromium-"))
        .toSorted()
        .toReversed();
      for (const dir of dirs) {
        const candidates = [
          join(
            pwCache,
            dir,
            "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
          ),
          join(
            pwCache,
            dir,
            "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
          ),
          join(pwCache, dir, "chrome-linux/chrome"),
        ];
        for (const c of candidates) {
          if (existsSync(c)) {
            return c;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Playwright bundled Chromium (Linux/XDG cache location)
  const xdgCache = join(home, ".cache/ms-playwright");
  if (existsSync(xdgCache)) {
    try {
      const dirs = readdirSync(xdgCache)
        .filter((d) => d.startsWith("chromium-"))
        .toSorted()
        .toReversed();
      for (const dir of dirs) {
        const c = join(xdgCache, dir, "chrome-linux/chrome");
        if (existsSync(c)) {
          return c;
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. System browsers (macOS)
  const systemBrowsers = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const b of systemBrowsers) {
    if (existsSync(b)) {
      return b;
    }
  }

  return undefined;
}

const browserPath = findBrowserPath();
const hasBrowser = chromium !== undefined && browserPath !== undefined;

// ── Network helpers ──

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

/** Strip the synchronous Chart.js CDN script from head to prevent page blocking in tests */
function stripChartJsCdn(html: string): string {
  return html.replace(/<script src="[^"]*chart\.js[^"]*"><\/script>/i, "");
}

export {
  chromium,
  browserPath,
  hasBrowser,
  findBrowserPath,
  getFreePort,
  fetchJson,
  stripChartJsCdn,
};
