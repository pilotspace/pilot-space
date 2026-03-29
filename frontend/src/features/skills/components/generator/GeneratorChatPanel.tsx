/**
 * GeneratorChatPanel -- Lightweight AI chat panel for the skill generator page.
 *
 * Renders chat messages from SkillGeneratorPageStore and provides a text input.
 * This IS wrapped in observer() -- it is OUTSIDE the ReactFlow tree, safe from
 * the flushSync conflict (Phase 52 decision).
 *
 * @module features/skills/components/generator/GeneratorChatPanel
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { SkillGeneratorPageStore, ChatMessage } from '@/features/skills/stores/SkillGeneratorPageStore';

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
          isUser
            ? 'bg-primary/10 text-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat Panel
// ---------------------------------------------------------------------------

interface GeneratorChatPanelProps {
  store: SkillGeneratorPageStore;
}

export const GeneratorChatPanel = observer(function GeneratorChatPanel({
  store,
}: GeneratorChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [store.chatMessages.length]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    store.addUserMessage(trimmed);
    setInput('');

    // Stub: mock assistant response until Plan 03 adds the real endpoint
    setTimeout(() => {
      store.addAssistantMessage(
        'I received your message. The chat endpoint will be available once the backend is connected.',
      );
    }, 500);
  }, [input, store]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-center px-4 py-2.5 border-b">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          AI Assistant
        </h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {store.chatMessages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {store.isStreaming && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Typing...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t p-3">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the skill you want..."
            className="min-h-[40px] max-h-[120px] resize-none text-sm"
            rows={1}
          />
          <Button
            size="icon"
            className="shrink-0 h-10 w-10"
            disabled={!input.trim() || store.isStreaming}
            onClick={handleSend}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
});
