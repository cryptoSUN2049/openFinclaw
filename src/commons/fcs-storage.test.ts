import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import {
  resolveFcsDir,
  loadFcsConfig,
  loadFcsScores,
  saveFcsScores,
  loadFcsAuthors,
  saveFcsAuthors,
  appendFcsHistory,
  loadFcsHistory,
} from "./fcs-storage.js";
import { resolveCommonsDir } from "./registry.js";
import type { FcsScoresFile, FcsAuthorsFile, FcsHistoryRecord, FcsEntryData } from "./types.fcs.js";

let tempDir: string;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function makeTempCommonsDir(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "fcs-test-"));
  await mkdir(join(tempDir, "fcs"), { recursive: true });
  return tempDir;
}

const sampleEntry: FcsEntryData = {
  entryId: "test-entry-1",
  score: {
    total: 72,
    breakdown: { quality: 80, usage: 65, social: 70, freshness: 75 },
    calculatedAt: "2026-02-24T00:00:00Z",
    decayApplied: 0.05,
  },
  lifecycle: {
    tier: "growing",
    status: "active",
    tierHistory: [{ tier: "seedling", status: "active", changedAt: "2026-01-01T00:00:00Z" }],
  },
};

describe("resolveFcsDir", () => {
  it("resolves to commons/fcs/ under the given directory", () => {
    expect(resolveFcsDir("/tmp/my-commons")).toBe("/tmp/my-commons/fcs");
  });

  it("falls back to resolveCommonsDir when no arg given", () => {
    const result = resolveFcsDir();
    expect(result).toBe(join(resolveCommonsDir(), "fcs"));
  });
});

describe("loadFcsConfig", () => {
  it("loads and validates the real config.json", async () => {
    const config = await loadFcsConfig();
    expect(config.version).toBe(1);
    expect(config.weights.quality).toBe(0.35);
    expect(config.weights.usage).toBe(0.3);
    expect(config.weights.social).toBe(0.2);
    expect(config.weights.freshness).toBe(0.15);
    expect(config.decayHalfLifeDays).toBe(90);
    expect(config.antiGaming.maxDailyScoreChange).toBe(5);
    expect(config.lifecycle.seedlingToGrowingThreshold).toBe(30);
  });

  it("includes type overrides for strategy and connector", async () => {
    const config = await loadFcsConfig();
    expect(config.typeOverrides?.strategy?.backtestSharpeFloor).toBe(0.5);
    expect(config.typeOverrides?.connector?.uptimeFloor).toBe(95);
  });

  it("throws for missing config.json", async () => {
    await expect(loadFcsConfig("/nonexistent/path")).rejects.toThrow();
  });
});

describe("loadFcsScores / saveFcsScores", () => {
  it("returns empty structure when scores.json does not exist", async () => {
    const dir = await makeTempCommonsDir();
    const scores = await loadFcsScores(dir);
    expect(scores.version).toBe(1);
    expect(Object.keys(scores.entries)).toHaveLength(0);
  });

  it("round-trips scores through save and load", async () => {
    const dir = await makeTempCommonsDir();
    const data: FcsScoresFile = {
      version: 1,
      updatedAt: "2026-02-24T12:00:00Z",
      entries: { "test-entry-1": sampleEntry },
    };
    await saveFcsScores(data, dir);
    const loaded = await loadFcsScores(dir);
    expect(loaded.version).toBe(1);
    expect(loaded.entries["test-entry-1"].score.total).toBe(72);
    expect(loaded.entries["test-entry-1"].lifecycle.tier).toBe("growing");
  });

  it("writes pretty-printed JSON", async () => {
    const dir = await makeTempCommonsDir();
    const data: FcsScoresFile = { version: 1, updatedAt: "2026-02-24T12:00:00Z", entries: {} };
    await saveFcsScores(data, dir);
    const raw = await readFile(join(dir, "fcs", "scores.json"), "utf-8");
    expect(raw).toContain("\n");
    expect(raw.endsWith("\n")).toBe(true);
  });
});

describe("loadFcsAuthors / saveFcsAuthors", () => {
  it("returns empty structure when authors.json does not exist", async () => {
    const dir = await makeTempCommonsDir();
    const authors = await loadFcsAuthors(dir);
    expect(authors.version).toBe(1);
    expect(Object.keys(authors.authors)).toHaveLength(0);
  });

  it("round-trips authors through save and load", async () => {
    const dir = await makeTempCommonsDir();
    const data: FcsAuthorsFile = {
      version: 1,
      updatedAt: "2026-02-24T12:00:00Z",
      authors: {
        "author-1": {
          authorId: "author-1",
          totalEntries: 5,
          averageFcs: 68,
          establishedCount: 2,
          memberSince: "2025-06-01",
          verified: true,
        },
      },
    };
    await saveFcsAuthors(data, dir);
    const loaded = await loadFcsAuthors(dir);
    expect(loaded.authors["author-1"].averageFcs).toBe(68);
    expect(loaded.authors["author-1"].verified).toBe(true);
  });
});

describe("appendFcsHistory / loadFcsHistory", () => {
  const record: FcsHistoryRecord = {
    entryId: "test-entry-1",
    timestamp: "2026-02-24T10:00:00Z",
    score: {
      total: 72,
      breakdown: { quality: 80, usage: 65, social: 70, freshness: 75 },
      calculatedAt: "2026-02-24T10:00:00Z",
      decayApplied: 0.05,
    },
    tier: "growing",
    status: "active",
  };

  it("returns empty array when no history exists", async () => {
    const dir = await makeTempCommonsDir();
    const history = await loadFcsHistory(dir);
    expect(history).toEqual([]);
  });

  it("appends and loads a single record", async () => {
    const dir = await makeTempCommonsDir();
    await appendFcsHistory(record, dir);
    const history = await loadFcsHistory(dir);
    expect(history).toHaveLength(1);
    expect(history[0].entryId).toBe("test-entry-1");
    expect(history[0].score.total).toBe(72);
  });

  it("appends multiple records to the same monthly file", async () => {
    const dir = await makeTempCommonsDir();
    await appendFcsHistory(record, dir);
    const record2 = { ...record, entryId: "test-entry-2", timestamp: "2026-02-25T10:00:00Z" };
    await appendFcsHistory(record2, dir);
    const history = await loadFcsHistory(dir);
    expect(history).toHaveLength(2);
  });

  it("creates separate files for different months", async () => {
    const dir = await makeTempCommonsDir();
    await appendFcsHistory(record, dir);
    const janRecord = { ...record, timestamp: "2026-01-15T10:00:00Z" };
    await appendFcsHistory(janRecord, dir);

    // Load only 1 month — should get the most recent (Feb)
    const recent = await loadFcsHistory(dir, 1);
    expect(recent).toHaveLength(1);
    expect(recent[0].timestamp).toBe("2026-02-24T10:00:00Z");

    // Load all months — should get both
    const all = await loadFcsHistory(dir, 12);
    expect(all).toHaveLength(2);
  });

  it("writes valid JSONL (one JSON object per line)", async () => {
    const dir = await makeTempCommonsDir();
    await appendFcsHistory(record, dir);
    await appendFcsHistory({ ...record, entryId: "entry-2" }, dir);
    const raw = await readFile(join(dir, "fcs", "history", "2026-02.jsonl"), "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
