/**
 * useSkillsViewQueryStringSync — two-way bind URL `?view=` ↔ local
 * `'cards' | 'graph'` state for the Skills gallery (Phase 92 Plan 03 Task 1).
 *
 * Pattern mirrors `usePaletteQueryStringSync` (Phase 90):
 *   - mount-only hydration from URL
 *   - whitelist guard rejects unknown values (T-92-10 mitigation)
 *   - setMode writes via `router.replace({ scroll: false })`
 *   - setMode('cards') strips the param to keep the default URL clean
 *
 * The `?view=` param is shared with `useArtifactPeekState`, but the two
 * domains are disjoint:
 *   - peek state expects `'split' | 'read' | 'chat'` — only honored when
 *     `focus` is also present
 *   - this hook expects `'cards' | 'graph'`
 *
 * Each side whitelists its own vocabulary and silently falls back when the
 * value is foreign, so the two consumers don't fight each other on a
 * gallery page that never opens a focus pane.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type SkillsViewMode = 'cards' | 'graph';

/**
 * Whitelist guard. Maps the raw `?view=` value (or null) to a SkillsViewMode.
 * Unknown values fall back to 'cards' silently — the caller must NOT write
 * the fallback back to the URL (preserves the original peek-state value when
 * the two domains overlap).
 */
function whitelist(raw: string | null): SkillsViewMode {
  return raw === 'graph' ? 'graph' : 'cards';
}

export function useSkillsViewQueryStringSync(): [
  SkillsViewMode,
  (next: SkillsViewMode) => void,
] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Hydrate from URL on every render (cheap; memoized on searchParams ref).
  const urlMode = useMemo(
    () => whitelist(searchParams.get('view')),
    [searchParams],
  );
  const [mode, setMode] = useState<SkillsViewMode>(urlMode);

  // Reflect external URL flips (slash-command navigation, browser back) into
  // local state. Only reacts when the whitelisted urlMode actually changes.
  useEffect(() => {
    if (urlMode !== mode) {
      setMode(urlMode);
    }
    // We intentionally exclude `mode` to avoid a feedback loop — setMode
    // already keeps local state in sync when the user toggles via the UI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlMode]);

  const update = useCallback(
    (next: SkillsViewMode) => {
      setMode(next);
      // Preserve any other query params on the URL — only mutate `view`.
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'cards') {
        params.delete('view');
      } else {
        params.set('view', next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return [mode, update];
}
