import type { ExchangeAccountConfig } from "../../../../src/config/types.financial.js";
import type { GatewayBrowserClient } from "../gateway.ts";
import type { ConfigSnapshot } from "../types.ts";
import {
  cloneConfigObject,
  removePathValue,
  serializeConfigForm,
  setPathValue,
} from "./config/form-utils.ts";

export type ExchangesState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  exchangesLoading: boolean;
  exchangesSaving: boolean;
  exchangesError: string | null;
  exchangeEditAlias: string | null;
  exchangeNewMode: boolean;
  exchangeFormDraft: Record<string, unknown> | null;
  configForm: Record<string, unknown> | null;
  configFormOriginal: Record<string, unknown> | null;
  configFormDirty: boolean;
  configFormMode: "form" | "raw";
  configRaw: string;
  configSnapshot: ConfigSnapshot | null;
  configLoading: boolean;
  lastError: string | null;
};

/** Read current exchanges map from configForm. */
export function getExchanges(
  state: ExchangesState,
): Record<string, ExchangeAccountConfig> {
  const fin = state.configForm?.financial as Record<string, unknown> | undefined;
  const exchanges = fin?.exchanges as Record<string, ExchangeAccountConfig> | undefined;
  return exchanges ?? {};
}

/** Load config data needed by the exchanges view. */
export async function loadExchanges(state: ExchangesState) {
  if (!state.client || !state.connected) return;
  if (state.exchangesLoading) return;
  state.exchangesLoading = true;
  state.exchangesError = null;
  try {
    // Reuse the config.get RPC to load the full config (includes financial.exchanges)
    const snapshot = await state.client.request<ConfigSnapshot>("config.get", {});
    state.configSnapshot = snapshot;
    state.configForm = cloneConfigObject(snapshot.config ?? {});
    state.configFormOriginal = cloneConfigObject(snapshot.config ?? {});
    state.configRaw = typeof snapshot.raw === "string"
      ? snapshot.raw
      : serializeConfigForm(snapshot.config ?? {});
    state.configFormDirty = false;
  } catch (err) {
    state.exchangesError = String(err);
  } finally {
    state.exchangesLoading = false;
  }
}

/** Save (add or update) a single exchange account. */
export async function saveExchange(
  state: ExchangesState,
  alias: string,
  config: ExchangeAccountConfig,
) {
  if (!state.client || !state.connected) return;
  state.exchangesSaving = true;
  state.exchangesError = null;
  try {
    const base = cloneConfigObject(state.configForm ?? state.configSnapshot?.config ?? {});
    setPathValue(base, ["financial", "exchanges", alias], config);
    state.configForm = base;
    state.configFormDirty = true;
    state.configRaw = serializeConfigForm(base);

    const baseHash = state.configSnapshot?.hash;
    if (!baseHash) {
      state.exchangesError = "Config hash missing; reload and retry.";
      return;
    }
    await state.client.request("config.set", { raw: state.configRaw, baseHash });
    state.configFormDirty = false;

    // Reload to get fresh snapshot
    await loadExchanges(state);

    // Reset form state
    state.exchangeEditAlias = null;
    state.exchangeNewMode = false;
    state.exchangeFormDraft = null;
  } catch (err) {
    state.exchangesError = String(err);
  } finally {
    state.exchangesSaving = false;
  }
}

/** Delete an exchange account by alias. */
export async function deleteExchange(state: ExchangesState, alias: string) {
  if (!state.client || !state.connected) return;
  state.exchangesSaving = true;
  state.exchangesError = null;
  try {
    const base = cloneConfigObject(state.configForm ?? state.configSnapshot?.config ?? {});
    removePathValue(base, ["financial", "exchanges", alias]);
    state.configForm = base;
    state.configFormDirty = true;
    state.configRaw = serializeConfigForm(base);

    const baseHash = state.configSnapshot?.hash;
    if (!baseHash) {
      state.exchangesError = "Config hash missing; reload and retry.";
      return;
    }
    await state.client.request("config.set", { raw: state.configRaw, baseHash });
    state.configFormDirty = false;

    await loadExchanges(state);
  } catch (err) {
    state.exchangesError = String(err);
  } finally {
    state.exchangesSaving = false;
  }
}
