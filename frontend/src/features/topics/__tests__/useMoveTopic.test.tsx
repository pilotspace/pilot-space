/**
 * Unit tests for useMoveTopic (Phase 93 Plan 03 Task 2).
 *
 * Coverage (per UI-SPEC §Design-Debt 7 + Plan 93-03 Decision J):
 *  - Optimistic dual-key write: removes from old parent's children list, inserts at top of new
 *    parent's list (page=1).
 *  - Rollback on 409 topic_max_depth_exceeded → MoveTopicError.kind === 'maxDepth' AND both
 *    snapshots restored.
 *  - Rollback on 409 topic_cycle_rejected → MoveTopicError.kind === 'cycle'.
 *  - Rollback on 403 cross_workspace_move → MoveTopicError.kind === 'forbidden'.
 *  - onSettled invalidates topicTreeKeys.all(workspaceId).
 *  - Unknown errors surface as { kind: 'unknown', original }.
 *  - 404 topic_not_found / parent_not_found → MoveTopicError.kind === 'notFound'.
 *  - useTopicsForMove excludes the source topic and its descendants.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMoveTopic = vi.fn();
const mockListChildren = vi.fn();
const mockListAncestors = vi.fn();
const mockList = vi.fn();

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

// Build a minimal ApiError-like shape used by the mapper. The hook reads
// `errorCode` + `status` and discriminates accordingly.
function makeApiError(status: number, errorCode: string | undefined, message = 'fail'): Error {
  const err = new Error(message) as Error & {
    name: string;
    status: number;
    errorCode?: string;
  };
  err.name = 'ApiError';
  err.status = status;
  err.errorCode = errorCode;
  return err;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

const buildPage = (items: Array<{ id: string; title: string; parentTopicId?: string | null }>) => ({
  items,
  total: items.length,
  hasNext: false,
  hasPrev: false,
  pageSize: 20,
  nextCursor: null,
  prevCursor: null,
});

// Seeds the cache with old/new parent children lists so we can observe optimistic mutations.
async function seedChildren(
  queryClient: QueryClient,
  topicTreeKeys: typeof import('../lib/topic-tree-keys').topicTreeKeys,
  oldParentId: string | null,
  newParentId: string | null,
  oldList: ReturnType<typeof buildPage>,
  newList: ReturnType<typeof buildPage>,
) {
  queryClient.setQueryData(topicTreeKeys.children('ws-1', oldParentId, 1), oldList);
  queryClient.setQueryData(topicTreeKeys.children('ws-1', newParentId, 1), newList);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMoveTopic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('optimistic update removes from old parent and inserts at top of new parent', async () => {
    const { wrapper, queryClient } = createWrapper();
    const { topicTreeKeys } = await import('../lib/topic-tree-keys');
    const note = { id: 'n1', title: 'Moved', parentTopicId: 'p2', topicDepth: 1 };

    const oldList = buildPage([
      { id: 'n1', title: 'Moved', parentTopicId: 'p1' },
      { id: 'n2', title: 'Sibling', parentTopicId: 'p1' },
    ]);
    const newList = buildPage([{ id: 'n3', title: 'Other', parentTopicId: 'p2' }]);
    await seedChildren(queryClient, topicTreeKeys, 'p1', 'p2', oldList, newList);

    // Server eventually returns the moved note; resolve after a microtask so we can observe
    // the optimistic intermediate cache.
    let resolveMove: (value: unknown) => void = () => undefined;
    mockMoveTopic.mockReturnValueOnce(new Promise((res) => { resolveMove = res; }));

    const { useMoveTopic } = await import('../hooks/useMoveTopic');
    const { result } = renderHook(() => useMoveTopic('ws-1'), { wrapper });

    act(() => {
      result.current.mutate({ noteId: 'n1', parentId: 'p2', oldParentId: 'p1' });
    });

    // Wait for the optimistic write to apply.
    await waitFor(() => {
      const after = queryClient.getQueryData<ReturnType<typeof buildPage>>(
        topicTreeKeys.children('ws-1', 'p1', 1)
      );
      expect(after?.items.map((n) => n.id)).toEqual(['n2']);
    });

    const newAfter = queryClient.getQueryData<ReturnType<typeof buildPage>>(
      topicTreeKeys.children('ws-1', 'p2', 1)
    );
    // n1 inserted at the top of new parent.
    expect(newAfter?.items.map((n) => n.id)).toEqual(['n1', 'n3']);

    // Resolve the server.
    act(() => {
      resolveMove(note);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back both snapshots and surfaces MoveTopicError.kind === "maxDepth" on 409 topic_max_depth_exceeded', async () => {
    const { wrapper, queryClient } = createWrapper();
    const { topicTreeKeys } = await import('../lib/topic-tree-keys');
    const oldList = buildPage([
      { id: 'n1', title: 'Moved', parentTopicId: 'p1' },
      { id: 'n2', title: 'Sibling', parentTopicId: 'p1' },
    ]);
    const newList = buildPage([{ id: 'n3', title: 'Other', parentTopicId: 'p2' }]);
    await seedChildren(queryClient, topicTreeKeys, 'p1', 'p2', oldList, newList);

    mockMoveTopic.mockRejectedValueOnce(makeApiError(409, 'topic_max_depth_exceeded'));

    const { useMoveTopic } = await import('../hooks/useMoveTopic');
    const { result } = renderHook(() => useMoveTopic('ws-1'), { wrapper });

    await act(async () => {
      result.current.mutate({ noteId: 'n1', parentId: 'p2', oldParentId: 'p1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual({ kind: 'maxDepth' });

    // Rollback verified — snapshots restored to their pre-mutation state.
    const restoredOld = queryClient.getQueryData<ReturnType<typeof buildPage>>(
      topicTreeKeys.children('ws-1', 'p1', 1)
    );
    const restoredNew = queryClient.getQueryData<ReturnType<typeof buildPage>>(
      topicTreeKeys.children('ws-1', 'p2', 1)
    );
    expect(restoredOld?.items.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(restoredNew?.items.map((n) => n.id)).toEqual(['n3']);
  });

  it('rolls back on 409 topic_cycle_rejected with kind === "cycle"', async () => {
    const { wrapper, queryClient } = createWrapper();
    const { topicTreeKeys } = await import('../lib/topic-tree-keys');
    await seedChildren(
      queryClient,
      topicTreeKeys,
      'p1',
      'p2',
      buildPage([{ id: 'n1', title: 'Moved', parentTopicId: 'p1' }]),
      buildPage([])
    );

    mockMoveTopic.mockRejectedValueOnce(makeApiError(409, 'topic_cycle_rejected'));
    const { useMoveTopic } = await import('../hooks/useMoveTopic');
    const { result } = renderHook(() => useMoveTopic('ws-1'), { wrapper });

    await act(async () => {
      result.current.mutate({ noteId: 'n1', parentId: 'p2', oldParentId: 'p1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({ kind: 'cycle' });
  });

  it('rolls back on 403 cross_workspace_move with kind === "forbidden"', async () => {
    const { wrapper, queryClient } = createWrapper();
    const { topicTreeKeys } = await import('../lib/topic-tree-keys');
    await seedChildren(
      queryClient,
      topicTreeKeys,
      'p1',
      'p2',
      buildPage([{ id: 'n1', title: 'Moved', parentTopicId: 'p1' }]),
      buildPage([])
    );

    mockMoveTopic.mockRejectedValueOnce(makeApiError(403, 'cross_workspace_move'));
    const { useMoveTopic } = await import('../hooks/useMoveTopic');
    const { result } = renderHook(() => useMoveTopic('ws-1'), { wrapper });

    await act(async () => {
      result.current.mutate({ noteId: 'n1', parentId: 'p2', oldParentId: 'p1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({ kind: 'forbidden' });
  });

  it('maps 404 topic_not_found / parent_not_found to kind === "notFound"', async () => {
    const { wrapper, queryClient } = createWrapper();
    const { topicTreeKeys } = await import('../lib/topic-tree-keys');
    await seedChildren(
      queryClient,
      topicTreeKeys,
      'p1',
      'p2',
      buildPage([{ id: 'n1', title: 'Moved', parentTopicId: 'p1' }]),
      buildPage([])
    );

    mockMoveTopic.mockRejectedValueOnce(makeApiError(404, 'parent_not_found'));
    const { useMoveTopic } = await import('../hooks/useMoveTopic');
    const { result } = renderHook(() => useMoveTopic('ws-1'), { wrapper });

    await act(async () => {
      result.current.mutate({ noteId: 'n1', parentId: 'p2', oldParentId: 'p1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({ kind: 'notFound' });
  });

  it('unrecognized errors surface as { kind: "unknown", original }', async () => {
    const { wrapper, queryClient } = createWrapper();
    const { topicTreeKeys } = await import('../lib/topic-tree-keys');
    await seedChildren(
      queryClient,
      topicTreeKeys,
      'p1',
      'p2',
      buildPage([{ id: 'n1', title: 'Moved', parentTopicId: 'p1' }]),
      buildPage([])
    );

    const original = new Error('Something else broke');
    mockMoveTopic.mockRejectedValueOnce(original);
    const { useMoveTopic } = await import('../hooks/useMoveTopic');
    const { result } = renderHook(() => useMoveTopic('ws-1'), { wrapper });

    await act(async () => {
      result.current.mutate({ noteId: 'n1', parentId: 'p2', oldParentId: 'p1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ kind: 'unknown' });
    // The original error is preserved for diagnostics
    expect((result.current.error as { kind: 'unknown'; original: unknown }).original).toBe(original);
  });

  it('onSettled invalidates topicTreeKeys.all(workspaceId)', async () => {
    const { wrapper, queryClient } = createWrapper();
    const { topicTreeKeys } = await import('../lib/topic-tree-keys');
    const note = { id: 'n1', title: 'Moved', parentTopicId: 'p2', topicDepth: 1 };

    await seedChildren(
      queryClient,
      topicTreeKeys,
      'p1',
      'p2',
      buildPage([{ id: 'n1', title: 'Moved', parentTopicId: 'p1' }]),
      buildPage([])
    );

    mockMoveTopic.mockResolvedValueOnce(note);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { useMoveTopic } = await import('../hooks/useMoveTopic');
    const { result } = renderHook(() => useMoveTopic('ws-1'), { wrapper });

    await act(async () => {
      result.current.mutate({ noteId: 'n1', parentId: 'p2', oldParentId: 'p1' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: topicTreeKeys.all('ws-1') })
    );
  });
});

// ---------------------------------------------------------------------------
// useTopicsForMove
// ---------------------------------------------------------------------------

describe('useTopicsForMove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes the source topic and all of its descendants', async () => {
    const { wrapper } = createWrapper();
    // Tree:
    //   root1 (no parent)
    //     ├─ source     ← exclude self
    //     │    ├─ childA   ← exclude (descendant)
    //     │    └─ childB   ← exclude (descendant)
    //     │         └─ grand  ← exclude (descendant of descendant)
    //     └─ sibling    ← keep
    //   root2 (no parent) ← keep
    const allNotes = {
      items: [
        { id: 'root1', title: 'Root 1', parentTopicId: null, topicDepth: 0 },
        { id: 'source', title: 'Source', parentTopicId: 'root1', topicDepth: 1 },
        { id: 'childA', title: 'Child A', parentTopicId: 'source', topicDepth: 2 },
        { id: 'childB', title: 'Child B', parentTopicId: 'source', topicDepth: 2 },
        { id: 'grand', title: 'Grand', parentTopicId: 'childB', topicDepth: 3 },
        { id: 'sibling', title: 'Sibling', parentTopicId: 'root1', topicDepth: 1 },
        { id: 'root2', title: 'Root 2', parentTopicId: null, topicDepth: 0 },
      ],
      total: 7,
      hasNext: false,
      hasPrev: false,
      pageSize: 200,
      nextCursor: null,
      prevCursor: null,
    };
    mockList.mockResolvedValueOnce(allNotes);

    const { useTopicsForMove } = await import('../hooks/useTopicsForMove');
    const { result } = renderHook(() => useTopicsForMove('ws-1', 'source'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const ids = result.current.data?.map((n) => n.id) ?? [];
    expect(ids).toEqual(['root1', 'sibling', 'root2']);
    expect(ids).not.toContain('source');
    expect(ids).not.toContain('childA');
    expect(ids).not.toContain('childB');
    expect(ids).not.toContain('grand');
  });
});
