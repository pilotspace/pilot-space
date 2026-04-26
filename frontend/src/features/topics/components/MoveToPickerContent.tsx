'use client';

/**
 * MoveToPickerContent — Plan 93-05 Task 1.
 *
 * Renders the body of the CommandPalette when `uiStore.paletteMode === 'move'`.
 * The wrapper Dialog + Input + Footer are owned by CommandPalette; this component
 * provides ONLY the result list (root pseudo-row + filtered topics + empty state).
 *
 * Pitfalls guarded:
 *  - The candidate list comes from `useTopicsForMove(workspaceId, sourceId)` which
 *    already excludes the source topic AND all of its descendants client-side
 *    (T-93-16). We render whatever the hook returns and trust the filter.
 *  - On select, the mutation needs `oldParentId` — we read it from
 *    `uiStore.paletteMoveSourceParentId`, which was cached by `openPaletteForMove`.
 *    If the caller forgot to pass `parentBefore` (legacy or test path), it falls
 *    back to `null` → backend remains authoritative on cycle/depth checks.
 *  - On error, the move hook returns a typed `MoveTopicError`; we forward to
 *    `toastMoveError` mirroring the sidebar drag-drop UX so the picker and DnD
 *    surface the same copy (UI-SPEC §Surface 1 + §Surface 3 share strings).
 *  - Selecting a row closes the palette via `uiStore.closeCommandPalette()` —
 *    the same single reset path the standard search flow uses.
 */

import { observer } from 'mobx-react-lite';
import { FileText, Home } from 'lucide-react';
import { toast } from 'sonner';

import { CommandGroup, CommandItem } from '@/components/ui/command';
import { useUIStore } from '@/stores';
import type { MoveTopicError } from '../hooks';
import { useMoveTopic, useTopicsForMove } from '../hooks';

const GROUP_HEADING_CLS =
  '[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] ' +
  '[&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.04em] ' +
  '[&_[cmdk-group-heading]]:text-[var(--text-muted)] [&_[cmdk-group-heading]]:uppercase';

interface Props {
  workspaceId: string;
  /** The source topic id — set by `uiStore.openPaletteForMove(...)`. */
  sourceId: string;
  /** Parent of the source topic before the move; null = source is at root. */
  parentBeforeId: string | null;
}

function toastMoveError(title: string, err: MoveTopicError): void {
  const heading = `Couldn't move "${title}".`;
  switch (err.kind) {
    case 'maxDepth':
      toast.error(heading, { description: 'This would exceed the 5-level depth limit.' });
      return;
    case 'cycle':
      toast.error(heading, { description: "A topic can't be moved into its own subtree." });
      return;
    case 'forbidden':
      toast.error(heading, { description: 'You do not have permission to move this topic.' });
      return;
    case 'notFound':
      toast.error(heading, { description: 'The target topic no longer exists.' });
      return;
    default:
      toast.error(heading, { description: 'Try again.' });
  }
}

export const MoveToPickerContent = observer(function MoveToPickerContent({
  workspaceId,
  sourceId,
  parentBeforeId,
}: Props) {
  const uiStore = useUIStore();
  const { data: candidates, isLoading } = useTopicsForMove(workspaceId, sourceId);
  const move = useMoveTopic(workspaceId);

  const handleSelect = (newParentId: string | null, displayTitle: string) => {
    move.mutate(
      { noteId: sourceId, parentId: newParentId, oldParentId: parentBeforeId },
      {
        onError: (err) => toastMoveError(displayTitle, err),
      },
    );
    // Close immediately — optimistic UI surfaces the move; toast surfaces errors.
    uiStore.closeCommandPalette();
  };

  return (
    <>
      {/* "Move to root" pinned pseudo-row (UI-SPEC §Surface 3) — always rendered. */}
      <CommandGroup heading="" className={GROUP_HEADING_CLS}>
        <CommandItem
          value="__move-to-root__"
          onSelect={() => handleSelect(null, 'topic')}
          data-testid="move-to-root"
        >
          <div className="flex items-center gap-2 min-w-0 w-full">
            <Home className="h-4 w-4 shrink-0 text-[var(--brand-primary)]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-[var(--text-heading)]">
                Move to root
              </div>
              <div className="truncate text-[12px] text-[var(--text-muted)]">
                Make a top-level topic
              </div>
            </div>
          </div>
        </CommandItem>
      </CommandGroup>

      {/* TOPICS group — candidates filtered server-/client-side to exclude
          self + descendants by useTopicsForMove. */}
      {!isLoading && candidates && candidates.length > 0 && (
        <CommandGroup heading="TOPICS" className={GROUP_HEADING_CLS}>
          {candidates.map((note) => {
            const title = note.title?.trim() || 'Untitled';
            return (
              <CommandItem
                key={note.id}
                value={`move-target-${note.id}-${title}`}
                onSelect={() => handleSelect(note.id, title)}
                data-testid={`move-target-${note.id}`}
              >
                <div className="flex items-center gap-2 min-w-0 w-full">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                    style={{ background: 'rgba(41,163,134,0.12)' }}
                  >
                    <FileText
                      className="h-4 w-4"
                      style={{ color: 'var(--brand-primary)' }}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="truncate text-[13px] font-medium text-[var(--text-heading)]">
                    {title}
                  </span>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      )}

      {/* Empty state when the workspace has no other topics (or all candidates
          were filtered as descendants). UI-SPEC §Surface 3 locked copy.
          Rendered as plain markup (NOT cmdk's CommandEmpty) because the
          "Move to root" pseudo-row is always a CommandItem child — cmdk would
          suppress CommandEmpty as long as that row is mounted. */}
      {!isLoading && (!candidates || candidates.length === 0) && (
        <div
          data-testid="move-picker-empty"
          className="px-3 py-3 text-[13px] text-[var(--text-muted)] text-center"
        >
          No matching topics
        </div>
      )}
    </>
  );
});
