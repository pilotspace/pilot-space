/**
 * Phase 87.1 Plan 04 — ArtifactRendererSwitch dispatch for MD and HTML.
 *
 * Verifies:
 *  - type='MD' with content → renders MarkdownRenderer with content prop
 *  - type='HTML' with content → renders HtmlRenderer with content + filename
 *  - type='HTML' iframe sandbox attribute equals empty string (no allow-scripts)
 *  - placeholder branch: no content → still falls through to UnsupportedState
 *    (we keep the old behavior when the hook hasn't fetched content yet).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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

// Resolve dynamic() synchronously by importing the underlying module and
// returning its named export. This is the same shape Next.js uses in tests.
vi.mock('next/dynamic', () => ({
  default: <P,>(loader: () => Promise<{ default?: unknown } | Record<string, unknown>>) => {
    let Resolved: React.ComponentType<P> | null = null;
    function DynamicProxy(props: P) {
      if (!Resolved) {
        // synchronous resolution via Promise spy — vitest hoists the mock and
        // we rely on the loader having been called eagerly in the import-time pass
        return null;
      }
      return <Resolved {...props} />;
    }
    void loader().then((mod) => {
      const candidate =
        (mod as { MarkdownRenderer?: unknown }).MarkdownRenderer ??
        (mod as { HtmlRenderer?: unknown }).HtmlRenderer ??
        (mod as { NoteReadOnly?: unknown }).NoteReadOnly ??
        (mod as { IssueReadOnly?: unknown }).IssueReadOnly ??
        (mod as { default?: unknown }).default;
      if (candidate) Resolved = candidate as React.ComponentType<P>;
    });
    return DynamicProxy;
  },
}));

import * as React from 'react';
import { ArtifactRendererSwitch } from '../ArtifactRendererSwitch';
import { HtmlRenderer } from '@/features/artifacts/components/renderers/HtmlRenderer';

describe('ArtifactRendererSwitch — MD/HTML dispatch (Phase 87.1 Plan 04)', () => {
  it('renders MarkdownRenderer when type=MD and content is present', async () => {
    queryState.isLoading = false;
    queryState.error = null;
    queryState.data = {
      type: 'MD',
      id: 'md-1',
      content: '# hello world\n\nbody',
      title: 'hello.md',
    };
    render(<ArtifactRendererSwitch type="MD" id="md-1" />);
    // The artifact-renderer wrapper appears immediately
    expect(screen.getByTestId('artifact-renderer')).toBeInTheDocument();
    // The dynamically-loaded MarkdownRenderer eventually renders the heading
    await waitFor(
      () => {
        // MarkdownContent renders the markdown — we verify by content presence.
        expect(screen.getByTestId('artifact-renderer').textContent).toContain('hello world');
      },
      { timeout: 2000 },
    );
  });

  it('renders HtmlRenderer when type=HTML and content is present', async () => {
    queryState.isLoading = false;
    queryState.error = null;
    queryState.data = {
      type: 'HTML',
      id: 'h-1',
      content: '<p>x</p>',
      title: 'page.html',
    };
    render(<ArtifactRendererSwitch type="HTML" id="h-1" />);
    expect(screen.getByTestId('artifact-renderer')).toBeInTheDocument();
    // HtmlRenderer header has Preview/Source tabs
    await waitFor(
      () => {
        expect(screen.getByRole('tab', { name: /preview/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /source/i })).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });

  it('shows EmptyState when MD data has no content (mid-fetch)', () => {
    queryState.isLoading = false;
    queryState.error = null;
    // No content key — preview not yet fetched.
    queryState.data = { type: 'MD', id: 'md-2' };
    render(<ArtifactRendererSwitch type="MD" id="md-2" />);
    expect(screen.getByText(/no preview available/i)).toBeInTheDocument();
  });
});

describe('HtmlRenderer iframe sandbox invariant (T-87.1-04-01)', () => {
  it('iframe sandbox attribute equals empty string and does not contain allow-scripts', () => {
    const { container } = render(
      <HtmlRenderer content="<p>safe</p>" filename="a.html" />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const sandbox = iframe!.getAttribute('sandbox');
    // Empty string == maximum sandbox; React serializes `sandbox=""` as such.
    expect(sandbox).toBe('');
    expect(sandbox).not.toContain('allow-scripts');
  });
});
