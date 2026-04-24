/**
 * Phase 88 Plan 02 — Task 4: Launchpad assembly RED phase.
 *
 * Smoke + integration test:
 *  - Renders <section role="main" aria-label="Workspace launchpad">.
 *  - Greeting (h1) is present.
 *  - Composer (data-testid="chat-input") is present.
 *  - Suggested-prompts group is present with 4 chips.
 *  - Clicking the first chip populates the composer textarea via
 *    composerRef.current.setDraft (integration across Tasks 1–3).
 *  - RedFlagStrip + ContinueCard slots render NULL placeholders this wave
 *    (TODO comments in the source point to Plans 03 / 04).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('mobx-react-lite', () => ({
  observer: (component: unknown) => component,
}));

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
  useParams: () => ({ workspaceSlug: 'workspace' }),
}));

const authMock: {
  user: { email: string; name: string } | null;
  userDisplayName: string;
} = {
  user: { email: 'tin@pilot.space', name: 'Tin Dang' },
  userDisplayName: 'Tin Dang',
};
vi.mock('@/stores', () => ({
  useAuthStore: () => authMock,
}));

const modeMock: { mode: 'plan' | 'act' | 'research' | 'draft' } = { mode: 'plan' };
vi.mock('@/stores/ai', () => ({
  getAIStore: () => ({
    pilotSpace: {
      getMode: () => modeMock.mode,
      setMode: (_id: string, mode: 'plan' | 'act' | 'research' | 'draft') => {
        modeMock.mode = mode;
      },
      sendMessage: vi.fn(),
    },
  }),
}));

// ChatInput dependency mocks
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

import { Launchpad } from '../Launchpad';

beforeEach(() => {
  pushSpy.mockReset();
  modeMock.mode = 'plan';
  Element.prototype.scrollIntoView = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

afterEach(() => cleanup());

describe('Launchpad (Phase 88 Plan 02 — assembly smoke + integration)', () => {
  it('renders the main landmark with the launchpad aria-label', () => {
    render(<Launchpad workspaceId="ws-1" workspaceSlug="workspace" />);
    const main = screen.getByRole('main', { name: 'Workspace launchpad' });
    expect(main).toBeInTheDocument();
  });

  it('renders the greeting h1', () => {
    render(<Launchpad workspaceId="ws-1" workspaceSlug="workspace" />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent(/Good (morning|afternoon|evening), Tin\./);
  });

  it('renders the composer (data-testid="chat-input")', () => {
    render(<Launchpad workspaceId="ws-1" workspaceSlug="workspace" />);
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
  });

  it('renders the suggested-prompts group with 4 chips', () => {
    render(<Launchpad workspaceId="ws-1" workspaceSlug="workspace" />);
    const group = screen.getByRole('group', { name: 'Suggested prompts' });
    expect(group).toBeInTheDocument();
    // The composer is a contenteditable div, not a button — the only buttons
    // inside the launchpad come from SuggestedPromptsRow (slimToolbar hides
    // the ChatInput menu cluster).
    const chips = screen.getAllByRole('button');
    expect(chips).toHaveLength(4);
  });

  it('clicking the first chip populates the composer with that prompt text', async () => {
    const user = userEvent.setup();
    render(<Launchpad workspaceId="ws-1" workspaceSlug="workspace" />);

    const chip = screen.getByRole('button', {
      name: 'Use prompt: Draft a standup for me',
    });
    await user.click(chip);

    // ChatInput syncs DOM from value via useEffect — wait one tick.
    await new Promise((r) => setTimeout(r, 5));

    const input = screen.getByTestId('chat-input');
    expect(input.textContent).toBe('Draft a standup for me');
  });
});
