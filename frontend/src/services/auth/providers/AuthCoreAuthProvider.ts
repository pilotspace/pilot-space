/**
 * AuthCoreAuthProvider — RS256-signed JWT auth via AuthCore server.
 *
 * Used when NEXT_PUBLIC_AUTH_PROVIDER=authcore.
 * Base URL is discovered at startup via GET /api/v1/auth/config.
 */

import type {
  AuthProvider,
  AuthTokens,
  AuthProviderUser,
  LoginResult,
  SignupResult,
} from './AuthProvider';

const AUTHCORE_TOKENS_KEY = 'authcore:tokens';

interface AuthCoreLoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: string;
  role: string;
}

interface AuthCoreRefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

interface AuthCoreRegisterResponse {
  user_id: string;
  email: string;
  verification_sent: boolean;
}

interface StoredAuthCoreState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user?: { id: string; email: string; name: string; avatarUrl: string | null };
}

function parseJwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!)) as { exp?: number };
    return payload.exp ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Extract a user-friendly message from an AuthCore RFC 7807 error response.
 * Falls back to the raw body if parsing fails.
 */
function parseAuthCoreError(body: string, status: number, operation: string): string {
  try {
    const parsed = JSON.parse(body) as { detail?: string; title?: string };
    return parsed.detail || parsed.title || `${operation} failed`;
  } catch {
    return `${operation} failed (${status})`;
  }
}

export class AuthCoreAuthProvider implements AuthProvider {
  private readonly baseUrl: string;
  private _refreshPromise: Promise<AuthTokens> | null = null;

  constructor(baseUrl: string) {
    if (!baseUrl) {
      throw new Error('AuthCoreAuthProvider requires a non-empty baseUrl');
    }
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(parseAuthCoreError(body, res.status, 'Login'));
    }

    const data: AuthCoreLoginResponse = await res.json();

    const expiresAt = parseJwtExpiry(data.access_token) || Math.floor(Date.now() / 1000) + 900;
    const tokens: AuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    };

    // AuthCore login response has user_id at top level, not a user object.
    // Email is the one we sent; name/avatar come from profile (not in login response).
    const user: AuthProviderUser = {
      id: data.user_id,
      email,
      name: '',
      avatarUrl: null,
    };

    if (typeof window !== 'undefined') {
      const stored: StoredAuthCoreState = { ...tokens, user };
      localStorage.setItem(AUTHCORE_TOKENS_KEY, JSON.stringify(stored));
    }

    return { tokens, user };
  }

  async logout(): Promise<void> {
    const token = await this.getToken();

    // Best-effort server-side logout; ignore errors
    if (token) {
      try {
        await fetch(`${this.baseUrl}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Network failure during logout — still clear local state
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTHCORE_TOKENS_KEY);
    }
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const res = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(parseAuthCoreError(body, res.status, 'Token refresh'));
    }

    const data: AuthCoreRefreshResponse = await res.json();

    const expiresAt = parseJwtExpiry(data.access_token) || Math.floor(Date.now() / 1000) + 900;
    const tokens: AuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    };

    if (typeof window !== 'undefined') {
      // Preserve user data from existing stored state
      const existing = localStorage.getItem(AUTHCORE_TOKENS_KEY);
      const existingUser = existing
        ? (JSON.parse(existing) as StoredAuthCoreState).user
        : undefined;
      const stored: StoredAuthCoreState = { ...tokens, user: existingUser };
      localStorage.setItem(AUTHCORE_TOKENS_KEY, JSON.stringify(stored));
    }

    return tokens;
  }

  async signup(email: string, password: string): Promise<SignupResult> {
    const res = await fetch(`${this.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(parseAuthCoreError(body, res.status, 'Signup'));
    }

    const data: AuthCoreRegisterResponse = await res.json();

    return {
      user: { id: data.user_id, email: data.email, name: '', avatarUrl: null },
      tokens: null,
      verificationRequired: data.verification_sent,
    };
  }

  async restoreSession(): Promise<LoginResult | null> {
    if (typeof window === 'undefined') return null;

    const raw = localStorage.getItem(AUTHCORE_TOKENS_KEY);
    if (!raw) return null;

    try {
      const stored: StoredAuthCoreState = JSON.parse(raw);

      // Validate token is still usable (getToken handles silent refresh)
      const accessToken = await this.getToken();
      if (!accessToken) return null;

      // Re-read tokens after potential refresh
      const refreshedRaw = localStorage.getItem(AUTHCORE_TOKENS_KEY);
      const refreshedStored: StoredAuthCoreState = refreshedRaw ? JSON.parse(refreshedRaw) : stored;

      // Build user from stored state or extract from JWT
      let userId = refreshedStored.user?.id ?? '';
      if (!userId) {
        try {
          const payload = JSON.parse(atob(accessToken.split('.')[1]!)) as { sub?: string };
          userId = payload.sub ?? '';
        } catch {
          // JWT parse failure
        }
      }

      if (!userId) {
        // Cannot identify user — treat as unauthenticated
        localStorage.removeItem(AUTHCORE_TOKENS_KEY);
        return null;
      }

      const user: AuthProviderUser = refreshedStored.user ?? {
        id: userId,
        email: '',
        name: '',
        avatarUrl: null,
      };
      // Ensure user.id is always set even if stored user had empty id
      if (!user.id) user.id = userId;

      return {
        tokens: {
          accessToken: refreshedStored.accessToken,
          refreshToken: refreshedStored.refreshToken,
          expiresAt: refreshedStored.expiresAt,
        },
        user,
      };
    } catch {
      localStorage.removeItem(AUTHCORE_TOKENS_KEY);
      return null;
    }
  }

  async getToken(): Promise<string | null> {
    if (typeof window === 'undefined') return null;

    const raw = localStorage.getItem(AUTHCORE_TOKENS_KEY);
    if (!raw) return null;

    try {
      const tokens: AuthTokens = JSON.parse(raw);
      const nowSeconds = Math.floor(Date.now() / 1000);

      // Token is still valid (with 30s buffer)
      if (tokens.expiresAt > nowSeconds + 30) {
        return tokens.accessToken;
      }

      // Deduplicate concurrent refresh calls
      if (!this._refreshPromise) {
        this._refreshPromise = this.refresh(tokens.refreshToken).finally(() => {
          this._refreshPromise = null;
        });
      }
      const refreshed = await this._refreshPromise;
      return refreshed.accessToken;
    } catch {
      localStorage.removeItem(AUTHCORE_TOKENS_KEY);
      return null;
    }
  }
}
