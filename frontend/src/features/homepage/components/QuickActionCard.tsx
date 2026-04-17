'use client';

/**
 * QuickActionCard — A clickable card for quick AI prompt shortcuts.
 *
 * Displays an icon, label, and sublabel. On click (or Enter/Space keypress),
 * navigates to /chat with the pre-filled prompt.
 *
 * Styling per UI-SPEC:
 * - bg-card, border-border, rounded-[10px], p-4, h-[72px]
 * - Hover: bg-secondary
 * - Icon: 18px, text-ai (#6b8fad)
 * - Label: 14px/400 text-foreground
 * - Sublabel: 12px/400 text-muted-foreground
 * - Hover transition: 150ms ease-out
 */

import { useCallback, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

interface QuickActionCardProps {
  /** Lucide icon component to render */
  icon: LucideIcon;
  /** Primary label text */
  label: string;
  /** Secondary sublabel text */
  sublabel: string;
  /** Prompt to pre-fill in the chat input */
  prompt: string;
  /** Workspace slug for navigation */
  workspaceSlug: string;
}

export function QuickActionCard({
  icon: Icon,
  label,
  sublabel,
  prompt,
  workspaceSlug,
}: QuickActionCardProps) {
  const router = useRouter();

  const navigate = useCallback(() => {
    router.push(`/${workspaceSlug}/chat?prefill=${encodeURIComponent(prompt)}`);
  }, [router, workspaceSlug, prompt]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate();
      }
    },
    [navigate]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={navigate}
      onKeyDown={handleKeyDown}
      aria-label={label}
      className="flex h-[72px] cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-card p-4 transition-colors duration-150 ease-out hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Icon */}
      <Icon className="h-[18px] w-[18px] shrink-0 text-ai" aria-hidden="true" />

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-normal leading-5 text-foreground">{label}</p>
        <p className="truncate text-xs font-normal leading-4 text-muted-foreground">{sublabel}</p>
      </div>
    </div>
  );
}
