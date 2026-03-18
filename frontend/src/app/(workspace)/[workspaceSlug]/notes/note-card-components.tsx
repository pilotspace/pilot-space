'use client';

/**
 * Note card/list row components extracted from notes page.
 * Includes: NoteGridCard, NoteListRow, GridSkeleton, EmptyState
 */
import { formatDistanceToNow } from 'date-fns';
import { FolderKanban, Pin, Plus } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Note, Project } from '@/types';

export interface NoteCardProps {
  note: Note;
  workspaceSlug: string;
  projectMap: Map<string, Project>;
  onPrefetch: () => void;
}

/**
 * Note card component for grid view
 */
export function NoteGridCard({ note, workspaceSlug, projectMap, onPrefetch }: NoteCardProps) {
  const updatedAt = formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true });
  const topics = note.topics ?? [];
  const linkedIssues = note.linkedIssues ?? [];
  const project = note.projectId ? projectMap.get(note.projectId) : undefined;

  return (
    <Link href={`/${workspaceSlug}/notes/${note.id}`} onMouseEnter={onPrefetch}>
      <Card
        className={cn(
          'group cursor-pointer transition-all duration-200',
          'hover:shadow-warm-md hover:border-primary/20',
          note.isPinned &&
            'ring-1 ring-amber-200/60 dark:ring-amber-700/30 bg-amber-50/30 dark:bg-amber-950/10'
        )}
      >
        <CardContent className="p-5">
          <div className="mb-3 flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <span className="font-display text-base font-semibold text-primary/70">
                {(note.title || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {note.isPinned && <Pin className="h-3.5 w-3.5 text-amber-500" />}
            </div>
          </div>
          <h3 className="mb-1 font-medium text-foreground transition-colors group-hover:text-primary line-clamp-1">
            {note.title || 'Untitled'}
          </h3>

          {/* Project reference */}
          {project && (
            <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground">
              <FolderKanban className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{project.name}</span>
              <div className="h-1 w-10 rounded-full bg-border overflow-hidden flex-shrink-0">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${((project.issueCount - project.openIssueCount) / Math.max(project.issueCount, 1)) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Linked issues with state colors, or content preview/topics fallback */}
          {linkedIssues.length > 0 ? (
            <div className="flex items-center gap-1 mb-3 flex-wrap">
              {linkedIssues.slice(0, 3).map((issue) => (
                <span
                  key={issue.id}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted/50"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: issue.state.color }}
                  />
                  {issue.identifier}
                </span>
              ))}
              {linkedIssues.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{linkedIssues.length - 3}
                </span>
              )}
            </div>
          ) : (
            <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
              {note.summary
                ? note.summary.slice(0, 100)
                : topics.length > 0
                  ? topics.join(', ')
                  : null}
            </p>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {(note.wordCount ?? 0) > 0 ? (
              <span>{note.wordCount!.toLocaleString()} words</span>
            ) : (
              <span />
            )}
            <span>Updated {updatedAt}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Note row component for list view
 */
export function NoteListRow({ note, workspaceSlug, projectMap, onPrefetch }: NoteCardProps) {
  const updatedAt = formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true });
  const topics = note.topics ?? [];
  const linkedIssues = note.linkedIssues ?? [];
  const project = note.projectId ? projectMap.get(note.projectId) : undefined;

  return (
    <Link href={`/${workspaceSlug}/notes/${note.id}`} onMouseEnter={onPrefetch}>
      <div
        className={cn(
          'group flex items-center gap-4 rounded-lg border border-border p-4',
          'transition-all hover:border-primary/30 hover:bg-accent/50',
          note.isPinned &&
            'ring-1 ring-amber-200/60 dark:ring-amber-700/30 bg-amber-50/20 dark:bg-amber-950/10'
        )}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
          <span className="font-display text-lg font-semibold text-primary/70">
            {(note.title || 'U').charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-foreground group-hover:text-primary truncate">
              {note.title || 'Untitled'}
            </h3>
            {note.isPinned && <Pin className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {project && (
              <span className="flex items-center gap-1 truncate">
                <FolderKanban className="h-3 w-3 flex-shrink-0" />
                {project.name}
              </span>
            )}
            {project && topics.length > 0 && <span className="text-border">&middot;</span>}
            <span className="truncate">
              {note.summary
                ? note.summary.slice(0, 80)
                : topics.length > 0
                  ? topics.join(', ')
                  : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0">
          {(note.wordCount ?? 0) > 0 && <span>{note.wordCount!.toLocaleString()} words</span>}
          {linkedIssues.length > 0 && (
            <div className="flex items-center gap-1">
              {linkedIssues.slice(0, 3).map((issue) => (
                <span
                  key={issue.id}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted/50"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: issue.state.color }}
                  />
                  {issue.identifier}
                </span>
              ))}
              {linkedIssues.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{linkedIssues.length - 3}
                </span>
              )}
            </div>
          )}
          <span className="w-24 text-right">{updatedAt}</span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Loading skeleton for grid view
 */
export function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <div className="mb-3 flex items-start justify-between">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-5 w-3/4 mb-2" />
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-2/3 mb-3" />
            <div className="flex justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Empty state component
 */
export function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="relative mb-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/6">
          <span className="font-display text-4xl font-semibold text-primary/40">N</span>
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-lg bg-background shadow-warm-sm border border-border/50">
          <Plus className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <h3 className="font-display text-xl font-semibold text-foreground mb-2">No notes yet</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm leading-relaxed">
        Start capturing your thoughts, ideas, and discussions. Notes are the foundation of your
        workflow.
      </p>
      {onCreate && (
        <Button onClick={onCreate} className="shadow-warm-sm">
          <Plus className="mr-2 h-4 w-4" />
          Create your first note
        </Button>
      )}
    </div>
  );
}
