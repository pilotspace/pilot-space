'use client';

/**
 * HomepageHub — Chat-First Homepage layout.
 *
 * Implements UIX-05 — redesigned Homepage with chat-first paradigm.
 *
 * Layout:
 * [Header bar — 48px, existing]
 * [Hero section — centered, ~280px tall]
 *   "What would you like to build?" ← Fraunces 28px/600
 *   [Chat input — 56px, warm surface, full width max 680px]
 * [Quick Action grid — 2x2, gap 16px, max 680px wide]
 * [Recent Conversations — horizontal scroll, max 680px wide]
 *
 * The previous 2-panel layout has been replaced with a chat-first
 * hero per the locked design decision (UIX-05).
 */

import { useEffect, useState } from 'react';
import { Lightbulb, GitPullRequest, FileText, BarChart3 } from 'lucide-react';
import { getAIStore } from '@/stores/ai/AIStore';
import { SessionListStore } from '@/stores/ai/SessionListStore';
import type { SessionSummary } from '@/stores/ai/SessionListStore';
import type { DigestCategoryGroup } from '../hooks/useWorkspaceDigest';
import { ChatHeroInput } from './ChatHeroInput';
import { QuickActionCard } from './QuickActionCard';
import { RecentConversationCard } from './RecentConversationCard';

// ── Backward-compatible export ───────────────────────────────────────────────
// buildContextualPrompts was exported from the old HomepageHub and has existing
// tests. Retained here for API compatibility while the chat-first redesign is live.

/** Fallback prompts when no digest data is available */
const FALLBACK_PROMPTS = [
  'What should I focus on today?',
  'Summarize my in-progress work',
  'Generate my daily standup update',
  'Find stale issues that need attention',
] as const;

/**
 * Build contextual prompts from digest category groups.
 * Returns up to 4 prompts derived from active digest categories,
 * padded with fallback prompts if fewer than 4 categories are present.
 */
export function buildContextualPrompts(groups: DigestCategoryGroup[]): readonly string[] {
  if (groups.length === 0) return FALLBACK_PROMPTS;

  const prompts: string[] = [];

  for (const group of groups) {
    if (prompts.length >= 4) break;

    const count = group.items.length;

    switch (group.category) {
      case 'stale_issues':
        prompts.push(`Review ${count} stale issue${count !== 1 ? 's' : ''} needing attention`);
        break;
      case 'cycle_risk':
        prompts.push('Sprint ends soon — prioritize remaining items?');
        break;
      case 'blocked_dependencies':
        prompts.push(`${count} item${count !== 1 ? 's are' : ' is'} blocked — help resolve?`);
        break;
      case 'unlinked_notes':
        prompts.push(
          `${count} note${count !== 1 ? 's have' : ' has'} extractable issues — review?`
        );
        break;
      case 'overdue_items':
        prompts.push(`${count} overdue item${count !== 1 ? 's' : ''} need attention`);
        break;
      case 'unassigned_priority':
        prompts.push(
          `${count} priority item${count !== 1 ? 's are' : ' is'} unassigned — assign?`
        );
        break;
    }
  }

  // Pad with fallback prompts to reach 4
  let fallbackIdx = 0;
  while (prompts.length < 4 && fallbackIdx < FALLBACK_PROMPTS.length) {
    const candidate = FALLBACK_PROMPTS[fallbackIdx]!;
    if (!prompts.includes(candidate)) {
      prompts.push(candidate);
    }
    fallbackIdx++;
  }

  return prompts;
}
// ────────────────────────────────────────────────────────────────────────────

/** Quick action definitions per UI-SPEC copywriting contract */
const QUICK_ACTIONS = [
  {
    icon: Lightbulb,
    label: 'Create issues from idea',
    sublabel: 'Turn your description into tracked issues',
    prompt: 'Create issues from this idea: ',
  },
  {
    icon: GitPullRequest,
    label: 'Review my PR',
    sublabel: 'Get a code review on an open pull request',
    prompt: 'Review my pull request: ',
  },
  {
    icon: FileText,
    label: 'Generate spec from notes',
    sublabel: 'Convert a note into a feature specification',
    prompt: 'Generate a spec from my notes about: ',
  },
  {
    icon: BarChart3,
    label: 'Check sprint status',
    sublabel: "Summarize what's in progress and what's blocked",
    prompt: "What's the current sprint status?",
  },
] as const;

interface HomepageHubProps {
  /** Workspace slug for navigation links */
  workspaceSlug: string;
}

export function HomepageHub({ workspaceSlug }: HomepageHubProps) {
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);

  // Load recent sessions client-side only to avoid SSR issues (RESEARCH Pitfall 5)
  useEffect(() => {
    const aiStore = getAIStore();
    const pilotSpace = aiStore.pilotSpace;
    if (!pilotSpace) return;

    const sessionListStore = new SessionListStore(pilotSpace);

    sessionListStore
      .fetchSessions(8)
      .then(() => {
        setRecentSessions([...sessionListStore.sessions].slice(0, 8));
      })
      .catch(() => {
        // Non-fatal — recent conversations section will be hidden
      });
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-[680px] mx-auto px-6 py-12">

        {/* Hero section */}
        <section className="flex flex-col items-center text-center" aria-label="Chat hero">
          <h1 className="font-display text-[28px] font-semibold leading-[1.2] text-foreground">
            What would you like to build?
          </h1>

          <div className="mt-8 w-full">
            <ChatHeroInput workspaceSlug={workspaceSlug} />
          </div>
        </section>

        {/* Quick action grid — 2x2 */}
        <section className="mt-8" aria-label="Quick actions">
          <div className="grid grid-cols-2 gap-4">
            {QUICK_ACTIONS.map((action) => (
              <QuickActionCard
                key={action.label}
                icon={action.icon}
                label={action.label}
                sublabel={action.sublabel}
                prompt={action.prompt}
                workspaceSlug={workspaceSlug}
              />
            ))}
          </div>
        </section>

        {/* Recent conversations — horizontal scroll */}
        {recentSessions.length > 0 && (
          <section className="mt-8" aria-label="Recent conversations">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              Recent Conversations
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recentSessions.map((session) => (
                <RecentConversationCard
                  key={session.sessionId}
                  session={session}
                  workspaceSlug={workspaceSlug}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
