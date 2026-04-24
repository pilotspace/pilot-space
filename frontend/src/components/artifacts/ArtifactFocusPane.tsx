/**
 * ArtifactFocusPane — split-pane focus surface for a single artifact.
 *
 * Used when URL carries `?focus=&focusType=`. Esc demotes to peek; ⌘. cycles
 * the view mode (split → read → chat → split).
 *
 * See `.planning/phases/86-peek-drawer-split-pane-lineage/86-UI-SPEC.md` §3.
 */
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { X } from 'lucide-react';
import type { ArtifactTokenKey } from '@/lib/artifact-tokens';
import { cn } from '@/lib/utils';
import { useArtifactPeekState } from '@/hooks/use-artifact-peek-state';
import { useArtifactQuery } from '@/hooks/use-artifact-query';
import { ArtifactTypeBadge } from './ArtifactTypeBadge';
import { ArtifactRendererSwitch } from './ArtifactRendererSwitch';
import { LineageChip } from './LineageChip';

export interface ArtifactFocusPaneProps {
  id: string;
  type: ArtifactTokenKey;
  className?: string;
}

const VIEW_CYCLE = ['split', 'read', 'chat'] as const;

export function ArtifactFocusPane({ id, type, className }: ArtifactFocusPaneProps) {
  const { demote, closeFocus, view, setView } = useArtifactPeekState();
  const params = useParams<{ workspaceSlug?: string }>();
  const workspaceSlug = params?.workspaceSlug ?? '';
  const { data } = useArtifactQuery(type, id);
  const lineage = data?.lineage ?? null;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        demote();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        const idx = VIEW_CYCLE.indexOf(view);
        const next = VIEW_CYCLE[(idx + 1) % VIEW_CYCLE.length];
        if (next) setView(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [demote, view, setView]);

  const title = data?.title ?? 'Artifact';

  return (
    <section
      role="region"
      aria-label={`Focus pane: ${title}`}
      className={cn('flex h-full min-h-0 flex-col bg-background', className)}
      data-testid="artifact-focus-pane"
    >
      <header className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <ArtifactTypeBadge type={type} />
            <h2 className="truncate text-sm font-medium">{title}</h2>
          </div>
          {lineage?.sourceChatId && (
            <LineageChip
              sourceChatId={lineage.sourceChatId}
              sourceMessageId={lineage.sourceMessageId}
              firstSeenAt={lineage.firstSeenAt}
              workspaceSlug={workspaceSlug}
            />
          )}
        </div>
        <button
          type="button"
          onClick={closeFocus}
          aria-label="Close focus pane"
          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="focus-pane-close"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ArtifactRendererSwitch type={type} id={id} className="h-full" />
      </div>
    </section>
  );
}
