import { cp, readFile, writeFile, access, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { resolveCommonsDir, loadCommonsIndex } from "./registry.js";
import type { CommonsEntry, CommonsEntryType, CommonsPublishResult } from "./types.js";

export type PublishOptions = {
  /** Override the entry type. Defaults to "skill". */
  type?: CommonsEntryType;
  /** Override the entry ID. Defaults to directory basename. */
  id?: string;
  /** Author name. Defaults to "local". */
  author?: string;
  /** Commons directory root (defaults to repo commons/). */
  commonsDir?: string;
};

/** Extract name and description from SKILL.md frontmatter. */
function parseSkillFrontmatter(content: string): {
  name?: string;
  description?: string;
  tags?: string[];
} {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm = match[1];
  const name = fm
    .match(/^name:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");
  const desc = fm
    .match(/^description:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");

  // Simple tag extraction from tags: [a, b, c] format
  const tagsMatch = fm.match(/^tags:\s*\[([^\]]*)\]/m);
  const tags = tagsMatch
    ? tagsMatch[1]
        .split(",")
        .map((t) => t.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
    : [];

  return { name, description: desc, tags };
}

/**
 * Publish a local skill/content to the commons registry.
 *
 * Validates that SKILL.md exists (for skill type), copies files into the
 * commons directory, and updates index.json.
 */
export async function publishToCommons(
  sourcePath: string,
  options: PublishOptions = {},
): Promise<CommonsPublishResult> {
  const commonsDir = options.commonsDir ?? resolveCommonsDir();
  const entryType = options.type ?? "skill";
  const entryId = options.id ?? basename(sourcePath);

  // Validate SKILL.md exists for skill types
  if (entryType === "skill") {
    const skillMdPath = join(sourcePath, "SKILL.md");
    try {
      await access(skillMdPath);
    } catch {
      throw new Error(`SKILL.md not found at ${skillMdPath}. Skills must contain a SKILL.md file.`);
    }
  }

  // Determine target directory within commons
  const typeDir = entryType === "workspace" ? "templates" : `${entryType}s`;
  const registryPath = join(typeDir, entryId);
  const targetPath = join(commonsDir, registryPath);

  await mkdir(targetPath, { recursive: true });
  await cp(sourcePath, targetPath, { recursive: true });

  // Build entry metadata from SKILL.md if available
  let name = entryId;
  let description = "";
  let tags: string[] = [];

  try {
    const skillMd = await readFile(join(sourcePath, "SKILL.md"), "utf-8");
    const parsed = parseSkillFrontmatter(skillMd);
    if (parsed.name) name = parsed.name;
    if (parsed.description) description = parsed.description;
    if (parsed.tags) tags = parsed.tags;
  } catch {
    // SKILL.md not required for non-skill types
  }

  const now = new Date().toISOString();
  const entry: CommonsEntry = {
    id: entryId,
    name,
    type: entryType,
    description,
    version: "1.0.0",
    author: options.author ?? "local",
    tags,
    path: registryPath,
    createdAt: now,
    updatedAt: now,
  };

  // Update index.json
  const index = await loadCommonsIndex(commonsDir).catch(() => ({
    version: 1 as const,
    entries: [] as CommonsEntry[],
  }));

  const existingIdx = index.entries.findIndex((e) => e.id === entryId);
  if (existingIdx >= 0) {
    entry.createdAt = index.entries[existingIdx].createdAt;
    index.entries[existingIdx] = entry;
  } else {
    index.entries.push(entry);
  }

  await writeFile(join(commonsDir, "index.json"), JSON.stringify(index, null, 2) + "\n", "utf-8");

  return { entry, registryPath };
}
