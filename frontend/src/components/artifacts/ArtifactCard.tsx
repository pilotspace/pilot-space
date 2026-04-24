/**
 * ArtifactCard — Unified card surface for every artifact type.
 *
 * Spec: `.planning/phases/85-unified-artifact-card-anatomy/85-UI-SPEC.md` §5.
 *
 * Renders all 12 artifact types (Tier 1 native + Tier 2 file) through one
 * component with three density variants: `full` | `preview` | `compact`.
 *
 * Consumers of Phases 86-91 (Peek drawer, chat inline, homepage refs,
 * skills gallery) render through this component rather than bespoke cards.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';
import { ARTIFACT_TYPE_TOKENS, type ArtifactTokenKey } from '@/lib/artifact-tokens';
import { artifactLabel } from '@/lib/artifact-labels';
import { ArtifactTypeBadge } from './ArtifactTypeBadge';
import { ArtifactMeta } from './ArtifactMeta';

export type ArtifactCardDensity = 'full' | 'preview' | 'compact';

export interface ArtifactCardProps {
  type: ArtifactTokenKey;
  id: string;
  title: string;
  projectName?: string;
  projectColor?: string;
  updatedAt: string | Date;
  createdAt?: string | Date;
  density?: ArtifactCardDensity;
  snippet?: string;
  onClick?: () => void;
  /** Reserved for Phase 86 Peek Drawer integration. */
  onOpenPeek?: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Reserved for Phase 86 lineage chip rendering. */
  lineage?: { sourceChatId?: string; sourceMessageId?: string };
  className?: string;
}

export function ArtifactCard({
  type,
  id: _id,
  title,
  projectName,
  projectColor,
  updatedAt,
  createdAt: _createdAt,
  density = 'full',
  snippet,
  onClick,
  onOpenPeek: _onOpenPeek,
  children,
  footer,
  lineage: _lineage,
  className,
}: ArtifactCardProps) {
  const tokens = ARTIFACT_TYPE_TOKENS[type];
  const typeLabel = artifactLabel(type, false);
  const interactive = Boolean(onClick);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (!onClick) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    },
    [onClick],
  );

  return (
    <article
      role="article"
      aria-label={`${typeLabel}: ${title}`}
      tabIndex={interactive ? 0 : -1}
      onClick={onClick}
      onKeyDown={interactive ? handleKeyDown : undefined}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[22px] border border-border bg-card',
        'motion-safe:transition-shadow motion-safe:hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        density === 'compact'
          ? 'min-w-[200px]'
          : density === 'preview'
            ? 'min-w-[240px]'
            : 'min-w-[320px]',
        interactive && 'cursor-pointer',
        className,
      )}
    >
      {density !== 'compact' && (
        <div
          data-testid="artifact-gradient"
          aria-hidden
          className={cn(
            'relative flex-shrink-0',
            density === 'full' ? 'h-[110px]' : 'h-[72px]',
          )}
          style={{ background: `linear-gradient(to bottom, ${tokens.gStart}, ${tokens.gEnd})` }}
        >
          <ArtifactTypeBadge type={type} className="absolute left-4 top-4" />
        </div>
      )}

      <div
        className={cn(
          'flex flex-col gap-1.5',
          density === 'compact' ? 'px-3 py-2' : density === 'preview' ? 'p-3' : 'p-4',
        )}
      >
        {density === 'compact' ? (
          <div className="flex items-center gap-2">
            <ArtifactTypeBadge type={type} />
            <span className="truncate text-[13px] font-medium leading-snug">{title}</span>
          </div>
        ) : (
          <h3 className="line-clamp-2 text-[13px] font-medium leading-snug">{title}</h3>
        )}
        {snippet && density !== 'compact' && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{snippet}</p>
        )}
        <ArtifactMeta
          projectName={projectName}
          projectColor={projectColor}
          updatedAt={updatedAt}
        />
      </div>

      {children && (
        <div className="max-h-[320px] overflow-hidden border-t border-border/60 px-4 py-3">
          {children}
        </div>
      )}

      {footer && <div className="border-t border-border/60 px-4 py-2">{footer}</div>}
    </article>
  );
}
