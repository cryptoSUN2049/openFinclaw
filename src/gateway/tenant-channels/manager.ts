import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Bot } from "grammy";
import type { createSubsystemLogger } from "../../logging/subsystem.js";
import { resolveTelegramAllowedUpdates } from "../../telegram/allowed-updates.js";
import { probeTelegram, type TelegramProbe } from "../../telegram/probe.js";
import { decryptToken, encryptToken } from "./crypto.js";
import type {
  TenantBotInstance,
  TenantChannel,
  TenantChannelCredentials,
  TenantChannelView,
  TelegramBotInfo,
} from "./types.js";

type SubsystemLogger = ReturnType<typeof createSubsystemLogger>;

export type TenantChannelManagerOptions = {
  supabaseUrl: string;
  supabaseServiceKey: string;
  encryptionKey: string;
  webhookBaseUrl: string;
  log: SubsystemLogger;
};

/**
 * Manages per-tenant channel connections (CRUD + bot lifecycle).
 * Reuses existing Telegram utilities (probeTelegram, Grammy bot).
 */
export class TenantChannelManager {
  private supabase: SupabaseClient;
  private encryptionKey: string;
  private webhookBaseUrl: string;
  private log: SubsystemLogger;
  private bots = new Map<string, TenantBotInstance>();

  constructor(opts: TenantChannelManagerOptions) {
    this.supabase = createClient(opts.supabaseUrl, opts.supabaseServiceKey);
    this.encryptionKey = opts.encryptionKey;
    this.webhookBaseUrl = opts.webhookBaseUrl.replace(/\/$/, "");
    this.log = opts.log;
  }

  // ---- CRUD ----

  /** List all channels for a tenant, returning UI-safe views (no secrets). */
  async listChannels(tenantId: string): Promise<TenantChannelView[]> {
    const { data, error } = await this.supabase
      .from("tenant_channels")
      .select("id, channel_type, label, status, last_error, bot_info, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to list channels: ${error.message}`);
    }
    return (data ?? []).map((row) => ({
      id: row.id as string,
      channelType: row.channel_type as TenantChannelView["channelType"],
      label: row.label as string | null,
      status: row.status as TenantChannelView["status"],
      lastError: row.last_error as string | null,
      botInfo: row.bot_info as TelegramBotInfo | null,
      createdAt: row.created_at as string,
    }));
  }

  /**
   * Validate a Telegram bot token by calling Telegram's getMe API.
   * Reuses the existing probeTelegram() utility.
   */
  async testTelegramToken(botToken: string): Promise<TelegramProbe> {
    return probeTelegram(botToken, 10_000);
  }

  /**
   * Add a new channel for a tenant:
   * 1. Validate the token (getMe)
   * 2. Encrypt and store in DB
   * 3. Set up webhook
   * 4. Start the bot instance
   */
  async addChannel(params: {
    tenantId: string;
    channelType: "telegram";
    botToken: string;
    label?: string;
  }): Promise<TenantChannelView> {
    const { tenantId, channelType, botToken, label } = params;

    // Validate the token first
    const probe = await this.testTelegramToken(botToken);
    if (!probe.ok || !probe.bot?.id) {
      throw new Error(probe.error ?? "Invalid bot token");
    }

    const botId = String(probe.bot.id);

    // Check for duplicate
    const { data: existing } = await this.supabase
      .from("tenant_channels")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("channel_type", channelType)
      .eq("credentials->>bot_id", botId)
      .maybeSingle();

    if (existing) {
      throw new Error("This bot is already connected to your account");
    }

    // Encrypt the token
    const { encrypted, iv } = encryptToken(botToken, this.encryptionKey);
    const credentials: TenantChannelCredentials = { encrypted, iv, bot_id: botId };
    const webhookSecret = randomBytes(24).toString("hex");
    const botInfo: TelegramBotInfo = {
      id: probe.bot.id,
      username: probe.bot.username ?? null,
      can_join_groups: probe.bot.canJoinGroups ?? null,
      can_read_all_group_messages: probe.bot.canReadAllGroupMessages ?? null,
    };

    // Insert into DB
    const { data: row, error } = await this.supabase
      .from("tenant_channels")
      .insert({
        tenant_id: tenantId,
        channel_type: channelType,
        label: label ?? null,
        credentials,
        status: "active",
        bot_info: botInfo,
        webhook_secret: webhookSecret,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save channel: ${error.message}`);
    }

    const channel = row as TenantChannel;

    // Start bot + set webhook
    try {
      await this.startBot(channel, botToken);
    } catch (err) {
      // Update status to error but don't fail the whole operation
      await this.updateChannelStatus(channel.id, "error", String(err));
      this.log.warn(`Failed to start bot for channel ${channel.id}: ${String(err)}`);
    }

    return {
      id: channel.id,
      channelType: channel.channel_type,
      label: channel.label,
      status: channel.status,
      lastError: channel.last_error,
      botInfo: channel.bot_info,
      createdAt: channel.created_at,
    };
  }

  /** Remove a channel: stop bot → delete webhook → delete DB record. */
  async removeChannel(channelId: string, tenantId: string): Promise<void> {
    // Load channel to verify ownership
    const channel = await this.loadChannel(channelId, tenantId);
    if (!channel) {
      throw new Error("Channel not found");
    }

    // Stop bot if running
    await this.stopBot(channelId);

    // Try to delete webhook from Telegram
    try {
      const token = decryptToken(
        channel.credentials.encrypted,
        channel.credentials.iv,
        this.encryptionKey,
      );
      const bot = new Bot(token);
      await bot.api.deleteWebhook();
    } catch (err) {
      this.log.warn(`Failed to delete webhook for channel ${channelId}: ${String(err)}`);
    }

    // Delete from DB
    const { error } = await this.supabase
      .from("tenant_channels")
      .delete()
      .eq("id", channelId)
      .eq("tenant_id", tenantId);

    if (error) {
      throw new Error(`Failed to delete channel: ${error.message}`);
    }
  }

  // ---- Bot Lifecycle ----

  /** Start a Grammy bot instance for a channel and register its Telegram webhook. */
  async startBot(channel: TenantChannel, plainToken?: string): Promise<void> {
    if (this.bots.has(channel.id)) {
      return; // Already running
    }

    const token =
      plainToken ??
      decryptToken(channel.credentials.encrypted, channel.credentials.iv, this.encryptionKey);

    const bot = new Bot(token);
    const abortController = new AbortController();

    // Minimal error handler to prevent unhandled rejections
    bot.catch((err) => {
      this.log.error(`Tenant bot error [${channel.id}]: ${err.message ?? err}`);
    });

    // Store instance
    this.bots.set(channel.id, {
      channelId: channel.id,
      tenantId: channel.tenant_id,
      bot,
      abortController,
    });

    // Register Telegram webhook
    const webhookUrl = `${this.webhookBaseUrl}/wh/telegram/${channel.tenant_id}/${channel.webhook_secret}`;
    try {
      await bot.api.setWebhook(webhookUrl, {
        secret_token: channel.webhook_secret,
        allowed_updates: [...resolveTelegramAllowedUpdates()],
      });
      await this.updateChannelStatus(channel.id, "active");
      this.log.info(
        `Started tenant bot [${channel.id}] @${channel.bot_info?.username ?? "unknown"}`,
      );
    } catch (err) {
      await this.updateChannelStatus(channel.id, "error", String(err));
      throw err;
    }
  }

  /** Stop a running bot instance. */
  async stopBot(channelId: string): Promise<void> {
    const instance = this.bots.get(channelId);
    if (!instance) {
      return;
    }
    instance.abortController.abort();
    try {
      await instance.bot.stop();
    } catch {
      // Best-effort stop
    }
    this.bots.delete(channelId);
  }

  /** Start all active bots from DB — called on gateway startup. */
  async startAllActiveBots(): Promise<void> {
    const { data, error } = await this.supabase
      .from("tenant_channels")
      .select("*")
      .eq("status", "active");

    if (error) {
      this.log.error(`Failed to load active channels: ${error.message}`);
      return;
    }

    const channels = (data ?? []) as TenantChannel[];
    this.log.info(`Starting ${channels.length} active tenant bot(s)`);

    for (const channel of channels) {
      try {
        await this.startBot(channel);
      } catch (err) {
        this.log.warn(`Failed to start bot ${channel.id}: ${String(err)}`);
      }
    }
  }

  // ---- Webhook Handling ----

  /**
   * Route an incoming Telegram webhook update to the correct bot instance.
   * Returns true if the update was handled.
   */
  async handleWebhookUpdate(
    tenantId: string,
    webhookSecret: string,
    update: unknown,
  ): Promise<boolean> {
    // Find the channel by tenant + secret
    const { data, error } = await this.supabase
      .from("tenant_channels")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("webhook_secret", webhookSecret)
      .eq("channel_type", "telegram")
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    const channelId = data.id as string;
    const instance = this.bots.get(channelId);
    if (!instance) {
      this.log.warn(`Webhook received for inactive bot [${channelId}]`);
      return false;
    }

    // Forward update to Grammy's bot.handleUpdate()
    try {
      await instance.bot.handleUpdate(update as Parameters<Bot["handleUpdate"]>[0]);
    } catch (err) {
      this.log.error(`Webhook handler error [${channelId}]: ${String(err)}`);
    }
    return true;
  }

  // ---- Internal Helpers ----

  private async loadChannel(channelId: string, tenantId: string): Promise<TenantChannel | null> {
    const { data, error } = await this.supabase
      .from("tenant_channels")
      .select("*")
      .eq("id", channelId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    return data as TenantChannel;
  }

  private async updateChannelStatus(
    channelId: string,
    status: TenantChannel["status"],
    lastError?: string,
  ): Promise<void> {
    await this.supabase
      .from("tenant_channels")
      .update({
        status,
        last_error: lastError ?? null,
      })
      .eq("id", channelId);
  }

  /** Gracefully stop all running bots (for gateway shutdown). */
  async stopAll(): Promise<void> {
    const ids = [...this.bots.keys()];
    for (const id of ids) {
      await this.stopBot(id);
    }
  }
}
