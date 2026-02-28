/**
 * useIssueRelations hook tests.
 *
 * Verifies TanStack Query integration for fetching issue-to-issue relations.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useIssueRelations, issueRelationsKeys } from '../use-issue-relations';
import type { IssueRelation } from '@/types';

vi.mock('@/services/api', () => ({
  issuesApi: {
    getRelations: vi.fn(),
  },
}));

import { issuesApi } from '@/services/api';

const WS_ID = '11111111-1111-1111-1111-111111111111';
const ISSUE_ID = '22222222-2222-2222-2222-222222222222';

const mockRelations: IssueRelation[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    linkType: 'blocks',
    direction: 'outbound',
    relatedIssue: {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      identifier: 'PS-2',
      name: 'Blocked issue',
      priority: 'high',
      state: {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        name: 'Todo',
        color: '#60a5fa',
        group: 'unstarted',
      },
    },
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    linkType: 'related',
    direction: 'inbound',
    relatedIssue: {
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      identifier: 'PS-3',
      name: 'Related issue',
      priority: 'low',
      state: {
        id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        name: 'Done',
        color: '#22c55e',
        group: 'completed',
      },
    },
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useIssueRelations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches relations when workspaceId and issueId are provided', async () => {
    vi.mocked(issuesApi.getRelations).mockResolvedValue(mockRelations);

    const { result } = renderHook(() => useIssueRelations(WS_ID, ISSUE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(issuesApi.getRelations).toHaveBeenCalledWith(WS_ID, ISSUE_ID);
    expect(result.current.data).toEqual(mockRelations);
  });

  it('is disabled when workspaceId is empty', () => {
    const { result } = renderHook(() => useIssueRelations('', ISSUE_ID), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(issuesApi.getRelations).not.toHaveBeenCalled();
  });

  it('is disabled when issueId is empty', () => {
    const { result } = renderHook(() => useIssueRelations(WS_ID, ''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(issuesApi.getRelations).not.toHaveBeenCalled();
  });

  it('is disabled when workspaceId is not a valid UUID', () => {
    const { result } = renderHook(() => useIssueRelations('not-a-uuid', ISSUE_ID), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(issuesApi.getRelations).not.toHaveBeenCalled();
  });

  it('is disabled when issueId is not a valid UUID', () => {
    const { result } = renderHook(() => useIssueRelations(WS_ID, 'not-a-uuid'), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(issuesApi.getRelations).not.toHaveBeenCalled();
  });

  it('returns error state when API call fails', async () => {
    vi.mocked(issuesApi.getRelations).mockRejectedValue(new Error('Unauthorized'));

    const { result } = renderHook(() => useIssueRelations(WS_ID, ISSUE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('returns empty array when API returns no relations', async () => {
    vi.mocked(issuesApi.getRelations).mockResolvedValue([]);

    const { result } = renderHook(() => useIssueRelations(WS_ID, ISSUE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('uses correct query key', () => {
    expect(issueRelationsKeys.detail(WS_ID, ISSUE_ID)).toEqual([
      'issues',
      WS_ID,
      ISSUE_ID,
      'relations',
    ]);
  });
});
