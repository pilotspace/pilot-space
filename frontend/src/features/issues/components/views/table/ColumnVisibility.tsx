'use client';

import { Columns3, RotateCcw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DEFAULT_COLUMNS } from './TableColumn';

interface ColumnVisibilityProps {
  hiddenColumns: Set<string>;
  onToggle: (columnKey: string) => void;
  onReset: () => void;
}

export function ColumnVisibility({ hiddenColumns, onToggle, onReset }: ColumnVisibilityProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <Columns3 className="size-3.5" />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="end">
        {DEFAULT_COLUMNS.map((col) => {
          const isVisible = !hiddenColumns.has(col.key);
          return (
            <button
              key={col.key}
              onClick={() => onToggle(col.key)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
            >
              <div
                className={cn(
                  'flex size-4 items-center justify-center rounded-sm border',
                  isVisible && 'border-[#29A386] bg-[#29A386] text-white'
                )}
              >
                {isVisible && <Check className="size-3" />}
              </div>
              {col.label}
            </button>
          );
        })}
        <div className="border-t mt-1 pt-1">
          <button
            onClick={onReset}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <RotateCcw className="size-3.5" />
            Reset to defaults
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
