'use client';

import { observer } from 'mobx-react-lite';
import { useArtifactPanelStore } from '@/stores';
import { ArtifactTabBar } from './artifact-tab-bar';

export const ArtifactPanel = observer(function ArtifactPanel() {
  const artifactPanel = useArtifactPanelStore();

  return (
    <div className="flex h-full flex-col bg-background">
      <ArtifactTabBar />
      <div className="flex-1 overflow-auto">
        {artifactPanel.hasOpenTabs ? (
          <div className="h-full p-4">
            {/* Artifact content will be rendered here in Phase 2 */}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">No artifacts open</p>
          </div>
        )}
      </div>
    </div>
  );
});
