'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterPillProps {
  label: string;
  value: string;
  onRemove: () => void;
  className?: string;
}

export function FilterPill({ label, value, onRemove, className }: FilterPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-[#29A386]/15 px-2.5 py-0.5 text-xs font-medium text-[#29A386]',
        'animate-in fade-in-0 zoom-in-95 duration-150',
        className
      )}
    >
      <span className="text-[#29A386]/70">{label}:</span>
      <span>{value}</span>
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-[#29A386]/20 transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
