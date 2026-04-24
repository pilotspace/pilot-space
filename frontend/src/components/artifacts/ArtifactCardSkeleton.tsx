/**
 * ArtifactCardSkeleton — Loading placeholder for ArtifactCard.
 *
 * Spec: `.planning/phases/85-unified-artifact-card-anatomy/85-UI-SPEC.md` §10.
 */
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { ArtifactCardDensity } from './ArtifactCard';

export interface ArtifactCardSkeletonProps {
  density?: ArtifactCardDensity;
  className?: string;
}

export function ArtifactCardSkeleton({
  density = 'full',
  className,
}: ArtifactCardSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading artifact"
      className={cn(
        'overflow-hidden rounded-[22px] border border-border bg-card',
        density === 'compact'
          ? 'min-w-[200px]'
          : density === 'preview'
            ? 'min-w-[240px]'
            : 'min-w-[320px]',
        className,
      )}
    >
      {density !== 'compact' && (
        <Skeleton
          className={cn(density === 'full' ? 'h-[110px]' : 'h-[72px]', 'rounded-none')}
        />
      )}
      <div
        className={cn(
          'flex flex-col gap-2',
          density === 'compact' ? 'px-3 py-2' : density === 'preview' ? 'p-3' : 'p-4',
        )}
      >
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
