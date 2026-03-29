/**
 * Marketplace search bar with text query, category filter, sort, and rating controls.
 * Source: Phase 055, P55-02
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MarketplaceSearchParams } from '@/services/api/marketplace';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: '__all__', label: 'All Categories' },
  { value: 'Development', label: 'Development' },
  { value: 'Writing', label: 'Writing' },
  { value: 'Analysis', label: 'Analysis' },
  { value: 'Documentation', label: 'Documentation' },
  { value: 'Security', label: 'Security' },
  { value: 'Design', label: 'Design' },
] as const;

const SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'top_rated', label: 'Top Rated' },
] as const;

const RATING_OPTIONS = [
  { value: '__any__', label: 'Any Rating' },
  { value: '3', label: '3+ Stars' },
  { value: '4', label: '4+ Stars' },
  { value: '5', label: '5 Stars' },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MarketplaceSearchBarProps {
  onSearchChange: (params: Partial<MarketplaceSearchParams>) => void;
  currentParams: MarketplaceSearchParams;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MarketplaceSearchBar({
  onSearchChange,
  currentParams,
}: MarketplaceSearchBarProps) {
  const [localQuery, setLocalQuery] = useState(currentParams.query ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced text search
  const handleQueryChange = useCallback(
    (value: string) => {
      setLocalQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearchChange({ query: value || undefined, offset: 0 });
      }, 300);
    },
    [onSearchChange],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleClear = useCallback(() => {
    setLocalQuery('');
    onSearchChange({
      query: undefined,
      category: undefined,
      sort: undefined,
      minRating: undefined,
      offset: 0,
    });
  }, [onSearchChange]);

  const hasActiveFilters =
    !!localQuery ||
    !!currentParams.category ||
    !!currentParams.minRating ||
    (currentParams.sort && currentParams.sort !== 'popular');

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Text search */}
      <div className="relative flex-1">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search skills..."
          aria-label="Search marketplace skills"
          value={localQuery}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Category filter */}
      <Select
        value={currentParams.category ?? '__all__'}
        onValueChange={(val) =>
          onSearchChange({
            category: val === '__all__' ? undefined : val,
            offset: 0,
          })
        }
      >
        <SelectTrigger className="w-full sm:w-[160px]">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sort */}
      <Select
        value={currentParams.sort ?? 'popular'}
        onValueChange={(val) =>
          onSearchChange({
            sort: val as MarketplaceSearchParams['sort'],
            offset: 0,
          })
        }
      >
        <SelectTrigger className="w-full sm:w-[130px]">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Min rating */}
      <Select
        value={currentParams.minRating ? String(currentParams.minRating) : '__any__'}
        onValueChange={(val) =>
          onSearchChange({
            minRating: val === '__any__' ? undefined : Number(val),
            offset: 0,
          })
        }
      >
        <SelectTrigger className="w-full sm:w-[130px]">
          <SelectValue placeholder="Rating" />
        </SelectTrigger>
        <SelectContent>
          {RATING_OPTIONS.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear all */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1">
          <X className="h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
