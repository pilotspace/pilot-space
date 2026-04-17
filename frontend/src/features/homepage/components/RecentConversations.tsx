'use client';

/**
 * RecentConversations — Horizontal scroll of recent AI chat sessions.
 *
 * Data flow: SessionListStore.fetchSessions() → recentSessions (sorted by updatedAt desc)
 * Renders up to 5 RecentConversationCard components.
 *
 * Allows users to resume previous conversations directly from the homepage.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, MessageSquare } from 'lucide-react';
import { getAIStore } from '@/stores/ai/AIStore';
import { SessionListStore } from '@/stores/ai/SessionListStore';
import type { SessionSummary } from '@/stores/ai/SessionListStore';
import { RecentConversationCard } from './RecentConversationCard';

interface RecentConversationsProps {
  workspaceSlug: string;
}

const MAX_SESSIONS = 5;

export function RecentConversations({ workspaceSlug }: RecentConversationsProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const pilotSpace = getAIStore().pilotSpace;
    if (!pilotSpace) {
      setIsLoading(false);
      return;
    }
    const store = new SessionListStore(pilotSpace);
    store
      .fetchSessions(MAX_SESSIONS)
      .then(() => {
        setSessions([...store.recentSessions].slice(0, MAX_SESSIONS));
      })
      .catch(() => {
        // Non-fatal — section will be hidden
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading) return null;
  if (sessions.length === 0) return null;

  return (
    <section aria-label="Recent conversations" className="py-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <h2 className="text-base font-semibold text-foreground">Recent conversations</h2>
        </div>
        <Link
          href={`/${workspaceSlug}/chat`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          View all
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      {/* Horizontal scroll */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
        {sessions.map((session) => (
          <RecentConversationCard
            key={session.sessionId}
            session={session}
            workspaceSlug={workspaceSlug}
          />
        ))}
      </div>
    </section>
  );
}
