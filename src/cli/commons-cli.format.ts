import type { CommonsEntry } from "../commons/types.js";
import { renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";

export type CommonsListOptions = {
  json?: boolean;
  type?: string;
};

export type CommonsSearchOptions = {
  json?: boolean;
};

export type CommonsInfoOptions = {
  json?: boolean;
};

export type CommonsInstallDisplayOptions = {
  alreadyExisted: boolean;
  installedPath: string;
};

const TYPE_EMOJI: Record<string, string> = {
  skill: "🛠",
  strategy: "📊",
  connector: "🔌",
  persona: "🎭",
  workspace: "📁",
  "knowledge-pack": "📚",
  "compliance-ruleset": "📋",
};

function entryEmoji(type: string): string {
  return TYPE_EMOJI[type] ?? "📦";
}

export function formatCommonsList(entries: CommonsEntry[], opts: CommonsListOptions): string {
  if (opts.json) {
    return JSON.stringify(entries, null, 2);
  }

  if (entries.length === 0) {
    const suffix = opts.type ? ` of type "${opts.type}"` : "";
    return `No commons entries found${suffix}.`;
  }

  const tableWidth = Math.max(60, (process.stdout.columns ?? 120) - 1);
  const rows = entries.map((entry) => ({
    Type: `${entryEmoji(entry.type)} ${entry.type}`,
    ID: theme.command(entry.id),
    Name: entry.name,
    Description: theme.muted(entry.description),
    Version: entry.version,
  }));

  const columns = [
    { key: "Type", header: "Type", minWidth: 12 },
    { key: "ID", header: "ID", minWidth: 16 },
    { key: "Name", header: "Name", minWidth: 14, flex: true },
    { key: "Description", header: "Description", minWidth: 20, flex: true },
    { key: "Version", header: "Ver", minWidth: 6 },
  ];

  const lines: string[] = [];
  lines.push(`${theme.heading("FinClaw Commons")} ${theme.muted(`(${entries.length} entries)`)}`);
  lines.push(renderTable({ width: tableWidth, columns, rows }).trimEnd());

  return lines.join("\n");
}

export function formatCommonsSearch(
  entries: CommonsEntry[],
  query: string,
  opts: CommonsSearchOptions,
): string {
  if (opts.json) {
    return JSON.stringify({ query, results: entries }, null, 2);
  }

  if (entries.length === 0) {
    return `No results for "${query}".`;
  }

  const tableWidth = Math.max(60, (process.stdout.columns ?? 120) - 1);
  const rows = entries.map((entry) => ({
    Type: `${entryEmoji(entry.type)} ${entry.type}`,
    ID: theme.command(entry.id),
    Description: theme.muted(entry.description),
    Tags: theme.muted(entry.tags.join(", ")),
  }));

  const columns = [
    { key: "Type", header: "Type", minWidth: 12 },
    { key: "ID", header: "ID", minWidth: 16, flex: true },
    { key: "Description", header: "Description", minWidth: 20, flex: true },
    { key: "Tags", header: "Tags", minWidth: 14 },
  ];

  const lines: string[] = [];
  lines.push(
    `${theme.heading("Search results")} ${theme.muted(`for "${query}" (${entries.length} matches)`)}`,
  );
  lines.push(renderTable({ width: tableWidth, columns, rows }).trimEnd());

  return lines.join("\n");
}

export function formatCommonsInfo(entry: CommonsEntry, opts: CommonsInfoOptions): string {
  if (opts.json) {
    return JSON.stringify(entry, null, 2);
  }

  const lines: string[] = [];
  lines.push(`${entryEmoji(entry.type)} ${theme.heading(entry.name)}`);
  lines.push("");
  lines.push(entry.description);
  lines.push("");
  lines.push(theme.heading("Details:"));
  lines.push(`${theme.muted("  ID:")} ${entry.id}`);
  lines.push(`${theme.muted("  Type:")} ${entry.type}`);
  lines.push(`${theme.muted("  Version:")} ${entry.version}`);
  lines.push(`${theme.muted("  Author:")} ${entry.author}`);
  lines.push(`${theme.muted("  Path:")} ${entry.path}`);
  if (entry.tags.length > 0) {
    lines.push(`${theme.muted("  Tags:")} ${entry.tags.join(", ")}`);
  }
  lines.push(`${theme.muted("  Created:")} ${entry.createdAt}`);
  lines.push(`${theme.muted("  Updated:")} ${entry.updatedAt}`);

  return lines.join("\n");
}

export function formatInstallSuccess(
  entry: CommonsEntry,
  display: CommonsInstallDisplayOptions,
): string {
  const emoji = entryEmoji(entry.type);
  const status = display.alreadyExisted
    ? theme.warn("(updated existing)")
    : theme.success("(newly installed)");

  const lines: string[] = [];
  lines.push(`${emoji} ${theme.success("Installed")} ${theme.command(entry.id)} ${status}`);
  lines.push(`${theme.muted("  Path:")} ${display.installedPath}`);

  if (entry.type === "skill") {
    lines.push("");
    lines.push(
      `${theme.muted("The skill is now available. Run")} ${theme.command("openclaw skills list")} ${theme.muted("to verify.")}`,
    );
  }

  return lines.join("\n");
}

export function formatPublishSuccess(entryId: string, registryPath: string): string {
  const lines: string[] = [];
  lines.push(
    `${theme.success("Published")} ${theme.command(entryId)} ${theme.muted("to commons")}`,
  );
  lines.push(`${theme.muted("  Registry path:")} ${registryPath}`);

  return lines.join("\n");
}
