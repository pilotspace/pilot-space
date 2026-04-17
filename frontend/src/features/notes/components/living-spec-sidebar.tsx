'use client';

/**
 * LivingSpecSidebar - Collapsible right sidebar on note detail page
 * Phase 78: Living Specs
 *
 * Plain component, NOT observer — TipTap constraint from CLAUDE.md.
 * Also React.memo to prevent unnecessary re-renders from parent.
 *
 * Layout:
 *   - w-[280px] when open, w-0 overflow-hidden when collapsed
 *   - transition-all duration-200 ease-out (motion-safe)
 *   - border-l border-border bg-card
 *   - Toggle button floats at top-4 -left-3 on sidebar boundary
 */
import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useLivingSpec } from '../hooks/use-living-spec';
import { useSpecAnnotations } from '../hooks/use-note-annotations';
import { useTocHeadings } from '../hooks/use-toc-headings';
import { LinkedIssuesPanel } from './living-spec/linked-issues-panel';
import { AnnotationsPanel } from './living-spec/annotations-panel';
import { TableOfContentsPanel } from './living-spec/table-of-contents-panel';
import type { Editor } from '@tiptap/react';

export interface LivingSpecSidebarProps {
  noteId: string;
  workspaceId: string;
  isOpen: boolean;
  onToggle: () => void;
  /** TipTap editor instance — used for TOC heading extraction. May be null if NoteCanvas doesn't expose it. */
  editor?: Editor | null;
  showVersionHistory?: boolean;
}

export const LivingSpecSidebar = React.memo(function LivingSpecSidebar({
  noteId,
  workspaceId,
  isOpen,
  onToggle,
  editor = null,
  showVersionHistory = false,
}: LivingSpecSidebarProps) {
  // When version history is open, sidebar yields to version panel
  if (showVersionHistory) return null;

  return (
    <TooltipProvider>
      <div className="relative flex-shrink-0">
        {/* Toggle button — floats on the sidebar/canvas boundary */}
        <div className="absolute top-4 -left-3 z-10">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                aria-controls="living-spec-sidebar"
                aria-label={isOpen ? 'Collapse living spec sidebar' : 'Expand living spec sidebar'}
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full',
                  'border border-border bg-card shadow-sm',
                  'text-muted-foreground transition-colors duration-150',
                  'hover:bg-muted hover:text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              >
                {isOpen ? (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              {isOpen ? 'Collapse spec panel' : 'View living spec'}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Sidebar panel */}
        <div
          id="living-spec-sidebar"
          role="complementary"
          aria-label="Living spec"
          aria-hidden={!isOpen}
          className={cn(
            'h-full border-l border-border bg-card overflow-hidden',
            'motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out',
            isOpen ? 'w-[280px]' : 'w-0'
          )}
        >
          {isOpen && (
            <ScrollArea className="h-full">
              <SidebarContent
                noteId={noteId}
                workspaceId={workspaceId}
                editor={editor}
              />
            </ScrollArea>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
});

LivingSpecSidebar.displayName = 'LivingSpecSidebar';

/**
 * Inner content — separate component so hooks are only active when sidebar is open.
 * Plain component, NOT observer.
 */
interface SidebarContentProps {
  noteId: string;
  workspaceId: string;
  editor: Editor | null;
}

function SidebarContent({ noteId, workspaceId, editor }: SidebarContentProps) {
  const { data: issues, isLoading: issuesLoading } = useLivingSpec({
    workspaceId,
    noteId,
    enabled: true,
  });

  const {
    data: annotations,
    isLoading: annotationsLoading,
    error: annotationsError,
  } = useSpecAnnotations({
    workspaceId,
    noteId,
    enabled: true,
  });

  const { headings } = useTocHeadings(editor);

  // Track active heading via IntersectionObserver-free approach:
  // Use scroll position to find the topmost visible heading in the editor.
  const [activeHeadingId, setActiveHeadingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const editorEl = document.querySelector('.ProseMirror');
    if (!editorEl || headings.length === 0) return;

    function handleScroll() {
      let active: string | null = null;
      for (const heading of headings) {
        const tag = `h${heading.level}`;
        const els = document.querySelectorAll(`.ProseMirror ${tag}`);
        for (const el of els) {
          if ((el as HTMLElement).textContent?.trim() === heading.text.trim()) {
            const rect = el.getBoundingClientRect();
            if (rect.top <= 120) {
              active = heading.id;
            }
          }
        }
      }
      setActiveHeadingId(active);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    const scrollContainer = document.querySelector('.ProseMirror')?.closest('[class*="overflow"]');
    scrollContainer?.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      scrollContainer?.removeEventListener('scroll', handleScroll);
    };
  }, [headings]);

  return (
    <div className="p-4 space-y-6">
      {/* Section 1: Linked Issues */}
      <LinkedIssuesPanel issues={issues} isLoading={issuesLoading} />

      <Separator />

      {/* Section 2: AI Annotations */}
      <AnnotationsPanel
        annotations={annotations}
        isLoading={annotationsLoading}
        error={annotationsError}
      />

      {/* Section 3: Table of Contents — only rendered when 3+ headings */}
      {headings.length >= 3 && (
        <>
          <Separator />
          <TableOfContentsPanel headings={headings} activeHeadingId={activeHeadingId} />
        </>
      )}
    </div>
  );
}
