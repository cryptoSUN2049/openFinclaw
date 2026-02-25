import { html, nothing } from "lit";

export type UserProfileProps = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  onLogout: () => void;
};

// Module-level dropdown state
let dropdownOpen = false;
let cleanupListener: (() => void) | null = null;

function requestRerender() {
  const app = document.querySelector("openclaw-app");
  if (app && "requestUpdate" in app) {
    (app as { requestUpdate: () => void }).requestUpdate();
  }
}

function closeDropdown() {
  dropdownOpen = false;
  if (cleanupListener) {
    cleanupListener();
    cleanupListener = null;
  }
  requestRerender();
}

function toggleDropdown(e: Event) {
  e.stopPropagation();
  dropdownOpen = !dropdownOpen;
  if (dropdownOpen) {
    // Close on any click outside (next tick to avoid immediate trigger)
    const handler = () => closeDropdown();
    requestAnimationFrame(() => {
      document.addEventListener("click", handler, { once: true });
      cleanupListener = () => document.removeEventListener("click", handler);
    });
  } else {
    closeDropdown();
  }
  requestRerender();
}

/** Derive a display name from available fields */
function getDisplayName(props: UserProfileProps): string {
  if (props.name) return props.name;
  if (props.email) return props.email.split("@")[0] ?? props.email;
  if (props.phone) return maskPhone(props.phone);
  return "User";
}

/** Get initial letter for avatar fallback */
function getInitial(props: UserProfileProps): string {
  if (props.name) return props.name[0]!.toUpperCase();
  if (props.email) return props.email[0]!.toUpperCase();
  if (props.phone) return "#";
  return "U";
}

/** Mask middle digits of a phone number for display */
function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.length <= 7) return digits;
  return digits.slice(0, -4).slice(0, -4) + "****" + digits.slice(-4);
}

/** Subtitle line (email or phone, whichever is available) */
function getSubtitle(props: UserProfileProps): string | null {
  if (props.email) return props.email;
  if (props.phone) return props.phone;
  return null;
}

export function renderUserProfile(props: UserProfileProps) {
  const { avatarUrl, onLogout } = props;
  const displayName = getDisplayName(props);
  const initial = getInitial(props);
  const subtitle = getSubtitle(props);
  const hasAvatar = Boolean(avatarUrl);

  return html`
    <style>
      .user-profile {
        position: relative;
      }
      .user-profile__trigger {
        display: flex;
        align-items: center;
        gap: 6px;
        background: none;
        border: none;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 6px;
        transition: background 0.15s;
      }
      .user-profile__trigger:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .user-profile__avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #6c5ce7;
        color: #fff;
        font-size: 0.8rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;
      }
      .user-profile__avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .user-profile__dropdown {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        min-width: 240px;
        background: #1a1a2e;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
        z-index: 1000;
        overflow: hidden;
      }
      .user-profile__header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .user-profile__header-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #6c5ce7;
        color: #fff;
        font-size: 1.1rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;
      }
      .user-profile__header-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .user-profile__info {
        flex: 1;
        min-width: 0;
      }
      .user-profile__name {
        font-size: 0.9rem;
        font-weight: 600;
        color: #fff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .user-profile__subtitle {
        font-size: 0.78rem;
        color: rgba(255, 255, 255, 0.45);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-top: 2px;
      }
      .user-profile__actions {
        padding: 6px 0;
      }
      .user-profile__action {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 10px 16px;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.75);
        font-size: 0.85rem;
        cursor: pointer;
        text-align: left;
        transition: background 0.15s, color 0.15s;
      }
      .user-profile__action:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .user-profile__action--danger:hover {
        color: #ff6b6b;
      }
      .user-profile__action-icon {
        font-size: 1rem;
        width: 20px;
        text-align: center;
        opacity: 0.7;
      }
    </style>
    <div class="user-profile">
      <button
        class="user-profile__trigger"
        @click=${toggleDropdown}
        title=${displayName}
      >
        <div class="user-profile__avatar">
          ${hasAvatar
            ? html`<img src=${avatarUrl!} alt="" />`
            : initial}
        </div>
      </button>
      ${dropdownOpen
        ? html`
            <div class="user-profile__dropdown" @click=${(e: Event) => e.stopPropagation()}>
              <div class="user-profile__header">
                <div class="user-profile__header-avatar">
                  ${hasAvatar
                    ? html`<img src=${avatarUrl!} alt="" />`
                    : initial}
                </div>
                <div class="user-profile__info">
                  <div class="user-profile__name">${displayName}</div>
                  ${subtitle
                    ? html`<div class="user-profile__subtitle">${subtitle}</div>`
                    : nothing}
                </div>
              </div>
              <div class="user-profile__actions">
                <button
                  class="user-profile__action user-profile__action--danger"
                  @click=${() => {
                    closeDropdown();
                    onLogout();
                  }}
                >
                  <span class="user-profile__action-icon">&#x279C;</span>
                  退出登录
                </button>
              </div>
            </div>
          `
        : nothing}
    </div>
  `;
}
