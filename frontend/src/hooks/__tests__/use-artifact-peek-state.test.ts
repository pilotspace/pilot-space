/**
 * useArtifactPeekState — URL-state transition tests (Phase 86).
 *
 * Covers all PeekStateAPI methods: open/close peek, open/close focus,
 * escalate, demote, setView, and mutually-exclusive peek/focus behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const replaceMock = vi.fn();
const searchParamsRef = { current: new URLSearchParams() };

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/acme',
  useSearchParams: () => searchParamsRef.current,
  useParams: () => ({ workspaceSlug: 'acme' }),
}));

import { useArtifactPeekState } from '../use-artifact-peek-state';

function setSearchParams(qs: string) {
  searchParamsRef.current = new URLSearchParams(qs);
}

describe('useArtifactPeekState', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    setSearchParams('');
  });

  afterEach(() => {
    replaceMock.mockClear();
  });

  it('starts closed when URL has no peek/focus params', () => {
    const { result } = renderHook(() => useArtifactPeekState());
    expect(result.current.isPeekOpen).toBe(false);
    expect(result.current.isFocusOpen).toBe(false);
    expect(result.current.peekId).toBeNull();
    expect(result.current.focusId).toBeNull();
    expect(result.current.view).toBe('split');
  });

  it('reads peek state from URL', () => {
    setSearchParams('peek=n123&peekType=NOTE');
    const { result } = renderHook(() => useArtifactPeekState());
    expect(result.current.isPeekOpen).toBe(true);
    expect(result.current.peekId).toBe('n123');
    expect(result.current.peekType).toBe('NOTE');
  });

  it('openPeek writes peek + peekType and clears focus', () => {
    setSearchParams('focus=f1&focusType=ISSUE&view=split');
    const { result } = renderHook(() => useArtifactPeekState());
    act(() => {
      result.current.openPeek('n123', 'NOTE');
    });
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = (replaceMock.mock.calls[0]?.[0] ?? '') as string;
    expect(url).toContain('peek=n123');
    expect(url).toContain('peekType=NOTE');
    expect(url).not.toContain('focus=');
    expect(url).not.toContain('view=');
  });

  it('closePeek removes peek params', () => {
    setSearchParams('peek=n1&peekType=NOTE');
    const { result } = renderHook(() => useArtifactPeekState());
    act(() => {
      result.current.closePeek();
    });
    const url = (replaceMock.mock.calls[0]?.[0] ?? '') as string;
    expect(url).not.toContain('peek=');
    expect(url).not.toContain('peekType=');
  });

  it('escalate replaces peek with focus + view=split', () => {
    setSearchParams('peek=n1&peekType=NOTE');
    const { result } = renderHook(() => useArtifactPeekState());
    act(() => {
      result.current.escalate();
    });
    const url = (replaceMock.mock.calls[0]?.[0] ?? '') as string;
    expect(url).toContain('focus=n1');
    expect(url).toContain('focusType=NOTE');
    expect(url).toContain('view=split');
    expect(url).not.toContain('peek=');
  });

  it('demote replaces focus with peek', () => {
    setSearchParams('focus=i9&focusType=ISSUE&view=read');
    const { result } = renderHook(() => useArtifactPeekState());
    act(() => {
      result.current.demote();
    });
    const url = (replaceMock.mock.calls[0]?.[0] ?? '') as string;
    expect(url).toContain('peek=i9');
    expect(url).toContain('peekType=ISSUE');
    expect(url).not.toContain('focus=');
    expect(url).not.toContain('view=');
  });

  it('setView updates only the view param when focus is open', () => {
    setSearchParams('focus=i9&focusType=ISSUE&view=split');
    const { result } = renderHook(() => useArtifactPeekState());
    act(() => {
      result.current.setView('read');
    });
    const url = (replaceMock.mock.calls[0]?.[0] ?? '') as string;
    expect(url).toContain('view=read');
    expect(url).toContain('focus=i9');
  });

  it('setView is a no-op when focus is not open', () => {
    setSearchParams('');
    const { result } = renderHook(() => useArtifactPeekState());
    act(() => {
      result.current.setView('chat');
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('peek and focus are mutually exclusive — openFocus removes peek', () => {
    setSearchParams('peek=n1&peekType=NOTE');
    const { result } = renderHook(() => useArtifactPeekState());
    act(() => {
      result.current.openFocus('i2', 'ISSUE');
    });
    const url = (replaceMock.mock.calls[0]?.[0] ?? '') as string;
    expect(url).not.toContain('peek=');
    expect(url).toContain('focus=i2');
    expect(url).toContain('focusType=ISSUE');
  });

  it('closeFocus clears focus + view', () => {
    setSearchParams('focus=i9&focusType=ISSUE&view=chat');
    const { result } = renderHook(() => useArtifactPeekState());
    act(() => {
      result.current.closeFocus();
    });
    const url = (replaceMock.mock.calls[0]?.[0] ?? '') as string;
    expect(url).not.toContain('focus=');
    expect(url).not.toContain('focusType=');
    expect(url).not.toContain('view=');
  });

  it('invalid peekType falls back to null', () => {
    setSearchParams('peek=n1&peekType=BOGUS');
    const { result } = renderHook(() => useArtifactPeekState());
    expect(result.current.peekType).toBeNull();
    expect(result.current.isPeekOpen).toBe(false);
  });

  it('invalid view falls back to split', () => {
    setSearchParams('focus=i9&focusType=ISSUE&view=weird');
    const { result } = renderHook(() => useArtifactPeekState());
    expect(result.current.view).toBe('split');
  });
});
