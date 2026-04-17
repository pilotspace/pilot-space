'use client';

/**
 * ExamplePrompts — "Try an example prompt" label + refresh + 3 pill chips.
 *
 * Design spec: pills are rounded-full, bg #f3f4f6, padding 6px 14px
 * Text: Inter 12px, #6b7280
 * Label: Inter 12px, #9ca3af + refresh-cw 11px
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

const PROMPT_POOL = [
  'Sprint retrospective template',
  'Draft a feature spec',
  'Triage stale issues',
  'Write a standup update',
  'Summarize recent activity',
  'Find blocked dependencies',
  'Review open pull requests',
  'Plan next sprint scope',
  'Create onboarding checklist',
] as const;

const PAGE_SIZE = 3;

interface ExamplePromptsProps {
  workspaceSlug: string;
}

export function ExamplePrompts({ workspaceSlug }: ExamplePromptsProps) {
  const router = useRouter();
  const [page, setPage] = useState(0);

  const startIdx = (page * PAGE_SIZE) % PROMPT_POOL.length;
  const prompts = Array.from({ length: PAGE_SIZE }, (_, i) =>
    PROMPT_POOL[(startIdx + i) % PROMPT_POOL.length]!
  );

  const handleRefresh = useCallback(() => {
    setPage((prev) => prev + 1);
  }, []);

  const handlePromptClick = useCallback(
    (prompt: string) => {
      router.push(`/${workspaceSlug}/chat?prefill=${encodeURIComponent(prompt)}`);
    },
    [router, workspaceSlug]
  );

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Label + refresh */}
      <button
        type="button"
        onClick={handleRefresh}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>Try an example prompt</span>
        <RefreshCw className="h-[11px] w-[11px]" aria-hidden="true" />
      </button>

      {/* Prompt pills */}
      <div className="flex flex-wrap justify-center gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => handlePromptClick(prompt)}
            className="rounded-full bg-muted px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
