/**
 * FCS (FinClaw Commons Score) storage layer.
 *
 * Handles reading/writing FCS data to the filesystem:
 *   commons/fcs/scores.json   — current scores by entryId
 *   commons/fcs/config.json   — scoring weights & thresholds
 *   commons/fcs/authors.json  — author reputation data
 *   commons/fcs/history/      — monthly JSONL append-only logs
 */

import { mkdir, readFile, writeFile, appendFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveCommonsDir } from "./registry.js";
import type { FcsConfig, FcsScoresFile, FcsAuthorsFile, FcsHistoryRecord } from "./types.fcs.js";
import {
  FcsConfigSchema,
  FcsScoresFileSchema,
  FcsAuthorsFileSchema,
  FcsHistoryRecordSchema,
} from "./zod-schema.fcs.js";

/** Resolve the FCS data directory inside commons/. */
export function resolveFcsDir(commonsDir?: string): string {
  const base = commonsDir ?? resolveCommonsDir();
  return join(base, "fcs");
}

/** Load and validate the FCS configuration from config.json. */
export async function loadFcsConfig(commonsDir?: string): Promise<FcsConfig> {
  const fcsDir = resolveFcsDir(commonsDir);
  const raw = await readFile(join(fcsDir, "config.json"), "utf-8");
  return FcsConfigSchema.parse(JSON.parse(raw));
}

/** Load current FCS scores. Returns an empty file structure if scores.json does not exist. */
export async function loadFcsScores(commonsDir?: string): Promise<FcsScoresFile> {
  const fcsDir = resolveFcsDir(commonsDir);
  try {
    const raw = await readFile(join(fcsDir, "scores.json"), "utf-8");
    return FcsScoresFileSchema.parse(JSON.parse(raw));
  } catch (err: unknown) {
    if (isFileNotFoundError(err)) {
      return { version: 1, updatedAt: new Date().toISOString(), entries: {} };
    }
    throw err;
  }
}

/** Write FCS scores to scores.json. */
export async function saveFcsScores(scores: FcsScoresFile, commonsDir?: string): Promise<void> {
  const fcsDir = resolveFcsDir(commonsDir);
  await mkdir(fcsDir, { recursive: true });
  await writeFile(join(fcsDir, "scores.json"), JSON.stringify(scores, null, 2) + "\n", "utf-8");
}

/** Load author reputation data. Returns an empty file structure if authors.json does not exist. */
export async function loadFcsAuthors(commonsDir?: string): Promise<FcsAuthorsFile> {
  const fcsDir = resolveFcsDir(commonsDir);
  try {
    const raw = await readFile(join(fcsDir, "authors.json"), "utf-8");
    return FcsAuthorsFileSchema.parse(JSON.parse(raw));
  } catch (err: unknown) {
    if (isFileNotFoundError(err)) {
      return { version: 1, updatedAt: new Date().toISOString(), authors: {} };
    }
    throw err;
  }
}

/** Write author reputation data to authors.json. */
export async function saveFcsAuthors(authors: FcsAuthorsFile, commonsDir?: string): Promise<void> {
  const fcsDir = resolveFcsDir(commonsDir);
  await mkdir(fcsDir, { recursive: true });
  await writeFile(join(fcsDir, "authors.json"), JSON.stringify(authors, null, 2) + "\n", "utf-8");
}

/** Append a scoring record to the monthly JSONL history file. */
export async function appendFcsHistory(
  record: FcsHistoryRecord,
  commonsDir?: string,
): Promise<void> {
  const fcsDir = resolveFcsDir(commonsDir);
  const historyDir = join(fcsDir, "history");
  await mkdir(historyDir, { recursive: true });

  const date = new Date(record.timestamp);
  const filename = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}.jsonl`;
  await appendFile(join(historyDir, filename), JSON.stringify(record) + "\n", "utf-8");
}

/** Load recent months of scoring history from JSONL files. Defaults to 3 months. */
export async function loadFcsHistory(commonsDir?: string, months = 3): Promise<FcsHistoryRecord[]> {
  const fcsDir = resolveFcsDir(commonsDir);
  const historyDir = join(fcsDir, "history");

  let files: string[];
  try {
    files = await readdir(historyDir);
  } catch (err: unknown) {
    if (isFileNotFoundError(err)) {
      return [];
    }
    throw err;
  }

  // Filter to .jsonl, sort descending, take the most recent N months
  const jsonlFiles = files
    .filter((f) => f.endsWith(".jsonl"))
    .toSorted()
    .toReversed()
    .slice(0, months);

  const records: FcsHistoryRecord[] = [];
  for (const file of jsonlFiles) {
    const raw = await readFile(join(historyDir, file), "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      records.push(FcsHistoryRecordSchema.parse(JSON.parse(trimmed)));
    }
  }

  return records;
}

function isFileNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
