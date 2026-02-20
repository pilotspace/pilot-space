'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ListRow } from './ListRow';
import type { Issue, IssueState, IssuePriority } from '@/types';

interface ListGroupProps {
  groupKey: string;
  groupLabel: string;
  groupIcon: React.ElementType;
  groupIconClass: string;
  issues: Issue[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onStateChange?: (issueId: string, state: IssueState) => void;
  onPriorityChange?: (issueId: string, priority: IssuePriority) => void;
  onNavigate?: (issue: Issue) => void;
}

export function ListGroup(props: ListGroupProps) {
  const {
    groupLabel,
    groupIcon: Icon,
    groupIconClass,
    issues,
    isCollapsed,
    onToggleCollapse,
    selectedIds,
    onToggleSelect,
    onStateChange,
    onPriorityChange,
    onNavigate,
  } = props;
  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={onToggleCollapse}
        className="flex w-full items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors"
        aria-expanded={!isCollapsed}
        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${groupLabel}`}
      >
        <ChevronRight
          className={cn('size-3.5 transition-transform duration-200', !isCollapsed && 'rotate-90')}
        />
        <Icon className={cn('size-4', groupIconClass)} />
        <span className="text-sm font-medium">{groupLabel}</span>
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          {issues.length}
        </Badge>
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all duration-250',
          isCollapsed ? 'max-h-0' : 'max-h-[5000px]'
        )}
      >
        {issues.map((issue) => (
          <ListRow
            key={issue.id}
            issue={issue}
            isSelected={selectedIds.has(issue.id)}
            onToggleSelect={onToggleSelect}
            onStateChange={onStateChange}
            onPriorityChange={onPriorityChange}
            onNavigate={onNavigate}
            showExpandToggle={issue.subIssueCount > 0}
          />
        ))}
      </div>
    </div>
  );
}
