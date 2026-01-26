'use client';

/**
 * AIContextSidebar - Sheet component wrapping AIContextPanel.
 *
 * T135: Slides in from right side with 400px/540px width.
 * Provides container for AI context panel with proper header.
 *
 * @example
 * ```tsx
 * <AIContextSidebar
 *   issueId={issueId}
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 * />
 * ```
 */

import { Sparkles } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { AIContextPanel } from './ai-context-panel';

// ============================================================================
// Types
// ============================================================================

export interface AIContextSidebarProps {
  /** Issue ID to generate context for */
  issueId: string;
  /** Whether the sidebar is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Optional issue identifier for display */
  issueIdentifier?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export function AIContextSidebar({
  issueId,
  open,
  onOpenChange,
  issueIdentifier,
}: AIContextSidebarProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[540px] md:w-[540px] p-0 flex flex-col gap-0"
      >
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-5 text-ai" />
            AI Context
            {issueIdentifier && (
              <span className="text-sm font-normal text-muted-foreground">
                for {issueIdentifier}
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Comprehensive context to help understand and implement this issue
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-hidden">
          <AIContextPanel issueId={issueId} className="h-full" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default AIContextSidebar;
