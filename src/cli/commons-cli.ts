import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import {
  formatCommonsList,
  formatCommonsSearch,
  formatCommonsInfo,
  formatInstallSuccess,
  formatPublishSuccess,
} from "./commons-cli.format.js";

export type {
  CommonsListOptions,
  CommonsSearchOptions,
  CommonsInfoOptions,
} from "./commons-cli.format.js";
export {
  formatCommonsList,
  formatCommonsSearch,
  formatCommonsInfo,
  formatInstallSuccess,
  formatPublishSuccess,
} from "./commons-cli.format.js";

export function registerCommonsCli(program: Command) {
  const commons = program
    .command("commons")
    .description("FinClaw Commons - browse and install financial skills and templates")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/commons", "docs.openclaw.ai/cli/commons")}\n`,
    );

  commons
    .command("list")
    .description("List all available commons entries")
    .option("--json", "Output as JSON", false)
    .option("--type <type>", "Filter by entry type (skill, strategy, workspace, etc.)")
    .option("--sort <field>", "Sort by field (fcs)")
    .option("--tier <tier>", "Filter by lifecycle tier (seedling, growing, established)")
    .action(async (opts) => {
      try {
        if (opts.sort === "fcs" || opts.tier) {
          // Use FCS-aware listing
          const { loadCommonsIndexWithFcs } = await import("../commons/registry.js");
          const { formatFcsCompact } = await import("./commons-cli.fcs.format.js");
          const { renderTable } = await import("../terminal/table.js");
          let entries = await loadCommonsIndexWithFcs();

          if (opts.type) {
            entries = entries.filter((e) => e.type === opts.type);
          }
          if (opts.tier) {
            entries = entries.filter((e) => (e.fcs?.lifecycle?.tier ?? "seedling") === opts.tier);
          }
          if (opts.sort === "fcs") {
            entries.sort((a, b) => (b.fcs?.score?.total ?? 0) - (a.fcs?.score?.total ?? 0));
          }

          if (opts.json) {
            defaultRuntime.log(JSON.stringify(entries, null, 2));
            return;
          }

          if (entries.length === 0) {
            defaultRuntime.log("No commons entries found.");
            return;
          }

          const tableWidth = Math.max(60, (process.stdout.columns ?? 120) - 1);
          const rows = entries.map((entry) => ({
            Type: entry.type,
            ID: theme.command(entry.id),
            Name: entry.name,
            FCS: formatFcsCompact(entry.fcs),
            Version: entry.version,
          }));
          const columns = [
            { key: "Type", header: "Type", minWidth: 12 },
            { key: "ID", header: "ID", minWidth: 16 },
            { key: "Name", header: "Name", minWidth: 14, flex: true },
            { key: "FCS", header: "FCS", minWidth: 18 },
            { key: "Version", header: "Ver", minWidth: 6 },
          ];

          const lines: string[] = [];
          lines.push(
            `${theme.heading("FinClaw Commons")} ${theme.muted(`(${entries.length} entries)`)}`,
          );
          lines.push(renderTable({ width: tableWidth, columns, rows }).trimEnd());
          defaultRuntime.log(lines.join("\n"));
        } else {
          const { loadCommonsIndex, listEntries } = await import("../commons/registry.js");
          const index = await loadCommonsIndex();
          const entries = listEntries(index, opts.type);
          defaultRuntime.log(formatCommonsList(entries, opts));
        }
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  commons
    .command("search")
    .description("Search commons by name, description, or tags")
    .argument("<query>", "Search query")
    .option("--json", "Output as JSON", false)
    .action(async (query, opts) => {
      try {
        const { loadCommonsIndex, searchEntries } = await import("../commons/registry.js");
        const index = await loadCommonsIndex();
        const results = searchEntries(index, query);
        defaultRuntime.log(formatCommonsSearch(results, query, opts));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  commons
    .command("install")
    .description("Install a commons entry to your workspace")
    .argument("<id>", "Entry ID to install")
    .option("--dir <path>", "Target directory for installation")
    .option("--json", "Output as JSON", false)
    .action(async (id, opts) => {
      try {
        const { loadCommonsIndex, findEntry } = await import("../commons/registry.js");
        const { installCommonsEntry } = await import("../commons/install.js");

        const index = await loadCommonsIndex();
        const entry = findEntry(index, id);
        if (!entry) {
          defaultRuntime.error(
            `Entry "${id}" not found in commons. Run "openclaw commons list" to see available entries.`,
          );
          defaultRuntime.exit(1);
          return;
        }

        const result = await installCommonsEntry(entry, { targetDir: opts.dir });

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
        } else {
          defaultRuntime.log(
            formatInstallSuccess(result.entry, {
              alreadyExisted: result.alreadyExisted,
              installedPath: result.installedPath,
            }),
          );
        }
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  commons
    .command("publish")
    .description("Publish a local skill or content to the commons registry")
    .argument("<path>", "Path to the skill/content directory")
    .option("--type <type>", "Entry type (skill, strategy, workspace, etc.)", "skill")
    .option("--id <id>", "Override entry ID (defaults to directory name)")
    .option("--author <author>", "Author name", "local")
    .option("--json", "Output as JSON", false)
    .action(async (sourcePath, opts) => {
      try {
        const { resolve } = await import("node:path");
        const { publishToCommons } = await import("../commons/publish.js");

        const result = await publishToCommons(resolve(sourcePath), {
          type: opts.type,
          id: opts.id,
          author: opts.author,
        });

        // Trigger initial FCS calculation
        try {
          const { loadFcsConfig } = await import("../commons/fcs-storage.js");
          const { calculateFcsScore } = await import("../commons/fcs-scoring.js");
          const { createInitialLifecycle } = await import("../commons/lifecycle-engine.js");
          const { loadFcsScores, saveFcsScores } = await import("../commons/fcs-storage.js");

          const config = await loadFcsConfig();
          const score = calculateFcsScore(result.entry, {}, config);
          const lifecycle = createInitialLifecycle();

          const scores = await loadFcsScores();
          scores.entries[result.entry.id] = {
            entryId: result.entry.id,
            score,
            lifecycle,
          };
          scores.updatedAt = new Date().toISOString();
          await saveFcsScores(scores);
        } catch {
          // FCS calculation is best-effort during publish
        }

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
        } else {
          defaultRuntime.log(formatPublishSuccess(result.entry.id, result.registryPath));
        }
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  commons
    .command("info")
    .description("Show detailed information about a commons entry")
    .argument("<id>", "Entry ID")
    .option("--json", "Output as JSON", false)
    .action(async (id, opts) => {
      try {
        const { loadCommonsIndex, findEntry } = await import("../commons/registry.js");

        const index = await loadCommonsIndex();
        const entry = findEntry(index, id);
        if (!entry) {
          defaultRuntime.error(
            `Entry "${id}" not found in commons. Run "openclaw commons list" to see available entries.`,
          );
          defaultRuntime.exit(1);
          return;
        }

        defaultRuntime.log(formatCommonsInfo(entry, opts));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // FCS Scoring commands
  // -------------------------------------------------------------------------

  commons
    .command("score")
    .description("Show FCS score details for a commons entry")
    .argument("<id>", "Entry ID")
    .option("--json", "Output as JSON", false)
    .option("--history", "Show recent score history", false)
    .action(async (id, opts) => {
      try {
        const { loadCommonsIndex, findEntry } = await import("../commons/registry.js");
        const { loadFcsScores } = await import("../commons/fcs-storage.js");
        const { formatFcsScore } = await import("./commons-cli.fcs.format.js");

        const index = await loadCommonsIndex();
        const entry = findEntry(index, id);
        if (!entry) {
          defaultRuntime.error(`Entry "${id}" not found in commons.`);
          defaultRuntime.exit(1);
          return;
        }

        const scores = await loadFcsScores();
        const fcs = scores.entries[id];
        if (!fcs) {
          defaultRuntime.error(
            `No FCS score found for "${id}". Run "commons fcs recalculate --entry ${id}" first.`,
          );
          defaultRuntime.exit(1);
          return;
        }

        defaultRuntime.log(formatFcsScore(entry, fcs, opts));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  commons
    .command("lifecycle")
    .description("Show lifecycle state for a commons entry")
    .argument("<id>", "Entry ID")
    .option("--json", "Output as JSON", false)
    .action(async (id, opts) => {
      try {
        const { loadCommonsIndex, findEntry } = await import("../commons/registry.js");
        const { loadFcsScores } = await import("../commons/fcs-storage.js");
        const { formatLifecycleState } = await import("./commons-cli.fcs.format.js");

        const index = await loadCommonsIndex();
        const entry = findEntry(index, id);
        if (!entry) {
          defaultRuntime.error(`Entry "${id}" not found in commons.`);
          defaultRuntime.exit(1);
          return;
        }

        const scores = await loadFcsScores();
        const fcs = scores.entries[id];
        if (!fcs) {
          defaultRuntime.error(
            `No lifecycle data for "${id}". Run "commons fcs recalculate --entry ${id}" first.`,
          );
          defaultRuntime.exit(1);
          return;
        }

        defaultRuntime.log(formatLifecycleState(entry, fcs, opts));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  // FCS recalculate subcommand group
  const fcs = commons.command("fcs").description("FCS scoring management");

  fcs
    .command("recalculate")
    .description("Recalculate FCS scores for all entries")
    .option("--entry <id>", "Only recalculate a specific entry")
    .option("--dry-run", "Preview changes without writing", false)
    .action(async (opts) => {
      try {
        const { loadCommonsIndex, findEntry } = await import("../commons/registry.js");
        const { loadFcsConfig, loadFcsScores, saveFcsScores, appendFcsHistory } =
          await import("../commons/fcs-storage.js");
        const { calculateFcsScore } = await import("../commons/fcs-scoring.js");
        const { createInitialLifecycle, evaluateLifecycle } =
          await import("../commons/lifecycle-engine.js");

        const index = await loadCommonsIndex();
        const config = await loadFcsConfig();
        const scores = await loadFcsScores();

        const entriesToProcess = opts.entry
          ? (() => {
              const e = findEntry(index, opts.entry);
              return e ? [e] : [];
            })()
          : index.entries;

        if (opts.entry && entriesToProcess.length === 0) {
          defaultRuntime.error(`Entry "${opts.entry}" not found.`);
          defaultRuntime.exit(1);
          return;
        }

        for (const entry of entriesToProcess) {
          const existing = scores.entries[entry.id];
          const data = {
            usage: existing?.usage,
            social: existing?.social,
            quality: existing?.quality,
            backtest: existing?.backtest,
            connectorHealth: existing?.connectorHealth,
          };

          const score = calculateFcsScore(entry, data, config, existing?.score);
          const lifecycle = existing?.lifecycle
            ? evaluateLifecycle(
                existing.lifecycle,
                score.total,
                entry.type,
                { updatedAt: entry.updatedAt, ...data },
                config.lifecycle,
              )
            : createInitialLifecycle();

          if (opts.dryRun) {
            const prev = existing?.score?.total?.toFixed(1) ?? "—";
            defaultRuntime.log(
              `${theme.muted("[dry-run]")} ${entry.id}: ${prev} → ${score.total.toFixed(1)} (${lifecycle.tier}/${lifecycle.status})`,
            );
          } else {
            scores.entries[entry.id] = {
              entryId: entry.id,
              score,
              lifecycle,
              usage: existing?.usage,
              social: existing?.social,
              quality: existing?.quality,
              backtest: existing?.backtest,
              connectorHealth: existing?.connectorHealth,
            };

            await appendFcsHistory({
              entryId: entry.id,
              timestamp: score.calculatedAt,
              score,
              tier: lifecycle.tier,
              status: lifecycle.status,
            });
          }
        }

        if (!opts.dryRun) {
          scores.updatedAt = new Date().toISOString();
          await saveFcsScores(scores);
          defaultRuntime.log(
            theme.success(`Recalculated FCS scores for ${entriesToProcess.length} entries.`),
          );
        }
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  commons
    .command("delist")
    .description("Emergency compliance delist of a commons entry")
    .argument("<id>", "Entry ID to delist")
    .option("--reason <text>", "Delist reason (required)")
    .option("--restore", "Restore a delisted entry", false)
    .action(async (id, opts) => {
      try {
        const { loadCommonsIndex, findEntry } = await import("../commons/registry.js");
        const { loadFcsScores, saveFcsScores, loadFcsConfig } =
          await import("../commons/fcs-storage.js");
        const { delistEntry, restoreEntry, createInitialLifecycle } =
          await import("../commons/lifecycle-engine.js");

        const index = await loadCommonsIndex();
        const entry = findEntry(index, id);
        if (!entry) {
          defaultRuntime.error(`Entry "${id}" not found.`);
          defaultRuntime.exit(1);
          return;
        }

        const scores = await loadFcsScores();
        const fcs = scores.entries[id];

        if (opts.restore) {
          if (!fcs) {
            defaultRuntime.error(`No FCS data for "${id}".`);
            defaultRuntime.exit(1);
            return;
          }
          const config = await loadFcsConfig();
          const restored = restoreEntry(
            fcs.lifecycle,
            fcs.score.total,
            config.lifecycle.seedlingToGrowingThreshold,
          );
          if (!restored) {
            defaultRuntime.error(
              `Cannot restore "${id}": FCS score too low (${fcs.score.total.toFixed(1)}).`,
            );
            defaultRuntime.exit(1);
            return;
          }
          fcs.lifecycle = restored;
          scores.updatedAt = new Date().toISOString();
          await saveFcsScores(scores);
          defaultRuntime.log(theme.success(`Restored "${id}" to seedling/active.`));
        } else {
          if (!opts.reason) {
            defaultRuntime.error("--reason is required for delist operations.");
            defaultRuntime.exit(1);
            return;
          }

          const currentLifecycle = fcs?.lifecycle ?? createInitialLifecycle();
          const delisted = delistEntry(currentLifecycle, opts.reason);

          if (!fcs) {
            scores.entries[id] = {
              entryId: id,
              score: {
                total: 0,
                breakdown: { quality: 0, usage: 0, social: 0, freshness: 0 },
                calculatedAt: new Date().toISOString(),
                decayApplied: 0,
              },
              lifecycle: delisted,
            };
          } else {
            fcs.lifecycle = delisted;
          }

          scores.updatedAt = new Date().toISOString();
          await saveFcsScores(scores);
          defaultRuntime.log(theme.error(`Delisted "${id}": ${opts.reason}`));
        }
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // Dashboard + Report commands
  // -------------------------------------------------------------------------

  commons
    .command("dashboard")
    .description("Show commons ecosystem dashboard")
    .option("--json", "Output as JSON", false)
    .option("--compact", "Compact view (skip leaderboard and activity)", false)
    .action(async (opts) => {
      try {
        const { loadCommonsIndexWithFcs } = await import("../commons/registry.js");
        const { computeCommonsOverview } = await import("../commons/dashboard-data.js");
        const { formatDashboard } = await import("./commons-cli.dashboard.js");

        const entries = await loadCommonsIndexWithFcs();
        const overview = computeCommonsOverview(entries);
        defaultRuntime.log(formatDashboard(overview, opts));
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  commons
    .command("generate-report")
    .description("Generate a Markdown report of the commons ecosystem")
    .option("--output <path>", "Output file path")
    .option("--badges", "Include shields.io badges", true)
    .option("--no-badges", "Exclude shields.io badges")
    .action(async (opts) => {
      try {
        const { writeFile } = await import("node:fs/promises");
        const { loadCommonsIndexWithFcs } = await import("../commons/registry.js");
        const { computeCommonsOverview } = await import("../commons/dashboard-data.js");
        const { generateMarkdownReport } = await import("./commons-cli.report.js");

        const entries = await loadCommonsIndexWithFcs();
        const overview = computeCommonsOverview(entries);
        const report = generateMarkdownReport(overview, { badges: opts.badges });

        if (opts.output) {
          await writeFile(opts.output, report, "utf-8");
          defaultRuntime.log(theme.success(`Report written to ${opts.output}`));
        } else {
          defaultRuntime.log(report);
        }
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  commons
    .command("build-site")
    .description("Generate static dashboard website")
    .option("--output <dir>", "Output directory")
    .option("--open", "Open in browser after generation", false)
    .action(async (opts) => {
      try {
        const { generateDashboardSite } = await import("../../commons/dashboard/generator.js");
        const outputDir = await generateDashboardSite({ outputDir: opts.output });
        defaultRuntime.log(theme.success(`Dashboard site generated at ${outputDir}`));

        if (opts.open) {
          const { exec } = await import("node:child_process");
          const { join } = await import("node:path");
          exec(`open "${join(outputDir, "index.html")}"`);
        }
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  // Default action (no subcommand) - show list
  commons.action(async () => {
    try {
      const { loadCommonsIndex, listEntries } = await import("../commons/registry.js");
      const index = await loadCommonsIndex();
      const entries = listEntries(index);
      defaultRuntime.log(formatCommonsList(entries, {}));
    } catch (err) {
      defaultRuntime.error(String(err));
      defaultRuntime.exit(1);
    }
  });
}
