'use client';

import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useUIStore } from '@/stores';
import { ConversationSidebar } from './conversation-sidebar';
import { ArtifactPanel } from './artifact-panel';
import { CommandPalette } from '@/components/search/CommandPalette';
import { useCommandPaletteShortcut } from '@/hooks/useCommandPaletteShortcut';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import type { ReactNode } from 'react';

interface ChatFirstShellProps {
  children: ReactNode;
}

export const ChatFirstShell = observer(function ChatFirstShell({
  children,
}: ChatFirstShellProps) {
  const uiStore = useUIStore();

  useEffect(() => {
    uiStore.hydrate();
  }, [uiStore]);

  useCommandPaletteShortcut();

  const showArtifactPanel = uiStore.layoutMode !== 'chat-first';

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <CommandPalette />

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:m-4 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <ConversationSidebar />

      {showArtifactPanel ? (
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel
            id="chat-column"
            defaultSize={`${uiStore.chatColumnSize}%`}
            minSize="15%"
            className="min-w-0"
          >
            <main id="main-content" className="h-full overflow-auto">
              {children}
            </main>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            id="artifact-panel"
            defaultSize={`${uiStore.artifactPanelSize}%`}
            minSize="30%"
            className="min-w-0"
          >
            <ArtifactPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <main id="main-content" className="flex-1 overflow-auto">
          {children}
        </main>
      )}
    </div>
  );
});
