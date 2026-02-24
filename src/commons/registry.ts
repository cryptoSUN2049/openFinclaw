import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CommonsEntryWithFcs } from "./types.fcs.js";
import type { CommonsEntry, CommonsEntryType, CommonsIndex } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolve the commons directory at the repository root. */
export function resolveCommonsDir(): string {
  // src/commons/registry.ts → repo root
  return resolve(__dirname, "..", "..", "commons");
}

/** Load and parse the commons index.json registry manifest. */
export async function loadCommonsIndex(commonsDir?: string): Promise<CommonsIndex> {
  const dir = commonsDir ?? resolveCommonsDir();
  const indexPath = join(dir, "index.json");
  const raw = await readFile(indexPath, "utf-8");
  const parsed = JSON.parse(raw) as CommonsIndex;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported commons index version: ${String(parsed.version)}`);
  }
  return parsed;
}

/** List entries, optionally filtered by type. */
export function listEntries(index: CommonsIndex, type?: CommonsEntryType): CommonsEntry[] {
  if (!type) {
    return index.entries;
  }
  return index.entries.filter((e) => e.type === type);
}

/** Search entries by fuzzy matching on name, description, and tags. */
export function searchEntries(index: CommonsIndex, query: string): CommonsEntry[] {
  const q = query.toLowerCase();
  return index.entries.filter((entry) => {
    if (entry.name.toLowerCase().includes(q)) {
      return true;
    }
    if (entry.id.toLowerCase().includes(q)) {
      return true;
    }
    if (entry.description.toLowerCase().includes(q)) {
      return true;
    }
    if (entry.tags.some((tag) => tag.toLowerCase().includes(q))) {
      return true;
    }
    return false;
  });
}

/** Find a single entry by exact ID. */
export function findEntry(index: CommonsIndex, id: string): CommonsEntry | undefined {
  return index.entries.find((e) => e.id === id);
}

/** Load commons index merged with FCS scoring data. */
export async function loadCommonsIndexWithFcs(commonsDir?: string): Promise<CommonsEntryWithFcs[]> {
  const index = await loadCommonsIndex(commonsDir);
  const { loadFcsScores } = await import("./fcs-storage.js");
  const scores = await loadFcsScores(commonsDir);
  return index.entries.map((entry) => ({
    ...entry,
    fcs: scores.entries[entry.id],
  }));
}
