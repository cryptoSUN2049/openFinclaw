import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { ensureFinancialPluginsEnabled } from "./configure.financial.js";

describe("ensureFinancialPluginsEnabled", () => {
  it("enables all finance plugins and preserves existing plugin configs", () => {
    const cfg: OpenClawConfig = {
      plugins: {
        allow: ["memory-core"],
        entries: {
          "fin-core": {
            enabled: false,
            config: {
              customLimit: 42,
            },
          },
          "memory-core": {
            enabled: true,
          },
        },
      },
    };

    const next = ensureFinancialPluginsEnabled(cfg);

    const entries = next.plugins?.entries as Record<
      string,
      {
        enabled?: boolean;
        config?: Record<string, unknown>;
      }
    >;
    expect(entries["fin-core"]?.enabled).toBe(true);
    expect(entries["fin-core"]?.config?.customLimit).toBe(42);
    expect(entries["fin-info-feed"]?.enabled).toBe(true);
    expect(entries["memory-core"]?.enabled).toBe(true);
    expect(next.plugins?.allow).toEqual(
      expect.arrayContaining(["memory-core", "fin-core", "fin-fund-manager", "fin-info-feed"]),
    );
  });

  it("does not create allowlist when config has no allowlist", () => {
    const cfg: OpenClawConfig = {
      plugins: {
        entries: {},
      },
    };
    const next = ensureFinancialPluginsEnabled(cfg);
    expect(next.plugins?.allow).toBeUndefined();
    expect(next.plugins?.entries?.["fin-monitoring"]?.enabled).toBe(true);
  });
});
