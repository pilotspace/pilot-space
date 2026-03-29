/**
 * SkillEditorPanel — Split-screen editor panel (LEFT side) for skill preview.
 * Shows SKILL.md text view or graph data view with a toggle.
 *
 * @module features/ai/ChatView/SkillEditor/SkillEditorPanel
 */
'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ChevronLeft, Network, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useStore } from '@/stores/RootStore';
import { SkillMarkdownPreview } from './SkillMarkdownPreview';

type ViewMode = 'text' | 'graph';

export const SkillEditorPanel = observer(function SkillEditorPanel() {
  const { aiStore } = useStore();
  const skillStore = aiStore.pilotSpace.skillGeneratorStore;
  const draft = skillStore.currentDraft;
  const [viewMode, setViewMode] = useState<ViewMode>('text');

  if (!draft || !skillStore.isPreviewVisible) return null;

  const graphNodeCount = draft.graphData?.nodes?.length ?? 0;
  const graphEdgeCount = draft.graphData?.edges?.length ?? 0;

  return (
    <div
      data-testid="skill-editor-panel"
      className="w-[480px] min-w-[380px] border-r flex flex-col h-full bg-background"
    >
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={() => skillStore.dismissPreview()}
          aria-label="Collapse editor panel"
          data-testid="collapse-editor-btn"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <h2 className="text-sm font-semibold truncate flex-1">{draft.name}</h2>

        {/* View mode toggle */}
        <div className="flex items-center rounded-md border bg-muted p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setViewMode('text')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-sm transition-colors',
              viewMode === 'text'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            data-testid="toggle-text-view"
          >
            Text
          </button>
          <button
            type="button"
            onClick={() => setViewMode('graph')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-sm transition-colors',
              viewMode === 'graph'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            data-testid="toggle-graph-view"
          >
            Graph
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-0 p-4">
        {viewMode === 'text' ? (
          <SkillMarkdownPreview content={draft.skillContent} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Network className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Graph view available in Phase 52
            </p>
            {(graphNodeCount > 0 || graphEdgeCount > 0) && (
              <p className="text-xs text-muted-foreground">
                {graphNodeCount} node{graphNodeCount !== 1 ? 's' : ''},{' '}
                {graphEdgeCount} edge{graphEdgeCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t">
        <Badge variant="secondary" className="text-xs">
          {draft.category}
        </Badge>
        {draft.examplePrompts.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {draft.examplePrompts.length} example{draft.examplePrompts.length !== 1 ? 's' : ''}
          </Badge>
        )}
        {draft.contextRequirements.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {draft.contextRequirements.length} ctx req{draft.contextRequirements.length !== 1 ? 's' : ''}
          </Badge>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          onClick={() => skillStore.openSaveDialog()}
          className="gap-1.5"
          data-testid="editor-save-btn"
        >
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          Save
        </Button>
      </div>
    </div>
  );
});

SkillEditorPanel.displayName = 'SkillEditorPanel';
