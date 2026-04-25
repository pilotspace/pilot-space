/**
 * Unit tests for ChatInput — contenteditable div behavior.
 *
 * Tests validate the post-migration behavioral contract:
 * - Forward slash "/" at position 0 fires onChange
 * - Backslash "\" is treated as plain text (no menu)
 * - contenteditable div has correct ARIA attributes
 * - getSerializedValue produces @[Type:uuid] for chip spans
 * - Backspace removes chip when cursor is immediately after chip
 * - Enter submits; Shift+Enter does not submit
 * - data-placeholder attribute is used instead of placeholder
 *
 * @module features/ai/ChatView/ChatInput/__tests__/ChatInput.test
 */

// Mock observer from mobx-react-lite to avoid MobX dependency in tests
vi.mock('mobx-react-lite', () => ({
  observer: (component: unknown) => component,
}));

// Phase 91 Plan 05 — override the global next/navigation mock so we can
// assert router.push calls from handleSkillSelect.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ workspaceSlug: 'alpha' }),
}));

// Phase 91 Plan 05 — provide a controllable skills list so the SkillMenu
// receives backend skills with `slug` populated. Default empty for baseline
// tests; per-test override via `currentSkills` set inside `it` bodies.
let currentSkills: Array<{
  name: string;
  description: string;
  category: string;
  icon: string;
  examples?: string[];
  slug?: string;
}> = [];
vi.mock('../../hooks/useSkills', () => ({
  useSkills: () => ({ skills: currentSkills, isLoading: false, error: null }),
}));

// Mock useAttachments hook — not relevant to trigger detection tests
vi.mock('../../hooks/useAttachments', () => ({
  useAttachments: () => ({
    attachments: [],
    attachmentIds: [],
    addFile: vi.fn(),
    addFromDrive: vi.fn(),
    removeFile: vi.fn(),
    reset: vi.fn(),
  }),
}));

// Mock useDriveStatus hook — not relevant to trigger detection tests
vi.mock('../../hooks/useDriveStatus', () => ({
  useDriveStatus: () => ({ data: null }),
}));

// Mock attachmentsApi — no network calls in unit tests
vi.mock('@/services/api/attachments', () => ({
  attachmentsApi: { getDriveAuthUrl: vi.fn() },
}));

// Mock RecordButton — uses useStore (MobX StoreProvider) which is not available in unit tests
vi.mock('../RecordButton', () => ({
  RecordButton: () => null,
}));

// Mock AudioPlaybackPill — not relevant to trigger detection tests
vi.mock('../AudioPlaybackPill', () => ({
  AudioPlaybackPill: () => null,
}));

// Mock useRecentEntities — not relevant to existing trigger detection tests
vi.mock('../../hooks/useRecentEntities', () => ({
  useRecentEntities: () => ({
    recentEntities: [],
    addEntity: vi.fn(),
  }),
}));

// Mock EntityPicker — prevents QueryClient context errors in existing tests
vi.mock('../EntityPicker', () => ({
  EntityPicker: () => null,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { ChatInput } from '../ChatInput';

// cmdk and ResizeObserver are not available in JSDOM
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

function renderChatInput(
  props: {
    value?: string;
    onChange?: (v: string) => void;
    onSubmit?: (...args: unknown[]) => void;
    isDisabled?: boolean;
  } = {}
) {
  const defaultProps = {
    value: props.value ?? '',
    onChange: props.onChange ?? vi.fn(),
    onSubmit: props.onSubmit ?? vi.fn(),
    isDisabled: props.isDisabled,
  };
  return render(<ChatInput {...defaultProps} />);
}

describe('ChatInput — contenteditable div behavior', () => {
  it('calls onChange with "/" when / is typed at position 0 (first character)', () => {
    const onChange = vi.fn();
    renderChatInput({ value: '', onChange });

    const div = screen.getByTestId('chat-input');
    // Set content and dispatch input event
    div.textContent = '/';
    fireEvent.input(div);

    expect(onChange).toHaveBeenCalled();
  });

  it('does NOT open SkillMenu when / is typed mid-text', () => {
    renderChatInput({ value: 'hello' });

    const div = screen.getByTestId('chat-input');

    // Simulate typing "/" mid-sentence (not at position 0)
    div.textContent = 'hello/';
    fireEvent.input(div);

    // SkillMenu popover search input should NOT be present
    expect(screen.queryByPlaceholderText('Search skills...')).not.toBeInTheDocument();
  });

  it('treats backslash as plain text — no menu opens', () => {
    const onChange = vi.fn();
    renderChatInput({ value: '', onChange });

    const div = screen.getByTestId('chat-input');

    // Simulate typing "\" — backslash should NOT trigger SkillMenu post-migration
    div.textContent = '\\';
    fireEvent.input(div);

    // onChange called (with plain text content)
    expect(onChange).toHaveBeenCalled();

    // No skill menu popover content should appear
    expect(screen.queryByPlaceholderText('Search skills...')).not.toBeInTheDocument();
  });

  it('has Phase 87 Plan 01 placeholder copy referencing / for commands', () => {
    renderChatInput();
    const div = screen.getByTestId('chat-input');
    expect(div.getAttribute('data-placeholder')).toBe(
      'Ask anything, draft a topic, or type / for commands\u2026'
    );
  });

  it('renders contenteditable div with correct ARIA attributes', () => {
    renderChatInput();
    const div = screen.getByTestId('chat-input');
    expect(div.getAttribute('role')).toBe('textbox');
    expect(div.getAttribute('aria-multiline')).toBe('true');
    expect(div.getAttribute('aria-label')).toBe('Chat input');
    expect(div.getAttribute('contenteditable')).toBe('true');
  });

  it('sets contentEditable to false when isDisabled is true', () => {
    render(<ChatInput value="" onChange={vi.fn()} onSubmit={vi.fn()} isDisabled />);
    const div = screen.getByTestId('chat-input');
    expect(div.getAttribute('contenteditable')).toBe('false');
  });

  it('serializes chip spans as @[Type:uuid] tokens', () => {
    const onChange = vi.fn();
    renderChatInput({ value: '', onChange });

    const div = screen.getByTestId('chat-input');
    // Manually insert a text node + chip span + text node to simulate chip state
    div.textContent = '';
    div.appendChild(document.createTextNode('Hello '));
    const chip = document.createElement('span');
    chip.setAttribute('data-entity-type', 'Note');
    chip.setAttribute('data-entity-id', 'abc-123');
    chip.setAttribute('contenteditable', 'false');
    chip.textContent = '@My Note';
    div.appendChild(chip);
    div.appendChild(document.createTextNode(' world'));

    fireEvent.input(div);

    expect(onChange).toHaveBeenCalledWith('Hello @[Note:abc-123] world');
  });

  it('removes chip on Backspace when cursor is immediately after chip', () => {
    const onChange = vi.fn();
    renderChatInput({ value: '', onChange });

    const div = screen.getByTestId('chat-input');
    // Insert chip followed by empty text node
    div.textContent = '';
    const chip = document.createElement('span');
    chip.setAttribute('data-entity-type', 'Issue');
    chip.setAttribute('data-entity-id', 'issue-456');
    chip.setAttribute('contenteditable', 'false');
    chip.textContent = '@Bug';
    div.appendChild(chip);
    const textAfter = document.createTextNode('');
    div.appendChild(textAfter);

    // Mock selection at offset 0 of the text node after the chip
    const mockRange = {
      startContainer: textAfter,
      startOffset: 0,
      collapsed: true,
    };
    const mockSelection = {
      rangeCount: 1,
      getRangeAt: () => mockRange,
      removeAllRanges: vi.fn(),
      addRange: vi.fn(),
    };
    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(
      mockSelection as unknown as Selection
    );

    fireEvent.keyDown(div, { key: 'Backspace' });

    // Chip should be removed from DOM
    expect(div.querySelector('[data-entity-type="Issue"]')).toBeNull();
    expect(onChange).toHaveBeenCalled();

    getSelectionSpy.mockRestore();
  });

  it('submits on Enter (without Shift) when content is non-empty', () => {
    const onSubmit = vi.fn();
    renderChatInput({ value: 'hello', onSubmit });

    const div = screen.getByTestId('chat-input');
    div.textContent = 'hello';
    fireEvent.keyDown(div, { key: 'Enter', shiftKey: false });

    expect(onSubmit).toHaveBeenCalled();
  });

  it('does not submit on Shift+Enter', () => {
    const onSubmit = vi.fn();
    renderChatInput({ value: 'hello', onSubmit });

    const div = screen.getByTestId('chat-input');
    div.textContent = 'hello';
    fireEvent.keyDown(div, { key: 'Enter', shiftKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onChange when /resume is typed in input', () => {
    // Regression test for: dialog opens but closes immediately when /resume selected.
    // Root cause: SkillMenu's onOpenChange focus-restore fired into SessionResumeMenu.
    // Fix: skipFocusOnSkillCloseRef prevents deferred focus when transitioning to resume menu.
    const onChange = vi.fn();
    renderChatInput({ value: '', onChange });

    const div = screen.getByTestId('chat-input');
    div.textContent = '/resume';
    fireEvent.input(div);

    expect(onChange).toHaveBeenCalled();
  });
});

// ─── Phase 91 Plan 05 — handleSkillSelect navigation behavior ────────────
//
// REPURPOSE: picking a skill from the chat-side SkillMenu (Sparkles button or
// via the /skill picker) used to text-insert `/skillname ` into the chat
// composer. Now it navigates to the skill detail page using `skill.slug`.
// Session-only skills (`resume`, `new`) preserve their existing handlers.
//
// Implementation note: Radix Popover content portals at open transition time;
// in JSDOM the open transition happens synchronously after the click, but
// `findByText` is used (with implicit waitFor) to give the portal mount a
// microtask tick.

describe('ChatInput — Phase 91 Plan 05 skill-select navigation', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));
  });

  beforeEach(() => {
    pushMock.mockReset();
    currentSkills = [];
  });

  it('selecting a backend skill from SkillMenu navigates to /{ws}/skills/{slug}', async () => {
    currentSkills = [
      {
        name: 'extract-issues',
        description: 'Extract issues from notes',
        category: 'issues',
        icon: 'ListTodo',
        slug: 'extract-issues',
      },
    ];
    renderChatInput({ value: '' });

    // Open SkillMenu via the Sparkles toolbar button.
    const sparklesBtn = screen.getByRole('button', { name: /open skill menu/i });
    fireEvent.click(sparklesBtn);

    // The popover content renders a row with the skill keyword (`/skillname`).
    const row = await screen.findByText('/extract-issues');
    fireEvent.click(row);

    expect(pushMock).toHaveBeenCalledWith('/alpha/skills/extract-issues');
  });

  it('selecting a backend skill without slug falls back to /{ws}/skills', async () => {
    currentSkills = [
      {
        name: 'legacy-skill',
        description: 'No slug populated',
        category: 'planning',
        icon: 'Wand2',
        // no slug — exercises the fallback branch
      },
    ];
    renderChatInput({ value: '' });

    const sparklesBtn = screen.getByRole('button', { name: /open skill menu/i });
    fireEvent.click(sparklesBtn);

    const row = await screen.findByText('/legacy-skill');
    fireEvent.click(row);

    expect(pushMock).toHaveBeenCalledWith('/alpha/skills');
  });

  it('selecting the session-only "new" skill calls onNewSession and does NOT navigate', async () => {
    // SESSION_SKILLS (resume, new) have no slug; the handler short-circuits
    // before the router.push call. The mocked useSkills returns whatever is
    // in `currentSkills`, so we explicitly include the 'new' session skill.
    currentSkills = [
      {
        name: 'new',
        description: 'Start a fresh conversation session',
        category: 'session',
        icon: 'Plus',
      },
    ];
    const onNewSession = vi.fn();
    render(
      <ChatInput
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onNewSession={onNewSession}
      />
    );

    const sparklesBtn = screen.getByRole('button', { name: /open skill menu/i });
    fireEvent.click(sparklesBtn);

    const newRow = await screen.findByText('/new');
    fireEvent.click(newRow);

    expect(onNewSession).toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
