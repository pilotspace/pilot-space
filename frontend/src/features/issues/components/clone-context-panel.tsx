'use client';

import * as React from 'react';
import { Terminal, Copy, Check, ListChecks, Link2, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'markdown' | 'claude_code' | 'task_list';

export interface CloneContextPanelProps {
  onExport: (format: ExportFormat) => Promise<string | null>;
  isLoading?: boolean;
  stats?: {
    tasksCount: number;
    relatedIssuesCount: number;
    relatedDocsCount: number;
  };
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const FORMAT_LABELS: Record<ExportFormat, string> = {
  markdown: 'Markdown',
  claude_code: 'Claude Code',
  task_list: 'Task List',
};

const COPY_FEEDBACK_MS = 1500;

// ============================================================================
// Component
// ============================================================================

export function CloneContextPanel({
  onExport,
  isLoading,
  stats,
  className,
}: CloneContextPanelProps) {
  const [activeFormat, setActiveFormat] = React.useState<ExportFormat>('markdown');
  const [preview, setPreview] = React.useState<string>('');
  const [isCopied, setIsCopied] = React.useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);

  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clean up timeout on unmount
  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const loadPreview = React.useCallback(
    async (format: ExportFormat) => {
      setIsLoadingPreview(true);
      try {
        const content = await onExport(format);
        setPreview(content ?? '');
      } catch {
        setPreview('Failed to load preview.');
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [onExport]
  );

  // Load preview when popover opens or format changes
  React.useEffect(() => {
    if (isOpen) {
      void loadPreview(activeFormat);
    }
  }, [isOpen, activeFormat, loadPreview]);

  const handleCopy = async () => {
    if (!preview || isLoadingPreview) return;

    try {
      await navigator.clipboard.writeText(preview);
      setIsCopied(true);
      toast.success('Context copied to clipboard', {
        description: `Ready to paste into ${FORMAT_LABELS[activeFormat]}`,
      });
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Fallback for environments where clipboard API is unavailable
      const textarea = document.createElement('textarea');
      textarea.value = preview;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setIsCopied(true);
      toast.success('Context copied to clipboard');
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveFormat(value as ExportFormat);
    setIsCopied(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5', className)}
          disabled={isLoading}
          aria-haspopup="dialog"
        >
          <Terminal className="size-4" aria-hidden="true" />
          Clone Context
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[480px] p-0 overflow-hidden"
        align="end"
        sideOffset={8}
        id="clone-context-panel"
      >
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {/* Gradient header */}
              <div className="bg-gradient-to-r from-primary to-ai px-4 py-3">
                <h3 className="text-sm font-semibold text-white">Ready for Claude Code</h3>
                <p className="text-xs text-white/70">Choose your preferred format</p>
              </div>

              <Tabs value={activeFormat} onValueChange={handleTabChange}>
                <div className="border-b px-3 pt-3 pb-0">
                  <TabsList className="w-full">
                    <TabsTrigger value="markdown" className="flex-1 text-xs">
                      Markdown
                    </TabsTrigger>
                    <TabsTrigger value="claude_code" className="flex-1 text-xs">
                      Claude Code
                    </TabsTrigger>
                    <TabsTrigger value="task_list" className="flex-1 text-xs">
                      Task List
                    </TabsTrigger>
                  </TabsList>
                </div>

                {(['markdown', 'claude_code', 'task_list'] as const).map((format) => (
                  <TabsContent key={format} value={format} className="mt-0">
                    <div className="relative">
                      <pre
                        className="max-h-[360px] overflow-auto bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 text-[#D4D4D4] p-5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap"
                        role="region"
                        aria-label={`${FORMAT_LABELS[format]} preview`}
                      >
                        {isLoadingPreview ? (
                          <span className="text-muted-foreground animate-pulse">
                            Loading preview...
                          </span>
                        ) : (
                          preview || 'No content available'
                        )}
                      </pre>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopy}
                        disabled={!preview || isLoadingPreview}
                        className={cn(
                          'absolute top-3 right-3 h-7 px-2.5 text-xs backdrop-blur-sm transition-all',
                          isCopied
                            ? 'text-green-400 hover:text-green-400 bg-green-500/10'
                            : 'text-[#D4D4D4] hover:text-white bg-white/10 hover:bg-white/20'
                        )}
                        aria-live="polite"
                        aria-label={isCopied ? 'Context copied to clipboard' : 'Copy context'}
                      >
                        {isCopied ? (
                          <>
                            <Check className="size-3.5 mr-1" aria-hidden="true" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5 mr-1" aria-hidden="true" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>

              {stats && (
                <div className="border-t px-4 py-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <ListChecks className="size-3.5" aria-hidden="true" />
                    <span className="font-medium text-foreground">{stats.tasksCount}</span> tasks
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link2 className="size-3.5" aria-hidden="true" />
                    <span className="font-medium text-foreground">
                      {stats.relatedIssuesCount}
                    </span>{' '}
                    issues
                  </div>
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="size-3.5" aria-hidden="true" />
                    <span className="font-medium text-foreground">
                      {stats.relatedDocsCount}
                    </span>{' '}
                    docs
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}
