'use client';

import { observer } from 'mobx-react-lite';
import { useRouter } from 'next/navigation';
import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Building2,
  Check,
  ChevronsUpDown,
  FileText,
  FolderKanban,
  LayoutGrid,
  Loader2,
  Settings,
  Ticket,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUIStore, useWorkspaceStore } from '@/stores';
import { workspacesApi } from '@/services/api/workspaces';
import { addRecentWorkspace } from '@/components/workspace-selector';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toSlug } from '@/lib/slug';
import { getLastWorkspacePath, getOrderedRecentWorkspaces } from '@/lib/workspace-nav';
import { useSwitcherQueryStringSync } from '@/hooks/useSwitcherQueryStringSync';
import { useSettingsModal } from '@/features/settings/settings-modal-context';
import { ApiError } from '@/services/api/client';
import type { Workspace } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG_PATTERN = /^[a-z0-9-]*$/;

// ---------------------------------------------------------------------------
// JUMP TO items (NAV-02 — Phase 84 routes /tasks and /topics)
// ---------------------------------------------------------------------------

interface JumpToItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** When `null`, onSelect opens the settings modal instead of routing. */
  path: ((slug: string) => string) | null;
}

const JUMP_TO_ITEMS: JumpToItem[] = [
  { id: 'projects', label: 'Projects', icon: FolderKanban, path: (slug) => `/${slug}/projects` },
  { id: 'tasks', label: 'Tasks', icon: Ticket, path: (slug) => `/${slug}/tasks` },
  { id: 'topics', label: 'Topics', icon: FileText, path: (slug) => `/${slug}/topics` },
  { id: 'artifacts', label: 'All artifacts', icon: LayoutGrid, path: (slug) => `/${slug}/artifacts` },
  { id: 'members', label: 'Members', icon: Users, path: (slug) => `/${slug}/members` },
  { id: 'settings', label: 'Settings', icon: Settings, path: null },
];

// ---------------------------------------------------------------------------
// CreateWorkspaceDialog — internal, not exported
// ---------------------------------------------------------------------------

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateWorkspaceDialog = observer(function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps) {
  const workspaceStore = useWorkspaceStore();
  const router = useRouter();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Tracks the slug that was last validated so we don't re-check on unchanged values
  const lastCheckedSlugRef = useRef<string>('');

  const reset = useCallback(() => {
    setName('');
    setSlug('');
    setSlugManuallyEdited(false);
    setSlugError(null);
    setIsCheckingSlug(false);
    setIsCreating(false);
    setSubmitError(null);
    lastCheckedSlugRef.current = '';
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) reset();
      onOpenChange(nextOpen);
    },
    [onOpenChange, reset]
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setName(value);
      if (!slugManuallyEdited) {
        setSlug(toSlug(value));
        setSlugError(null);
        lastCheckedSlugRef.current = '';
      }
    },
    [slugManuallyEdited]
  );

  const handleSlugChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 48);
    setSlug(raw);
    setSlugManuallyEdited(true);
    setSlugError(null);
    lastCheckedSlugRef.current = '';
  }, []);

  const validateSlugAvailability = useCallback(async () => {
    const trimmed = slug.trim();
    if (!trimmed) return;
    if (!SLUG_PATTERN.test(trimmed)) {
      setSlugError('Only lowercase letters, numbers, and hyphens are allowed.');
      return;
    }
    if (trimmed === lastCheckedSlugRef.current) return;

    setIsCheckingSlug(true);
    setSlugError(null);
    try {
      await workspacesApi.get(trimmed);
      // Resolved → slug is taken
      setSlugError('Slug already taken — try another.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // 404 = slug is free
        setSlugError(null);
      } else {
        // Network / 5xx — block submission, show error
        setSlugError('Unable to check availability. Please try again.');
      }
    } finally {
      lastCheckedSlugRef.current = trimmed;
      setIsCheckingSlug(false);
    }
  }, [slug]);

  const isFormValid =
    name.trim().length > 0 &&
    slug.trim().length > 0 &&
    slugError === null &&
    !isCheckingSlug &&
    !isCreating;

  const handleCreate = useCallback(async () => {
    if (!isFormValid) return;

    setIsCreating(true);
    setSubmitError(null);

    try {
      const workspace = await workspaceStore.createWorkspace({
        name: name.trim(),
        slug: slug.trim(),
      });

      if (workspace) {
        addRecentWorkspace(workspace.slug);
        handleOpenChange(false);
        router.push(`/${workspace.slug}`);
      } else {
        setSubmitError(workspaceStore.error ?? 'Failed to create workspace.');
      }
    } catch {
      setSubmitError('Unexpected error. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }, [isFormValid, name, slug, workspaceStore, handleOpenChange, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && isFormValid) {
        void handleCreate();
      }
    },
    [isFormValid, handleCreate]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Create workspace</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Workspaces are shared environments for your team.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Name field */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-name" className="text-xs font-medium">
              Name
            </Label>
            <Input
              id="ws-name"
              value={name}
              onChange={handleNameChange}
              placeholder="My Workspace"
              className="h-8 text-sm"
              autoComplete="off"
              maxLength={100}
              aria-required="true"
            />
          </div>

          {/* Slug field */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-slug" className="text-xs font-medium">
              Slug
              <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                (used in URL)
              </span>
            </Label>
            <div className="relative">
              <Input
                id="ws-slug"
                value={slug}
                onChange={handleSlugChange}
                onBlur={() => void validateSlugAvailability()}
                placeholder="my-workspace"
                className={cn(
                  'h-8 text-sm pr-8',
                  slugError && 'border-destructive focus-visible:ring-destructive'
                )}
                autoComplete="off"
                maxLength={48}
                aria-required="true"
                aria-describedby="ws-slug-hint"
                aria-invalid={slugError !== null}
              />
              {isCheckingSlug && (
                <Loader2
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </div>

            <p id="ws-slug-hint" className="text-[10px] text-muted-foreground">
              {isCheckingSlug ? (
                'Checking availability...'
              ) : slugError ? (
                <span className="text-destructive">{slugError}</span>
              ) : (
                <>Lowercase letters, numbers, and hyphens only. Max 48 chars.</>
              )}
            </p>
          </div>

          {/* Submit error */}
          {submitError && (
            <p role="alert" className="text-xs text-destructive">
              {submitError}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleOpenChange(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => void handleCreate()}
            disabled={!isFormValid}
            aria-busy={isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden="true" />
                Creating...
              </>
            ) : (
              'Create workspace'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

// ---------------------------------------------------------------------------
// WorkspacePill — exported trigger button (Surface 2 anchor)
// ---------------------------------------------------------------------------

interface WorkspacePillProps {
  /** Display name shown inside the pill. */
  name: string;
  /** Used for aria-label in collapsed/icon-only contexts. */
  ariaLabel?: string;
  onClick?: () => void;
}

export const WorkspacePill = observer(function WorkspacePill({
  name,
  ariaLabel,
  onClick,
}: WorkspacePillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="workspace-pill"
      aria-label={ariaLabel ?? 'Switch workspace'}
      className={cn(
        'flex h-9 items-center gap-2 rounded-full border border-[var(--border-card)]',
        'bg-[var(--surface-page)] px-3 min-w-[200px] max-w-[208px]',
        'transition-colors hover:bg-[var(--surface-input)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
      )}
    >
      <Building2 className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
      <span className="flex-1 truncate text-left text-[13px] font-medium text-[var(--text-heading)]">
        {name}
      </span>
      <ChevronsUpDown
        className="h-3 w-3 shrink-0 text-[var(--text-muted)]"
        aria-hidden="true"
      />
    </button>
  );
});

// ---------------------------------------------------------------------------
// WorkspaceSwitcher — exported (Popover + cmdk Surface 2)
// ---------------------------------------------------------------------------

interface WorkspaceSwitcherProps {
  currentSlug: string;
  collapsed?: boolean;
}

export const WorkspaceSwitcher = observer(function WorkspaceSwitcher({
  currentSlug,
  collapsed,
}: WorkspaceSwitcherProps) {
  const uiStore = useUIStore();
  const workspaceStore = useWorkspaceStore();
  const router = useRouter();
  const settings = useSettingsModal();

  // Bidirectional sync between ?switcher=1 and uiStore.workspaceSwitcherOpen
  useSwitcherQueryStringSync();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) uiStore.openWorkspaceSwitcher();
      else uiStore.closeWorkspaceSwitcher();
    },
    [uiStore]
  );

  const currentWorkspace: Workspace | undefined =
    workspaceStore.getWorkspaceBySlug(currentSlug) ?? workspaceStore.currentWorkspace ?? undefined;

  const displayName = currentWorkspace?.name ?? currentSlug;

  // Resolve the WORKSPACES list (recency-first, alphabetical fallback).
  // We always emit alphabetical leftovers after recents so single-workspace
  // users (no recents recorded yet) still see their workspace listed.
  const workspacesToShow = useMemo<Workspace[]>(() => {
    const recents = getOrderedRecentWorkspaces(workspaceStore);
    const ordered: Workspace[] = [...recents];
    const seen = new Set(ordered.map((w) => w.id));
    for (const w of workspaceStore.workspaceList) {
      if (!seen.has(w.id)) {
        ordered.push(w);
        seen.add(w.id);
      }
    }
    return ordered;
    // observer() + reading workspaceList inside the closure is enough for MobX
    // to track recomputes when workspaces are added/removed; we don't need it
    // in the dep array.
  }, [workspaceStore]);

  // Slug used by JUMP TO row navigation. Falls back to first known workspace
  // if currentWorkspace is unset (rare, e.g. first-render race).
  const currentWorkspaceSlug =
    workspaceStore.currentWorkspace?.slug ??
    currentSlug ??
    workspaceStore.workspaceList[0]?.slug ??
    '';

  const handleSelectWorkspace = useCallback(
    (ws: Workspace) => {
      addRecentWorkspace(ws.slug);
      const lastPath = getLastWorkspacePath(ws.slug);
      router.push(lastPath ?? `/${ws.slug}`);
      uiStore.closeWorkspaceSwitcher();
    },
    [router, uiStore]
  );

  const handleSelectJumpTo = useCallback(
    (item: JumpToItem) => {
      if (item.path === null) {
        // Settings: open modal, not router push
        settings.openSettings();
      } else if (currentWorkspaceSlug) {
        router.push(item.path(currentWorkspaceSlug));
      }
      uiStore.closeWorkspaceSwitcher();
    },
    [router, settings, uiStore, currentWorkspaceSlug]
  );

  const handleOpenCreate = useCallback(() => {
    uiStore.closeWorkspaceSwitcher();
    setCreateDialogOpen(true);
  }, [uiStore]);

  // ---------------------------------------------------------------------------
  // Popover content — shared between collapsed (Tooltip-wrapped) and expanded.
  // ---------------------------------------------------------------------------

  const popoverContent = (
    <PopoverContent
      side="bottom"
      align="start"
      sideOffset={8}
      className="w-[320px] rounded-2xl p-0 bg-[var(--surface-page)] border border-[var(--border-card)]"
      style={{ boxShadow: 'var(--shadow-floating)' }}
    >
      <Command className="bg-transparent">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-card)]">
          <CommandInput
            placeholder="Jump to…"
            className="text-[15px] placeholder:text-[var(--text-muted)] font-medium border-0 px-0 h-8"
          />
          <kbd className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--surface-input)] text-[var(--text-muted)]">
            ⌘K
          </kbd>
        </div>
        <CommandList className="max-h-[400px] p-2">
          <CommandEmpty className="py-6 text-center text-[13px] text-[var(--text-muted)]">
            No matches.
          </CommandEmpty>

          <CommandGroup heading="WORKSPACES">
            {workspacesToShow.map((ws, idx) => {
              const isActive = workspaceStore.currentWorkspaceId === ws.id;
              return (
                <CommandItem
                  key={ws.id}
                  value={`ws-${ws.slug}-${ws.name}`}
                  onSelect={() => handleSelectWorkspace(ws)}
                  data-testid={`switcher-ws-${ws.slug}`}
                  className={cn(
                    'gap-2 rounded-md px-2 py-2',
                    isActive && 'bg-[var(--surface-input)]'
                  )}
                >
                  <Building2
                    className={cn(
                      'h-4 w-4 shrink-0',
                      isActive
                        ? 'text-[var(--brand-primary)]'
                        : 'text-[var(--text-muted)]'
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-[13px] text-[var(--text-heading)]">
                    {ws.name}
                  </span>
                  {idx === 1 && (
                    <kbd className="font-mono text-[10px] text-[var(--text-muted)]">⌘2</kbd>
                  )}
                  {idx === 2 && (
                    <kbd className="font-mono text-[10px] text-[var(--text-muted)]">⌘3</kbd>
                  )}
                  {isActive && (
                    <Check
                      className="h-4 w-4 text-[var(--brand-primary)]"
                      aria-label="Current workspace"
                      data-testid={`switcher-active-check-${ws.slug}`}
                    />
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandGroup heading="JUMP TO">
            {JUMP_TO_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.id}
                  value={`jump-${item.id}-${item.label}`}
                  onSelect={() => handleSelectJumpTo(item)}
                  data-testid={`switcher-jump-${item.id}`}
                  className="gap-2 rounded-md px-2 py-2"
                >
                  <Icon
                    className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-[13px] text-[var(--text-heading)]">
                    {item.label}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>

        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-card)]">
          <button
            type="button"
            onClick={handleOpenCreate}
            data-testid="switcher-new-workspace"
            className="text-[13px] font-medium text-[var(--brand-primary)] hover:text-[var(--brand-dark)] focus-visible:outline-none focus-visible:underline"
          >
            + New workspace
          </button>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">↵ to jump</span>
        </div>
      </Command>
    </PopoverContent>
  );

  // ---------------------------------------------------------------------------
  // Collapsed sidebar — show icon-only trigger inside Tooltip
  // ---------------------------------------------------------------------------

  if (collapsed) {
    return (
      <>
        <Popover open={uiStore.workspaceSwitcherOpen} onOpenChange={handleOpenChange}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid="workspace-pill"
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Switch workspace (current: ${displayName})`}
                  aria-haspopup="dialog"
                  aria-expanded={uiStore.workspaceSwitcherOpen}
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">{displayName}</TooltipContent>
          </Tooltip>
          {popoverContent}
        </Popover>
        <CreateWorkspaceDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Expanded sidebar — full WorkspacePill trigger
  // ---------------------------------------------------------------------------

  return (
    <>
      <Popover open={uiStore.workspaceSwitcherOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <WorkspacePill
            name={displayName}
            ariaLabel="Switch workspace"
          />
        </PopoverTrigger>
        {popoverContent}
      </Popover>

      <CreateWorkspaceDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </>
  );
});
