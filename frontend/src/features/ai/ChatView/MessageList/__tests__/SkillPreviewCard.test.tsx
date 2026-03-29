/**
 * Unit tests for SkillPreviewCard component.
 *
 * Tests rendering when draft exists/null, content truncation,
 * metadata badges, and button click handlers.
 *
 * @module features/ai/ChatView/MessageList/__tests__/SkillPreviewCard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Store mock
// ---------------------------------------------------------------------------

const mockOpenSaveDialog = vi.fn();
const mockDismissPreview = vi.fn();

const mockSkillStore = {
  currentDraft: null as Record<string, unknown> | null,
  isPreviewVisible: false,
  isSaveDialogOpen: false,
  isGenerating: false,
  openSaveDialog: mockOpenSaveDialog,
  dismissPreview: mockDismissPreview,
};

vi.mock('@/stores/RootStore', () => ({
  useStore: () => ({
    aiStore: {
      pilotSpace: {
        skillGeneratorStore: mockSkillStore,
      },
    },
  }),
}));

// Import after mocks
import { SkillPreviewCard } from '../SkillPreviewCard';

function makeDraft(overrides?: Record<string, unknown>) {
  return {
    sessionId: 'sess-1',
    name: 'A11y Review',
    description: 'Reviews React components for accessibility issues',
    category: 'Code Review',
    icon: 'shield',
    skillContent: [
      '# A11y Review',
      '',
      '## Description',
      'Reviews components for WCAG compliance.',
      '',
      '## Rules',
      '- Check alt text on images',
      '- Check color contrast ratios',
      '- Verify keyboard navigation',
      '- Check ARIA attributes',
    ].join('\n'),
    examplePrompts: ['Review this component for accessibility', 'Check a11y'],
    contextRequirements: ['react-component'],
    toolDeclarations: ['read_file', 'search_code'],
    graphData: null,
    ...overrides,
  };
}

describe('SkillPreviewCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkillStore.currentDraft = null;
  });

  it('renders null when currentDraft is null', () => {
    const { container } = render(<SkillPreviewCard />);
    expect(container.innerHTML).toBe('');
  });

  it('renders skill name and description when draft exists', () => {
    mockSkillStore.currentDraft = makeDraft();
    render(<SkillPreviewCard />);

    expect(screen.getByText('A11y Review')).toBeInTheDocument();
    expect(
      screen.getByText('Reviews React components for accessibility issues'),
    ).toBeInTheDocument();
  });

  it('shows first 6 lines of skill content and truncates the rest', () => {
    mockSkillStore.currentDraft = makeDraft();
    render(<SkillPreviewCard />);

    // The content preview <pre> should contain text from the first 6 lines
    const preElement = screen.getByText(/## Rules/);
    expect(preElement).toBeInTheDocument();
    // Lines after 6 are truncated — "- Check alt text on images" should NOT be in the preview
    expect(screen.queryByText(/Check alt text on images/)).not.toBeInTheDocument();
  });

  it('shows metadata badges with correct counts', () => {
    mockSkillStore.currentDraft = makeDraft();
    render(<SkillPreviewCard />);

    const metadataContainer = screen.getByTestId('skill-metadata');
    expect(metadataContainer).toHaveTextContent('2 examples');
    expect(metadataContainer).toHaveTextContent('1 context req');
    expect(metadataContainer).toHaveTextContent('2 tools');
  });

  it('shows category badge', () => {
    mockSkillStore.currentDraft = makeDraft();
    render(<SkillPreviewCard />);

    expect(screen.getByText('Code Review')).toBeInTheDocument();
  });

  it('calls openSaveDialog when Save button clicked', async () => {
    mockSkillStore.currentDraft = makeDraft();
    render(<SkillPreviewCard />);

    const saveBtn = screen.getByTestId('save-skill-btn');
    await userEvent.click(saveBtn);
    expect(mockOpenSaveDialog).toHaveBeenCalledOnce();
  });

  it('calls dismissPreview when Dismiss button clicked', async () => {
    mockSkillStore.currentDraft = makeDraft();
    render(<SkillPreviewCard />);

    const dismissBtn = screen.getByTestId('dismiss-btn');
    await userEvent.click(dismissBtn);
    expect(mockDismissPreview).toHaveBeenCalledOnce();
  });

  it('sets isPreviewVisible when Edit in Editor clicked', async () => {
    mockSkillStore.currentDraft = makeDraft();
    mockSkillStore.isPreviewVisible = false;
    render(<SkillPreviewCard />);

    const editBtn = screen.getByTestId('edit-in-editor-btn');
    await userEvent.click(editBtn);
    expect(mockSkillStore.isPreviewVisible).toBe(true);
  });

  it('handles single-item counts (no plural s)', () => {
    mockSkillStore.currentDraft = makeDraft({
      examplePrompts: ['one'],
      contextRequirements: ['one'],
      toolDeclarations: ['one'],
    });
    render(<SkillPreviewCard />);

    const metadataContainer = screen.getByTestId('skill-metadata');
    expect(metadataContainer).toHaveTextContent('1 example');
    expect(metadataContainer).toHaveTextContent('1 context req');
    expect(metadataContainer).toHaveTextContent('1 tool');
    // Should NOT have plural forms
    expect(metadataContainer.textContent).not.toContain('examples');
    expect(metadataContainer.textContent).not.toContain('tools');
  });
});
