/**
 * Phase 88 Plan 02 — Task 2: HomeComposer RED phase.
 *
 * HomeComposer is a navigation-submit adapter wrapping
 * `<ChatInput surface="homepage" slimToolbar />`. Per CONTEXT.md "Submit
 * path" + UI-SPEC §3 "Submit behavior":
 *  - On submit: router.push(`/{ws}/chat?prefill=...&mode=...&from=home`)
 *  - Empty draft → no navigation
 *  - Mode resolved from `pilotSpace.getMode("__homepage__")` (sentinel
 *    session id so the homepage's mode does not pollute real sessions).
 *  - Forwards a `setDraft(text)` ref handle (HomeComposerHandle) — sets the
 *    composer text AND focuses the contenteditable surface.
 *  - Does NOT call any AI streaming method.
 *
 * Implementation note: ChatInput is a contenteditable div with
 * `data-testid="chat-input"` and `aria-label="Chat input"`. Focus assertions
 * use `toHaveFocus()` against that element.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';

// ─── Mocks (must hoist before component import) ─────────────────────────────

vi.mock('mobx-react-lite', () => ({
  observer: (component: unknown) => component,
}));

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
  useParams: () => ({ workspaceSlug: 'workspace' }),
}));

// pilotSpace mode store — homepage uses sentinel session id "__homepage__".
const modeMock: { mode: 'plan' | 'act' | 'research' | 'draft' } = { mode: 'plan' };
const sendMessageSpy = vi.fn();
vi.mock('@/stores/ai', () => ({
  getAIStore: () => ({
    pilotSpace: {
      getMode: (sessionId: string | null) => {
        // Assert the sentinel is what HomeComposer queries.
        expect(sessionId).toBe('__homepage__');
        return modeMock.mode;
      },
      setMode: (sessionId: string, mode: 'plan' | 'act' | 'research' | 'draft') => {
        expect(sessionId).toBe('__homepage__');
        modeMock.mode = mode;
      },
      sendMessage: sendMessageSpy,
    },
  }),
}));

// ChatInput dependency mocks — copied from ChatInput.slimToolbar.test.tsx
vi.mock('@/features/ai/ChatView/hooks/useSkills', () => ({
  useSkills: () => ({ skills: [] }),
}));
vi.mock('@/features/ai/ChatView/hooks/useAttachments', () => ({
  useAttachments: () => ({
    attachments: [],
    attachmentIds: [],
    addFile: vi.fn(),
    addFromDrive: vi.fn(),
    removeFile: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock('@/features/ai/ChatView/hooks/useDriveStatus', () => ({
  useDriveStatus: () => ({ data: null }),
}));
vi.mock('@/services/api/attachments', () => ({
  attachmentsApi: { getDriveAuthUrl: vi.fn() },
}));
vi.mock('@/features/ai/ChatView/ChatInput/RecordButton', () => ({
  RecordButton: () => null,
}));
vi.mock('@/features/ai/ChatView/ChatInput/AudioPlaybackPill', () => ({
  AudioPlaybackPill: () => null,
}));
vi.mock('@/features/ai/ChatView/hooks/useRecentEntities', () => ({
  useRecentEntities: () => ({ recentEntities: [], addEntity: vi.fn() }),
}));
vi.mock('@/features/ai/ChatView/ChatInput/EntityPicker', () => ({
  EntityPicker: () => null,
}));

import { HomeComposer, type HomeComposerHandle } from '../components/HomeComposer';

beforeEach(() => {
  pushSpy.mockReset();
  sendMessageSpy.mockReset();
  modeMock.mode = 'plan';
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom does not implement ResizeObserver — ChatInput needs it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
});

function renderHomeComposer(ref?: React.Ref<HomeComposerHandle>) {
  return render(
    <HomeComposer ref={ref} workspaceId="ws-1" workspaceSlug="workspace" />,
  );
}

describe('HomeComposer (Phase 88 Plan 02 — navigation-submit adapter)', () => {
  describe('navigation submit', () => {
    it('pushes /{slug}/chat?prefill=...&mode=...&from=home on Enter with text', async () => {
      const user = userEvent.setup();
      renderHomeComposer();

      const input = screen.getByTestId('chat-input');
      input.focus();
      await user.keyboard('hello world');
      // Enter submits (ChatInput handleKeyDown branch).
      await user.keyboard('{Enter}');

      expect(pushSpy).toHaveBeenCalledTimes(1);
      const url = pushSpy.mock.calls[0]![0] as string;
      expect(url).toBe(
        '/workspace/chat?prefill=hello%20world&mode=plan&from=home',
      );
    });

    it('embeds the current mode from pilotSpace.getMode("__homepage__")', async () => {
      const user = userEvent.setup();
      modeMock.mode = 'research';
      renderHomeComposer();

      const input = screen.getByTestId('chat-input');
      input.focus();
      await user.keyboard('hi');
      await user.keyboard('{Enter}');

      expect(pushSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy.mock.calls[0]![0]).toMatch(/&mode=research&/);
    });

    it('does not navigate when draft is empty', async () => {
      const user = userEvent.setup();
      renderHomeComposer();

      const input = screen.getByTestId('chat-input');
      input.focus();
      await user.keyboard('{Enter}');

      expect(pushSpy).not.toHaveBeenCalled();
    });

    it('never invokes pilotSpace.sendMessage (homepage navigates, does not stream)', async () => {
      const user = userEvent.setup();
      renderHomeComposer();

      const input = screen.getByTestId('chat-input');
      input.focus();
      await user.keyboard('hello');
      await user.keyboard('{Enter}');

      expect(sendMessageSpy).not.toHaveBeenCalled();
    });

    it('URL-encodes special characters in the draft', async () => {
      const user = userEvent.setup();
      renderHomeComposer();

      const input = screen.getByTestId('chat-input');
      input.focus();
      await user.keyboard('a&b c');
      await user.keyboard('{Enter}');

      const url = pushSpy.mock.calls[0]![0] as string;
      // '&' must be %26, ' ' must be %20.
      expect(url).toContain('prefill=a%26b%20c');
    });
  });

  describe('setDraft ref handle', () => {
    it('exposes setDraft via forwardRef and populates the composer text', () => {
      const ref = createRef<HomeComposerHandle>();
      renderHomeComposer(ref);

      expect(ref.current).not.toBeNull();
      expect(typeof ref.current!.setDraft).toBe('function');

      act(() => {
        ref.current!.setDraft('Draft a standup for me');
      });

      const input = screen.getByTestId('chat-input');
      expect(input.textContent).toBe('Draft a standup for me');
    });

    it('focuses the contenteditable surface after setDraft', async () => {
      const ref = createRef<HomeComposerHandle>();
      renderHomeComposer(ref);

      act(() => {
        ref.current!.setDraft('hello');
      });

      // setDraft uses a 0-tick deferred focus to dodge Radix focus side-effects.
      await new Promise((r) => setTimeout(r, 5));

      const input = screen.getByTestId('chat-input');
      expect(input).toHaveFocus();
    });
  });
});
