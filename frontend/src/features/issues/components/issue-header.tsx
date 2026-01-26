'use client';

/**
 * IssueHeader - Header component for issue detail view.
 *
 * T140: Contains navigation, issue identifier, AI generated badge,
 * and AI Context button that opens the sidebar.
 *
 * @example
 * ```tsx
 * <IssueHeader
 *   issue={issue}
 *   onBack={handleBack}
 *   onAIContextClick={handleAIContext}
 *   showAIContext={aiContextEnabled}
 * />
 * ```
 */

import {
  ArrowLeft,
  MoreHorizontal,
  Trash2,
  Copy,
  ExternalLink,
  Sparkles,
  Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ============================================================================
// Types
// ============================================================================

export interface IssueHeaderProps {
  /** Issue identifier (e.g., PILOT-123) */
  identifier: string;
  /** Whether issue was AI generated */
  aiGenerated?: boolean;
  /** Whether to show AI Context button */
  showAIContext?: boolean;
  /** Back button handler */
  onBack: () => void;
  /** AI Context button handler */
  onAIContextClick?: () => void;
  /** Copy link handler */
  onCopyLink: () => void;
  /** Delete handler */
  onDelete: () => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function IssueHeader({
  identifier,
  aiGenerated,
  showAIContext,
  onBack,
  onAIContextClick,
  onCopyLink,
  onDelete,
}: IssueHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">{identifier}</span>
          {aiGenerated && (
            <Badge variant="outline" className="gap-1 text-ai border-ai/30">
              <Sparkles className="size-3" />
              AI Generated
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {showAIContext && onAIContextClick && (
          <Button variant="ai" size="sm" onClick={onAIContextClick}>
            <Sparkles className="size-4 mr-2" />
            AI Context
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={onCopyLink}>
          <Copy className="size-4 mr-2" />
          Copy link
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCopyLink}>
              <LinkIcon className="mr-2 size-4" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem>
              <ExternalLink className="mr-2 size-4" />
              Open in new tab
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Delete issue
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default IssueHeader;
