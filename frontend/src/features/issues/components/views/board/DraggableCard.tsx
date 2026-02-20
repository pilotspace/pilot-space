'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IssueCard, type IssueCardDensity } from '@/components/issues/IssueCard';
import type { Issue } from '@/types';

interface DraggableCardProps {
  issue: Issue;
  density: IssueCardDensity;
  onClick?: (issue: Issue) => void;
  isOverlay?: boolean;
}

export function DraggableCard({ issue, density, onClick, isOverlay = false }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/card relative',
        isDragging && !isOverlay && 'opacity-35',
        isOverlay && 'shadow-lg scale-[1.02] rotate-1'
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className={cn(
          'absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center z-10',
          'opacity-0 group-hover/card:opacity-100 cursor-grab active:cursor-grabbing',
          'rounded-l-lg hover:bg-muted/50 transition-opacity',
          isOverlay && 'opacity-100'
        )}
        aria-label={`Drag ${issue.identifier}`}
      >
        <GripVertical className="size-3.5 text-muted-foreground" />
      </div>
      <div className="pl-3">
        <IssueCard issue={issue} onClick={onClick} isDragging={isDragging} density={density} />
      </div>
    </div>
  );
}
