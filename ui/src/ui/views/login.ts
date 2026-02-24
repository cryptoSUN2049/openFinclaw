import { html, nothing } from "lit";

export type LoginTab = "phone" | "email";

export type LoginViewCallbacks = {
  onEmailLogin: (email: string, password: string) => void;
  onEmailSignup: (email: string, password: string) => void;
  onSendPhoneCode: (phone: string, countryCode: string) => void;
  onPhoneLogin: (phone: string, code: string, countryCode: string) => void;
  onWalletLogin: () => void;
  onGoogleLogin: () => void;
  authError: string | null;
  authLoading: boolean;
};

// Module-level state (persists across renders within the same page session)
let activeTab: LoginTab = "phone";
let phoneCodeSent = false;
let codeCooldown = 0;
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

function requestRerender() {
  const app = document.querySelector("openclaw-app");
  if (app && "requestUpdate" in app) {
    (app as { requestUpdate: () => void }).requestUpdate();
  }
}

function setTab(tab: LoginTab) {
  activeTab = tab;
  phoneCodeSent = false;
  requestRerender();
}

function startCooldown() {
  codeCooldown = 60;
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    codeCooldown--;
    if (codeCooldown <= 0) {
      if (cooldownTimer) clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
    requestRerender();
  }, 1000);
}

function handlePhoneSubmit(e: Event, callbacks: LoginViewCallbacks) {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const data = new FormData(form);
  const phone = (data.get("phone") as string)?.trim() ?? "";
  const code = (data.get("code") as string)?.trim() ?? "";
  const countryCode = (data.get("countryCode") as string)?.trim() || "+86";
  if (!phone || !code) return;
  callbacks.onPhoneLogin(phone, code, countryCode);
}

function handleSendCode(callbacks: LoginViewCallbacks) {
  const phoneInput = document.getElementById("login-phone") as HTMLInputElement | null;
  const phone = phoneInput?.value?.trim();
  if (!phone) return;
  const countryCodeInput = document.getElementById("login-country") as HTMLInputElement | null;
  const countryCode = countryCodeInput?.value?.trim() || "+86";
  callbacks.onSendPhoneCode(phone, countryCode);
  phoneCodeSent = true;
  startCooldown();
}

function handleEmailSubmit(e: Event, callbacks: LoginViewCallbacks) {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const data = new FormData(form);
  const email = (data.get("email") as string)?.trim() ?? "";
  const password = (data.get("password") as string) ?? "";
  if (!email || !password) return;
  // Email login doubles as signup on xplatform
  callbacks.onEmailLogin(email, password);
}

// --- Phone Tab (default, matches Findoo design) ---
function renderPhoneTab(callbacks: LoginViewCallbacks) {
  const { authLoading } = callbacks;
  return html`
    <form @submit=${(e: Event) => handlePhoneSubmit(e, callbacks)}>
      <div class="login-field">
        <label>手机号</label>
        <div class="login-phone-row">
          <div class="login-country-picker">
            <span class="login-flag">🇨🇳</span>
            <input
              id="login-country"
              name="countryCode"
              type="text"
              value="+86"
              ?disabled=${authLoading}
              class="login-country-input"
            />
          </div>
          <input
            id="login-phone"
            name="phone"
            type="tel"
            required
            autocomplete="tel"
            ?disabled=${authLoading}
            placeholder="请输入手机号"
            class="login-phone-input"
          />
        </div>
      </div>

      <div class="login-field">
        <label>验证码</label>
        <div class="login-code-row">
          <input
            id="login-code"
            name="code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            required
            ?disabled=${authLoading}
            placeholder="请输入验证码"
            class="login-code-input"
          />
          <button
            type="button"
            class="login-send-code-btn"
            ?disabled=${authLoading || codeCooldown > 0}
            @click=${() => handleSendCode(callbacks)}
          >
            ${codeCooldown > 0 ? `${codeCooldown}s` : "发送验证码"}
          </button>
        </div>
      </div>

      <button class="login-submit-btn" type="submit" ?disabled=${authLoading}>
        ${
          authLoading
            ? html`
                <span class="login-spinner"></span>
              `
            : nothing
        }
        登录 / 注册
      </button>
    </form>
  `;
}

// --- Email Tab ---
function renderEmailTab(callbacks: LoginViewCallbacks) {
  const { authLoading } = callbacks;
  return html`
    <form @submit=${(e: Event) => handleEmailSubmit(e, callbacks)}>
      <div class="login-field">
        <label>邮箱</label>
        <input
          id="login-email"
          name="email"
          type="email"
          required
          autocomplete="email"
          ?disabled=${authLoading}
          placeholder="请输入邮箱地址"
        />
      </div>
      <div class="login-field">
        <label>密码</label>
        <input
          id="login-password"
          name="password"
          type="password"
          required
          autocomplete="current-password"
          ?disabled=${authLoading}
          placeholder="请输入密码"
        />
      </div>

      <button class="login-submit-btn" type="submit" ?disabled=${authLoading}>
        ${
          authLoading
            ? html`
                <span class="login-spinner"></span>
              `
            : nothing
        }
        登录 / 注册
      </button>
    </form>
  `;
}

export function renderLoginView(callbacks: LoginViewCallbacks) {
  const { authError, authLoading } = callbacks;

  return html`
    <style>
      .login-overlay {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        z-index: 9999;
      }
      .login-card {
        position: relative;
        background: #1a1a2e;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 40px 36px 32px;
        width: 100%;
        max-width: 440px;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
      }
      .login-close {
        position: absolute;
        top: 16px;
        right: 16px;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.4);
        font-size: 1.4rem;
        cursor: pointer;
        padding: 4px 8px;
        line-height: 1;
        border-radius: 6px;
        transition: color 0.2s, background 0.2s;
      }
      .login-close:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.08);
      }
      .login-brand {
        text-align: center;
        margin-bottom: 28px;
      }
      .login-brand h1 {
        font-size: 1.6rem;
        font-weight: 700;
        color: #fff;
        margin: 0;
        letter-spacing: -0.01em;
      }

      /* --- Tabs --- */
      .login-tabs {
        display: flex;
        gap: 0;
        margin-bottom: 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .login-tab {
        flex: 1;
        padding: 10px 0;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: rgba(255, 255, 255, 0.45);
        font-size: 0.95rem;
        font-weight: 500;
        cursor: pointer;
        transition: color 0.2s, border-color 0.2s;
        text-align: center;
      }
      .login-tab:hover {
        color: rgba(255, 255, 255, 0.7);
      }
      .login-tab.active {
        color: #fff;
        border-bottom-color: #6c5ce7;
      }

      /* --- Fields --- */
      .login-field {
        margin-bottom: 16px;
      }
      .login-field label {
        display: block;
        font-size: 0.85rem;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.7);
        margin-bottom: 8px;
      }
      .login-field input {
        width: 100%;
        padding: 12px 14px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        color: #fff;
        font-size: 0.9rem;
        box-sizing: border-box;
        transition: border-color 0.2s;
      }
      .login-field input::placeholder {
        color: rgba(255, 255, 255, 0.3);
      }
      .login-field input:focus {
        outline: none;
        border-color: #6c5ce7;
      }

      /* --- Phone row: flag + country code + phone input --- */
      .login-phone-row {
        display: flex;
        gap: 8px;
      }
      .login-country-picker {
        display: flex;
        align-items: center;
        gap: 4px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 0 10px;
        flex-shrink: 0;
      }
      .login-flag {
        font-size: 1.2rem;
        line-height: 1;
      }
      .login-country-input {
        width: 48px !important;
        padding: 12px 0 !important;
        background: transparent !important;
        border: none !important;
        color: #fff;
        font-size: 0.9rem;
        text-align: center;
      }
      .login-country-input:focus {
        outline: none;
        border: none !important;
      }
      .login-phone-input {
        flex: 1;
        min-width: 0;
      }

      /* --- Code row: input + send button --- */
      .login-code-row {
        display: flex;
        gap: 8px;
      }
      .login-code-input {
        flex: 1;
        min-width: 0;
      }
      .login-send-code-btn {
        flex-shrink: 0;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.6);
        font-size: 0.85rem;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.2s, color 0.2s;
      }
      .login-send-code-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }
      .login-send-code-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* --- Submit button (purple, full width) --- */
      .login-submit-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 14px;
        margin-top: 20px;
        background: #6c5ce7;
        border: none;
        border-radius: 10px;
        color: #fff;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s, opacity 0.2s;
      }
      .login-submit-btn:hover:not(:disabled) {
        background: #5a4bd1;
      }
      .login-submit-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* --- Divider --- */
      .login-divider {
        display: flex;
        align-items: center;
        gap: 14px;
        margin: 24px 0;
        color: rgba(255, 255, 255, 0.35);
        font-size: 0.8rem;
      }
      .login-divider::before,
      .login-divider::after {
        content: "";
        flex: 1;
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
      }

      /* --- Google button --- */
      .login-google-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: 100%;
        padding: 12px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 0.9rem;
        cursor: pointer;
        transition: background 0.2s, color 0.2s;
      }
      .login-google-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }
      .login-google-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .login-google-icon {
        width: 18px;
        height: 18px;
      }

      /* --- Terms --- */
      .login-terms {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-top: 20px;
        font-size: 0.78rem;
        color: rgba(255, 255, 255, 0.4);
        line-height: 1.5;
      }
      .login-terms input[type="checkbox"] {
        margin-top: 3px;
        accent-color: #6c5ce7;
        flex-shrink: 0;
      }
      .login-terms a {
        color: #6c5ce7;
        text-decoration: none;
      }
      .login-terms a:hover {
        text-decoration: underline;
      }

      /* --- Error --- */
      .login-error {
        background: rgba(255, 50, 50, 0.1);
        color: #ff6b6b;
        border: 1px solid rgba(255, 50, 50, 0.25);
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 0.85rem;
        margin-bottom: 16px;
      }

      /* --- Spinner --- */
      .login-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: login-spin 0.6s linear infinite;
        margin-right: 8px;
      }
      @keyframes login-spin {
        to { transform: rotate(360deg); }
      }
    </style>
    <div class="login-overlay">
      <div class="login-card">
        <div class="login-brand">
          <h1>Welcome to OpenFinClaw</h1>
        </div>

        <div class="login-tabs">
          <button
            class="login-tab ${activeTab === "phone" ? "active" : ""}"
            type="button"
            @click=${() => setTab("phone")}
          >手机登录</button>
          <button
            class="login-tab ${activeTab === "email" ? "active" : ""}"
            type="button"
            @click=${() => setTab("email")}
          >邮箱登录</button>
        </div>

        ${authError ? html`<div class="login-error">${authError}</div>` : nothing}

        ${activeTab === "phone" ? renderPhoneTab(callbacks) : nothing}
        ${activeTab === "email" ? renderEmailTab(callbacks) : nothing}

        <div class="login-divider">或者</div>

        <button
          class="login-google-btn"
          type="button"
          ?disabled=${authLoading}
          @click=${() => callbacks.onGoogleLogin()}
        >
          <svg class="login-google-icon" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.99 11.99 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77.01-.54z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          使用 Google 账号登录
        </button>

        <label class="login-terms">
          <input type="checkbox" checked />
          <span>我已阅读并同意
            <a href="javascript:void(0)">《服务条款》</a>和<a href="javascript:void(0)">《隐私政策》</a>
          </span>
        </label>
      </div>
    </div>
  `;
}
