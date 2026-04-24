/**
 * ArtifactRendererSwitch — Phase 86.
 *
 * Verifies loading / error / placeholder states and dispatch selection.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const queryState: {
  data: unknown;
  isLoading: boolean;
  error: Error | null;
} = { data: null, isLoading: false, error: null };

vi.mock('@/hooks/use-artifact-query', () => ({
  useArtifactQuery: () => ({
    data: queryState.data,
    isLoading: queryState.isLoading,
    error: queryState.error,
    refetch: vi.fn(),
  }),
}));

// next/dynamic is synchronous in tests — but returning a real component by
// stubbing to the target module keeps tests deterministic.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: unknown } | Record<string, unknown>>) => {
    function DynamicStub() {
      return <div data-testid="dynamic-placeholder" />;
    }
    // Eagerly kick loader for side effects; not awaited here.
    void loader().catch(() => undefined);
    return DynamicStub;
  },
}));

import { ArtifactRendererSwitch } from '../ArtifactRendererSwitch';

describe('ArtifactRendererSwitch', () => {
  it('renders loading state', () => {
    queryState.data = null;
    queryState.isLoading = true;
    queryState.error = null;
    render(<ArtifactRendererSwitch type="NOTE" id="n1" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders error state with a Retry button', () => {
    queryState.isLoading = false;
    queryState.error = new Error('boom');
    queryState.data = null;
    render(<ArtifactRendererSwitch type="NOTE" id="n1" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders placeholder "Preview unavailable" for file types', () => {
    queryState.isLoading = false;
    queryState.error = null;
    queryState.data = { type: 'PDF', id: 'p1', placeholder: true };
    render(<ArtifactRendererSwitch type="PDF" id="p1" />);
    expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument();
  });

  it('renders the dispatch wrapper when data.placeholder is false', () => {
    queryState.isLoading = false;
    queryState.error = null;
    queryState.data = {
      type: 'NOTE',
      id: 'n1',
      placeholder: false,
      note: {
        id: 'n1',
        title: 'Hello',
        content: { type: 'doc', content: [] },
        wordCount: 0,
        isPinned: false,
        workspaceId: 'w1',
        linkedIssues: [],
        createdAt: '',
        updatedAt: '',
      },
    };
    render(<ArtifactRendererSwitch type="NOTE" id="n1" />);
    expect(screen.getByTestId('artifact-renderer')).toBeInTheDocument();
  });

  it('renders empty state when data is undefined/null but not loading', () => {
    queryState.isLoading = false;
    queryState.error = null;
    queryState.data = undefined;
    render(<ArtifactRendererSwitch type="ISSUE" id="i1" />);
    expect(screen.getByText(/no preview available/i)).toBeInTheDocument();
  });
});
