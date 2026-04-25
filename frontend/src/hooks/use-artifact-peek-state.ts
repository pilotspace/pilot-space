/**
 * useArtifactPeekState — URL-driven peek/focus state for artifacts.
 *
 * Source of truth for Phase 86 peek drawer + split-pane focus.
 * Reads `useSearchParams()`; mutates via `router.replace()` with scroll preserved.
 *
 * Peek and focus are mutually exclusive — opening one removes the other.
 *
 * Phase 91 Plan 04 — additive extension for skill reference files. The same
 * `peek` query param is overloaded with a `skill-file:<slug>/<path>` prefix
 * scheme (single-param, no `peekType` companion) so the existing entity-peek
 * dispatch (`peek=<id>&peekType=<TOKEN>`) is preserved verbatim. When the
 * prefix matches, `skillFile` is populated and `peekId`/`peekType` are forced
 * to `null` so downstream consumers don't try to resolve the value via
 * `useArtifactQuery`. `escalate` is a no-op for skill-file peeks (split-pane
 * for files is deferred to Phase 92).
 *
 * See `.planning/phases/86-peek-drawer-split-pane-lineage/86-UI-SPEC.md` §7
 * and `.planning/phases/91-skills-gallery-detail-palette-chat-surfacing/91-CONTEXT.md`
 * §Peek Drawer Integration.
 */
'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  isArtifactTokenKey,
  type ArtifactTokenKey,
} from '@/lib/artifact-tokens';
import {
  decodeSkillFilePeek,
  encodeSkillFilePeek,
} from '@/features/skills/lib/skill-peek';

export type ArtifactPeekView = 'split' | 'read' | 'chat';

export interface SkillFilePeekTarget {
  slug: string;
  path: string;
}

export interface PeekStateAPI {
  peekId: string | null;
  peekType: ArtifactTokenKey | null;
  focusId: string | null;
  focusType: ArtifactTokenKey | null;
  view: ArtifactPeekView;
  isPeekOpen: boolean;
  isFocusOpen: boolean;
  /** Phase 91 — non-null when `?peek=skill-file:<slug>/<path>` is present. */
  skillFile: SkillFilePeekTarget | null;
  /** Phase 91 — convenience flag mirrors `skillFile !== null`. */
  isSkillFilePeek: boolean;
  openPeek: (id: string, type: ArtifactTokenKey) => void;
  closePeek: () => void;
  openFocus: (id: string, type: ArtifactTokenKey, view?: ArtifactPeekView) => void;
  closeFocus: () => void;
  escalate: () => void;
  demote: () => void;
  setView: (view: ArtifactPeekView) => void;
  /** Phase 91 — opens the drawer at a skill reference file. */
  openSkillFilePeek: (slug: string, path: string) => void;
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

  const peekRaw = searchParams.get('peek');
  // Phase 91 — detect the skill-file: prefix BEFORE the entity-peek path so
  // we never confuse it for a (peekId, peekType) pair. When skillFile is
  // non-null, peekId/peekType are forced to null so consumers like
  // useArtifactQuery don't attempt to resolve the value as an artifact UUID.
  const skillFile = decodeSkillFilePeek(peekRaw);
  const peekId = skillFile ? null : peekRaw;
  const peekType = skillFile
    ? null
    : normalizeType(searchParams.get('peekType'));
  const focusId = searchParams.get('focus');
  const focusType = normalizeType(searchParams.get('focusType'));
  const view = normalizeView(searchParams.get('view'));

  const isSkillFilePeek = skillFile !== null;
  const isPeekOpen = Boolean((peekId && peekType) || skillFile);
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
    // Phase 91 — split-pane for skill files is deferred to Phase 92.
    if (isSkillFilePeek) return;
    if (!peekId || !peekType) return;
    openFocus(peekId, peekType, 'split');
  }, [isSkillFilePeek, openFocus, peekId, peekType]);

  const openSkillFilePeek = useCallback(
    (slug: string, path: string) => {
      replace(
        buildUrl({
          peek: encodeSkillFilePeek(slug, path),
          peekType: null,
          focus: null,
          focusType: null,
          view: null,
        }),
      );
    },
    [buildUrl, replace],
  );

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
      skillFile,
      isSkillFilePeek,
      openPeek,
      closePeek,
      openFocus,
      closeFocus,
      escalate,
      demote,
      setView,
      openSkillFilePeek,
    }),
    [
      peekId,
      peekType,
      focusId,
      focusType,
      view,
      isPeekOpen,
      isFocusOpen,
      skillFile,
      isSkillFilePeek,
      openPeek,
      closePeek,
      openFocus,
      closeFocus,
      escalate,
      demote,
      setView,
      openSkillFilePeek,
    ],
  );
}

export const _PEEK_QUERY_KEYS = ALL_PEEK_KEYS;
