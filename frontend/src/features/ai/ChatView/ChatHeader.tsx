/**
 * ChatHeader - Chat title, status, and task badges
 * T075-T079: Add session selector dropdown
 */

import { observer } from 'mobx-react-lite';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bot, Loader2, X, MessageSquare, ChevronDown, Plus, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatHeaderProps {
  title?: string;
  isStreaming?: boolean;
  activeTaskCount?: number;
  sessionId?: string | null;
  recentSessions?: Array<{
    sessionId: string;
    title?: string;
    updatedAt: Date;
  }>;
  onClear?: () => void;
  onClose?: () => void;
  onNewSession?: () => void;
  onSelectSession?: (sessionId: string) => void;
  className?: string;
}

export const ChatHeader = observer<ChatHeaderProps>(
  ({
    title,
    isStreaming,
    activeTaskCount = 0,
    sessionId,
    recentSessions = [],
    onClear,
    onClose,
    onNewSession,
    onSelectSession,
    className,
  }) => {
    return (
      <div className={cn('border-b bg-background', className)} data-testid="chat-header">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-ai-muted">
              <Bot className="h-4 w-4 text-ai" />
            </div>

            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold leading-none">{title || 'PilotSpace Agent'}</h2>

              <div className="flex items-center gap-2">
                {isStreaming && (
                  <Badge
                    variant="secondary"
                    className="gap-1.5 text-xs"
                    data-testid="streaming-indicator"
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Streaming
                  </Badge>
                )}

                {!isStreaming && activeTaskCount > 0 && (
                  <Badge variant="secondary" className="gap-1.5 text-xs">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {activeTaskCount} {activeTaskCount === 1 ? 'task' : 'tasks'} active
                  </Badge>
                )}

                {!isStreaming && activeTaskCount === 0 && sessionId && (
                  <span className="text-xs text-muted-foreground">Ready</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Session selector dropdown */}
            {recentSessions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild data-testid="session-dropdown">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <MessageSquare className="h-3 w-3" />
                    {sessionId ? `Session: ${sessionId.slice(0, 8)}` : 'Select Session'}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Recent Sessions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {onNewSession && (
                    <>
                      <DropdownMenuItem
                        onClick={onNewSession}
                        className="gap-2"
                        data-testid="new-session-button"
                      >
                        <Plus className="h-4 w-4" />
                        <span>New Session</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {recentSessions.map((session) => (
                    <DropdownMenuItem
                      key={session.sessionId}
                      onClick={() => onSelectSession?.(session.sessionId)}
                      className={cn('gap-2', sessionId === session.sessionId && 'bg-accent')}
                      data-testid="session-item"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {session.title || `Session ${session.sessionId.slice(0, 8)}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {session.updatedAt.toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Session badge (show if sessions not available) */}
            {sessionId && recentSessions.length === 0 && (
              <Badge variant="outline" className="gap-1.5 font-mono text-xs">
                <MessageSquare className="h-3 w-3" />
                Session: {sessionId.slice(0, 8)}
              </Badge>
            )}

            <Button
              variant="ghost"
              size="icon"
              data-testid="timer-button"
              aria-label="Session history"
            >
              <Timer className="h-4 w-4" />
              <span className="sr-only">Session history</span>
            </Button>

            {onClear && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClear}
                disabled={isStreaming}
                data-testid="clear-conversation-button"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Clear conversation</span>
              </Button>
            )}

            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} data-testid="close-chat-button">
                <X className="h-4 w-4" />
                <span className="sr-only">Close PilotSpace Agent</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }
);

ChatHeader.displayName = 'ChatHeader';
