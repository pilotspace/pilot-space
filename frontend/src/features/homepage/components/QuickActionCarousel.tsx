'use client';

/**
 * QuickActionCarousel — 5 icon-only action cards in a horizontal row
 * with optional left/right scroll arrows.
 *
 * Design spec: 96px wide cards, corner 12px, border #e5e7eb, gap 10px
 * Icons: 20px, color #6b7280 / Labels: Inter 12px, #4b5563
 */

import { useRef, useCallback, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  CircleDot,
  GitPullRequest,
  FileCode,
  Calendar,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface QuickAction {
  icon: LucideIcon;
  label: string;
  prompt: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: FileText, label: 'Note', prompt: 'Create a new note about: ' },
  { icon: CircleDot, label: 'Issue', prompt: 'Create issues from this idea: ' },
  { icon: GitPullRequest, label: 'PR Review', prompt: 'Review my pull request: ' },
  { icon: FileCode, label: 'Spec', prompt: 'Generate a spec from my notes about: ' },
  { icon: Calendar, label: 'Sprint', prompt: "What's the current sprint status?" },
];

interface QuickActionCarouselProps {
  workspaceSlug: string;
}

export function QuickActionCarousel({ workspaceSlug }: QuickActionCarouselProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback((direction: 'left' | 'right') => {
    scrollRef.current?.scrollBy({
      left: direction === 'left' ? -106 : 106,
      behavior: 'smooth',
    });
  }, []);

  const navigate = useCallback(
    (prompt: string) => {
      router.push(`/${workspaceSlug}/chat?prefill=${encodeURIComponent(prompt)}`);
    },
    [router, workspaceSlug]
  );

  const handleCardKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, prompt: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate(prompt);
      }
    },
    [navigate]
  );

  return (
    <div className="flex items-center justify-center gap-2">
      {/* Left arrow */}
      <button
        type="button"
        onClick={() => scroll('left')}
        aria-label="Scroll left"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:text-muted-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {/* Cards */}
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto scrollbar-none"
        role="list"
        aria-label="Quick actions"
      >
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            role="listitem"
            onClick={() => navigate(action.prompt)}
            onKeyDown={(e) => handleCardKeyDown(e, action.prompt)}
            className="flex w-24 shrink-0 flex-col items-center gap-2 rounded-xl border border-border bg-background py-3.5 transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <action.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-secondary-foreground">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Right arrow */}
      <button
        type="button"
        onClick={() => scroll('right')}
        aria-label="Scroll right"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:text-muted-foreground"
      >
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
