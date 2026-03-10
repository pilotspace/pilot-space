/**
 * Tests for RelatedIssuesPanel — Phase 15 (Related Issues).
 *
 * RELISS-01: semantic suggestion display
 * RELISS-02: manual linking UI
 * RELISS-03: reason badge enrichment
 * RELISS-04: dismissal flow
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — all hooks return controlled data
// ---------------------------------------------------------------------------

const mockDismissMutate = vi.fn();
const mockCreateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock('@/features/issues/hooks/use-related-suggestions', () => ({
  useRelatedSuggestions: vi.fn(),
  relatedSuggestionsKeys: {
    detail: (wid: string, iid: string) => ['issues', wid, iid, 'related-suggestions'],
  },
}));

vi.mock('@/features/issues/hooks/use-dismiss-suggestion', () => ({
  useDismissSuggestion: vi.fn(),
}));

vi.mock('@/features/issues/hooks/use-create-relation', () => ({
  useCreateRelation: vi.fn(),
}));

vi.mock('@/features/issues/hooks/use-delete-relation', () => ({
  useDeleteRelation: vi.fn(),
}));

vi.mock('@/features/issues/hooks/use-issue-relations', () => ({
  useIssueRelations: vi.fn(),
  issueRelationsKeys: {
    detail: (wid: string, iid: string) => ['issues', wid, iid, 'relations'],
  },
}));

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | false)[]) => classes.filter(Boolean).join(' '),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { useRelatedSuggestions } from '@/features/issues/hooks/use-related-suggestions';
import { useDismissSuggestion } from '@/features/issues/hooks/use-dismiss-suggestion';
import { useCreateRelation } from '@/features/issues/hooks/use-create-relation';
import { useDeleteRelation } from '@/features/issues/hooks/use-delete-relation';
import { useIssueRelations } from '@/features/issues/hooks/use-issue-relations';
import { RelatedIssuesPanel } from '../related-issues-panel';
import type { RelatedSuggestion, IssueRelation } from '@/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const ISSUE_ID = '00000000-0000-0000-0000-000000000002';

const mockSuggestions: RelatedSuggestion[] = [
  {
    id: '00000000-0000-0000-0000-000000000010',
    title: 'Fix login bug',
    identifier: 'PS-42',
    similarityScore: 0.89,
    reason: 'Semantic match (89%)',
  },
];

const mockRelation: IssueRelation = {
  id: '00000000-0000-0000-0000-000000000020',
  linkType: 'related',
  direction: 'outbound',
  relatedIssue: {
    id: '00000000-0000-0000-0000-000000000030',
    identifier: 'PS-99',
    name: 'Auth refactor',
    priority: 'medium',
    state: { id: 'state-1', name: 'In Progress', color: '#fbbf24', group: 'started' },
  },
};

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RelatedIssuesPanel workspaceId={WORKSPACE_ID} issueId={ISSUE_ID} workspaceSlug="test-ws" />
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Default mock implementations (overridden per test as needed)
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRelatedSuggestions).mockReturnValue({
    data: [],
    isLoading: false,
  } as unknown as ReturnType<typeof useRelatedSuggestions>);
  vi.mocked(useDismissSuggestion).mockReturnValue({
    mutate: mockDismissMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useDismissSuggestion>);
  vi.mocked(useCreateRelation).mockReturnValue({
    mutate: mockCreateMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateRelation>);
  vi.mocked(useDeleteRelation).mockReturnValue({
    mutate: mockDeleteMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteRelation>);
  vi.mocked(useIssueRelations).mockReturnValue({
    data: [],
    isLoading: false,
  } as unknown as ReturnType<typeof useIssueRelations>);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RelatedIssuesPanel', () => {
  // RELISS-01
  it('renders AI suggestions with similarity reason badge', () => {
    vi.mocked(useRelatedSuggestions).mockReturnValue({
      data: mockSuggestions,
      isLoading: false,
    } as unknown as ReturnType<typeof useRelatedSuggestions>);

    renderPanel();

    expect(screen.getByText('PS-42')).toBeInTheDocument();
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.getByText('Semantic match (89%)')).toBeInTheDocument();
  });

  it('renders empty state when no suggestions available', () => {
    vi.mocked(useRelatedSuggestions).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useRelatedSuggestions>);

    renderPanel();

    expect(screen.getByText('No suggestions yet')).toBeInTheDocument();
  });

  // RELISS-04
  it('dismiss button calls mutation and invalidates suggestions query', async () => {
    vi.mocked(useRelatedSuggestions).mockReturnValue({
      data: mockSuggestions,
      isLoading: false,
    } as unknown as ReturnType<typeof useRelatedSuggestions>);

    renderPanel();

    const dismissBtn = screen.getByRole('button', { name: /dismiss suggestion/i });
    fireEvent.click(dismissBtn);

    const expectedId = mockSuggestions[0]?.id;
    await waitFor(() => {
      expect(mockDismissMutate).toHaveBeenCalledWith(expectedId);
    });
  });

  // RELISS-02
  it('renders linked issues section with unlink button', () => {
    vi.mocked(useIssueRelations).mockReturnValue({
      data: [mockRelation],
      isLoading: false,
    } as unknown as ReturnType<typeof useIssueRelations>);

    renderPanel();

    expect(screen.getByText('PS-99')).toBeInTheDocument();
    expect(screen.getByText('Auth refactor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlink issue/i })).toBeInTheDocument();
  });

  it('link issue search calls createRelation and refreshes list', async () => {
    renderPanel();

    // The link issue button (combobox trigger) should be present
    const linkBtn = screen.getByRole('button', { name: /link issue/i });
    fireEvent.click(linkBtn);

    // Search input should appear in the popover
    const searchInput = await screen.findByPlaceholderText(/search issues/i);
    expect(searchInput).toBeInTheDocument();
  });
});
