/**
 * Integration test harness that boots a **real** OpenClaw Gateway with the
 * fin-core plugin loaded. Unlike the mock-server approach used by existing
 * dashboard E2E tests, this harness exercises the full pipeline:
 *
 *   startGatewayServer → loadGatewayPlugins → registerHttpRoute → gatherData → template render
 *
 * Environment isolation mirrors `src/gateway/test-helpers.server.ts` but
 * deliberately omits `OPENCLAW_TEST_MINIMAL_GATEWAY` so that bundled fin-*
 * plugins are discovered and loaded.
 *
 * **Config strategy**: The config FILE contains only gateway auth (no `plugins`
 * section) to avoid triggering plugin discovery during config validation (which
 * would fail on WIP extensions with missing entry files). Plugin enablement is
 * set via `setConfigOverride()` runtime overrides, which are applied by
 * `loadConfig()` after validation passes.
 */
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

// ── Types ──

type GatewayServer = {
  close: (opts?: { reason?: string; restartExpectedMs?: number | null }) => Promise<void>;
};

export type FinGatewayHarness = {
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
};

// ── Env capture (inline to avoid importing from src which may trigger early module init) ──

const FIN_GATEWAY_ENV_KEYS = [
  "HOME",
  "USERPROFILE",
  "OPENCLAW_STATE_DIR",
  "OPENCLAW_CONFIG_PATH",
  "OPENFINCLAW_CONFIG_PATH",
  "OPENCLAW_SKIP_BROWSER_CONTROL_SERVER",
  "OPENCLAW_SKIP_GMAIL_WATCHER",
  "OPENCLAW_SKIP_CANVAS_HOST",
  "OPENCLAW_SKIP_CHANNELS",
  "OPENCLAW_SKIP_PROVIDERS",
  "OPENCLAW_SKIP_CRON",
  "OPENCLAW_TEST_MINIMAL_GATEWAY",
  "OPENCLAW_BUNDLED_PLUGINS_DIR",
  "OPENCLAW_GATEWAY_PORT",
  "OPENCLAW_GATEWAY_TOKEN",
] as const;

function captureEnvSnapshot() {
  const snapshot = new Map<string, string | undefined>();
  for (const key of FIN_GATEWAY_ENV_KEYS) {
    snapshot.set(key, process.env[key]);
  }
  return {
    restore() {
      for (const [key, value] of snapshot) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    },
  };
}

// ── Port helper ──

export async function getFreePort(): Promise<number> {
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

// ── Harness ──

/**
 * Boot a real OpenClaw Gateway with fin-core (and other bundled fin-* plugins)
 * loaded. The gateway binds to loopback on a random free port.
 *
 * Non-essential subsystems (channels, cron, browser, gmail, canvas) are
 * disabled via SKIP env vars.
 */
export async function startFinGatewayHarness(): Promise<FinGatewayHarness> {
  // 1. Snapshot current env for restoration on close
  const envSnapshot = captureEnvSnapshot();

  // 2. Create isolated temp home + state directory
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-fin-e2e-"));
  const stateDir = path.join(tempHome, ".openfinclaw");
  await fs.mkdir(stateDir, { recursive: true });

  // 3. Write a MINIMAL config file — only gateway auth, NO `plugins` section.
  //    This avoids triggering `ensureRegistry()` in config validation, which
  //    runs plugin discovery and fails on WIP extensions with missing entry files.
  const config = {
    gateway: {
      auth: { mode: "token", token: "fin-e2e-test-token" },
    },
  };
  await fs.writeFile(path.join(stateDir, "openfinclaw.json"), JSON.stringify(config, null, 2));

  // 4. Apply env vars
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  delete process.env.OPENCLAW_CONFIG_PATH;
  delete process.env.OPENFINCLAW_CONFIG_PATH;

  // Skip non-essential subsystems
  process.env.OPENCLAW_SKIP_BROWSER_CONTROL_SERVER = "1";
  process.env.OPENCLAW_SKIP_GMAIL_WATCHER = "1";
  process.env.OPENCLAW_SKIP_CANVAS_HOST = "1";
  process.env.OPENCLAW_SKIP_CHANNELS = "1";
  process.env.OPENCLAW_SKIP_PROVIDERS = "1";
  process.env.OPENCLAW_SKIP_CRON = "1";

  // CRITICAL: do NOT set OPENCLAW_TEST_MINIMAL_GATEWAY — that skips plugin loading entirely
  delete process.env.OPENCLAW_TEST_MINIMAL_GATEWAY;
  // CRITICAL: do NOT override OPENCLAW_BUNDLED_PLUGINS_DIR — let it resolve to real extensions/
  delete process.env.OPENCLAW_BUNDLED_PLUGINS_DIR;

  // 5. Enable plugins via runtime config overrides (applied by loadConfig() AFTER
  //    config file validation). This ensures `hasExplicitPluginConfig()` returns
  //    true inside `applyTestPluginDefaults()`, preventing VITEST from disabling
  //    plugins. The config file itself stays clean (no `plugins` section) so
  //    validation never calls plugin discovery.
  const { setConfigOverride, resetConfigOverrides } =
    await import("../../src/config/runtime-overrides.js");
  setConfigOverride("plugins.enabled", true);
  setConfigOverride("plugins.entries", { "fin-core": { enabled: true } });

  // 6. Clear config cache (previous test setup may have cached the old config)
  const { clearConfigCache } = await import("../../src/config/io.js");
  clearConfigCache();

  // 7. Start real gateway (dynamic import so env is applied before module init)
  const port = await getFreePort();

  const mod = await import("../../src/gateway/server.js");
  const server: GatewayServer = await mod.startGatewayServer(port, {
    controlUiEnabled: false,
    bind: "loopback",
  });

  // 8. Verify plugin registry after startup (import from runtime.js, not loader.js)
  const { getActivePluginRegistry } = await import("../../src/plugins/runtime.js");
  const registry = getActivePluginRegistry();
  const loadedPlugins = (registry?.plugins ?? []).filter(
    (p: { status?: string }) => p.status === "loaded",
  );
  const errorPlugins = (registry?.plugins ?? []).filter(
    (p: { status?: string }) => p.status === "error",
  );
  const routeCount = registry?.httpRoutes?.length ?? 0;
  console.log(
    `[fin-gateway-harness] Gateway on :${port} — ${loadedPlugins.length} loaded, ${routeCount} routes` +
      (errorPlugins.length > 0 ? `, ${errorPlugins.length} errors` : ""),
  );
  for (const p of errorPlugins) {
    const r = p as { id: string; error?: string };
    console.log(`  [error] ${r.id}: ${r.error ?? "unknown"}`);
  }

  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    port,
    baseUrl,
    async close() {
      try {
        await server.close({ reason: "fin-e2e-test-cleanup" });
      } catch {
        // Ignore close errors during cleanup
      }
      resetConfigOverrides();
      envSnapshot.restore();
      await fs.rm(tempHome, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    },
  };
}
