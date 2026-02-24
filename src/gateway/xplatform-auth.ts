import type { XplatformAuthConfig } from "../config/types.gateway.js";
import type { SupabaseUser } from "./auth.js";

export type XplatformAuthResult = { ok: true; user: SupabaseUser } | { ok: false; reason: string };

// Simple in-memory cache: token → { user, expiresAt }
const tokenCache = new Map<string, { user: SupabaseUser; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds

function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of tokenCache) {
    if (entry.expiresAt <= now) {
      tokenCache.delete(key);
    }
  }
}

/**
 * Verify a JWT by calling xplatform's /api/users/me endpoint.
 * Returns user info on success, or a failure reason.
 * Results are cached in memory for 60s to reduce requests.
 */
export async function verifyXplatformToken(params: {
  jwt: string;
  config: XplatformAuthConfig;
}): Promise<XplatformAuthResult> {
  const { jwt, config } = params;

  // Check cache first
  const cached = tokenCache.get(jwt);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, user: cached.user };
  }

  try {
    const url = `${config.apiUrl}/api/users/me`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "invalid_token" };
    }

    if (!res.ok) {
      return { ok: false, reason: `xplatform_http_${res.status}` };
    }

    const body = (await res.json()) as Record<string, unknown>;

    // Extract user fields — xplatform may return { id, email, is_active } or nested
    const id =
      (typeof body.id === "string" ? body.id : undefined) ??
      (typeof body.user_id === "string" ? body.user_id : undefined) ??
      (typeof (body.user as Record<string, unknown>)?.id === "string"
        ? ((body.user as Record<string, unknown>).id as string)
        : undefined);

    if (!id) {
      return { ok: false, reason: "xplatform_missing_user_id" };
    }

    const email =
      (typeof body.email === "string" ? body.email : undefined) ??
      (typeof (body.user as Record<string, unknown>)?.email === "string"
        ? ((body.user as Record<string, unknown>).email as string)
        : undefined) ??
      "";

    // Check allowed domains
    if (config.allowedDomains && config.allowedDomains.length > 0 && email) {
      const domain = email.split("@")[1]?.toLowerCase();
      const allowed = config.allowedDomains.some((d) => d.toLowerCase() === domain);
      if (!allowed) {
        return { ok: false, reason: "email_domain_not_allowed" };
      }
    }

    const user: SupabaseUser = { id, email };

    // Cache the result
    tokenCache.set(jwt, { user, expiresAt: Date.now() + CACHE_TTL_MS });

    // Periodically clean expired entries
    if (tokenCache.size > 100) {
      cleanExpiredCache();
    }

    return { ok: true, user };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("abort") || message.includes("timeout")) {
      return { ok: false, reason: "xplatform_timeout" };
    }
    return { ok: false, reason: `xplatform_error: ${message}` };
  }
}
