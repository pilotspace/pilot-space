'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { IssueState, IssuePriority } from '@/types';

const STATES: Array<{ value: IssueState; label: string }> = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITIES: Array<{ value: IssuePriority; label: string }> = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
];

interface BulkActionsBarProps {
  selectedCount: number;
  onChangeState?: (state: IssueState) => void;
  onSetPriority?: (priority: IssuePriority) => void;
  onDelete?: () => void;
  onClearSelection: () => void;
}

export function BulkActionsBar({
  selectedCount,
  onChangeState,
  onSetPriority,
  onDelete,
  onClearSelection,
}: BulkActionsBarProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClearSelection();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClearSelection]);

  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 flex items-center gap-2 border-t bg-background/95 backdrop-blur px-4 py-2',
        'animate-in slide-in-from-bottom-2 duration-200'
      )}
    >
      <span className="text-sm font-medium text-[#29A386]">{selectedCount} selected</span>

      {onChangeState && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              State
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {STATES.map((s) => (
              <DropdownMenuItem key={s.value} onClick={() => onChangeState(s.value)}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {onSetPriority && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              Priority
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {PRIORITIES.map((p) => (
              <DropdownMenuItem key={p.value} onClick={() => onSetPriority(p.value)}>
                {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {onDelete && (
        <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={onDelete}>
          Delete
        </Button>
      )}

      <div className="flex-1" />

      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onClearSelection}>
        <X className="size-3" />
        Cancel
      </Button>
    </div>
  );
}
