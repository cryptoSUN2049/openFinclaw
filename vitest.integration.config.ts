/**
 * Vitest configuration for integration E2E tests that boot a real OpenClaw Gateway
 * with plugins loaded via jiti.
 *
 * Key difference from vitest.e2e.config.ts:
 *   pool = "forks" (not "vmForks") — jiti's `module.require` patching is incompatible
 *   with vitest's VM context where `require` is a getter-only property.
 */
import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

const base = baseConfig as unknown as Record<string, unknown>;
const baseTest = (baseConfig as { test?: { exclude?: string[] } }).test ?? {};
const exclude = (baseTest.exclude ?? []).filter((p) => p !== "**/*.e2e.test.ts");

export default defineConfig({
  ...base,
  test: {
    ...baseTest,
    pool: "forks",
    maxWorkers: 1,
    silent: process.env.OPENCLAW_E2E_VERBOSE !== "1",
    include: ["test/fin-dashboard-integration.e2e.test.ts"],
    exclude,
    testTimeout: 120_000,
  },
});
