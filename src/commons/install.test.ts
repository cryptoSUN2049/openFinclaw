import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { installCommonsEntry } from "./install.js";
import type { CommonsEntry } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const commonsDir = resolve(__dirname, "..", "..", "commons");

const skillEntry: CommonsEntry = {
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
};

const workspaceEntry: CommonsEntry = {
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
};

describe("installCommonsEntry", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "finclaw-install-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("installs a skill to the target directory", async () => {
    const result = await installCommonsEntry(skillEntry, {
      targetDir: join(tempDir, "skills"),
      commonsDir,
    });

    expect(result.entry.id).toBe("fin-dca-strategy");
    expect(result.alreadyExisted).toBe(false);

    // Verify SKILL.md was copied
    const skillMd = await readFile(join(result.installedPath, "SKILL.md"), "utf-8");
    expect(skillMd).toContain("fin-dca-strategy");
  });

  it("detects already-existing installation", async () => {
    // Install once
    await installCommonsEntry(skillEntry, {
      targetDir: join(tempDir, "skills"),
      commonsDir,
    });

    // Install again
    const result = await installCommonsEntry(skillEntry, {
      targetDir: join(tempDir, "skills"),
      commonsDir,
    });

    expect(result.alreadyExisted).toBe(true);
  });

  it("installs a workspace template to the target directory", async () => {
    const targetDir = join(tempDir, "my-workspace");
    const result = await installCommonsEntry(workspaceEntry, {
      targetDir,
      commonsDir,
    });

    expect(result.entry.id).toBe("finclaw-starter");
    expect(result.alreadyExisted).toBe(false);

    // Verify README.md was copied
    const readme = await readFile(join(result.installedPath, "README.md"), "utf-8");
    expect(readme).toContain("FinClaw");
  });

  it("throws for missing source path", async () => {
    const badEntry: CommonsEntry = {
      ...skillEntry,
      path: "skills/nonexistent-skill",
    };

    await expect(installCommonsEntry(badEntry, { targetDir: tempDir, commonsDir })).rejects.toThrow(
      "source not found",
    );
  });
});
