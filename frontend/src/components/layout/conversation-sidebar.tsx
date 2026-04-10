'use client';

import { observer } from 'mobx-react-lite';
import { MessageSquarePlus, FileText, LayoutGrid, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const ConversationSidebar = observer(function ConversationSidebar() {
  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Header — workspace switcher placeholder */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
        <span className="text-xs font-semibold text-sidebar-foreground">Conversations</span>
      </div>

      {/* New Chat button */}
      <div className="shrink-0 p-2">
        <Button variant="default" size="sm" className="w-full shadow-warm-sm text-xs">
          <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
          New Chat
        </Button>
      </div>

      {/* Conversation history list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2">
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            No conversations yet
          </p>
        </div>
      </ScrollArea>

      <Separator />

      {/* Browse shortcuts — Notes, Issues, Projects */}
      <div className="shrink-0 p-2">
        <div className="flex items-center justify-center gap-1">
          {[
            { icon: FileText, label: 'Notes' },
            { icon: LayoutGrid, label: 'Issues' },
            { icon: FolderKanban, label: 'Projects' },
          ].map(({ icon: Icon, label }) => (
            <Tooltip key={label} delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-sidebar-foreground"
                >
                  <Icon className="h-4 w-4" />
                  <span className="sr-only">{label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Footer — user controls placeholder */}
      <div className="shrink-0 border-t border-sidebar-border p-2">
        <div className="h-10" />
      </div>
    </aside>
  );
});
