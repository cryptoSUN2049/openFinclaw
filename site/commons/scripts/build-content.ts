import fs from "node:fs";
import path from "node:path";

// ── Paths ──────────────────────────────────────────────────────────────────
const SITE_ROOT = path.resolve(import.meta.dirname, "..");
const COMMONS_ROOT = path.resolve(SITE_ROOT, "../../commons");
const INDEX_PATH = path.join(COMMONS_ROOT, "index.json");
const ENTRIES_EN_DIR = path.join(SITE_ROOT, "src/content/entries/en");
const ENTRIES_ZH_DIR = path.join(SITE_ROOT, "src/content/entries/zh-CN");
const REGISTRY_PATH = path.join(SITE_ROOT, "src/data/registry.json");

// ── Types ──────────────────────────────────────────────────────────────────
interface IndexEntry {
  id: string;
  name: string;
  type: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  path: string;
  createdAt: string;
  updatedAt: string;
}

interface IndexFile {
  version: number;
  entries: IndexEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip YAML frontmatter delimited by `---` and return the body content.
 * If no frontmatter is found, return the full text as-is.
 */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (match) {
    return content.slice(match[0].length);
  }
  return content;
}

/**
 * Build YAML frontmatter from an index entry's metadata fields.
 */
function buildFrontmatter(entry: IndexEntry): string {
  const tagsYaml = entry.tags.map((t) => `  - ${t}`).join("\n");
  return [
    "---",
    `id: "${entry.id}"`,
    `name: "${entry.name}"`,
    `type: "${entry.type}"`,
    `description: "${entry.description}"`,
    `version: "${entry.version}"`,
    `author: "${entry.author}"`,
    `tags:`,
    tagsYaml,
    `path: "${entry.path}"`,
    "---",
    "",
  ].join("\n");
}

/**
 * Determine which source markdown file to read for a given entry.
 * Skills use SKILL.md; workspaces/templates use README.md.
 */
function getSourceFilename(entry: IndexEntry, locale?: string): string {
  const isSkill = entry.type === "skill";
  const base = isSkill ? "SKILL" : "README";
  if (locale) {
    return `${base}.${locale}.md`;
  }
  return `${base}.md`;
}

/**
 * Read a file and return its contents, or null if the file doesn't exist.
 */
function readFileOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  // Read index.json
  const indexRaw = fs.readFileSync(INDEX_PATH, "utf-8");
  const index: IndexFile = JSON.parse(indexRaw);

  console.log(
    `[build-content] Found ${index.entries.length} entries in index.json`
  );

  // Ensure output directories exist
  fs.mkdirSync(ENTRIES_EN_DIR, { recursive: true });
  fs.mkdirSync(ENTRIES_ZH_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });

  const registryEntries: Omit<IndexEntry, "path" | "createdAt" | "updatedAt">[] = [];

  for (const entry of index.entries) {
    const entryDir = path.join(COMMONS_ROOT, entry.path);
    const frontmatter = buildFrontmatter(entry);

    // ── English ──────────────────────────────────────────────────────────
    const enSourceFile = path.join(entryDir, getSourceFilename(entry));
    const enSource = readFileOrNull(enSourceFile);

    if (enSource === null) {
      console.warn(
        `[build-content] WARN: Missing source file ${enSourceFile} for entry "${entry.id}", skipping.`
      );
      continue;
    }

    const enBody = stripFrontmatter(enSource);
    const enOutput = frontmatter + enBody;
    const enOutPath = path.join(ENTRIES_EN_DIR, `${entry.id}.md`);
    fs.writeFileSync(enOutPath, enOutput, "utf-8");
    console.log(`  [en] ${entry.id}.md`);

    // ── zh-CN ────────────────────────────────────────────────────────────
    const zhSourceFile = path.join(
      entryDir,
      getSourceFilename(entry, "zh-CN")
    );
    const zhSource = readFileOrNull(zhSourceFile);

    let zhBody: string;
    if (zhSource !== null) {
      zhBody = stripFrontmatter(zhSource);
      console.log(`  [zh-CN] ${entry.id}.md (translated)`);
    } else {
      // Fall back to English content
      zhBody = enBody;
      console.log(`  [zh-CN] ${entry.id}.md (fallback from en)`);
    }

    const zhOutput = frontmatter + zhBody;
    const zhOutPath = path.join(ENTRIES_ZH_DIR, `${entry.id}.md`);
    fs.writeFileSync(zhOutPath, zhOutput, "utf-8");

    // ── Registry entry ───────────────────────────────────────────────────
    registryEntries.push({
      id: entry.id,
      name: entry.name,
      type: entry.type,
      description: entry.description,
      version: entry.version,
      author: entry.author,
      tags: entry.tags,
    });
  }

  // Write registry.json
  fs.writeFileSync(
    REGISTRY_PATH,
    JSON.stringify(registryEntries, null, 2) + "\n",
    "utf-8"
  );
  console.log(
    `[build-content] Wrote ${registryEntries.length} entries to registry.json`
  );

  console.log("[build-content] Done.");
}

main();
