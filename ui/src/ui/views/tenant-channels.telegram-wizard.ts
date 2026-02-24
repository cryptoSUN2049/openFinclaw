import { html, nothing } from "lit";
import type { TelegramSetupState } from "./tenant-channels.types.ts";

export function renderTelegramWizard(params: {
  state: TelegramSetupState;
  onClose: () => void;
  onTokenInput: (token: string) => void;
  onVerify: () => void;
  onConnect: () => void;
  onBack: () => void;
}) {
  const { state, onClose, onTokenInput, onVerify, onConnect, onBack } = params;

  return html`
    <div class="modal-overlay" @click=${(e: Event) => {
      if ((e.target as HTMLElement).classList.contains("modal-overlay")) {
        onClose();
      }
    }}>
      <div class="modal" style="max-width: 480px; width: 100%;">
        <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div class="card-title" style="margin: 0;">连接 Telegram Bot</div>
          <button class="btn btn-icon" @click=${onClose} style="font-size: 18px;">&times;</button>
        </div>

        ${state.step === 1 ? renderStep1(state, onTokenInput, onVerify) : nothing}
        ${state.step === 2 ? renderStep2(state, onConnect, onBack) : nothing}
        ${state.step === 3 ? renderStep3(state, onClose) : nothing}
      </div>
    </div>
  `;
}

function renderStep1(
  state: TelegramSetupState,
  onTokenInput: (token: string) => void,
  onVerify: () => void,
) {
  return html`
    <div style="margin-bottom: 16px;">
      <div class="card-sub" style="margin-bottom: 12px;">第 1 步：获取 Bot Token</div>
      <ol style="margin: 0 0 16px 0; padding-left: 20px; font-size: 13px; line-height: 1.8; color: var(--text-secondary);">
        <li>打开 Telegram，搜索 <strong>@BotFather</strong></li>
        <li>发送 <code>/newbot</code> 创建机器人</li>
        <li>复制获得的 Token</li>
      </ol>
      <input
        type="text"
        class="input"
        placeholder="粘贴你的 Bot Token"
        .value=${state.botToken}
        @input=${(e: Event) => onTokenInput((e.target as HTMLInputElement).value)}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter" && state.botToken.trim()) {
            onVerify();
          }
        }}
        style="width: 100%; box-sizing: border-box;"
      />
    </div>

    ${
      state.error
        ? html`<div class="callout danger" style="margin-bottom: 12px; font-size: 13px;">${state.error}</div>`
        : nothing
    }

    <div class="row" style="justify-content: flex-end;">
      <button
        class="btn btn-primary"
        ?disabled=${!state.botToken.trim() || state.loading}
        @click=${onVerify}
      >
        ${state.loading ? "验证中..." : "下一步 →"}
      </button>
    </div>
  `;
}

function renderStep2(state: TelegramSetupState, onConnect: () => void, onBack: () => void) {
  const botName = state.botInfo?.first_name ?? "Bot";
  const botUsername = state.botInfo?.username;

  return html`
    <div style="margin-bottom: 16px;">
      <div class="card-sub" style="margin-bottom: 12px;">第 2 步：确认机器人信息</div>
      <div class="callout" style="margin-bottom: 12px;">
        <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">✅ 验证成功</div>
        <div style="font-size: 13px; color: var(--text-secondary);">
          机器人名称：<strong>${botName}</strong>
          ${botUsername ? html`<br/>用户名：<strong>@${botUsername}</strong>` : nothing}
        </div>
      </div>
      <div style="font-size: 13px; color: var(--text-secondary);">
        点击"连接"后，这个机器人就会成为你的 AI 金融助手。
      </div>
    </div>

    ${
      state.error
        ? html`<div class="callout danger" style="margin-bottom: 12px; font-size: 13px;">${state.error}</div>`
        : nothing
    }

    <div class="row" style="justify-content: space-between;">
      <button class="btn" @click=${onBack}>← 上一步</button>
      <button
        class="btn btn-primary"
        ?disabled=${state.loading}
        @click=${onConnect}
      >
        ${state.loading ? "连接中..." : "连接 →"}
      </button>
    </div>
  `;
}

function renderStep3(state: TelegramSetupState, onClose: () => void) {
  const botUsername = state.botInfo?.username;

  return html`
    <div style="text-align: center; padding: 16px 0;">
      <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
      <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">连接成功！</div>
      <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 24px;">
        你的 AI 金融助手已就绪。<br/>
        现在去 Telegram 给
        ${
          botUsername
            ? html`<strong>@${botUsername}</strong>`
            : html`
                你的机器人
              `
        }
        发消息试试吧！
      </div>
      <button class="btn btn-primary" @click=${onClose}>完成</button>
    </div>
  `;
}
