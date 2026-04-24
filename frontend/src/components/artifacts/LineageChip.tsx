/**
 * LineageChip — "From chat" brand-green pill marking chat-born artifacts.
 *
 * Phase 86 signature element of the v3 design: every artifact born in chat
 * carries its origin forward. Clicking navigates to the origin chat message.
 *
 * See `.planning/phases/86-peek-drawer-split-pane-lineage/86-UI-SPEC.md` §5.
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { CornerUpLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface LineageChipProps {
  sourceChatId?: string;
  sourceMessageId?: string;
  firstSeenAt?: string;
  workspaceSlug: string;
  /** Visible label override; defaults to "From chat". */
  label?: string;
  className?: string;
}

/**
 * brand-green #29a386, 12% tint bg, 1px border, rounded-full.
 * Renders null when no `sourceChatId` — never render a non-lineage placeholder.
 */
export function LineageChip({
  sourceChatId,
  sourceMessageId,
  firstSeenAt,
  workspaceSlug,
  label = 'From chat',
  className,
}: LineageChipProps) {
  if (!sourceChatId) return null;

  const pillClass = cn(
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
    'border border-[#29a386] text-[11px] font-medium leading-none',
    'text-[#29a386] transition-colors',
    'hover:bg-[rgba(41,163,134,0.18)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29a386] focus-visible:ring-offset-1',
    className,
  );
  const pillStyle: React.CSSProperties = { background: 'rgba(41,163,134,0.12)' };
  const iconEl = (
    <CornerUpLeft className="h-3 w-3 flex-shrink-0" aria-hidden="true" strokeWidth={2} />
  );

  const href = sourceMessageId
    ? `/${workspaceSlug}/chat/${sourceChatId}#msg-${sourceMessageId}`
    : `/${workspaceSlug}/chat/${sourceChatId}`;

  const chipInner = (
    <>
      {iconEl}
      <span>{label}</span>
    </>
  );

  const tooltipText = firstSeenAt
    ? `Originates from chat · ${formatDistanceToNow(new Date(firstSeenAt), { addSuffix: true })}`
    : 'Originates from chat';

  const linkEl = (
    <Link
      href={href}
      className={pillClass}
      style={pillStyle}
      role="link"
      aria-label={`${label} — open origin chat`}
      data-testid="lineage-chip"
    >
      {chipInner}
    </Link>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          <span className="text-xs">{tooltipText}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
