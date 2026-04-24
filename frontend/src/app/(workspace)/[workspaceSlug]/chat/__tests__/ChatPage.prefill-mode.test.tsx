/**
 * Phase 88 Plan 04 — Task 3 RED #2.
 *
 * Verifies the chat page consumes ?prefill=, ?mode=, ?session= URL params:
 *   1. ?prefill=hello&mode=research (no session) →
 *      setPendingMode('research') BEFORE sendMessage('hello'); send fires
 *      exactly once; router.replace('/{slug}/chat') strips the params.
 *   2. Re-render with same params → still called only once (sentRef guard).
 *   3. ?prefill=hi&mode=act&session=abc →
 *      setSessionId('abc') then setMode('abc','act') then sendMessage('hi'),
 *      WITHOUT setPendingMode being called.
 *   4. ?session=abc only (no prefill) → setSessionId('abc'); sendMessage NOT
 *      called.
 *   5. No params → no calls; router.replace not called.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

// ─── observer pass-through ──────────────────────────────────────────────────
vi.mock('mobx-react-lite', () => ({
  observer: (component: unknown) => component,
}));

// ─── next/navigation mocks (mutated per test via a local controller) ────────

const replaceSpy = vi.fn();
const searchParamsController = {
  prefill: null as string | null,
  mode: null as string | null,
  session: null as string | null,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy, push: vi.fn() }),
  useParams: () => ({ workspaceSlug: 'workspace' }),
  useSearchParams: () => ({
    get: (k: string) => {
      if (k === 'prefill') return searchParamsController.prefill;
      if (k === 'mode') return searchParamsController.mode;
      if (k === 'session') return searchParamsController.session;
      return null;
    },
  }),
}));

// ─── Workspace store mock (resolves slug → 'ws-uuid') ───────────────────────

const wsStoreMock = {
  workspaceList: [{ id: 'ws-uuid', slug: 'workspace' }],
  isLoading: false,
  currentWorkspace: { id: 'ws-uuid', slug: 'workspace' },
  currentWorkspaceId: 'ws-uuid',
  fetchWorkspaces: vi.fn(),
  selectWorkspace: vi.fn(),
  getWorkspaceBySlug: (s: string) => (s === 'workspace' ? { id: 'ws-uuid' } : undefined),
};
vi.mock('@/stores', () => ({
  useWorkspaceStore: () => wsStoreMock,
}));

// ─── AI store mock (with the new pendingMode surface) ───────────────────────

const sendMessageSpy = vi.fn();
const setPendingModeSpy = vi.fn();
const setSessionIdSpy = vi.fn();
const setModeSpy = vi.fn();
const setWorkspaceIdSpy = vi.fn();

const pilotSpaceMock = {
  workspaceId: null as string | null,
  sessionId: null as string | null,
  setWorkspaceId: setWorkspaceIdSpy,
  setSessionId: setSessionIdSpy,
  setMode: setModeSpy,
  setPendingMode: setPendingModeSpy,
  sendMessage: sendMessageSpy,
  // Other props referenced by ChatView are mocked away below.
};
vi.mock('@/stores/ai/AIStore', () => ({
  getAIStore: () => ({
    pilotSpace: pilotSpaceMock,
    approval: {},
  }),
}));

// ─── ChatView shell mock — we only test the page's effect logic ─────────────

vi.mock('@/features/ai/ChatView', () => ({
  ChatView: () => <div data-testid="chat-view-mock" />,
}));

import ChatPage from '../page';

beforeEach(() => {
  replaceSpy.mockReset();
  sendMessageSpy.mockReset();
  setPendingModeSpy.mockReset();
  setSessionIdSpy.mockReset();
  setModeSpy.mockReset();
  setWorkspaceIdSpy.mockReset();
  searchParamsController.prefill = null;
  searchParamsController.mode = null;
  searchParamsController.session = null;
  pilotSpaceMock.workspaceId = null;
  pilotSpaceMock.sessionId = null;
});

afterEach(() => cleanup());

describe('ChatPage prefill+mode+session handler (Phase 88 Plan 04 — Task 3)', () => {
  it('?prefill=hello&mode=research (no session) → setPendingMode then sendMessage then router.replace', async () => {
    searchParamsController.prefill = 'hello';
    searchParamsController.mode = 'research';

    render(<ChatPage />);

    await waitFor(() => expect(sendMessageSpy).toHaveBeenCalledTimes(1));

    // setPendingMode fired BEFORE sendMessage.
    expect(setPendingModeSpy).toHaveBeenCalledWith('research');
    expect(setPendingModeSpy.mock.invocationCallOrder[0]).toBeLessThan(
      sendMessageSpy.mock.invocationCallOrder[0]!,
    );

    // sendMessage called with the prefill text.
    expect(sendMessageSpy).toHaveBeenCalledWith('hello');

    // router.replace strips the params.
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/workspace/chat'));

    // setSessionId NOT called (no ?session present).
    expect(setSessionIdSpy).not.toHaveBeenCalled();
  });

  it('re-render with same params still calls sendMessage once (sentRef guard)', async () => {
    searchParamsController.prefill = 'hello';
    searchParamsController.mode = 'research';

    const { rerender } = render(<ChatPage />);
    await waitFor(() => expect(sendMessageSpy).toHaveBeenCalledTimes(1));

    rerender(<ChatPage />);
    rerender(<ChatPage />);

    // Still exactly one call.
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
  });

  it('?prefill=hi&mode=act&session=abc → setSessionId+setMode then sendMessage; NO setPendingMode', async () => {
    searchParamsController.prefill = 'hi';
    searchParamsController.mode = 'act';
    searchParamsController.session = 'abc';

    render(<ChatPage />);

    await waitFor(() => expect(sendMessageSpy).toHaveBeenCalledTimes(1));

    expect(setSessionIdSpy).toHaveBeenCalledWith('abc');
    expect(setModeSpy).toHaveBeenCalledWith('abc', 'act');
    expect(sendMessageSpy).toHaveBeenCalledWith('hi');
    // pendingMode path is bypassed when ?session is present.
    expect(setPendingModeSpy).not.toHaveBeenCalled();

    // Order: setSessionId → setMode → sendMessage.
    expect(setSessionIdSpy.mock.invocationCallOrder[0]).toBeLessThan(
      setModeSpy.mock.invocationCallOrder[0]!,
    );
    expect(setModeSpy.mock.invocationCallOrder[0]).toBeLessThan(
      sendMessageSpy.mock.invocationCallOrder[0]!,
    );
  });

  it('?session=abc only (no prefill) → setSessionId fires; sendMessage NOT called', async () => {
    searchParamsController.session = 'abc';

    render(<ChatPage />);

    // Allow effects to flush.
    await new Promise((r) => setTimeout(r, 20));

    expect(setSessionIdSpy).toHaveBeenCalledWith('abc');
    expect(sendMessageSpy).not.toHaveBeenCalled();
    // No params to strip → router.replace not called.
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('no params → no auto-submit calls and no router.replace', async () => {
    render(<ChatPage />);
    await new Promise((r) => setTimeout(r, 20));

    expect(sendMessageSpy).not.toHaveBeenCalled();
    expect(setPendingModeSpy).not.toHaveBeenCalled();
    expect(setSessionIdSpy).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
