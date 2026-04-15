'use client';

/**
 * ChatHeroInput — Hero-level chat input for the homepage.
 *
 * On submit, navigates to the /chat page with the message pre-filled
 * via ?prefill= query param. The chat page reads this and auto-sends.
 *
 * States:
 * - Idle: warm border, placeholder visible
 * - Focused: 2px ring (#29a386), placeholder remains
 * - Has value: send button activates (teal)
 * - Submitting: input disabled, Loader2 in send button
 */

import { useState, useCallback, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, Loader2 } from 'lucide-react';

interface ChatHeroInputProps {
  /** Workspace slug used to build the /chat navigation URL */
  workspaceSlug: string;
}

export function ChatHeroInput({ workspaceSlug }: ChatHeroInputProps) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    router.push(`/${workspaceSlug}/chat?prefill=${encodeURIComponent(trimmed)}`);
  }, [value, isSubmitting, router, workspaceSlug]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const hasValue = value.trim().length > 0;

  return (
    <div className="relative flex w-full items-end gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-ring transition-shadow duration-150">
      <textarea
        role="textbox"
        aria-label="Chat with AI"
        aria-multiline="true"
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSubmitting}
        placeholder="Describe a feature, ask about your sprint, or request a PR review..."
        className="min-h-[32px] flex-1 resize-none bg-transparent text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        style={{ fieldSizing: 'content' } as React.CSSProperties}
      />

      {/* Send button — appears when input has value */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!hasValue || isSubmitting}
        aria-label="Send message"
        className={[
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-150',
          hasValue && !isSubmitting
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-muted text-muted-foreground cursor-not-allowed',
        ].join(' ')}
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowUp className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
