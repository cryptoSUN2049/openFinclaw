import { html, nothing } from "lit";
import type { TenantChannelEntry } from "./tenant-channels.types.ts";

export function renderTenantChannelCard(params: {
  channel: TenantChannelEntry;
  onRemove: (channelId: string) => void;
}) {
  const { channel, onRemove } = params;
  const isActive = channel.status === "active";
  const botName = channel.botInfo?.first_name ?? channel.label ?? "Telegram Bot";
  const botUsername = channel.botInfo?.username;
  const statusColor = isActive ? "#22c55e" : "#ef4444";
  const statusText = isActive ? "已连接" : "连接失败";

  return html`
    <div class="card" style="position: relative;">
      <div class="row" style="align-items: center; gap: 12px;">
        <div style="font-size: 28px;">🤖</div>
        <div style="flex: 1; min-width: 0;">
          <div class="card-title" style="margin: 0;">${botName}</div>
          ${botUsername ? html`<div class="muted">@${botUsername}</div>` : nothing}
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: ${statusColor};
          "></span>
          <span style="font-size: 13px; color: ${statusColor};">${statusText}</span>
        </div>
      </div>

      ${
        !isActive && channel.lastError
          ? html`
            <div class="callout danger" style="margin-top: 12px; font-size: 13px;">
              ${friendlyError(channel.lastError)}
            </div>
          `
          : nothing
      }

      <div class="row" style="margin-top: 12px; justify-content: flex-end;">
        <button
          class="btn btn-danger"
          style="font-size: 12px;"
          @click=${() => {
            if (confirm("确定要断开这个渠道连接吗？")) {
              onRemove(channel.id);
            }
          }}
        >
          断开连接
        </button>
      </div>
    </div>
  `;
}

function friendlyError(error: string): string {
  if (error.includes("401") || error.includes("Unauthorized")) {
    return "Bot Token 已失效，请重新连接";
  }
  if (error.includes("ETIMEOUT") || error.includes("timeout") || error.includes("network")) {
    return "网络连接超时，正在重试...";
  }
  return "连接异常，请尝试断开后重新连接";
}
