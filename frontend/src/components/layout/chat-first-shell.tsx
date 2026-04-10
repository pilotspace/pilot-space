'use client';

import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { AnimatePresence, motion } from 'motion/react';
import { Menu } from 'lucide-react';
import { useUIStore } from '@/stores';
import { useResponsive } from '@/hooks/useMediaQuery';
import { useRouteArtifact } from '@/hooks/useRouteArtifact';
import { ConversationSidebar } from './conversation-sidebar';
import { ArtifactPanel } from './artifact-panel';
import { CommandPalette } from '@/components/search/CommandPalette';
import { useCommandPaletteShortcut } from '@/hooks/useCommandPaletteShortcut';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface ChatFirstShellProps {
  children: ReactNode;
}

export const ChatFirstShell = observer(function ChatFirstShell({
  children,
}: ChatFirstShellProps) {
  const uiStore = useUIStore();
  const { isMobile, isTablet } = useResponsive();

  // When the current route maps to an artifact, render children in the artifact panel
  const isRouteArtifact = useRouteArtifact(true);

  useEffect(() => {
    uiStore.hydrate();
  }, [uiStore]);

  useCommandPaletteShortcut();

  // Auto-collapse sidebar on mobile/tablet
  useEffect(() => {
    if (isMobile || isTablet) {
      uiStore.setSidebarCollapsed(true);
    }
  }, [isMobile, isTablet, uiStore]);

  const showArtifactPanel = uiStore.layoutMode !== 'chat-first';
  const sidebarCollapsed = uiStore.sidebarCollapsed;

  // Determine where to render children:
  // - If current route is an artifact (notes, issues, etc.), render in artifact panel
  // - Otherwise (homepage), render in the chat/main column
  const chatColumnContent = isRouteArtifact ? null : children;
  const artifactContent = isRouteArtifact ? children : null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <CommandPalette />

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:m-4 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {isMobile && !sidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => uiStore.setSidebarCollapsed(true)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div className={cn(isMobile && !sidebarCollapsed && 'fixed left-0 top-0 z-50 h-full')}>
        <ConversationSidebar />
      </div>

      {/* Sidebar expand button when collapsed (desktop only) */}
      {sidebarCollapsed && !isMobile && (
        <div className="flex shrink-0 items-start pt-2 pl-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => uiStore.setSidebarCollapsed(false)}
            aria-label="Open sidebar"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Mobile menu button */}
      {isMobile && sidebarCollapsed && (
        <div className="fixed top-2 left-2 z-30">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 bg-background/80 backdrop-blur-sm"
            onClick={() => uiStore.setSidebarCollapsed(false)}
            aria-label="Open sidebar"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      )}

      {showArtifactPanel ? (
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel
            id="chat-column"
            defaultSize={`${uiStore.chatColumnSize}%`}
            minSize="15%"
            className="min-w-0"
          >
            <main id="main-content" className="h-full overflow-auto">
              {chatColumnContent}
            </main>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            id="artifact-panel"
            defaultSize={`${uiStore.artifactPanelSize}%`}
            minSize="30%"
            className="min-w-0"
          >
            <ArtifactPanel>
              {artifactContent}
            </ArtifactPanel>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <main id="main-content" className="flex-1 overflow-auto">
          {chatColumnContent ?? children}
        </main>
      )}
    </div>
  );
});
