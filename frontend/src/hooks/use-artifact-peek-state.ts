/**
 * useArtifactPeekState — URL-driven peek/focus state for artifacts.
 *
 * Source of truth for Phase 86 peek drawer + split-pane focus.
 * Reads `useSearchParams()`; mutates via `router.replace()` with scroll preserved.
 *
 * Peek and focus are mutually exclusive — opening one removes the other.
 *
 * See `.planning/phases/86-peek-drawer-split-pane-lineage/86-UI-SPEC.md` §7.
 */
'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  isArtifactTokenKey,
  type ArtifactTokenKey,
} from '@/lib/artifact-tokens';

export type ArtifactPeekView = 'split' | 'read' | 'chat';

export interface PeekStateAPI {
  peekId: string | null;
  peekType: ArtifactTokenKey | null;
  focusId: string | null;
  focusType: ArtifactTokenKey | null;
  view: ArtifactPeekView;
  isPeekOpen: boolean;
  isFocusOpen: boolean;
  openPeek: (id: string, type: ArtifactTokenKey) => void;
  closePeek: () => void;
  openFocus: (id: string, type: ArtifactTokenKey, view?: ArtifactPeekView) => void;
  closeFocus: () => void;
  escalate: () => void;
  demote: () => void;
  setView: (view: ArtifactPeekView) => void;
}

const ALL_PEEK_KEYS = ['peek', 'peekType', 'focus', 'focusType', 'view'] as const;

function normalizeType(raw: string | null): ArtifactTokenKey | null {
  if (!raw) return null;
  return isArtifactTokenKey(raw) ? raw : null;
}

function normalizeView(raw: string | null): ArtifactPeekView {
  if (raw === 'read' || raw === 'chat' || raw === 'split') return raw;
  return 'split';
}

export function useArtifactPeekState(): PeekStateAPI {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const peekId = searchParams.get('peek');
  const peekType = normalizeType(searchParams.get('peekType'));
  const focusId = searchParams.get('focus');
  const focusType = normalizeType(searchParams.get('focusType'));
  const view = normalizeView(searchParams.get('view'));

  const isPeekOpen = Boolean(peekId && peekType);
  const isFocusOpen = Boolean(focusId && focusType);

  const buildUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === undefined) params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  const replace = useCallback(
    (url: string) => {
      router.replace(url, { scroll: false });
    },
    [router],
  );

  const openPeek = useCallback(
    (id: string, type: ArtifactTokenKey) => {
      replace(
        buildUrl({
          peek: id,
          peekType: type,
          focus: null,
          focusType: null,
          view: null,
        }),
      );
    },
    [buildUrl, replace],
  );

  const closePeek = useCallback(() => {
    replace(buildUrl({ peek: null, peekType: null }));
  }, [buildUrl, replace]);

  const openFocus = useCallback(
    (id: string, type: ArtifactTokenKey, v: ArtifactPeekView = 'split') => {
      replace(
        buildUrl({
          focus: id,
          focusType: type,
          view: v,
          peek: null,
          peekType: null,
        }),
      );
    },
    [buildUrl, replace],
  );

  const closeFocus = useCallback(() => {
    replace(buildUrl({ focus: null, focusType: null, view: null }));
  }, [buildUrl, replace]);

  const escalate = useCallback(() => {
    if (!peekId || !peekType) return;
    openFocus(peekId, peekType, 'split');
  }, [openFocus, peekId, peekType]);

  const demote = useCallback(() => {
    if (!focusId || !focusType) return;
    openPeek(focusId, focusType);
  }, [openPeek, focusId, focusType]);

  const setView = useCallback(
    (next: ArtifactPeekView) => {
      if (!focusId) return;
      replace(buildUrl({ view: next }));
    },
    [buildUrl, replace, focusId],
  );

  return useMemo<PeekStateAPI>(
    () => ({
      peekId,
      peekType,
      focusId,
      focusType,
      view,
      isPeekOpen,
      isFocusOpen,
      openPeek,
      closePeek,
      openFocus,
      closeFocus,
      escalate,
      demote,
      setView,
    }),
    [
      peekId,
      peekType,
      focusId,
      focusType,
      view,
      isPeekOpen,
      isFocusOpen,
      openPeek,
      closePeek,
      openFocus,
      closeFocus,
      escalate,
      demote,
      setView,
    ],
  );
}

export const _PEEK_QUERY_KEYS = ALL_PEEK_KEYS;
