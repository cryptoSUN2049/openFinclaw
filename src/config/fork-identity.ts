/**
 * Centralized fork identity for OpenFinClaw.
 * Consumed by the updater, registry lookups, and daemon service constants.
 */
export const FORK_PACKAGE_NAME = "openfinclaw";
export const FORK_REPO_URL = "https://github.com/cryptoSUN2049/openFinclaw.git";
export const FORK_NPM_REGISTRY_BASE = "https://registry.npmjs.org/openfinclaw";
export const FORK_ENTRY_BINARY = "openfinclaw.mjs";
// Legacy package names recognized during normalizeTag parsing
export const LEGACY_PACKAGE_NAMES = ["openclaw"] as const;
