'use client';

import { observer } from 'mobx-react-lite';
import { CircleDashed, AlertTriangle, Tag, User, Layers, FolderKanban, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIssueViewStore } from '@/stores/RootStore';
import { FilterDropdown } from './FilterDropdown';
import { FilterPill } from './FilterPill';

const STATE_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
];

const TYPE_OPTIONS = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'task', label: 'Task' },
];

interface FilterBarProps {
  hideProjectFilter?: boolean;
  assigneeOptions?: Array<{ value: string; label: string }>;
  labelOptions?: Array<{ value: string; label: string; color?: string }>;
  projectOptions?: Array<{ value: string; label: string }>;
}

export const FilterBar = observer(function FilterBar({
  hideProjectFilter = false,
  assigneeOptions = [],
  labelOptions = [],
  projectOptions = [],
}: FilterBarProps) {
  const viewStore = useIssueViewStore();

  const pillData: Array<{
    label: string;
    values: string[];
    onRemove: (v: string) => void;
    options: Array<{ value: string; label: string }>;
  }> = [];

  if (viewStore.filterStates.length > 0) {
    pillData.push({
      label: 'State',
      values: viewStore.filterStates,
      onRemove: (v) => viewStore.toggleFilterState(v),
      options: STATE_OPTIONS,
    });
  }
  if (viewStore.filterPriorities.length > 0) {
    pillData.push({
      label: 'Priority',
      values: viewStore.filterPriorities,
      onRemove: (v) => viewStore.toggleFilterPriority(v),
      options: PRIORITY_OPTIONS,
    });
  }
  if (viewStore.filterTypes.length > 0) {
    pillData.push({
      label: 'Type',
      values: viewStore.filterTypes,
      onRemove: (v) => viewStore.toggleFilterType(v),
      options: TYPE_OPTIONS,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterDropdown
          label="State"
          icon={CircleDashed}
          options={STATE_OPTIONS}
          selected={viewStore.filterStates}
          onChange={(s) => viewStore.setFilterStates(s)}
        />
        <FilterDropdown
          label="Priority"
          icon={AlertTriangle}
          options={PRIORITY_OPTIONS}
          selected={viewStore.filterPriorities}
          onChange={(s) => viewStore.setFilterPriorities(s)}
        />
        <FilterDropdown
          label="Type"
          icon={Tag}
          options={TYPE_OPTIONS}
          selected={viewStore.filterTypes}
          onChange={(s) => viewStore.setFilterTypes(s)}
        />
        {assigneeOptions.length > 0 && (
          <FilterDropdown
            label="Assignee"
            icon={User}
            options={assigneeOptions}
            selected={viewStore.filterAssigneeIds}
            onChange={(s) => viewStore.setFilterAssigneeIds(s)}
          />
        )}
        {labelOptions.length > 0 && (
          <FilterDropdown
            label="Label"
            icon={Layers}
            options={labelOptions}
            selected={viewStore.filterLabelIds}
            onChange={(s) => viewStore.setFilterLabelIds(s)}
          />
        )}
        {!hideProjectFilter && projectOptions.length > 0 && (
          <FilterDropdown
            label="Project"
            icon={FolderKanban}
            options={projectOptions}
            selected={viewStore.filterProjectIds}
            onChange={(s) => viewStore.setFilterProjectIds(s)}
          />
        )}
      </div>

      {viewStore.hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          {pillData.map((pill) =>
            pill.values.map((v) => {
              const displayLabel = pill.options.find((o) => o.value === v)?.label ?? v;
              return (
                <FilterPill
                  key={`${pill.label}-${v}`}
                  label={pill.label}
                  value={displayLabel}
                  onRemove={() => pill.onRemove(v)}
                />
              );
            })
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => viewStore.clearAllFilters()}
            className="h-6 gap-1 px-2 text-xs text-muted-foreground"
          >
            <X className="size-3" />
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
});
