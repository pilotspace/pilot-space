'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface CollapsedColumnProps {
  icon: React.ElementType;
  iconClass: string;
  label: string;
  count: number;
  onExpand: () => void;
}

export function CollapsedColumn({
  icon: Icon,
  iconClass,
  label,
  count,
  onExpand,
}: CollapsedColumnProps) {
  return (
    <button
      onClick={onExpand}
      className={cn(
        'flex w-10 shrink-0 flex-col items-center gap-2 rounded-lg border bg-muted/30 py-3',
        'hover:bg-accent/50 transition-colors cursor-pointer'
      )}
      aria-label={`Expand ${label} column (${count} issues)`}
    >
      <Icon className={cn('size-4', iconClass)} />
      <Badge variant="secondary" className="h-4 min-w-[1rem] px-1 text-[10px]">
        {count}
      </Badge>
      <span
        className="text-[10px] font-medium text-muted-foreground"
        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
      >
        {label}
      </span>
    </button>
  );
}
