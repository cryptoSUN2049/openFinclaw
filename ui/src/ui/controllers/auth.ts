import type { OpenClawApp } from "../app.ts";
import {
  clearSession,
  emailSignIn,
  emailSignUp,
  fetchProfile,
  getStoredSession,
  logout,
  phoneLogin,
  sendPhoneCode,
  storeSession,
  walletNonce,
  walletVerify,
  type AuthSession,
} from "../xplatform-client.ts";

/**
 * Fetch user profile and merge into session. Best-effort — does not throw.
 */
async function enrichSessionProfile(host: OpenClawApp, session: AuthSession): Promise<void> {
  try {
    const profile = await fetchProfile(session.access_token);
    let updated = false;
    if (profile.email && !session.email) {
      session.email = profile.email;
      updated = true;
    }
    if (profile.phone && !session.phone) {
      session.phone = profile.phone;
      updated = true;
    }
    if (profile.name && !session.name) {
      session.name = profile.name;
      updated = true;
    }
    if (profile.avatar_url && !session.avatar_url) {
      session.avatar_url = profile.avatar_url;
      updated = true;
    }
    if (updated) {
      storeSession(session);
      host.supabaseSession = { ...session };
    }
  } catch {
    // Profile fetch is best-effort; login still succeeds
  }
}

export async function handleEmailLogin(host: OpenClawApp, email: string, password: string) {
  host.supabaseLoading = true;
  host.supabaseError = null;
  try {
    const session = await emailSignIn(email, password);
    storeSession(session);
    host.supabaseSession = session;
    host.connect();
    void enrichSessionProfile(host, session);
  } catch (err) {
    host.supabaseError = err instanceof Error ? err.message : String(err);
  } finally {
    host.supabaseLoading = false;
  }
}

export async function handleEmailSignup(host: OpenClawApp, email: string, password: string) {
  host.supabaseLoading = true;
  host.supabaseError = null;
  try {
    const session = await emailSignUp(email, password);
    storeSession(session);
    host.supabaseSession = session;
    host.connect();
    void enrichSessionProfile(host, session);
  } catch (err) {
    host.supabaseError = err instanceof Error ? err.message : String(err);
  } finally {
    host.supabaseLoading = false;
  }
}

export async function handleSendPhoneCode(host: OpenClawApp, phone: string, countryCode: string) {
  host.supabaseLoading = true;
  host.supabaseError = null;
  try {
    await sendPhoneCode(phone, countryCode);
    // Code sent successfully; UI should switch to verification input
  } catch (err) {
    host.supabaseError = err instanceof Error ? err.message : String(err);
  } finally {
    host.supabaseLoading = false;
  }
}

export async function handlePhoneLogin(
  host: OpenClawApp,
  phone: string,
  code: string,
  countryCode: string,
) {
  host.supabaseLoading = true;
  host.supabaseError = null;
  try {
    const session = await phoneLogin(phone, code, countryCode);
    // Ensure phone number is stored in session for profile display
    if (!session.phone) {
      session.phone = `${countryCode}${phone}`;
    }
    storeSession(session);
    host.supabaseSession = session;
    host.connect();
    void enrichSessionProfile(host, session);
  } catch (err) {
    host.supabaseError = err instanceof Error ? err.message : String(err);
  } finally {
    host.supabaseLoading = false;
  }
}

export async function handleWalletLogin(host: OpenClawApp) {
  host.supabaseLoading = true;
  host.supabaseError = null;
  try {
    // Request wallet connection via window.ethereum (MetaMask etc.)
    const ethereum = (window as unknown as Record<string, unknown>).ethereum as
      | { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
      | undefined;
    if (!ethereum) {
      host.supabaseError = "No wallet detected. Please install MetaMask.";
      host.supabaseLoading = false;
      return;
    }

    const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
    const address = accounts[0];
    if (!address) {
      host.supabaseError = "No account selected";
      host.supabaseLoading = false;
      return;
    }

    // Get nonce from xplatform
    const { nonce } = await walletNonce(address);

    // Construct SIWE message
    const domain = window.location.host;
    const origin = window.location.origin;
    const message = [
      `${domain} wants you to sign in with your Ethereum account:`,
      address,
      "",
      "Sign in to OpenFinClaw",
      "",
      `URI: ${origin}`,
      `Version: 1`,
      `Chain ID: 1`,
      `Nonce: ${nonce}`,
      `Issued At: ${new Date().toISOString()}`,
    ].join("\n");

    // Request signature
    const signature = (await ethereum.request({
      method: "personal_sign",
      params: [message, address],
    })) as string;

    // Verify with xplatform
    const session = await walletVerify(message, signature, address);
    storeSession(session);
    host.supabaseSession = session;
    host.connect();
    void enrichSessionProfile(host, session);
  } catch (err) {
    host.supabaseError = err instanceof Error ? err.message : String(err);
  } finally {
    host.supabaseLoading = false;
  }
}

export function handleGoogleLogin(_host: OpenClawApp) {
  const redirectUri = window.location.pathname;
  // Gateway proxies the xplatform call server-side (no CORS/CSP issues)
  window.location.href = `/__auth__/google/redirect?redirect_uri=${encodeURIComponent(redirectUri)}`;
}

export async function handleLogout(host: OpenClawApp) {
  const session = host.supabaseSession as AuthSession | null;
  if (session?.access_token) {
    await logout(session.access_token);
  }
  clearSession();
  host.supabaseSession = null;
  host.connected = false;
  host.client?.stop();
}

/**
 * Check for a stored session on startup (replaces Supabase onAuthStateChange).
 * Also handles Google OAuth redirect callback.
 */
export function initAuthListener(host: OpenClawApp) {
  // Handle Google OAuth callback — token arrives as URL hash fragment
  const hash = window.location.hash;
  if (hash) {
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshTokenVal = params.get("refresh_token");
    if (accessToken) {
      const session: AuthSession = {
        access_token: accessToken,
        refresh_token: refreshTokenVal,
        user_id: params.get("user_id") ?? "",
        email: params.get("email"),
        name: params.get("name") ?? params.get("full_name"),
        avatar_url: params.get("avatar_url") ?? params.get("picture"),
      };
      storeSession(session);
      host.supabaseSession = session;
      // Clean the URL
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (!host.connected) {
        host.connect();
      }
      void enrichSessionProfile(host, session);
      return;
    }
  }

  // Restore from localStorage
  const stored = getStoredSession();
  if (stored) {
    host.supabaseSession = stored;
    // Refresh profile if missing user info
    if (!stored.name && !stored.email) {
      void enrichSessionProfile(host, stored);
    }
  }
}
