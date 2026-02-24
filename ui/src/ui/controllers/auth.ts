import type { OpenClawApp } from "../app.ts";
import {
  clearSession,
  emailSignIn,
  emailSignUp,
  getStoredSession,
  googleLoginUrl,
  logout,
  phoneLogin,
  sendPhoneCode,
  storeSession,
  walletNonce,
  walletVerify,
  type AuthSession,
} from "../xplatform-client.ts";

export async function handleEmailLogin(host: OpenClawApp, email: string, password: string) {
  host.supabaseLoading = true;
  host.supabaseError = null;
  try {
    const session = await emailSignIn(email, password);
    storeSession(session);
    host.supabaseSession = session;
    host.connect();
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
    storeSession(session);
    host.supabaseSession = session;
    host.connect();
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
  } catch (err) {
    host.supabaseError = err instanceof Error ? err.message : String(err);
  } finally {
    host.supabaseLoading = false;
  }
}

export async function handleGoogleLogin(host: OpenClawApp) {
  host.supabaseLoading = true;
  host.supabaseError = null;
  try {
    const redirectUri = window.location.origin + window.location.pathname;
    const url = googleLoginUrl(redirectUri);
    // xplatform returns JSON with oauth_url instead of a 302 redirect
    const res = await fetch(url);
    const data = (await res.json()) as { oauth_url?: string };
    if (data.oauth_url) {
      window.location.href = data.oauth_url;
      return;
    }
    // Fallback: if server does redirect directly, navigate to the URL
    window.location.href = url;
  } catch (err) {
    host.supabaseError = err instanceof Error ? err.message : String(err);
    host.supabaseLoading = false;
  }
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
      };
      storeSession(session);
      host.supabaseSession = session;
      // Clean the URL
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (!host.connected) {
        host.connect();
      }
      return;
    }
  }

  // Restore from localStorage
  const stored = getStoredSession();
  if (stored) {
    host.supabaseSession = stored;
  }
}
