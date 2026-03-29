/**
 * SkillPreviewPanel -- Collapsible bottom panel showing SKILL.md preview.
 *
 * Wrapped in observer() -- outside ReactFlow tree, safe per Phase 52 decision.
 *
 * @module features/skills/components/generator/SkillPreviewPanel
 */

'use client';

import { observer } from 'mobx-react-lite';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';

import { SkillMarkdownPreview } from '@/features/skills/components/SkillMarkdownPreview';
import type { SkillGeneratorPageStore } from '@/features/skills/stores/SkillGeneratorPageStore';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SkillPreviewPanelProps {
  store: SkillGeneratorPageStore;
}

export const SkillPreviewPanel = observer(function SkillPreviewPanel({
  store,
}: SkillPreviewPanelProps) {
  return (
    <div className="border-t bg-background">
      {/* Toggle header */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
        onClick={() => store.togglePreview()}
      >
        <FileText className="h-3.5 w-3.5" />
        SKILL.md Preview
        {store.isPreviewOpen ? (
          <ChevronDown className="ml-auto h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="ml-auto h-3.5 w-3.5" />
        )}
      </button>

      {/* Collapsible content */}
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ height: store.isPreviewOpen ? 256 : 0 }}
      >
        <div className="h-64 overflow-y-auto px-4 pb-3">
          {store.hasContent ? (
            <SkillMarkdownPreview
              content={store.skillContent}
              className="max-h-full"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No skill content yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
