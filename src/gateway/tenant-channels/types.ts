import type { Bot } from "grammy";

/** Database row for a tenant's connected channel. */
export type TenantChannel = {
  id: string;
  tenant_id: string;
  channel_type: TenantChannelType;
  label: string | null;
  credentials: TenantChannelCredentials;
  config: Record<string, unknown>;
  status: TenantChannelStatus;
  last_error: string | null;
  bot_info: TelegramBotInfo | null;
  webhook_secret: string;
  created_at: string;
  updated_at: string;
};

export type TenantChannelType = "telegram";

export type TenantChannelStatus = "active" | "inactive" | "error";

export type TenantChannelCredentials = {
  encrypted: string;
  iv: string;
  bot_id: string;
};

/** Cached Telegram getMe response. */
export type TelegramBotInfo = {
  id: number;
  username: string | null;
  first_name?: string | null;
  can_join_groups?: boolean | null;
  can_read_all_group_messages?: boolean | null;
};

/** Runtime state for an active bot instance. */
export type TenantBotInstance = {
  channelId: string;
  tenantId: string;
  bot: Bot;
  abortController: AbortController;
};

/** Public-facing channel entry returned to the UI (no secrets). */
export type TenantChannelView = {
  id: string;
  channelType: TenantChannelType;
  label: string | null;
  status: TenantChannelStatus;
  lastError: string | null;
  botInfo: TelegramBotInfo | null;
  createdAt: string;
};
