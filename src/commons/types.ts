/**
 * FinClaw Commons type definitions.
 *
 * The Commons is a shared registry of financial skills, strategies,
 * connectors, and workspace templates that can be browsed, installed,
 * and published via the CLI.
 */

export type CommonsEntryType =
  | "skill"
  | "strategy"
  | "connector"
  | "persona"
  | "workspace"
  | "knowledge-pack"
  | "compliance-ruleset";

export type CommonsEntry = {
  id: string;
  name: string;
  type: CommonsEntryType;
  description: string;
  version: string;
  author: string;
  tags: string[];
  /** Relative path within the commons directory (e.g. "skills/fin-dca-strategy") */
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type CommonsIndex = {
  version: 1;
  entries: CommonsEntry[];
};

export type CommonsInstallResult = {
  entry: CommonsEntry;
  installedPath: string;
  alreadyExisted: boolean;
};

export type CommonsPublishResult = {
  entry: CommonsEntry;
  registryPath: string;
};

// Re-export FCS types for convenience
export type {
  FcsScore,
  FcsConfig,
  LifecycleState,
  LifecycleTier,
  LifecycleStatus,
  CommonsEntryWithFcs,
  AuthorReputation,
} from "./types.fcs.js";
