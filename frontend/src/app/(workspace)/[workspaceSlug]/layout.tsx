'use client';

/**
 * Workspace-slug-scoped layout.
 *
 * Responsibilities:
 * - Mount the AiNotConfiguredBanner at the top of every workspace page (AIGOV-05).
 * - Mount the global `<ArtifactPeekDrawer />` (Phase 86) so `?peek=` works
 *   everywhere in the workspace.
 * - When `?focus=` is present, switch the main content slot to the split-pane
 *   layout (chat rail + artifact focus) and render the mode toggle overlay.
 *
 * Note: the outer `(workspace)/layout.tsx` already provides the top-level
 * Sidebar + `<main>` shell via `<AppShell>`; we do not refactor that. We only
 * swap the children we render in the main slot.
 */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { usePathname, useRouter } from 'next/navigation';
import { useWorkspace } from '@/components/workspace-guard';
import { useWorkspaceStore } from '@/stores';
import { saveLastWorkspacePath } from '@/lib/workspace-nav';
import { AiNotConfiguredBanner } from '@/components/workspace/ai-not-configured-banner';
import type { WorkspaceFeatureToggles } from '@/types';
import { ArtifactPeekDrawer } from '@/components/artifacts/ArtifactPeekDrawer';
import { ArtifactFocusPane } from '@/components/artifacts/ArtifactFocusPane';
import { ArtifactSplitModeToggle } from '@/components/artifacts/ArtifactSplitModeToggle';
import { ChatRail } from '@/components/artifacts/ChatRail';
import { useArtifactPeekState } from '@/hooks/use-artifact-peek-state';
import { cn } from '@/lib/utils';

/** Map first pathname segment after workspace slug to a feature toggle key. */
const ROUTE_FEATURE_MAP: Record<string, keyof WorkspaceFeatureToggles> = {
  notes: 'notes',
  issues: 'issues',
  projects: 'projects',
  members: 'members',
  knowledge: 'knowledge',
  docs: 'docs',
  skills: 'skills',
  costs: 'costs',
  approvals: 'approvals',
};

interface WorkspaceSlugLayoutProps {
  children: ReactNode;
}

const WorkspaceSlugLayout = observer(function WorkspaceSlugLayout({
  children,
}: WorkspaceSlugLayoutProps) {
  const { workspaceSlug } = useWorkspace();
  const workspaceStore = useWorkspaceStore();
  const isOwner = workspaceStore.isOwner;
  const pathname = usePathname();
  const router = useRouter();

  const { isFocusOpen, focusId, focusType, view } = useArtifactPeekState();

  useEffect(() => {
    saveLastWorkspacePath(workspaceSlug, pathname);
  }, [pathname, workspaceSlug]);

  // Route protection: redirect when navigating to a disabled feature
  useEffect(() => {
    if (!workspaceStore.featureToggles) return;
    const segments = pathname.split('/').filter(Boolean);
    const routeSegment = segments[1];
    if (!routeSegment) return;
    const featureKey = ROUTE_FEATURE_MAP[routeSegment];
    if (featureKey && !workspaceStore.isFeatureEnabled(featureKey)) {
      router.replace(`/${workspaceSlug}`);
    }
  }, [pathname, workspaceSlug, workspaceStore.featureToggles, router, workspaceStore]);

  return (
    <>
      <AiNotConfiguredBanner workspaceSlug={workspaceSlug} isOwner={isOwner} />

      {!isFocusOpen && children}

      {isFocusOpen && focusId && focusType && (
        <div
          data-view={view}
          className={cn(
            'split-layout grid h-full w-full min-h-0 overflow-hidden',
            'transition-[grid-template-columns] duration-200 ease-out',
            view === 'split' && 'grid-cols-[380px_1fr]',
            view === 'read' && 'grid-cols-[48px_1fr]',
            view === 'chat' && 'grid-cols-[1fr_0px]',
          )}
        >
          <div
            className={cn(
              'min-h-0 overflow-hidden border-r border-border',
              view === 'read' && 'pointer-events-none opacity-60',
            )}
          >
            {view === 'read' ? (
              <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-wider text-muted-foreground">
                Chat
              </div>
            ) : (
              <ChatRail />
            )}
          </div>
          <div
            className={cn(
              'min-h-0 overflow-hidden',
              view === 'chat' && 'pointer-events-none invisible',
            )}
          >
            <ArtifactFocusPane id={focusId} type={focusType} />
          </div>
        </div>
      )}

      {/* Global peek drawer — always mounted */}
      <ArtifactPeekDrawer />

      {/* Mode toggle overlay — only when focus open */}
      {isFocusOpen && (
        <ArtifactSplitModeToggle className="fixed left-1/2 top-3 z-50 -translate-x-1/2" />
      )}
    </>
  );
});

export default WorkspaceSlugLayout;
