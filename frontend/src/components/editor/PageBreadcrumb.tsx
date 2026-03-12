'use client';

/**
 * PageBreadcrumb - Ancestor chain navigation for note page header.
 *
 * Plain component (not observer) — receives data as props from the parent
 * observer component. Renders: [Project >] [ancestor1 >] ... > currentTitle
 */

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

interface PageBreadcrumbProps {
  /** Ancestor chain, root-first (from getAncestors utility) */
  ancestors: Array<{ id: string; title: string }>;
  /** Current page title (not a link) */
  currentTitle: string;
  /** Workspace slug for link hrefs */
  workspaceSlug: string;
  /** Optional project name shown as first segment (no link) */
  projectName?: string;
}

export function PageBreadcrumb({
  ancestors,
  currentTitle,
  workspaceSlug,
  projectName,
}: PageBreadcrumbProps) {
  const hasItems = projectName || ancestors.length > 0;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
      {projectName && (
        <>
          <span className={cn('max-w-[120px] truncate', !hasItems && 'text-foreground')}>
            {projectName}
          </span>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
        </>
      )}

      {ancestors.map((ancestor) => (
        <span key={ancestor.id} className="flex items-center gap-1">
          <Link
            href={`/${workspaceSlug}/notes/${ancestor.id}`}
            className="max-w-[120px] truncate hover:text-foreground transition-colors"
          >
            {ancestor.title}
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
        </span>
      ))}

      <span className="max-w-[160px] truncate font-medium text-foreground">{currentTitle}</span>
    </nav>
  );
}
