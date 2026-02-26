import { html, nothing } from "lit";
import type { ExchangeAccountConfig, ExchangeId } from "../../../../src/config/types.financial.js";

const EXCHANGE_IDS: readonly ExchangeId[] = ["hyperliquid", "binance", "okx", "bybit"] as const;

const EXCHANGE_META: Record<ExchangeId, { label: string; color: string; needsPassphrase: boolean }> =
  {
    hyperliquid: { label: "Hyperliquid", color: "#0ea5e9", needsPassphrase: false },
    binance: { label: "Binance", color: "#f0b90b", needsPassphrase: false },
    okx: { label: "OKX", color: "#f97316", needsPassphrase: true },
    bybit: { label: "Bybit", color: "#6366f1", needsPassphrase: false },
  };

const MARKET_TYPES = ["spot", "swap", "future"] as const;

export type ExchangesProps = {
  loading: boolean;
  saving: boolean;
  error: string | null;
  exchanges: Record<string, ExchangeAccountConfig>;
  editAlias: string | null;
  newMode: boolean;
  formDraft: Record<string, unknown> | null;
  onAdd: () => void;
  onEdit: (alias: string) => void;
  onCancel: () => void;
  onSave: (alias: string, config: ExchangeAccountConfig) => void;
  onDelete: (alias: string) => void;
  onFormChange: (draft: Record<string, unknown>) => void;
};

function maskKey(key: string | undefined): string {
  if (!key) return "";
  // Redacted values from config system show as "••••••" or similar
  if (key.startsWith("••") || key === "[redacted]") return "Configured";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function renderExchangeCard(
  alias: string,
  config: ExchangeAccountConfig,
  props: ExchangesProps,
) {
  const meta = EXCHANGE_META[config.exchange] ?? {
    label: config.exchange,
    color: "#888",
    needsPassphrase: false,
  };
  const hasKey = Boolean(config.apiKey);
  const hasSecret = Boolean(config.secret);

  return html`
    <div class="card" style="margin-bottom: 12px;">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span
            style="display: inline-block; width: 10px; height: 10px; border-radius: 50%;
                   background: ${meta.color};"
          ></span>
          <div>
            <div class="card-title" style="margin: 0;">${alias}</div>
            <div class="card-sub" style="margin: 0;">
              <span
                style="display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px;
                       background: ${meta.color}22; color: ${meta.color}; font-weight: 600;"
              >
                ${meta.label}
              </span>
              ${config.testnet ? html`<span class="pill" style="margin-left: 6px; font-size: 11px;">Testnet</span>` : nothing}
              ${config.defaultType && config.defaultType !== "spot" ? html`<span class="muted" style="margin-left: 6px; font-size: 11px;">${config.defaultType}</span>` : nothing}
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button
            class="btn"
            @click=${() => props.onEdit(alias)}
            ?disabled=${props.saving}
          >
            Edit
          </button>
          <button
            class="btn"
            style="color: var(--color-danger, #ef4444);"
            @click=${() => {
              if (confirm(`Delete exchange account "${alias}"?`)) {
                props.onDelete(alias);
              }
            }}
            ?disabled=${props.saving}
          >
            Delete
          </button>
        </div>
      </div>
      <div style="margin-top: 10px; display: flex; gap: 16px; font-size: 13px;">
        <span class="muted">API Key:</span>
        <span class="mono">${hasKey ? maskKey(config.apiKey) : html`<span class="muted">Not set</span>`}</span>
        <span class="muted">Secret:</span>
        <span class="mono">${hasSecret ? maskKey(config.secret) : html`<span class="muted">Not set</span>`}</span>
      </div>
    </div>
  `;
}

function renderExchangeForm(props: ExchangesProps) {
  const draft = props.formDraft ?? {};
  const isEdit = props.editAlias != null && !props.newMode;
  const selectedExchange = (draft.exchange as ExchangeId) ?? "binance";
  const meta = EXCHANGE_META[selectedExchange];

  const aliasValue = (draft.alias as string) ?? "";
  const apiKeyValue = (draft.apiKey as string) ?? "";
  const secretValue = (draft.secret as string) ?? "";
  const passphraseValue = (draft.passphrase as string) ?? "";
  const testnetValue = Boolean(draft.testnet);
  const subaccountValue = (draft.subaccount as string) ?? "";
  const defaultTypeValue = (draft.defaultType as string) ?? "spot";

  const update = (field: string, value: unknown) => {
    props.onFormChange({ ...draft, [field]: value });
  };

  return html`
    <section class="card">
      <div class="card-title">${isEdit ? `Edit: ${props.editAlias}` : "Add Exchange Account"}</div>
      <div class="card-sub">${isEdit ? "Update exchange credentials and settings." : "Connect a new exchange account."}</div>

      <div class="form-grid" style="margin-top: 16px; max-width: 520px;">
        <!-- Alias -->
        <label class="field">
          <span>Alias</span>
          <input
            .value=${aliasValue}
            @input=${(e: Event) => update("alias", (e.target as HTMLInputElement).value)}
            placeholder="e.g. main-binance"
            ?disabled=${isEdit}
          />
          ${isEdit ? html`<span class="muted" style="font-size: 11px;">Alias cannot be changed after creation.</span>` : nothing}
        </label>

        <!-- Exchange selector -->
        <div class="field">
          <span>Exchange</span>
          <div style="display: flex; gap: 0; margin-top: 4px;">
            ${EXCHANGE_IDS.map(
              (id) => html`
                <button
                  style="
                    flex: 1; padding: 8px 4px; border: 1px solid var(--color-border, #333);
                    background: ${selectedExchange === id ? `${EXCHANGE_META[id].color}22` : "transparent"};
                    color: ${selectedExchange === id ? EXCHANGE_META[id].color : "var(--color-text-secondary, #888)"};
                    font-weight: ${selectedExchange === id ? "600" : "400"};
                    font-size: 13px; cursor: pointer;
                    border-radius: ${id === EXCHANGE_IDS[0] ? "6px 0 0 6px" : id === EXCHANGE_IDS[EXCHANGE_IDS.length - 1] ? "0 6px 6px 0" : "0"};
                    border-left: ${id === EXCHANGE_IDS[0] ? "" : "none"};
                  "
                  @click=${() => update("exchange", id)}
                >
                  ${EXCHANGE_META[id].label}
                </button>
              `,
            )}
          </div>
        </div>

        <!-- API Key -->
        <label class="field">
          <span>API Key</span>
          <input
            type="password"
            .value=${apiKeyValue}
            @input=${(e: Event) => update("apiKey", (e.target as HTMLInputElement).value)}
            placeholder="Enter API key"
            autocomplete="off"
          />
        </label>

        <!-- Secret -->
        <label class="field">
          <span>API Secret</span>
          <input
            type="password"
            .value=${secretValue}
            @input=${(e: Event) => update("secret", (e.target as HTMLInputElement).value)}
            placeholder="Enter API secret"
            autocomplete="off"
          />
        </label>

        <!-- Passphrase (only for exchanges that need it) -->
        ${meta?.needsPassphrase
          ? html`
            <label class="field">
              <span>Passphrase</span>
              <input
                type="password"
                .value=${passphraseValue}
                @input=${(e: Event) => update("passphrase", (e.target as HTMLInputElement).value)}
                placeholder="Exchange passphrase"
                autocomplete="off"
              />
            </label>
          `
          : nothing}

        <!-- Subaccount -->
        <label class="field">
          <span>Sub-account <span class="muted">(optional)</span></span>
          <input
            .value=${subaccountValue}
            @input=${(e: Event) => update("subaccount", (e.target as HTMLInputElement).value)}
            placeholder="Sub-account name"
          />
        </label>

        <!-- Testnet toggle -->
        <div class="field">
          <div
            style="display: flex; align-items: center; justify-content: space-between;
                   padding: 8px 0; cursor: pointer;"
            @click=${() => update("testnet", !testnetValue)}
          >
            <span>Testnet</span>
            <div
              style="
                width: 40px; height: 22px; border-radius: 11px;
                background: ${testnetValue ? "var(--color-primary, #3b82f6)" : "var(--color-border, #444)"};
                position: relative; transition: background 0.2s;
              "
            >
              <div
                style="
                  width: 18px; height: 18px; border-radius: 50%; background: white;
                  position: absolute; top: 2px;
                  left: ${testnetValue ? "20px" : "2px"};
                  transition: left 0.2s;
                "
              ></div>
            </div>
          </div>
        </div>

        <!-- Default market type -->
        <div class="field">
          <span>Default Market Type</span>
          <div style="display: flex; gap: 0; margin-top: 4px;">
            ${MARKET_TYPES.map(
              (mt) => html`
                <button
                  style="
                    flex: 1; padding: 8px 4px; border: 1px solid var(--color-border, #333);
                    background: ${defaultTypeValue === mt ? "var(--color-bg-active, #2a2a2a)" : "transparent"};
                    color: ${defaultTypeValue === mt ? "var(--color-text, #eee)" : "var(--color-text-secondary, #888)"};
                    font-weight: ${defaultTypeValue === mt ? "600" : "400"};
                    font-size: 13px; cursor: pointer;
                    border-radius: ${mt === "spot" ? "6px 0 0 6px" : mt === "future" ? "0 6px 6px 0" : "0"};
                    border-left: ${mt === "spot" ? "" : "none"};
                  "
                  @click=${() => update("defaultType", mt)}
                >
                  ${mt.charAt(0).toUpperCase() + mt.slice(1)}
                </button>
              `,
            )}
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="row" style="margin-top: 20px; gap: 8px;">
        <button
          class="btn primary"
          ?disabled=${props.saving || (!isEdit && !aliasValue.trim())}
          @click=${() => {
            const alias = isEdit ? props.editAlias! : aliasValue.trim();
            if (!alias) return;
            const config: ExchangeAccountConfig = {
              exchange: selectedExchange,
            };
            if (apiKeyValue) config.apiKey = apiKeyValue;
            if (secretValue) config.secret = secretValue;
            if (passphraseValue && meta?.needsPassphrase) config.passphrase = passphraseValue;
            if (subaccountValue) config.subaccount = subaccountValue;
            if (testnetValue) config.testnet = true;
            if (defaultTypeValue !== "spot") config.defaultType = defaultTypeValue as "swap" | "future";
            props.onSave(alias, config);
          }}
        >
          ${props.saving ? "Saving..." : "Save"}
        </button>
        <button class="btn" @click=${props.onCancel}>Cancel</button>
      </div>
    </section>
  `;
}

export function renderExchanges(props: ExchangesProps) {
  const entries = Object.entries(props.exchanges);
  const showForm = props.newMode || props.editAlias != null;

  return html`
    ${props.error ? html`<div class="callout danger" style="margin-bottom: 12px;">${props.error}</div>` : nothing}

    ${showForm
      ? renderExchangeForm(props)
      : html`
        <section>
          <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div class="muted">${entries.length} exchange account${entries.length !== 1 ? "s" : ""} configured</div>
            <button
              class="btn primary"
              @click=${props.onAdd}
              ?disabled=${props.loading}
            >
              Add Exchange
            </button>
          </div>

          ${props.loading
            ? html`<div class="muted">Loading...</div>`
            : entries.length === 0
              ? html`
                <div class="card">
                  <div class="muted" style="text-align: center; padding: 32px 0;">
                    No exchange accounts configured yet.
                    <br />
                    Click <strong>Add Exchange</strong> to connect your first exchange.
                  </div>
                </div>
              `
              : entries.map(([alias, config]) => renderExchangeCard(alias, config, props))}
        </section>
      `}
  `;
}
