/**
 * SkillPreviewCard — Inline chat card showing a generated skill preview.
 * Renders within the message list when a skill_preview SSE event has been
 * received and currentDraft is populated in the SkillGeneratorStore.
 *
 * @module features/ai/ChatView/MessageList/SkillPreviewCard
 */
'use client';

import { observer } from 'mobx-react-lite';
import { Code2, Save, Wand2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useStore } from '@/stores/RootStore';

/**
 * Truncate content to the first N lines.
 */
function truncateLines(content: string, maxLines: number): string {
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;
  return lines.slice(0, maxLines).join('\n') + '\n...';
}

export const SkillPreviewCard = observer(function SkillPreviewCard() {
  const { aiStore } = useStore();
  const skillStore = aiStore.pilotSpace.skillGeneratorStore;
  const draft = skillStore.currentDraft;

  if (!draft) return null;

  const contentPreview = truncateLines(draft.skillContent, 6);

  return (
    <Card
      data-testid="skill-preview-card"
      className={cn(
        'mx-4 my-3 border-primary/20 rounded-lg animate-fade-up',
        'bg-[var(--color-ai-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.06)]',
      )}
    >
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Wand2 className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm truncate">{draft.name}</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">
            {draft.category}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-2 space-y-3">
        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2">{draft.description}</p>

        {/* Content preview */}
        <div className="bg-muted rounded-md p-3 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Code2 className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-muted-foreground font-medium">SKILL.md</span>
          </div>
          <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/80 max-h-[120px] overflow-hidden">
            {contentPreview}
          </pre>
        </div>

        {/* Metadata badges */}
        <div className="flex flex-wrap gap-1.5" data-testid="skill-metadata">
          {draft.examplePrompts.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {draft.examplePrompts.length} example{draft.examplePrompts.length !== 1 ? 's' : ''}
            </Badge>
          )}
          {draft.contextRequirements.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {draft.contextRequirements.length} context req
              {draft.contextRequirements.length !== 1 ? 's' : ''}
            </Badge>
          )}
          {draft.toolDeclarations.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {draft.toolDeclarations.length} tool
              {draft.toolDeclarations.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardContent>

      <CardFooter className="px-4 pb-4 pt-2 gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            skillStore.isPreviewVisible = true;
          }}
          className="gap-1.5"
          data-testid="edit-in-editor-btn"
        >
          <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
          Edit in Editor
        </Button>
        <Button
          size="sm"
          onClick={() => skillStore.openSaveDialog()}
          className="gap-1.5"
          data-testid="save-skill-btn"
        >
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          Save Skill
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => skillStore.dismissPreview()}
          className="gap-1.5 ml-auto"
          data-testid="dismiss-btn"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Dismiss
        </Button>
      </CardFooter>
    </Card>
  );
});

SkillPreviewCard.displayName = 'SkillPreviewCard';
