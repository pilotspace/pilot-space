'use client';

import { observer } from 'mobx-react-lite';
import { X, Pin } from 'lucide-react';
import { useArtifactPanelStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const ArtifactTabBar = observer(function ArtifactTabBar() {
  const artifactPanel = useArtifactPanelStore();
  const { openTabs, activeTabId } = artifactPanel;

  if (openTabs.length === 0) return null;

  return (
    <div className="flex h-10 items-center border-b border-border px-2 gap-1 overflow-x-auto">
      {openTabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTabId}
          className={cn(
            'group flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs cursor-pointer transition-colors',
            tab.id === activeTabId
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          )}
          onClick={() => artifactPanel.setActiveTab(tab.id)}
        >
          <span className="truncate max-w-[120px]">{tab.title}</span>
          {tab.isPinned && <Pin className="h-2.5 w-2.5 text-muted-foreground" />}
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              artifactPanel.closeTab(tab.id);
            }}
          >
            <X className="h-3 w-3" />
            <span className="sr-only">Close tab</span>
          </Button>
        </div>
      ))}
    </div>
  );
});
