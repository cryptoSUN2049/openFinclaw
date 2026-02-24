import type { TenantChannelEntry, TelegramSetupState } from "../views/tenant-channels.types.ts";

/** Minimal state interface needed by the tenant channel controller. */
export type TenantChannelsState = {
  client: { request: <T>(method: string, params?: unknown) => Promise<T> } | null;
  connected: boolean;
  tenantChannels: TenantChannelEntry[];
  tenantChannelsLoading: boolean;
  tenantWizardOpen: boolean;
  tenantWizardState: TelegramSetupState | null;
};

/** Load the current tenant's channel list from the gateway. */
export async function loadTenantChannels(state: TenantChannelsState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.tenantChannelsLoading) {
    return;
  }

  state.tenantChannelsLoading = true;
  try {
    const res = await state.client.request<{ channels: TenantChannelEntry[] }>(
      "tenant.channels.list",
    );
    state.tenantChannels = res.channels ?? [];
  } catch (_err) {
    console.error("Failed to load tenant channels:", _err);
  } finally {
    state.tenantChannelsLoading = false;
  }
}

/** Open the Telegram setup wizard. */
export function openTenantWizard(state: TenantChannelsState): void {
  state.tenantWizardOpen = true;
  state.tenantWizardState = {
    step: 1,
    botToken: "",
    botInfo: null,
    error: null,
    loading: false,
  };
}

/** Close the wizard and reset state. */
export function closeTenantWizard(state: TenantChannelsState): void {
  state.tenantWizardOpen = false;
  state.tenantWizardState = null;
}

/** Update the token input in the wizard. */
export function setWizardToken(state: TenantChannelsState, token: string): void {
  if (!state.tenantWizardState) {
    return;
  }
  state.tenantWizardState = { ...state.tenantWizardState, botToken: token, error: null };
}

/** Verify the bot token (step 1 → step 2). */
export async function verifyTenantToken(state: TenantChannelsState): Promise<void> {
  if (!state.client || !state.tenantWizardState) {
    return;
  }
  const ws = state.tenantWizardState;
  if (!ws.botToken.trim()) {
    state.tenantWizardState = { ...ws, error: "请输入 Bot Token" };
    return;
  }

  state.tenantWizardState = { ...ws, loading: true, error: null };

  try {
    const res = await state.client.request<{
      probe: {
        ok: boolean;
        error?: string;
        bot?: { id?: number; username?: string | null; first_name?: string };
      };
    }>("tenant.channels.test", { botToken: ws.botToken.trim() });

    if (!res.probe?.ok) {
      state.tenantWizardState = {
        ...ws,
        loading: false,
        error: res.probe?.error ?? "Token 无法识别，请检查是否复制完整",
      };
    } else {
      state.tenantWizardState = {
        ...ws,
        step: 2,
        loading: false,
        botInfo: res.probe.bot ?? null,
        error: null,
      };
    }
  } catch {
    state.tenantWizardState = {
      ...ws,
      loading: false,
      error: "网络连接失败，请稍后重试",
    };
  }
}

/** Connect the bot (step 2 → step 3): add channel to DB + set webhook. */
export async function connectTenantChannel(state: TenantChannelsState): Promise<void> {
  if (!state.client || !state.tenantWizardState) {
    return;
  }
  const ws = state.tenantWizardState;

  state.tenantWizardState = { ...ws, loading: true, error: null };

  try {
    await state.client.request("tenant.channels.add", {
      channelType: "telegram",
      botToken: ws.botToken.trim(),
      label: ws.botInfo?.first_name ?? null,
    });
    state.tenantWizardState = { ...ws, step: 3, loading: false, error: null };
    // Refresh channels list
    void loadTenantChannels(state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.tenantWizardState = {
      ...ws,
      loading: false,
      error: msg.includes("already connected")
        ? "这个 Bot 已经连接到你的账户了"
        : msg.includes("Invalid") || msg.includes("invalid")
          ? "Token 无法识别，请检查是否复制完整"
          : "连接失败，请稍后重试",
    };
  }
}

/** Go back to previous wizard step. */
export function wizardGoBack(state: TenantChannelsState): void {
  if (!state.tenantWizardState) {
    return;
  }
  const ws = state.tenantWizardState;
  if (ws.step === 2) {
    state.tenantWizardState = { ...ws, step: 1, botInfo: null, error: null };
  }
}

/** Remove a channel (with confirmation handled by the UI). */
export async function removeTenantChannel(
  state: TenantChannelsState,
  channelId: string,
): Promise<void> {
  if (!state.client) {
    return;
  }
  try {
    await state.client.request("tenant.channels.remove", { channelId });
    state.tenantChannels = state.tenantChannels.filter((ch) => ch.id !== channelId);
  } catch (_err) {
    console.error("Failed to remove channel:", _err);
  }
}
