'use client';

import * as React from 'react';
import { ChevronRight, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/copy-context';
import { useCopyFeedback } from '@/features/issues/hooks/use-copy-feedback';
import type { ContextPrompt } from '@/stores/ai/AIContextStore';

export interface PromptBlockProps {
  prompt: ContextPrompt;
  defaultExpanded?: boolean;
}

export function PromptBlock({ prompt, defaultExpanded }: PromptBlockProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded ?? false);
  const { copied, handleCopy } = useCopyFeedback();
  const contentId = `prompt-content-${prompt.taskId}`;

  const onCopyClick = () => {
    void handleCopy(async () => {
      const success = await copyToClipboard(prompt.content);
      if (success) {
        toast.success('Prompt copied to clipboard', {
          description: prompt.title,
        });
      }
      return success;
    });
  };

  const toggle = () => setIsExpanded((prev) => !prev);

  return (
    <div className="rounded-md border border-border transition-colors hover:border-border/80">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2.5 text-left',
          'hover:bg-muted/50 transition-colors rounded-t-md',
          !isExpanded && 'rounded-b-md'
        )}
      >
        <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </motion.div>
        <span className="flex-1 truncate text-sm font-medium">{prompt.title}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onCopyClick();
          }}
          aria-label={copied ? 'Copied to clipboard' : 'Copy prompt to clipboard'}
          className="h-7 gap-1.5 px-2 text-xs shrink-0"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </Button>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id={contentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">
              <pre className="bg-muted rounded-md p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {prompt.content}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
