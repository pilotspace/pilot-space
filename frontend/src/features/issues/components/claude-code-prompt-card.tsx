'use client';

/**
 * ClaudeCodePromptCard - Displays Claude Code prompt with copy functionality.
 *
 * T134: Card with Terminal icon, copy button, expand/collapse for long prompts.
 * Shows first 300 chars collapsed, with hint to paste into Claude Code.
 *
 * @example
 * ```tsx
 * <ClaudeCodePromptCard prompt={prompt} />
 * ```
 */

import * as React from 'react';
import { Terminal, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// ============================================================================
// Types
// ============================================================================

export interface ClaudeCodePromptCardProps {
  /** Claude Code prompt text */
  prompt: string;
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export function ClaudeCodePromptCard({ prompt, className }: ClaudeCodePromptCardProps) {
  const [copied, setCopied] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);

  const shouldTruncate = prompt.length > 300;
  const displayText = isExpanded || !shouldTruncate ? prompt : `${prompt.slice(0, 300)}...`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  };

  return (
    <Card className={cn('border-purple-200 dark:border-purple-900/40', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="size-4 text-purple-600 dark:text-purple-400" />
            Claude Code Prompt
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="gap-1.5"
            title="Copy to clipboard"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-emerald-600" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                Copy
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg bg-slate-950 dark:bg-slate-900 p-4 overflow-hidden">
          <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-words">
            {displayText}
          </pre>
        </div>

        {shouldTruncate && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronDown className="size-3.5" />
                Show less
              </>
            ) : (
              <>
                <ChevronRight className="size-3.5" />
                Show full prompt
              </>
            )}
          </button>
        )}

        <div className="flex items-start gap-2 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 p-3">
          <Terminal className="size-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
          <p className="text-xs text-purple-900 dark:text-purple-300">
            Paste this prompt into{' '}
            <a
              href="https://claude.ai/code"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline hover:no-underline"
            >
              Claude Code
            </a>{' '}
            to get context-aware implementation guidance for this issue.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default ClaudeCodePromptCard;
