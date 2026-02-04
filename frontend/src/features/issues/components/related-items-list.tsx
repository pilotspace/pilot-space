'use client';

/**
 * RelatedItemsList - Displays related documents, code files, or issues.
 *
 * Part of T132-T142: Shows related items with icons and links.
 *
 * @example
 * ```tsx
 * <RelatedItemsList
 *   title="Related Documents"
 *   items={docs}
 *   type="doc"
 * />
 * ```
 */

import * as React from 'react';
import { FileText, Code, GitPullRequest, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// Types
// ============================================================================

export type RelatedItemType = 'doc' | 'code' | 'issue';

export interface RelatedItem {
  /** Item title or file path */
  title: string;
  /** Optional description */
  description?: string;
  /** Optional URL */
  url?: string;
  /** Optional relevance score (0-1) */
  relevance?: number;
}

export interface RelatedItemsListProps {
  /** Section title */
  title: string;
  /** Items to display */
  items: RelatedItem[];
  /** Item type for icon selection */
  type: RelatedItemType;
  /** Maximum items to show */
  maxDisplay?: number;
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Item Component
// ============================================================================

interface ItemProps {
  item: RelatedItem;
  type: RelatedItemType;
}

function Item({ item, type }: ItemProps) {
  const Icon = React.useMemo(() => {
    switch (type) {
      case 'doc':
        return FileText;
      case 'code':
        return Code;
      case 'issue':
        return GitPullRequest;
      default:
        return FileText;
    }
  }, [type]);

  const iconColor = React.useMemo(() => {
    switch (type) {
      case 'doc':
        return 'text-blue-600 dark:text-blue-400';
      case 'code':
        return 'text-purple-600 dark:text-purple-400';
      case 'issue':
        return 'text-emerald-600 dark:text-emerald-400';
      default:
        return 'text-muted-foreground';
    }
  }, [type]);

  const content = (
    <div className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors group">
      <Icon className={cn('size-4 shrink-0 mt-0.5', iconColor)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium truncate group-hover:text-foreground">{item.title}</p>
          {item.url && <ExternalLink className="size-3.5 shrink-0 text-muted-foreground mt-0.5" />}
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
        )}
        {item.relevance !== undefined && (
          <Badge variant="outline" className="text-xs mt-2">
            {Math.round(item.relevance * 100)}% relevance
          </Badge>
        )}
      </div>
    </div>
  );

  if (item.url) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="block no-underline">
        {content}
      </a>
    );
  }

  return content;
}

// ============================================================================
// Main Component
// ============================================================================

export function RelatedItemsList({
  title,
  items,
  type,
  maxDisplay,
  className,
}: RelatedItemsListProps) {
  const [showAll, setShowAll] = React.useState(false);

  if (items.length === 0) {
    return null;
  }

  const displayItems = showAll || !maxDisplay ? items : items.slice(0, maxDisplay);
  const hasMore = maxDisplay && items.length > maxDisplay;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Badge variant="secondary" className="text-xs">
          {items.length}
        </Badge>
      </div>

      <div className="space-y-2">
        {displayItems.map((item, index) => (
          <Item key={`${item.title}-${index}`} item={item} type={type} />
        ))}
      </div>

      {hasMore && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Show {items.length - maxDisplay} more...
        </button>
      )}

      {showAll && hasMore && (
        <button
          onClick={() => setShowAll(false)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Show less
        </button>
      )}
    </div>
  );
}

export default RelatedItemsList;
