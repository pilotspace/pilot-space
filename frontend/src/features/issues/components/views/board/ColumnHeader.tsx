'use client';

import * as React from 'react';
import { Plus, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ColumnHeaderProps {
  icon: React.ElementType;
  iconClass: string;
  label: string;
  count: number;
  wipLimit?: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onAdd?: () => void;
}

export function ColumnHeader({
  icon: Icon,
  iconClass,
  label,
  count,
  wipLimit,
  isCollapsed,
  onToggleCollapse,
  onAdd,
}: ColumnHeaderProps) {
  const atLimit = wipLimit ? count >= wipLimit : false;
  const nearLimit = wipLimit ? count >= wipLimit * 0.8 : false;

  return (
    <div className="flex items-center justify-between border-b p-2">
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-1 hover:bg-accent/50 rounded p-0.5 transition-colors"
          aria-label={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
          aria-expanded={!isCollapsed}
        >
          <ChevronRight
            className={cn('size-3 transition-transform', !isCollapsed && 'rotate-90')}
          />
          <Icon className={cn('size-3.5', iconClass)} />
          <span className="text-xs font-medium">{label}</span>
        </button>
        <Badge
          variant="secondary"
          className={cn(
            'h-4 min-w-[1rem] px-1 text-[10px]',
            atLimit && 'animate-pulse bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            nearLimit &&
              !atLimit &&
              'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
          )}
        >
          {count}
          {wipLimit ? `/${wipLimit}` : ''}
        </Badge>
      </div>
      {onAdd && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onAdd}
          className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label={`Add issue to ${label}`}
        >
          <Plus className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
