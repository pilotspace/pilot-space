'use client';

/**
 * PR Detail Page - Pull request detail view with AI review panel.
 *
 * T150-T151: Grid layout with PR content (2 cols) and review panel (1 col).
 * Shows PR header with metadata and request review button.
 *
 * @example
 * ```tsx
 * <PRDetailPage repoId={repo.id} prNumber={123} />
 * ```
 */

import { ExternalLink, GitPullRequest, GitMerge, GitBranch, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PRReviewPanel } from '../components/pr-review-panel';

// ============================================================================
// Types
// ============================================================================

export interface PRDetailPageProps {
  /** Repository UUID */
  repoId: string;
  /** Pull request number */
  prNumber: number;
  /** Optional PR data (would come from API in real implementation) */
  prData?: {
    title: string;
    description: string;
    author: string;
    createdAt: string;
    state: 'open' | 'closed' | 'merged';
    branch: string;
    baseBranch: string;
    url: string;
  };
}

// ============================================================================
// PR Header Component
// ============================================================================

interface PRHeaderProps {
  prData: NonNullable<PRDetailPageProps['prData']>;
  prNumber: number;
}

function PRHeader({ prData, prNumber }: PRHeaderProps) {
  const stateConfig = {
    open: {
      icon: GitPullRequest,
      label: 'Open',
      bgClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    closed: {
      icon: GitPullRequest,
      label: 'Closed',
      bgClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    },
    merged: {
      icon: GitMerge,
      label: 'Merged',
      bgClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    },
  };

  const state = stateConfig[prData.state];
  const StateIcon = state.icon;

  return (
    <div className="space-y-4">
      {/* Title & State */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-2xl font-bold truncate">{prData.title}</h1>
            <Badge variant="outline" className={cn('gap-1 shrink-0', state.bgClass)}>
              <StateIcon className="size-3" />
              {state.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            #{prNumber} opened by {prData.author} on{' '}
            {new Date(prData.createdAt).toLocaleDateString()}
          </p>
        </div>

        <Button variant="outline" size="sm" asChild>
          <a href={prData.url} target="_blank" rel="noopener noreferrer" className="gap-1.5">
            <ExternalLink className="size-4" />
            View on GitHub
          </a>
        </Button>
      </div>

      {/* Branch Info */}
      <div className="flex items-center gap-2 text-sm">
        <GitBranch className="size-4 text-muted-foreground" />
        <span className="font-mono text-muted-foreground">{prData.branch}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-mono text-muted-foreground">{prData.baseBranch}</span>
      </div>

      <Separator />

      {/* Description */}
      {prData.description && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p>{prData.description}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PR Content Component (Placeholder)
// ============================================================================

function PRContent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Files Changed</CardTitle>
        <CardDescription>Review code changes and commits</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <Clock className="size-12 mb-4 opacity-50" />
          <p>File diff viewer would appear here</p>
          <p className="text-xs mt-1">This is a placeholder for the PR content view</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PRDetailPage({ repoId, prNumber, prData }: PRDetailPageProps) {
  // Mock data for demonstration (would come from API in real implementation)
  const mockPRData = prData || {
    title: 'Add AI-powered PR review panel components',
    description:
      'Implements Wave 6 Track 3 features including PR review panel, streaming progress, aspect cards, and cost tracking.',
    author: 'developer',
    createdAt: new Date().toISOString(),
    state: 'open' as const,
    branch: 'feature/pr-review-panel',
    baseBranch: 'main',
    url: `https://github.com/example/repo/pull/${prNumber}`,
  };

  return (
    <div className="container max-w-[1600px] mx-auto p-6 space-y-6" data-testid="pr-detail">
      {/* PR Header */}
      <PRHeader prData={mockPRData} prNumber={prNumber} />

      {/* Grid Layout: 2 cols content + 1 col review */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PR Content (2 cols on large screens) */}
        <div className="lg:col-span-2 space-y-6">
          <PRContent />
        </div>

        {/* AI Review Panel (1 col on large screens) */}
        <div className="lg:col-span-1">
          <PRReviewPanel repoId={repoId} prNumber={prNumber} />
        </div>
      </div>
    </div>
  );
}

export default PRDetailPage;
