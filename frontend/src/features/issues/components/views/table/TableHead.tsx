'use client';

import * as React from 'react';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TableColumnDef, SortDirection } from './TableColumn';

interface TableHeadProps {
  columns: TableColumnDef[];
  columnWidths: Map<string, number>;
  hiddenColumns: Set<string>;
  sortColumn: string | null;
  sortDirection: SortDirection;
  onSort: (column: string) => void;
  onResize: (column: string, width: number) => void;
  allSelected: boolean;
  onSelectAll: () => void;
}

export function TableHead({
  columns,
  columnWidths,
  hiddenColumns,
  sortColumn,
  sortDirection,
  onSort,
  onResize,
  allSelected,
  onSelectAll,
}: TableHeadProps) {
  const [resizing, setResizing] = React.useState<string | null>(null);

  const handleResizeStart = (e: React.PointerEvent, columnKey: string) => {
    e.preventDefault();
    setResizing(columnKey);
    const startX = e.clientX;
    const startWidth =
      columnWidths.get(columnKey) ?? columns.find((c) => c.key === columnKey)!.defaultWidth;
    const minWidth = columns.find((c) => c.key === columnKey)!.minWidth;

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(minWidth, startWidth + delta);
      onResize(columnKey, newWidth);
    };

    const handleUp = () => {
      setResizing(null);
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  };

  const visibleColumns = columns.filter((c) => !hiddenColumns.has(c.key));

  return (
    <div className="sticky top-0 z-10 flex border-b bg-muted/50 backdrop-blur">
      {/* Checkbox column */}
      <div className="flex w-10 shrink-0 items-center justify-center border-r">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onSelectAll}
          className="size-4 rounded border accent-[#29A386]"
          aria-label="Select all issues"
        />
      </div>

      {visibleColumns.map((col) => {
        const width = columnWidths.get(col.key) ?? col.defaultWidth;
        const isSorted = sortColumn === col.key;

        return (
          <div
            key={col.key}
            role="columnheader"
            className="relative flex shrink-0 items-center border-r"
            style={{ width }}
            aria-sort={
              isSorted && sortDirection === 'asc'
                ? 'ascending'
                : isSorted && sortDirection === 'desc'
                  ? 'descending'
                  : 'none'
            }
          >
            <button
              onClick={() => col.sortable && onSort(col.key)}
              className={cn(
                'flex h-8 flex-1 items-center gap-1 px-2 text-xs font-medium text-muted-foreground',
                col.sortable && 'hover:text-foreground cursor-pointer'
              )}
            >
              {col.label}
              {col.sortable &&
                (isSorted && sortDirection === 'asc' ? (
                  <ArrowUp className="size-3" />
                ) : isSorted && sortDirection === 'desc' ? (
                  <ArrowDown className="size-3" />
                ) : (
                  <ChevronsUpDown className="size-3 opacity-30" />
                ))}
            </button>

            {col.resizable && (
              <div
                onPointerDown={(e) => handleResizeStart(e, col.key)}
                className={cn(
                  'absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50',
                  resizing === col.key && 'bg-primary/50'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
