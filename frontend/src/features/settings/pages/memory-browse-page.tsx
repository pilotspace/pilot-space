/**
 * MemoryBrowsePage — Admin memory management page inside the settings modal.
 *
 * Phase 71: Paginated table with filters, search, detail drawer, bulk actions,
 * and stats header. NOT observer — uses TanStack Query, not MobX.
 */

'use client';

import * as React from 'react';
import { useStore } from '@/stores';
import { MemoryStatsHeader } from '../components/memory-stats-header';
import { MemorySearchBar } from '../components/memory-search-bar';
import { MemoryFacetBar } from '../components/memory-facet-bar';
import { MemoryBrowseTable } from '../components/memory-browse-table';
import { MemoryBulkActionBar } from '../components/memory-bulk-action-bar';
import { MemoryDetailDrawer } from '../components/memory-detail-drawer';
import { useBulkMemoryAction, useMemoryList } from '../hooks/use-ai-memory';
import type { MemoryListParams } from '../hooks/use-ai-memory';

const DEFAULT_LIMIT = 50;

export function MemoryBrowsePage() {
  const { workspaceStore } = useStore();
  const workspaceId = workspaceStore.currentWorkspace?.id;

  const [offset, setOffset] = React.useState(0);
  const [filters, setFilters] = React.useState<
    Pick<MemoryListParams, 'type' | 'kind' | 'pinned'>
  >({});
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [selectedMemoryId, setSelectedMemoryId] = React.useState<string | null>(null);

  const params: MemoryListParams = React.useMemo(
    () => ({
      offset,
      limit: DEFAULT_LIMIT,
      ...filters,
      ...(searchQuery ? { q: searchQuery } : {}),
    }),
    [offset, filters, searchQuery],
  );

  const { data: listData, isLoading } = useMemoryList(workspaceId, params);
  const resultCount = listData?.total ?? 0;

  const bulkAction = useBulkMemoryAction(workspaceId);

  const handleSearchChange = React.useCallback((q: string) => {
    setSearchQuery(q);
    setOffset(0);
    setSelectedIds(new Set());
  }, []);

  const handleFiltersChange = React.useCallback(
    (next: Pick<MemoryListParams, 'type' | 'kind' | 'pinned'>) => {
      setFilters(next);
      setOffset(0);
      setSelectedIds(new Set());
    },
    [],
  );

  const handlePageChange = React.useCallback((newOffset: number) => {
    setOffset(newOffset);
    setSelectedIds(new Set());
  }, []);

  const handleBulkPin = React.useCallback(() => {
    if (!selectedIds.size) return;
    bulkAction.mutate(
      { action: 'pin', memoryIds: Array.from(selectedIds) },
      { onSuccess: () => setSelectedIds(new Set()) },
    );
  }, [selectedIds, bulkAction]);

  const handleBulkForget = React.useCallback(() => {
    if (!selectedIds.size) return;
    bulkAction.mutate(
      { action: 'forget', memoryIds: Array.from(selectedIds) },
      { onSuccess: () => setSelectedIds(new Set()) },
    );
  }, [selectedIds, bulkAction]);

  if (!workspaceId) return null;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Memory</h2>
        <p className="text-sm text-muted-foreground max-w-lg">
          Browse, search, and manage AI memory for this workspace.
        </p>
      </div>

      <MemoryStatsHeader workspaceId={workspaceId} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center border-b pb-4">
        <div className="relative flex-1 min-w-0">
          <MemorySearchBar value={searchQuery} onChange={handleSearchChange} />
          {!isLoading && (
            <span id="memory-search-results" className="sr-only" aria-live="polite" aria-atomic="true">
              {resultCount} {resultCount === 1 ? 'result' : 'results'} found
            </span>
          )}
        </div>
        <MemoryFacetBar filters={filters} onChange={handleFiltersChange} />
      </div>

      <MemoryBrowseTable
        workspaceId={workspaceId}
        params={params}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={setSelectedMemoryId}
        offset={offset}
        limit={DEFAULT_LIMIT}
        onPageChange={handlePageChange}
      />

      <div role="status" aria-live="polite">
        {selectedIds.size > 0 && (
          <MemoryBulkActionBar
            selectedCount={selectedIds.size}
            onPin={handleBulkPin}
            onForget={handleBulkForget}
            isPending={bulkAction.isPending}
          />
        )}
      </div>

      <MemoryDetailDrawer
        workspaceId={workspaceId}
        nodeId={selectedMemoryId}
        open={!!selectedMemoryId}
        onClose={() => setSelectedMemoryId(null)}
      />
    </div>
  );
}
