import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { TenantChannelManager } from "../tenant-channels/manager.js";
import type { GatewayRequestHandlers } from "./types.js";

/**
 * Create tenant.channels.* RPC handlers.
 * All methods require JWT auth (client.supabaseUser must exist).
 */
export function createTenantChannelHandlers(
  manager: TenantChannelManager | null,
): GatewayRequestHandlers {
  function requireAuth(client: { supabaseUser?: { id: string } } | null): string {
    const userId = client?.supabaseUser?.id;
    if (!userId) {
      throw errorShape(ErrorCodes.NOT_PAIRED, "Authentication required");
    }
    return userId;
  }

  function requireManager(): TenantChannelManager {
    if (!manager) {
      throw errorShape(ErrorCodes.UNAVAILABLE, "Tenant channel management is not enabled");
    }
    return manager;
  }

  return {
    /** List the current tenant's connected channels. */
    "tenant.channels.list": async ({ client, respond }) => {
      try {
        const tenantId = requireAuth(client);
        const mgr = requireManager();
        const channels = await mgr.listChannels(tenantId);
        respond(true, { channels });
      } catch (err) {
        if (isErrorShape(err)) {
          respond(false, undefined, err);
          return;
        }
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
      }
    },

    /** Test a Telegram bot token (calls getMe). */
    "tenant.channels.test": async ({ params, client, respond }) => {
      try {
        requireAuth(client);
        const mgr = requireManager();
        const botToken = params.botToken as string | undefined;
        if (!botToken || typeof botToken !== "string") {
          respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "botToken is required"));
          return;
        }
        const probe = await mgr.testTelegramToken(botToken);
        respond(true, { probe });
      } catch (err) {
        if (isErrorShape(err)) {
          respond(false, undefined, err);
          return;
        }
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
      }
    },

    /** Add a new channel connection for the current tenant. */
    "tenant.channels.add": async ({ params, client, respond }) => {
      try {
        const tenantId = requireAuth(client);
        const mgr = requireManager();
        const channelType = params.channelType as string | undefined;
        const botToken = params.botToken as string | undefined;
        const label = params.label as string | undefined;

        if (channelType !== "telegram") {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "Only 'telegram' channel type is supported"),
          );
          return;
        }
        if (!botToken || typeof botToken !== "string") {
          respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "botToken is required"));
          return;
        }

        const channel = await mgr.addChannel({
          tenantId,
          channelType,
          botToken,
          label,
        });
        respond(true, { channel });
      } catch (err) {
        if (isErrorShape(err)) {
          respond(false, undefined, err);
          return;
        }
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
      }
    },

    /** Remove a channel connection for the current tenant. */
    "tenant.channels.remove": async ({ params, client, respond }) => {
      try {
        const tenantId = requireAuth(client);
        const mgr = requireManager();
        const channelId = params.channelId as string | undefined;
        if (!channelId || typeof channelId !== "string") {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "channelId is required"),
          );
          return;
        }
        await mgr.removeChannel(channelId, tenantId);
        respond(true, { ok: true });
      } catch (err) {
        if (isErrorShape(err)) {
          respond(false, undefined, err);
          return;
        }
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
      }
    },
  };
}

function isErrorShape(err: unknown): err is { code: string; message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    typeof (err as Record<string, unknown>).code === "string"
  );
}
