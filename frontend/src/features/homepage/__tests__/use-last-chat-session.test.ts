/**
 * Phase 88 Plan 04 — Task 1: useLastChatSession hook (RED).
 *
 * Hook contract (from PLAN §interfaces):
 *   useLastChatSession(workspaceId) → { session: LastChatSession | null, isLoading: boolean }
 *
 * Plan deviation locked at pre-work (2026-04-24):
 *   The plan cites `/chats?limit=1&order_by=last_message_at_desc`. That route
 *   does not exist. The real backend endpoint is `GET /ai/sessions?limit=1`
 *   which returns `{ sessions: SessionSummaryResponse[] }` (snake_case). The
 *   payload exposes `id`, `title`, `updated_at`, `context_history`, etc., but
 *   does NOT expose a per-session message preview or artifact list. The hook
 *   maps `title` → title, `updated_at` → lastMessageAt, '' → preview, [] →
 *   artifacts. Documented in 88-04-SUMMARY.md.
 *
 * Auth: backend requires Bearer + X-Workspace-Id. We use direct `fetch` (no
 * apiClient) so we can inject both headers explicitly — matches the pattern
 * already in `SessionListStore.fetchSessions`.
 *
 * Graceful degrade: any non-2xx response OR network error returns
 * `{ session: null, isLoading: false }` — never throws into render.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

// ─── Auth mock (used by hook to fetch Bearer token) ─────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

// ─── Test wrapper with QueryClient ──────────────────────────────────────────

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  // eslint-disable-next-line react/display-name
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

// ─── fetch mock ─────────────────────────────────────────────────────────────

const fetchMock = vi.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

import { useLastChatSession } from '../hooks/use-last-chat-session';

describe('useLastChatSession (Phase 88 Plan 04)', () => {
  it('returns session mapped from /ai/sessions?limit=1 success response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        sessions: [
          {
            id: 'sess-abc',
            workspace_id: 'ws-1',
            agent_name: 'conversation',
            title: 'Q3 planning thread',
            updated_at: '2026-04-24T10:00:00Z',
            created_at: '2026-04-24T09:00:00Z',
            turn_count: 4,
            total_cost_usd: 0,
            expires_at: '2026-05-24T10:00:00Z',
          },
        ],
      }),
    });

    const { result } = renderHook(() => useLastChatSession('ws-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.session).not.toBeNull();
    expect(result.current.session?.id).toBe('sess-abc');
    expect(result.current.session?.title).toBe('Q3 planning thread');
    expect(result.current.session?.lastMessageAt).toBe('2026-04-24T10:00:00Z');
    // No preview / artifacts in backend payload — graceful empties.
    expect(result.current.session?.lastMessagePreview).toBe('');
    expect(result.current.session?.artifacts).toEqual([]);
  });

  it('returns session: null when /ai/sessions returns empty list', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ sessions: [] }),
    });

    const { result } = renderHook(() => useLastChatSession('ws-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it('returns session: null on 404 (graceful degrade)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    });

    const { result } = renderHook(() => useLastChatSession('ws-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it('returns session: null on network error (graceful degrade — never throws)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const { result } = renderHook(() => useLastChatSession('ws-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it('returns isLoading=true on initial render before fetch resolves', () => {
    // Never-resolving promise — initial state is loading.
    fetchMock.mockReturnValueOnce(new Promise(() => {}));

    const { result } = renderHook(() => useLastChatSession('ws-1'), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.session).toBeNull();
  });
});
