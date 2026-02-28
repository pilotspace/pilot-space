/**
 * Unit tests for AuthCoreAuthProvider.
 *
 * fetch() is mocked via vitest — tests verify RS256 token path,
 * local storage persistence, silent refresh, and error propagation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthCoreAuthProvider } from '../providers/AuthCoreAuthProvider';

const BASE_URL = 'https://authcore.example.com';

// JWT with exp = 9999999999 (year 2286 — effectively never expires)
const FAR_FUTURE_EXP = 9999999999;
// Build a minimal base64-encoded JWT payload
function makeJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: 'user-123', exp, iat: 1000000 }));
  return `${header}.${payload}.signature`;
}

const VALID_ACCESS_TOKEN = makeJwt(FAR_FUTURE_EXP);
const EXPIRED_ACCESS_TOKEN = makeJwt(1000); // exp in the past

const MOCK_LOGIN_RESPONSE = {
  access_token: VALID_ACCESS_TOKEN,
  refresh_token: 'refresh-abc',
  token_type: 'bearer',
  user_id: 'user-id-456',
  role: 'member',
};

const MOCK_REFRESH_RESPONSE = {
  access_token: makeJwt(FAR_FUTURE_EXP + 1),
  refresh_token: 'new-refresh-token',
  token_type: 'bearer',
};

describe('AuthCoreAuthProvider — constructor', () => {
  it('throws when baseUrl is empty', () => {
    expect(() => new AuthCoreAuthProvider('')).toThrow('requires a non-empty baseUrl');
  });

  it('strips trailing slash from baseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_LOGIN_RESPONSE,
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AuthCoreAuthProvider('https://authcore.example.com/');
    await provider.login('user@example.com', 'password');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://authcore.example.com/auth/login',
      expect.any(Object)
    );
  });
});

describe('AuthCoreAuthProvider.login', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns LoginResult on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_LOGIN_RESPONSE,
    });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    const result = await provider.login('user@example.com', 'password');

    expect(result.tokens.accessToken).toBe(VALID_ACCESS_TOKEN);
    expect(result.tokens.refreshToken).toBe('refresh-abc');
    expect(result.tokens.expiresAt).toBe(FAR_FUTURE_EXP);
    expect(result.user.id).toBe('user-id-456');
    expect(result.user.email).toBe('user@example.com');
    expect(result.user.name).toBe('');
    expect(result.user.avatarUrl).toBeNull();
  });

  it('persists tokens and user info to localStorage', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_LOGIN_RESPONSE,
    });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    await provider.login('user@example.com', 'password');

    const stored = JSON.parse(localStorage.getItem('authcore:tokens')!);
    expect(stored.accessToken).toBe(VALID_ACCESS_TOKEN);
    expect(stored.refreshToken).toBe('refresh-abc');
    expect(stored.user.id).toBe('user-id-456');
    expect(stored.user.email).toBe('user@example.com');
  });

  it('throws user-friendly message from RFC 7807 error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({
          type: 'https://authcore.local/errors/auth_invalid_credentials',
          title: 'Invalid Credentials',
          status: 401,
          detail: 'Invalid email or password',
        }),
    });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    await expect(provider.login('user@example.com', 'wrong')).rejects.toThrow(
      'Invalid email or password'
    );
  });

  it('throws fallback message for non-JSON error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    await expect(provider.login('user@example.com', 'pass')).rejects.toThrow('Login failed (500)');
  });
});

describe('AuthCoreAuthProvider.logout', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls logout endpoint and removes localStorage tokens', async () => {
    // Pre-seed tokens
    localStorage.setItem(
      'authcore:tokens',
      JSON.stringify({
        accessToken: VALID_ACCESS_TOKEN,
        refreshToken: 'r',
        expiresAt: FAR_FUTURE_EXP,
      })
    );

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    await provider.logout();

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/auth/logout`,
      expect.objectContaining({ method: 'POST' })
    );
    expect(localStorage.getItem('authcore:tokens')).toBeNull();
  });

  it('still clears localStorage when logout network call fails', async () => {
    localStorage.setItem(
      'authcore:tokens',
      JSON.stringify({
        accessToken: VALID_ACCESS_TOKEN,
        refreshToken: 'r',
        expiresAt: FAR_FUTURE_EXP,
      })
    );
    fetchMock.mockRejectedValue(new Error('network error'));

    const provider = new AuthCoreAuthProvider(BASE_URL);
    await provider.logout(); // must not throw

    expect(localStorage.getItem('authcore:tokens')).toBeNull();
  });
});

describe('AuthCoreAuthProvider.refresh', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns new AuthTokens and updates localStorage', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_REFRESH_RESPONSE,
    });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    const tokens = await provider.refresh('old-refresh-token');

    expect(tokens.refreshToken).toBe('new-refresh-token');
    expect(tokens.accessToken).toBe(MOCK_REFRESH_RESPONSE.access_token);

    const stored = JSON.parse(localStorage.getItem('authcore:tokens')!);
    expect(stored.refreshToken).toBe('new-refresh-token');
  });

  it('throws user-friendly message on refresh failure', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ detail: 'Refresh token expired' }),
    });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    await expect(provider.refresh('expired')).rejects.toThrow('Refresh token expired');
  });
});

describe('AuthCoreAuthProvider.signup', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns SignupResult with verificationRequired=true', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user_id: 'new-user-id',
        email: 'new@example.com',
        verification_sent: true,
      }),
    });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    const result = await provider.signup('new@example.com', 'password123');

    expect(result.user?.id).toBe('new-user-id');
    expect(result.user?.email).toBe('new@example.com');
    expect(result.tokens).toBeNull();
    expect(result.verificationRequired).toBe(true);
  });

  it('calls /auth/register with email and password', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user_id: 'u1',
        email: 'test@example.com',
        verification_sent: false,
      }),
    });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    await provider.signup('test@example.com', 'pass123');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/auth/register`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'pass123' }),
      })
    );
  });

  it('throws user-friendly message on signup failure', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ detail: 'Email already registered' }),
    });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    await expect(provider.signup('dup@example.com', 'pass')).rejects.toThrow(
      'Email already registered'
    );
  });
});

describe('AuthCoreAuthProvider.restoreSession', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns LoginResult when valid tokens and user are stored', async () => {
    localStorage.setItem(
      'authcore:tokens',
      JSON.stringify({
        accessToken: VALID_ACCESS_TOKEN,
        refreshToken: 'r',
        expiresAt: FAR_FUTURE_EXP,
        user: {
          id: 'user-id-456',
          email: 'user@example.com',
          name: 'Core User',
          avatarUrl: null,
        },
      })
    );

    const provider = new AuthCoreAuthProvider(BASE_URL);
    const result = await provider.restoreSession();

    expect(result).not.toBeNull();
    expect(result!.user.id).toBe('user-id-456');
    expect(result!.user.email).toBe('user@example.com');
    expect(result!.tokens.accessToken).toBe(VALID_ACCESS_TOKEN);
  });

  it('returns null when no tokens stored', async () => {
    const provider = new AuthCoreAuthProvider(BASE_URL);
    const result = await provider.restoreSession();

    expect(result).toBeNull();
  });

  it('returns null and clears storage when tokens are invalid', async () => {
    localStorage.setItem(
      'authcore:tokens',
      JSON.stringify({
        accessToken: EXPIRED_ACCESS_TOKEN,
        refreshToken: 'bad-refresh',
        expiresAt: 1000, // expired
      })
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    const result = await provider.restoreSession();

    expect(result).toBeNull();
  });

  it('silently refreshes and restores when token is near expiry', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    localStorage.setItem(
      'authcore:tokens',
      JSON.stringify({
        accessToken: EXPIRED_ACCESS_TOKEN,
        refreshToken: 'refresh-token',
        expiresAt: nowSeconds + 10, // within 30s buffer
        user: { id: 'uid', email: 'e@e.com', name: 'N', avatarUrl: null },
      })
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_REFRESH_RESPONSE,
    });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    const result = await provider.restoreSession();

    expect(result).not.toBeNull();
    expect(result!.tokens.accessToken).toBe(MOCK_REFRESH_RESPONSE.access_token);
  });
});

describe('AuthCoreAuthProvider.getToken', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns token when stored and not expired', async () => {
    localStorage.setItem(
      'authcore:tokens',
      JSON.stringify({
        accessToken: VALID_ACCESS_TOKEN,
        refreshToken: 'r',
        expiresAt: FAR_FUTURE_EXP,
      })
    );

    const provider = new AuthCoreAuthProvider(BASE_URL);
    const token = await provider.getToken();

    expect(token).toBe(VALID_ACCESS_TOKEN);
    expect(fetchMock).not.toHaveBeenCalled(); // no refresh needed
  });

  it('silently refreshes when token is near expiry', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    localStorage.setItem(
      'authcore:tokens',
      JSON.stringify({
        accessToken: EXPIRED_ACCESS_TOKEN,
        refreshToken: 'refresh-token',
        expiresAt: nowSeconds + 10, // within 30s buffer
      })
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_REFRESH_RESPONSE,
    });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    const token = await provider.getToken();

    expect(token).toBe(MOCK_REFRESH_RESPONSE.access_token);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns null when no tokens stored', async () => {
    const provider = new AuthCoreAuthProvider(BASE_URL);
    const token = await provider.getToken();
    expect(token).toBeNull();
  });

  it('returns null and clears storage when refresh fails', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    localStorage.setItem(
      'authcore:tokens',
      JSON.stringify({
        accessToken: EXPIRED_ACCESS_TOKEN,
        refreshToken: 'bad-refresh',
        expiresAt: nowSeconds + 5,
      })
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const provider = new AuthCoreAuthProvider(BASE_URL);
    const token = await provider.getToken();

    expect(token).toBeNull();
    expect(localStorage.getItem('authcore:tokens')).toBeNull();
  });
});
