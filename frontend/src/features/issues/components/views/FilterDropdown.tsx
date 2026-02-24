'use client';

import * as React from 'react';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

interface FilterOption {
  value: string;
  label: string;
  icon?: React.ElementType;
  color?: string;
}

interface FilterDropdownProps {
  label: string;
  icon: React.ElementType;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function FilterDropdown({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
}: FilterDropdownProps) {
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <Icon className="size-3.5" />
          <span>{label}</span>
          {selected.length > 0 && (
            <Badge
              variant="secondary"
              className="h-4 min-w-[1rem] rounded-full px-1 text-[10px] bg-[#29A386]/15 text-[#29A386]"
            >
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Search ${label.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto px-1 pb-1">
          {filtered.map((option) => {
            const isSelected = selected.includes(option.value);
            const OptionIcon = option.icon;
            return (
              <button
                key={option.value}
                onClick={() => toggleOption(option.value)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs',
                  'hover:bg-accent transition-colors',
                  isSelected && 'bg-accent'
                )}
              >
                <div
                  className={cn(
                    'flex size-4 items-center justify-center rounded-sm border',
                    isSelected && 'border-[#29A386] bg-[#29A386] text-white'
                  )}
                >
                  {isSelected && <Check className="size-3" />}
                </div>
                {OptionIcon && <OptionIcon className={cn('size-3.5', option.color)} />}
                <span>{option.label}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">No results</p>
          )}
        </div>
        {selected.length > 0 && (
          <div className="border-t p-1">
            <button
              onClick={() => onChange([])}
              className="w-full rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              Clear selection
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
