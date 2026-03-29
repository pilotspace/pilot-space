'use client';

/**
 * VersionHistory - Vertical timeline with version badges, changelogs, and skill content preview.
 *
 * Layout:
 * - Most recent version first
 * - Each entry: version badge, date, changelog, expandable skill content preview
 * - Latest version gets a "Latest" badge
 *
 * Source: Phase 055, P55-03
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarketplaceVersions } from '@/features/skills/hooks/use-marketplace';
import type { MarketplaceVersionResponse } from '@/services/api/marketplace';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VersionHistoryProps {
  listingId: string;
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Version Entry
// ---------------------------------------------------------------------------

function VersionEntry({
  version,
  isLatest,
}: {
  version: MarketplaceVersionResponse;
  isLatest: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const date = new Date(version.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Skill content preview: first 3 lines
  const contentLines = version.skillContent?.split('\n') ?? [];
  const previewLines = contentLines.slice(0, 3).join('\n');
  const hasMore = contentLines.length > 3;

  return (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className="h-3 w-3 rounded-full border-2 border-primary bg-background" />
        <div className="w-px flex-1 bg-border" />
      </div>

      {/* Content */}
      <div className="flex-1 -mt-1 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            v{version.version}
          </Badge>
          {isLatest && (
            <Badge variant="default" className="text-xs">
              Latest
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{date}</span>
        </div>

        {version.changelog && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {version.changelog}
          </p>
        )}

        {/* Skill content preview */}
        {version.skillContent && (
          <div className="rounded-md border bg-muted/30 p-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronDown className="mr-1 h-3 w-3" />
              ) : (
                <ChevronRight className="mr-1 h-3 w-3" />
              )}
              Skill content
            </Button>
            {(expanded || !hasMore) && version.skillContent ? (
              <pre className="mt-2 overflow-x-auto text-xs text-muted-foreground whitespace-pre-wrap">
                {version.skillContent}
              </pre>
            ) : hasMore ? (
              <pre className="mt-2 overflow-x-auto text-xs text-muted-foreground whitespace-pre-wrap">
                {previewLines}
                {'\n...'}
              </pre>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function VersionSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-3 w-3 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function VersionHistory({ listingId, workspaceId }: VersionHistoryProps) {
  const { data: versions, isLoading } = useMarketplaceVersions(workspaceId, listingId);

  if (isLoading) return <VersionSkeleton />;

  if (!versions || versions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No version history available
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {versions.map((version, index) => (
        <VersionEntry
          key={version.id}
          version={version}
          isLatest={index === 0}
        />
      ))}
    </div>
  );
}
