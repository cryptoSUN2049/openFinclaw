/**
 * Static site generator for FinClaw Commons Dashboard.
 *
 * Reads the commons index + FCS data, computes overview statistics,
 * and generates a self-contained HTML file with embedded data for
 * Chart.js visualization.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeCommonsOverview } from "../../src/commons/dashboard-data.js";
import type { CommonsOverview } from "../../src/commons/dashboard-data.js";
import { loadCommonsIndexWithFcs, resolveCommonsDir } from "../../src/commons/registry.js";
import type { CommonsEntryWithFcs } from "../../src/commons/types.fcs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type GeneratorOptions = {
  /** Output directory for the generated site. Defaults to commons/site/. */
  outputDir?: string;
  /** Commons directory root. */
  commonsDir?: string;
};

/** Generate the static dashboard site. */
export async function generateDashboardSite(options: GeneratorOptions = {}): Promise<string> {
  const commonsDir = options.commonsDir ?? resolveCommonsDir();
  const outputDir = options.outputDir ?? join(commonsDir, "site");

  // Load data
  const entries = await loadCommonsIndexWithFcs(commonsDir);
  const overview = computeCommonsOverview(entries);

  // Read template
  const templatePath = join(__dirname, "template.html");
  let template = await readFile(templatePath, "utf-8");

  // Read CSS
  const cssPath = join(__dirname, "assets", "style.css");
  const css = await readFile(cssPath, "utf-8");

  // Inject data and inline CSS
  const dataPayload = JSON.stringify({ overview, entries }, null, 2);

  // Replace external CSS link with inline style
  template = template.replace(
    '<link rel="stylesheet" href="style.css">',
    `<style>\n${css}\n</style>`,
  );

  // Replace external Chart.js link with CDN (for self-contained builds without local chart.min.js)
  template = template.replace(
    '<script src="chart.min.js" defer></script>',
    '<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js" defer></script>',
  );

  // Inject data before the closing </body>
  const dataScript = `<script>window.__FINCLAW_DATA__ = ${dataPayload};</script>`;
  template = template.replace("</body>", `${dataScript}\n</body>`);

  // Write output
  await mkdir(outputDir, { recursive: true });

  const indexPath = join(outputDir, "index.html");
  await writeFile(indexPath, template, "utf-8");

  // Write data.json for external consumption
  const dataJsonPath = join(outputDir, "data.json");
  await writeFile(dataJsonPath, JSON.stringify({ overview, entries }, null, 2), "utf-8");

  return outputDir;
}

/** Build the data payload without generating files. Useful for testing. */
export function buildDashboardData(entries: CommonsEntryWithFcs[]): {
  overview: CommonsOverview;
  entries: CommonsEntryWithFcs[];
} {
  const overview = computeCommonsOverview(entries);
  return { overview, entries };
}
