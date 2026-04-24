/**
 * ModeSelector — 4-chip segmented radiogroup for the chat composer.
 *
 * Phase 87 Plan 01 (CHAT-02). Renders Plan · Act · Research · Draft chips
 * right-aligned next to the send affordance. Per-mode color tokens, ARIA
 * radiogroup semantics, ←/→ keyboard cycling, and tooltips per UI-SPEC §2.
 *
 * @module features/ai/ChatView/ChatInput/ModeSelector
 */

import { useCallback, useRef, type KeyboardEvent } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CHAT_MODES, type ChatMode } from './types';

const MODE_LABEL: Record<ChatMode, string> = {
  plan: 'Plan',
  act: 'Act',
  research: 'Research',
  draft: 'Draft',
};

const MODE_TOOLTIP: Record<ChatMode, string> = {
  plan: 'Plan — propose without changes',
  act: 'Act — execute with approval',
  research: 'Research — read-only',
  draft: 'Draft — ephemeral, not saved',
};

const MODE_ACTIVE_CLASS: Record<ChatMode, string> = {
  plan: 'bg-[#64748b] text-white',
  act: 'bg-[#29a386] text-white',
  research: 'bg-[#8b5cf6] text-white',
  draft: 'bg-[#d97706] text-white',
};

const MODE_HOVER_TINT: Record<ChatMode, string> = {
  plan: 'hover:bg-[rgba(100,116,139,0.06)]',
  act: 'hover:bg-[rgba(41,163,134,0.06)]',
  research: 'hover:bg-[rgba(139,92,246,0.06)]',
  draft: 'hover:bg-[rgba(217,119,6,0.06)]',
};

export interface ModeSelectorProps {
  value: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

export function ModeSelector({ value, onChange, disabled }: ModeSelectorProps) {
  const refs = useRef<Record<ChatMode, HTMLButtonElement | null>>({
    plan: null,
    act: null,
    research: null,
    draft: null,
  });

  const handleKey = useCallback(
    (mode: ChatMode, e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const idx = CHAT_MODES.indexOf(mode);
      const nextIdx =
        e.key === 'ArrowRight'
          ? (idx + 1) % CHAT_MODES.length
          : (idx - 1 + CHAT_MODES.length) % CHAT_MODES.length;
      const next = CHAT_MODES[nextIdx]!;
      refs.current[next]?.focus();
      onChange(next);
    },
    [onChange]
  );

  return (
    <TooltipProvider delayDuration={400}>
      <div
        role="radiogroup"
        aria-label="Conversation mode"
        data-mode-selector
        className="inline-flex h-8 items-center rounded-full bg-white/70 p-0.5 shadow-[0_0_0_1px_rgba(200,209,219,0.6)_inset]"
      >
        {CHAT_MODES.map((mode) => {
          const active = mode === value;
          return (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  ref={(el) => {
                    refs.current[mode] = el;
                  }}
                  role="radio"
                  aria-checked={active}
                  data-mode-chip={mode}
                  disabled={disabled}
                  tabIndex={active ? 0 : -1}
                  onClick={() => {
                    if (!disabled) onChange(mode);
                  }}
                  onKeyDown={(e) => {
                    if (!disabled) handleKey(mode, e);
                  }}
                  className={cn(
                    'h-7 px-3 rounded-full text-xs font-semibold leading-none transition-colors duration-150 ease-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    active
                      ? MODE_ACTIVE_CLASS[mode]
                      : cn('text-muted-foreground', MODE_HOVER_TINT[mode]),
                    disabled && 'cursor-not-allowed opacity-60'
                  )}
                >
                  {MODE_LABEL[mode]}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{MODE_TOOLTIP[mode]}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
