/**
 * MoveToPickerContent — Plan 93-05 Task 1.
 *
 * Coverage:
 *  - "Move to root" pseudo-row is always rendered first.
 *  - Source topic + descendants are excluded by useTopicsForMove (verified via
 *    rendered candidate ids).
 *  - Selecting "Move to root" calls notesApi.moveTopic with parentId=null and
 *    closes the palette.
 *  - Selecting a topic row calls notesApi.moveTopic with that topic's id.
 *  - oldParentId is sourced from `parentBeforeId` prop (Decision: openPaletteForMove
 *    caches it on UIStore.paletteMoveSourceParentId).
 *  - Empty state ("No matching topics") renders when picker has no candidates.
 *  - Error toast fires with the locked copy on cycle / max-depth rejections.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Command } from 'cmdk';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMoveTopic = vi.fn();
const mockList = vi.fn();
const mockListChildren = vi.fn();
const mockListAncestors = vi.fn();

vi.mock('@/services/api', () => ({
  notesApi: {
    moveTopic: (...args: unknown[]) => mockMoveTopic(...args),
    listChildren: (...args: unknown[]) => mockListChildren(...args),
    listAncestors: (...args: unknown[]) => mockListAncestors(...args),
    list: (...args: unknown[]) => mockList(...args),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));

// useUIStore — return a mock store the picker can call closeCommandPalette on.
const closeCommandPaletteMock = vi.fn();
const fakeUIStore = { closeCommandPalette: closeCommandPaletteMock };

vi.mock('@/stores', () => ({
  useUIStore: () => fakeUIStore,
}));

// Sonner toast — capture error calls so the locked copy can be asserted.
const toastErrorMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {/* MoveToPickerContent renders cmdk CommandItem nodes; they require a
            cmdk Command ancestor in jsdom or they throw a context error. */}
        <Command>{children}</Command>
      </QueryClientProvider>
    ),
  };
}

const buildPage = (
  items: Array<{ id: string; title: string; parentTopicId?: string | null }>,
) => ({
  items: items.map((i) => ({ ...i, parentTopicId: i.parentTopicId ?? null })),
  total: items.length,
  hasNext: false,
  hasPrev: false,
  pageSize: 200,
  nextCursor: null,
  prevCursor: null,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MoveToPickerContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "Move to root" pseudo-row first (always shown)', async () => {
    mockList.mockResolvedValueOnce(
      buildPage([
        { id: 'note-A', title: 'Topic A' },
        { id: 'note-B', title: 'Topic B' },
      ]),
    );

    const { Wrapper } = createWrapper();
    const { MoveToPickerContent } = await import('../components/MoveToPickerContent');

    render(
      <Wrapper>
        <MoveToPickerContent
          workspaceId="ws-1"
          sourceId="note-source"
          parentBeforeId={null}
        />
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByText(/Move to root/i)).toBeInTheDocument());
    expect(screen.getByText('Make a top-level topic')).toBeInTheDocument();
  });

  it('excludes the source topic and its descendants from the candidate list', async () => {
    // source = topic-S; topic-S has child topic-D; topic-D has grandchild topic-G;
    // topic-X is unrelated. Picker should show ONLY topic-X.
    mockList.mockResolvedValueOnce(
      buildPage([
        { id: 'topic-S', title: 'Source', parentTopicId: null },
        { id: 'topic-D', title: 'Direct Child', parentTopicId: 'topic-S' },
        { id: 'topic-G', title: 'Grand Child', parentTopicId: 'topic-D' },
        { id: 'topic-X', title: 'Unrelated', parentTopicId: null },
      ]),
    );

    const { Wrapper } = createWrapper();
    const { MoveToPickerContent } = await import('../components/MoveToPickerContent');

    render(
      <Wrapper>
        <MoveToPickerContent workspaceId="ws-1" sourceId="topic-S" parentBeforeId={null} />
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByText('Unrelated')).toBeInTheDocument());

    expect(screen.queryByText('Source')).not.toBeInTheDocument();
    expect(screen.queryByText('Direct Child')).not.toBeInTheDocument();
    expect(screen.queryByText('Grand Child')).not.toBeInTheDocument();
  });

  it('selecting "Move to root" calls moveTopic with parentId=null + closes the palette', async () => {
    mockList.mockResolvedValueOnce(
      buildPage([{ id: 'topic-X', title: 'Unrelated', parentTopicId: null }]),
    );
    mockMoveTopic.mockResolvedValueOnce({
      id: 'topic-S',
      title: 'Source',
      parentTopicId: null,
      topicDepth: 0,
    });

    const { Wrapper } = createWrapper();
    const { MoveToPickerContent } = await import('../components/MoveToPickerContent');

    render(
      <Wrapper>
        <MoveToPickerContent
          workspaceId="ws-1"
          sourceId="topic-S"
          parentBeforeId="parent-A"
        />
      </Wrapper>,
    );

    const rootRow = await screen.findByTestId('move-to-root');
    await userEvent.click(rootRow);

    await waitFor(() => expect(mockMoveTopic).toHaveBeenCalled());
    // notesApi.moveTopic(workspaceId, noteId, parentId)
    expect(mockMoveTopic).toHaveBeenCalledWith('ws-1', 'topic-S', null);
    expect(closeCommandPaletteMock).toHaveBeenCalled();
  });

  it('selecting a topic row calls moveTopic with that topic id as parentId', async () => {
    mockList.mockResolvedValueOnce(
      buildPage([{ id: 'topic-X', title: 'Destination', parentTopicId: null }]),
    );
    mockMoveTopic.mockResolvedValueOnce({
      id: 'topic-S',
      title: 'Source',
      parentTopicId: 'topic-X',
      topicDepth: 1,
    });

    const { Wrapper } = createWrapper();
    const { MoveToPickerContent } = await import('../components/MoveToPickerContent');

    render(
      <Wrapper>
        <MoveToPickerContent
          workspaceId="ws-1"
          sourceId="topic-S"
          parentBeforeId={null}
        />
      </Wrapper>,
    );

    const targetRow = await screen.findByTestId('move-target-topic-X');
    await userEvent.click(targetRow);

    await waitFor(() => expect(mockMoveTopic).toHaveBeenCalled());
    expect(mockMoveTopic).toHaveBeenCalledWith('ws-1', 'topic-S', 'topic-X');
    expect(closeCommandPaletteMock).toHaveBeenCalled();
  });

  it('renders the "No matching topics" empty state when there are no candidates', async () => {
    // Only the source itself in the workspace — picker filters it out → empty.
    mockList.mockResolvedValueOnce(
      buildPage([{ id: 'topic-S', title: 'Source', parentTopicId: null }]),
    );

    const { Wrapper } = createWrapper();
    const { MoveToPickerContent } = await import('../components/MoveToPickerContent');

    render(
      <Wrapper>
        <MoveToPickerContent workspaceId="ws-1" sourceId="topic-S" parentBeforeId={null} />
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByText('No matching topics')).toBeInTheDocument());
  });

  it('surfaces a typed move error toast on cycle rejection', async () => {
    mockList.mockResolvedValueOnce(
      buildPage([{ id: 'topic-X', title: 'Cycle Target', parentTopicId: null }]),
    );
    const cycleErr = Object.assign(new Error('cycle'), {
      name: 'ApiError',
      status: 409,
      errorCode: 'topic_cycle_rejected',
    });
    mockMoveTopic.mockRejectedValueOnce(cycleErr);

    const { Wrapper } = createWrapper();
    const { MoveToPickerContent } = await import('../components/MoveToPickerContent');

    render(
      <Wrapper>
        <MoveToPickerContent
          workspaceId="ws-1"
          sourceId="topic-S"
          parentBeforeId={null}
        />
      </Wrapper>,
    );

    const targetRow = await screen.findByTestId('move-target-topic-X');
    await userEvent.click(targetRow);

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    const [heading, opts] = toastErrorMock.mock.calls[0] as [string, { description: string }];
    expect(heading).toMatch(/Couldn't move/i);
    expect((opts as { description: string }).description).toMatch(/own subtree/i);
  });

  it('surfaces max-depth toast copy on topic_max_depth_exceeded', async () => {
    mockList.mockResolvedValueOnce(
      buildPage([{ id: 'topic-X', title: 'Deep Target', parentTopicId: null }]),
    );
    const depthErr = Object.assign(new Error('depth'), {
      name: 'ApiError',
      status: 409,
      errorCode: 'topic_max_depth_exceeded',
    });
    mockMoveTopic.mockRejectedValueOnce(depthErr);

    const { Wrapper } = createWrapper();
    const { MoveToPickerContent } = await import('../components/MoveToPickerContent');

    render(
      <Wrapper>
        <MoveToPickerContent
          workspaceId="ws-1"
          sourceId="topic-S"
          parentBeforeId={null}
        />
      </Wrapper>,
    );

    const targetRow = await screen.findByTestId('move-target-topic-X');
    await userEvent.click(targetRow);

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    const [, opts] = toastErrorMock.mock.calls[0] as [string, { description: string }];
    expect((opts as { description: string }).description).toMatch(/5-level depth/i);
  });
});
