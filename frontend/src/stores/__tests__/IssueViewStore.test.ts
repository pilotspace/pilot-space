/**
 * Unit tests for IssueViewStore.
 *
 * Tests MobX store for issue view state: view preferences, filters,
 * selection, persistence, and lifecycle.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IssueViewStore } from '../features/issues/IssueViewStore';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('IssueViewStore', () => {
  let store: IssueViewStore;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    store = new IssueViewStore();
  });

  // ---- Default State ----

  describe('default state', () => {
    it('has correct initial view preferences', () => {
      expect(store.viewMode).toBe('board');
      expect(store.cardDensity).toBe('comfortable');
      expect(store.collapsedColumns.size).toBe(0);
      expect(store.collapsedGroups.size).toBe(0);
      expect(store.columnWidths.size).toBe(0);
      expect(store.hiddenColumns.size).toBe(0);
      expect(store.wipLimits.size).toBe(0);
    });

    it('has empty filters by default', () => {
      expect(store.filterStates).toEqual([]);
      expect(store.filterPriorities).toEqual([]);
      expect(store.filterTypes).toEqual([]);
      expect(store.filterAssigneeIds).toEqual([]);
      expect(store.filterLabelIds).toEqual([]);
      expect(store.filterProjectIds).toEqual([]);
    });

    it('has empty selection by default', () => {
      expect(store.selectedIssueIds.size).toBe(0);
    });
  });

  // ---- Computed Getters ----

  describe('computed getters', () => {
    it('hasActiveFilters returns false when no filters set', () => {
      expect(store.hasActiveFilters).toBe(false);
    });

    it('hasActiveFilters returns true when any filter is set', () => {
      store.setFilterStates(['backlog']);
      expect(store.hasActiveFilters).toBe(true);
    });

    it('activeFilterCount sums all filter arrays', () => {
      store.setFilterStates(['backlog', 'todo']);
      store.setFilterPriorities(['high']);
      store.setFilterLabelIds(['label-1', 'label-2', 'label-3']);
      expect(store.activeFilterCount).toBe(6);
    });

    it('activeFilterCount is 0 when no filters', () => {
      expect(store.activeFilterCount).toBe(0);
    });

    it('selectedCount reflects selectedIssueIds size', () => {
      expect(store.selectedCount).toBe(0);
      store.toggleSelectedIssue('issue-1');
      expect(store.selectedCount).toBe(1);
      store.toggleSelectedIssue('issue-2');
      expect(store.selectedCount).toBe(2);
    });
  });

  // ---- View Preference Actions ----

  describe('view preference actions', () => {
    it('setViewMode updates viewMode', () => {
      store.setViewMode('list');
      expect(store.viewMode).toBe('list');
      store.setViewMode('table');
      expect(store.viewMode).toBe('table');
    });

    it('setCardDensity updates cardDensity', () => {
      store.setCardDensity('compact');
      expect(store.cardDensity).toBe('compact');
      store.setCardDensity('minimal');
      expect(store.cardDensity).toBe('minimal');
    });

    it('toggleColumnCollapsed adds and removes column keys', () => {
      store.toggleColumnCollapsed('cancelled');
      expect(store.collapsedColumns.has('cancelled')).toBe(true);
      store.toggleColumnCollapsed('cancelled');
      expect(store.collapsedColumns.has('cancelled')).toBe(false);
    });

    it('toggleGroupCollapsed adds and removes group IDs', () => {
      store.toggleGroupCollapsed('group-1');
      expect(store.collapsedGroups.has('group-1')).toBe(true);
      store.toggleGroupCollapsed('group-1');
      expect(store.collapsedGroups.has('group-1')).toBe(false);
    });

    it('setColumnWidth sets width for a column', () => {
      store.setColumnWidth('title', 200);
      expect(store.columnWidths.get('title')).toBe(200);
    });

    it('toggleHiddenColumn adds and removes column keys', () => {
      store.toggleHiddenColumn('priority');
      expect(store.hiddenColumns.has('priority')).toBe(true);
      store.toggleHiddenColumn('priority');
      expect(store.hiddenColumns.has('priority')).toBe(false);
    });

    it('setWipLimit sets limit for a column', () => {
      store.setWipLimit('in_progress', 5);
      expect(store.wipLimits.get('in_progress')).toBe(5);
    });
  });

  // ---- Filter Actions ----

  describe('filter set actions', () => {
    it('setFilterStates replaces states array', () => {
      store.setFilterStates(['backlog', 'todo']);
      expect(store.filterStates).toEqual(['backlog', 'todo']);
    });

    it('setFilterPriorities replaces priorities array', () => {
      store.setFilterPriorities(['high', 'urgent']);
      expect(store.filterPriorities).toEqual(['high', 'urgent']);
    });

    it('setFilterTypes replaces types array', () => {
      store.setFilterTypes(['bug', 'feature']);
      expect(store.filterTypes).toEqual(['bug', 'feature']);
    });

    it('setFilterAssigneeIds replaces assignee IDs', () => {
      store.setFilterAssigneeIds(['user-1']);
      expect(store.filterAssigneeIds).toEqual(['user-1']);
    });

    it('setFilterLabelIds replaces label IDs', () => {
      store.setFilterLabelIds(['label-1']);
      expect(store.filterLabelIds).toEqual(['label-1']);
    });

    it('setFilterProjectIds replaces project IDs', () => {
      store.setFilterProjectIds(['proj-1']);
      expect(store.filterProjectIds).toEqual(['proj-1']);
    });
  });

  describe('filter toggle actions', () => {
    it('toggleFilterState adds then removes', () => {
      store.toggleFilterState('backlog');
      expect(store.filterStates).toEqual(['backlog']);
      store.toggleFilterState('backlog');
      expect(store.filterStates).toEqual([]);
    });

    it('toggleFilterPriority adds then removes', () => {
      store.toggleFilterPriority('high');
      expect(store.filterPriorities).toEqual(['high']);
      store.toggleFilterPriority('high');
      expect(store.filterPriorities).toEqual([]);
    });

    it('toggleFilterType adds then removes', () => {
      store.toggleFilterType('bug');
      expect(store.filterTypes).toEqual(['bug']);
      store.toggleFilterType('bug');
      expect(store.filterTypes).toEqual([]);
    });

    it('toggleFilterAssigneeId adds then removes', () => {
      store.toggleFilterAssigneeId('user-1');
      expect(store.filterAssigneeIds).toEqual(['user-1']);
      store.toggleFilterAssigneeId('user-1');
      expect(store.filterAssigneeIds).toEqual([]);
    });

    it('toggleFilterLabelId adds then removes', () => {
      store.toggleFilterLabelId('label-1');
      expect(store.filterLabelIds).toEqual(['label-1']);
      store.toggleFilterLabelId('label-1');
      expect(store.filterLabelIds).toEqual([]);
    });

    it('toggleFilterProjectId adds then removes', () => {
      store.toggleFilterProjectId('proj-1');
      expect(store.filterProjectIds).toEqual(['proj-1']);
      store.toggleFilterProjectId('proj-1');
      expect(store.filterProjectIds).toEqual([]);
    });

    it('clearAllFilters resets all filter arrays', () => {
      store.setFilterStates(['backlog']);
      store.setFilterPriorities(['high']);
      store.setFilterTypes(['bug']);
      store.setFilterAssigneeIds(['user-1']);
      store.setFilterLabelIds(['label-1']);
      store.setFilterProjectIds(['proj-1']);

      store.clearAllFilters();

      expect(store.filterStates).toEqual([]);
      expect(store.filterPriorities).toEqual([]);
      expect(store.filterTypes).toEqual([]);
      expect(store.filterAssigneeIds).toEqual([]);
      expect(store.filterLabelIds).toEqual([]);
      expect(store.filterProjectIds).toEqual([]);
      expect(store.hasActiveFilters).toBe(false);
    });
  });

  // ---- Selection Actions ----

  describe('selection actions', () => {
    it('toggleSelectedIssue adds and removes issue IDs', () => {
      store.toggleSelectedIssue('issue-1');
      expect(store.selectedIssueIds.has('issue-1')).toBe(true);
      store.toggleSelectedIssue('issue-1');
      expect(store.selectedIssueIds.has('issue-1')).toBe(false);
    });

    it('selectAll replaces selection with given IDs', () => {
      store.toggleSelectedIssue('issue-old');
      store.selectAll(['issue-1', 'issue-2', 'issue-3']);
      expect(store.selectedCount).toBe(3);
      expect(store.selectedIssueIds.has('issue-old')).toBe(false);
    });

    it('clearSelection empties selection', () => {
      store.selectAll(['issue-1', 'issue-2']);
      store.clearSelection();
      expect(store.selectedCount).toBe(0);
    });
  });

  // ---- Lifecycle ----

  describe('lifecycle', () => {
    it('reset restores all defaults', () => {
      store.setViewMode('table');
      store.setCardDensity('minimal');
      store.toggleColumnCollapsed('cancelled');
      store.setFilterStates(['backlog']);
      store.toggleSelectedIssue('issue-1');
      store.setColumnWidth('title', 300);
      store.setWipLimit('in_progress', 3);

      store.reset();

      expect(store.viewMode).toBe('board');
      expect(store.cardDensity).toBe('comfortable');
      expect(store.collapsedColumns.size).toBe(0);
      expect(store.filterStates).toEqual([]);
      expect(store.selectedCount).toBe(0);
      expect(store.columnWidths.size).toBe(0);
      expect(store.wipLimits.size).toBe(0);
    });

    it('dispose cleans up reaction disposers without error', () => {
      expect(() => store.dispose()).not.toThrow();
    });
  });

  // ---- Persistence ----

  describe('persistence', () => {
    it('hydrate loads persisted state from localStorage', () => {
      const persisted = {
        viewMode: 'list',
        cardDensity: 'compact',
        collapsedColumns: ['cancelled'],
        collapsedGroups: ['group-1'],
        columnWidths: { title: 250 },
        hiddenColumns: ['priority'],
        wipLimits: { in_progress: 3 },
        filterStates: ['backlog'],
        filterPriorities: ['high'],
        filterTypes: [],
        filterAssigneeIds: [],
        filterLabelIds: [],
        filterProjectIds: [],
      };
      localStorageMock.setItem('pilot-space:issue-view-state', JSON.stringify(persisted));

      const freshStore = new IssueViewStore();
      freshStore.hydrate();

      expect(freshStore.viewMode).toBe('list');
      expect(freshStore.cardDensity).toBe('compact');
      expect(freshStore.collapsedColumns.has('cancelled')).toBe(true);
      expect(freshStore.collapsedGroups.has('group-1')).toBe(true);
      expect(freshStore.columnWidths.get('title')).toBe(250);
      expect(freshStore.hiddenColumns.has('priority')).toBe(true);
      expect(freshStore.wipLimits.get('in_progress')).toBe(3);
      expect(freshStore.filterStates).toEqual(['backlog']);
      expect(freshStore.filterPriorities).toEqual(['high']);
    });

    it('hydrate is idempotent (only runs once)', () => {
      localStorageMock.setItem(
        'pilot-space:issue-view-state',
        JSON.stringify({ viewMode: 'list' })
      );

      const freshStore = new IssueViewStore();
      freshStore.hydrate();
      expect(freshStore.viewMode).toBe('list');

      // Change viewMode in storage, hydrate again - should NOT change
      localStorageMock.setItem(
        'pilot-space:issue-view-state',
        JSON.stringify({ viewMode: 'table' })
      );
      freshStore.hydrate();
      expect(freshStore.viewMode).toBe('list');
    });

    it('hydrate handles corrupted localStorage gracefully', () => {
      localStorageMock.setItem('pilot-space:issue-view-state', 'not-valid-json');

      const freshStore = new IssueViewStore();
      expect(() => freshStore.hydrate()).not.toThrow();
      expect(freshStore.viewMode).toBe('board'); // defaults preserved
    });

    it('hydrate handles missing keys with defaults', () => {
      localStorageMock.setItem(
        'pilot-space:issue-view-state',
        JSON.stringify({ viewMode: 'table' })
      );

      const freshStore = new IssueViewStore();
      freshStore.hydrate();

      expect(freshStore.viewMode).toBe('table');
      expect(freshStore.cardDensity).toBe('comfortable'); // default
      expect(freshStore.filterStates).toEqual([]); // default
    });
  });
});
