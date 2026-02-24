import { html, nothing } from "lit";
import { renderTenantChannelCard } from "./tenant-channels.card.ts";
import { renderTelegramWizard } from "./tenant-channels.telegram-wizard.ts";
import type { TenantChannelsProps } from "./tenant-channels.types.ts";

/**
 * Cloud-mode channels view: simplified per-tenant channel management.
 * Users see their connected bots and can add/remove Telegram bots via a wizard.
 */
export function renderTenantChannels(props: TenantChannelsProps) {
  const hasChannels = props.channels.length > 0;

  return html`
    ${
      props.wizardOpen && props.wizardState
        ? renderTelegramWizard({
            state: props.wizardState,
            onClose: props.onCloseWizard,
            onTokenInput: props.onWizardTokenInput,
            onVerify: props.onWizardVerify,
            onConnect: props.onWizardConnect,
            onBack: props.onWizardBack,
          })
        : nothing
    }

    <section>
      <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div class="card-title" style="margin: 0;">我的渠道</div>
        <button class="btn btn-primary" @click=${props.onOpenWizard}>
          + 添加渠道
        </button>
      </div>

      ${
        props.loading
          ? html`
              <div class="card"><div class="muted">加载中...</div></div>
            `
          : nothing
      }

      ${
        !props.loading && hasChannels
          ? html`
            <div class="grid grid-cols-2">
              ${props.channels.map((ch) =>
                renderTenantChannelCard({
                  channel: ch,
                  onRemove: props.onRemoveChannel,
                }),
              )}
            </div>
          `
          : nothing
      }

      ${
        !props.loading && !hasChannels
          ? html`
            <div class="card" style="text-align: center; padding: 48px 24px;">
              <div style="font-size: 48px; margin-bottom: 12px;">🔗</div>
              <div style="font-size: 15px; font-weight: 500; margin-bottom: 8px;">
                还没有连接的渠道
              </div>
              <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">
                连接一个 Telegram Bot，就可以在聊天中使用 AI 金融助手了。
              </div>
              <button class="btn btn-primary" @click=${props.onOpenWizard}>
                连接 Telegram Bot
              </button>
            </div>
          `
          : nothing
      }
    </section>
  `;
}
