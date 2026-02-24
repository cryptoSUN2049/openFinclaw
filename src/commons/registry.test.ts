import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listEntries, loadCommonsIndex, searchEntries, findEntry } from "./registry.js";
import type { CommonsIndex } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const commonsDir = resolve(__dirname, "..", "..", "commons");

const sampleIndex: CommonsIndex = {
  version: 1,
  entries: [
    {
      id: "fin-dca-strategy",
      name: "DCA Strategy Assistant",
      type: "skill",
      description: "Dollar-cost averaging strategy",
      version: "1.0.0",
      author: "finclaw-commons",
      tags: ["finance", "investment", "dca"],
      path: "skills/fin-dca-strategy",
      createdAt: "2026-02-24T00:00:00Z",
      updatedAt: "2026-02-24T00:00:00Z",
    },
    {
      id: "fin-tax-report",
      name: "Tax Reporting Assistant",
      type: "skill",
      description: "Tax reporting from transaction history",
      version: "1.0.0",
      author: "finclaw-commons",
      tags: ["finance", "tax", "compliance"],
      path: "skills/fin-tax-report",
      createdAt: "2026-02-24T00:00:00Z",
      updatedAt: "2026-02-24T00:00:00Z",
    },
    {
      id: "finclaw-starter",
      name: "FinClaw Starter Workspace",
      type: "workspace",
      description: "Starter workspace template",
      version: "1.0.0",
      author: "finclaw-commons",
      tags: ["workspace", "template"],
      path: "templates/finclaw-starter",
      createdAt: "2026-02-24T00:00:00Z",
      updatedAt: "2026-02-24T00:00:00Z",
    },
  ],
};

describe("loadCommonsIndex", () => {
  it("loads the real commons index.json", async () => {
    const index = await loadCommonsIndex(commonsDir);
    expect(index.version).toBe(1);
    expect(index.entries.length).toBeGreaterThanOrEqual(3);
  });

  it("throws for missing index.json", async () => {
    await expect(loadCommonsIndex("/nonexistent/path")).rejects.toThrow();
  });
});

describe("listEntries", () => {
  it("returns all entries when no type filter", () => {
    const result = listEntries(sampleIndex);
    expect(result).toHaveLength(3);
  });

  it("filters by type", () => {
    const skills = listEntries(sampleIndex, "skill");
    expect(skills).toHaveLength(2);
    expect(skills.every((e) => e.type === "skill")).toBe(true);
  });

  it("returns empty for unmatched type", () => {
    const result = listEntries(sampleIndex, "connector");
    expect(result).toHaveLength(0);
  });

  it("filters workspace type", () => {
    const workspaces = listEntries(sampleIndex, "workspace");
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].id).toBe("finclaw-starter");
  });
});

describe("searchEntries", () => {
  it("matches by name", () => {
    const results = searchEntries(sampleIndex, "dca");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((e) => e.id === "fin-dca-strategy")).toBe(true);
  });

  it("matches by description", () => {
    const results = searchEntries(sampleIndex, "tax");
    expect(results.some((e) => e.id === "fin-tax-report")).toBe(true);
  });

  it("matches by tag", () => {
    const results = searchEntries(sampleIndex, "compliance");
    expect(results.some((e) => e.id === "fin-tax-report")).toBe(true);
  });

  it("matches by ID", () => {
    const results = searchEntries(sampleIndex, "fin-dca");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("fin-dca-strategy");
  });

  it("is case-insensitive", () => {
    const results = searchEntries(sampleIndex, "DCA");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty for non-matching query", () => {
    const results = searchEntries(sampleIndex, "zzz-no-match-zzz");
    expect(results).toHaveLength(0);
  });
});

describe("findEntry", () => {
  it("finds by exact ID", () => {
    const entry = findEntry(sampleIndex, "fin-dca-strategy");
    expect(entry).toBeDefined();
    expect(entry!.id).toBe("fin-dca-strategy");
  });

  it("returns undefined for missing ID", () => {
    const entry = findEntry(sampleIndex, "nonexistent");
    expect(entry).toBeUndefined();
  });
});
