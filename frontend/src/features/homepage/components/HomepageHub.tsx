'use client';

/**
 * HomepageHub — v2 Chat-first homepage launchpad.
 *
 * 4-section dashboard per design.md §8:
 *   WorkspacePill → Greeting → AI Prompt Hero →
 *   Recent Artifacts → Active Routines → Sprint Progress
 *
 * Design source: Pencil "Homepage v2 — Artifacts + Sprint Progress"
 * Spacing: design.md §7 (36px pill→greeting, 36px greeting→chatbox, 80px chatbox→artifacts)
 */

import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useAuthStore, useWorkspaceStore } from '@/stores/RootStore';
import { getAIStore } from '@/stores/ai/AIStore';
import { useWorkspaceDigest } from '../hooks/useWorkspaceDigest';
import type { DigestCategoryGroup } from '../hooks/useWorkspaceDigest';
import { ChatHeroInput } from './ChatHeroInput';
import { ExamplePrompts } from './ExamplePrompts';
import { RecentWorkSection } from './RecentWorkSection';
import { ActiveRoutines } from './ActiveRoutines';
import { SprintProgress } from './SprintProgress';
import { RecentConversations } from './RecentConversations';
import { WorkspacePill } from './WorkspacePill';

// ── Backward-compatible export ───────────────────────────────────────────────

/** Fallback prompts when no digest data is available */
const FALLBACK_PROMPTS = [
  'What should I focus on today?',
  'Summarize my in-progress work',
  'Generate my daily standup update',
  'Find stale issues that need attention',
] as const;

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

interface HomepageHubProps {
  workspaceSlug: string;
}

export const HomepageHub = observer(function HomepageHub({ workspaceSlug }: HomepageHubProps) {
  const authStore = useAuthStore();
  const workspaceStore = useWorkspaceStore();
  const workspaceId = workspaceStore.currentWorkspace?.id ?? '';

  const rawDisplayName = authStore.userDisplayName ?? '';
  const emailPrefix = authStore.user?.email?.split('@')[0] ?? '';
  const firstName =
    rawDisplayName && rawDisplayName !== emailPrefix ? rawDisplayName.split(' ')[0] : '';

  const greeting = firstName
    ? `Hi ${firstName}, what do you want to work on?`
    : 'What do you want to work on?';

  // ── AI context injection ─────────────────────────────────────────────────
  const { groups, suggestionCount } = useWorkspaceDigest({ workspaceId });

  useEffect(() => {
    const store = getAIStore().pilotSpace;
    if (!store || !workspaceId) return;

    if (store.workspaceId !== workspaceId) {
      store.setWorkspaceId(workspaceId);
    }

    const staleCount = groups
      .filter((g) => g.category === 'stale_issues')
      .reduce((sum, g) => sum + g.items.length, 0);
    const cycleRiskCount = groups
      .filter((g) => g.category === 'cycle_risk')
      .reduce((sum, g) => sum + g.items.length, 0);
    const noteGroups = groups.filter((g) => g.category === 'unlinked_notes');
    const recentNotes = noteGroups.flatMap((g) =>
      g.items.map((item) => ({ id: item.entityId ?? item.id, title: item.title }))
    );

    const parts: string[] = [];
    if (staleCount > 0) parts.push(`${staleCount} stale issues`);
    if (cycleRiskCount > 0) parts.push(`${cycleRiskCount} cycle risks`);
    if (recentNotes.length > 0) parts.push(`${recentNotes.length} recent notes active`);
    const digestSummary =
      parts.length > 0
        ? `Workspace has ${parts.join(', ')}.`
        : `Workspace has ${suggestionCount} suggestions.`;

    store.setHomepageContext({
      digestSummary,
      totalSuggestionCount: suggestionCount,
      staleIssueCount: staleCount,
      cycleRiskCount,
      recentNotes,
    });

    return () => {
      store.clearHomepageContext();
    };
  }, [workspaceId, groups, suggestionCount]);

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      {/* Main content — design.md §7: 56px top, 60px sides */}
      <div className="mx-auto max-w-[720px] px-[60px] pt-14 pb-16 max-sm:px-6">
        {/* Workspace pill */}
        <div className="flex justify-center">
          <WorkspacePill />
        </div>

        {/* Hero greeting — 36px below pill (mt-9) */}
        <h1 className="mt-9 text-center font-display text-2xl font-normal leading-[1.2] tracking-[-1px] text-foreground">
          {greeting}
        </h1>

        {/* AI Prompt Hero — 36px below greeting, max-w 680px */}
        <div className="mx-auto mt-9 max-w-[680px]">
          <ChatHeroInput workspaceSlug={workspaceSlug} />
        </div>

        {/* Example prompts — discoverability for new users */}
        <div className="mt-4">
          <ExamplePrompts workspaceSlug={workspaceSlug} />
        </div>

        {/* ── Content sections — 80px below chatbox ─────────────────── */}
        <div className="mt-20">
          {/* Recent Artifacts */}
          <RecentWorkSection workspaceSlug={workspaceSlug} workspaceId={workspaceId} />

          {/* Active Routines — 16px internal padding via py-4 */}
          <ActiveRoutines workspaceSlug={workspaceSlug} />

          {/* Sprint Progress — wired to cyclesApi */}
          <SprintProgress workspaceSlug={workspaceSlug} workspaceId={workspaceId} />

          {/* Recent Conversations — resume previous AI chats */}
          <RecentConversations workspaceSlug={workspaceSlug} />
        </div>
      </div>
    </div>
  );
});
