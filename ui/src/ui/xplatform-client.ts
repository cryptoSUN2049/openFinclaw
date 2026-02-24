const XPLATFORM_API_URL = import.meta.env.VITE_XPLATFORM_API_URL as string | undefined;

export function isAuthConfigured(): boolean {
  return Boolean(XPLATFORM_API_URL);
}

export type AuthSession = {
  access_token: string;
  refresh_token: string | null;
  user_id: string;
  email?: string | null;
};

const STORAGE_KEY = "openfinclaw_auth_session";

export function getStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.access_token === "string" && typeof parsed?.user_id === "string") {
      return parsed as AuthSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function storeSession(session: AuthSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function apiUrl(path: string): string {
  if (!XPLATFORM_API_URL) throw new Error("XPLATFORM_API_URL not configured");
  return `${XPLATFORM_API_URL}${path}`;
}

async function handleJsonResponse<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.message ?? body?.error ?? body?.detail ?? `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

function extractSession(data: Record<string, unknown>): AuthSession {
  // xplatform may return tokens at top level or nested under session/data
  const accessToken =
    (data.access_token as string) ??
    (data.token as string) ??
    ((data.session as Record<string, unknown>)?.access_token as string);
  const refreshToken =
    (data.refresh_token as string | null) ??
    ((data.session as Record<string, unknown>)?.refresh_token as string | null) ??
    null;
  const userId =
    (data.user_id as string) ??
    (data.id as string) ??
    ((data.user as Record<string, unknown>)?.id as string) ??
    "";
  const email =
    (data.email as string | null) ??
    ((data.user as Record<string, unknown>)?.email as string | null) ??
    null;

  if (!accessToken) throw new Error("No access token in response");

  return { access_token: accessToken, refresh_token: refreshToken, user_id: userId, email };
}

// --- Email Auth ---

export async function emailSignIn(email: string, password: string): Promise<AuthSession> {
  const res = await fetch(apiUrl("/api/auth/supabase/signin"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await handleJsonResponse<Record<string, unknown>>(res);
  return extractSession(data);
}

export async function emailSignUp(email: string, password: string): Promise<AuthSession> {
  const res = await fetch(apiUrl("/api/auth/supabase/signup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await handleJsonResponse<Record<string, unknown>>(res);
  return extractSession(data);
}

// --- Phone Auth ---

export async function sendPhoneCode(phone: string, countryCode: string): Promise<void> {
  const res = await fetch(apiUrl("/api/auth/send_code"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, country_code: countryCode }),
  });
  await handleJsonResponse(res);
}

export async function phoneLogin(
  phone: string,
  code: string,
  countryCode: string,
): Promise<AuthSession> {
  const res = await fetch(apiUrl("/api/auth/phone_login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code, country_code: countryCode }),
  });
  const data = await handleJsonResponse<Record<string, unknown>>(res);
  return extractSession(data);
}

// --- Wallet Auth (SIWE) ---

export async function walletNonce(address: string): Promise<{ nonce: string; expires_at: string }> {
  const res = await fetch(apiUrl(`/api/auth/wallet/nonce?address=${encodeURIComponent(address)}`));
  return handleJsonResponse(res);
}

export async function walletVerify(
  message: string,
  signature: string,
  address: string,
): Promise<AuthSession> {
  const res = await fetch(apiUrl("/api/auth/wallet/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature, address }),
  });
  const data = await handleJsonResponse<Record<string, unknown>>(res);
  return extractSession(data);
}

// --- Google OAuth ---

export function googleLoginUrl(redirectUri: string): string {
  if (!XPLATFORM_API_URL) throw new Error("XPLATFORM_API_URL not configured");
  return `${XPLATFORM_API_URL}/api/auth/google/login?redirect_uri=${encodeURIComponent(redirectUri)}`;
}

// --- Token Management ---

export async function refreshToken(refresh: string): Promise<AuthSession> {
  const res = await fetch(apiUrl("/api/auth/refresh_token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  const data = await handleJsonResponse<Record<string, unknown>>(res);
  return extractSession(data);
}

export async function logout(accessToken: string): Promise<void> {
  try {
    await fetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    // Best-effort; clear local state regardless
  }
}
