'use client';

/**
 * useLastChatSession — Phase 88 Plan 04 Task 1.
 *
 * Returns the workspace's most-recently-updated chat session for the
 * launchpad ContinueCard. Graceful degrade is mandatory — any failure
 * (404, network error, malformed payload) returns `{ session: null }`
 * so the ContinueCard renders nothing.
 *
 * Plan deviation locked at pre-work (2026-04-24):
 *   The plan cites `/chats?limit=1&order_by=last_message_at_desc`. The
 *   real backend endpoint is `GET /ai/sessions?limit=1` (see
 *   SessionListStore.fetchSessions — same path, same auth shape). The
 *   payload exposes `id`, `title`, `updated_at`, `context_history` but
 *   NOT a per-session message preview or artifact list. We map title +
 *   updated_at and supply '' / [] for preview + artifacts. ContinueCard
 *   gracefully renders empty pill rows.
 *
 * Auth model: Bearer + X-Workspace-Id, fetched fresh per request via
 * supabase.auth.getSession(). Matches SessionListStore pattern — we do
 * NOT use apiClient here because the workspaceId is passed in (not
 * read from localStorage), so we want the header to track the
 * caller's intent precisely.
 *
 * @module features/homepage/hooks/use-last-chat-session
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** API base — falls back to /api/v1 when env is unset (matches stores/ai). */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

/** Lightweight artifact pill payload for ContinueCard chips (Phase 88). */
export interface LastChatSessionArtifact {
  kind: 'ISSUE' | 'NOTE' | 'SPEC' | string;
  label: string;
  id: string;
}

/**
 * Public shape consumed by ContinueCard (Phase 88 Plan 04 Task 2).
 * `lastMessagePreview` may be empty string when backend doesn't expose it.
 */
export interface LastChatSession {
  id: string;
  title: string;
  lastMessagePreview: string;
  lastMessageAt: string; // ISO8601
  artifacts: LastChatSessionArtifact[];
}

export interface UseLastChatSessionResult {
  session: LastChatSession | null;
  isLoading: boolean;
}

/**
 * Backend `/ai/sessions` response — only the fields we consume.
 * Mirrors SessionSummaryResponse from `stores/ai/types/session.ts`.
 */
interface SessionListItem {
  id: string;
  title?: string | null;
  updated_at: string;
}

interface SessionListResponse {
  sessions?: SessionListItem[];
}

async function getAuthHeaders(workspaceId: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Workspace-Id': workspaceId,
  };

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch {
    // Continue without bearer — backend will 401 and the hook will
    // gracefully return session: null (UI renders nothing).
  }

  return headers;
}

async function fetchLastSession(workspaceId: string): Promise<LastChatSession | null> {
  const headers = await getAuthHeaders(workspaceId);
  const url = `${API_BASE}/ai/sessions?limit=1`;

  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', headers });
  } catch {
    // Network error — graceful degrade.
    return null;
  }

  if (!response.ok) {
    // 404 / 401 / 5xx — graceful degrade.
    return null;
  }

  let data: SessionListResponse;
  try {
    data = (await response.json()) as SessionListResponse;
  } catch {
    return null;
  }

  const first = data.sessions?.[0];
  if (!first) return null;

  return {
    id: first.id,
    title: first.title ?? 'Untitled chat',
    // Backend /ai/sessions list endpoint does not return a per-session
    // message preview. Supply empty string so ContinueCard can collapse
    // the preview row gracefully (UI-SPEC §6 empty row).
    lastMessagePreview: '',
    lastMessageAt: first.updated_at,
    // Likewise for artifacts — list endpoint omits them. Phase 89+ may
    // expose context_history → artifact pills.
    artifacts: [],
  };
}

/**
 * Returns `{ session, isLoading }`. Errors are silently mapped to
 * `{ session: null, isLoading: false }` — the hook NEVER throws into
 * the React render path.
 */
export function useLastChatSession(workspaceId: string): UseLastChatSessionResult {
  const query = useQuery<LastChatSession | null>({
    queryKey: ['chats', 'last', workspaceId],
    queryFn: () => fetchLastSession(workspaceId),
    staleTime: 30_000,
    retry: false,
    enabled: !!workspaceId,
  });

  return {
    session: query.data ?? null,
    isLoading: query.isLoading,
  };
}
