'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, FileText, LayoutGrid, FolderKanban, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUGGESTED_PROMPTS = [
  { text: 'Create a new note', icon: FileText },
  { text: 'Show my open issues', icon: LayoutGrid },
  { text: 'Start a project plan', icon: FolderKanban },
  { text: 'What should I focus on today?', icon: Sparkles },
] as const;

const QUICK_ACTIONS = [
  { label: 'Notes', path: 'notes', icon: FileText },
  { label: 'Issues', path: 'issues', icon: LayoutGrid },
  { label: 'Projects', path: 'projects', icon: FolderKanban },
] as const;

interface ChatEmptyStateProps {
  onPromptClick?: (prompt: string) => void;
}

export function ChatEmptyState({ onPromptClick }: ChatEmptyStateProps) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const workspaceSlug = segments[0] ?? '';

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-auto px-4 py-6">
      <div className="w-full max-w-xl space-y-6 sm:space-y-10">
        {/* Logo + greeting */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <Compass className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            What can I help you with?
          </h2>
          <p className="text-sm text-muted-foreground">
            Ask anything, browse your workspace, or try a suggestion
          </p>
        </div>

        {/* Suggested prompts */}
        <div className="grid gap-2">
          {SUGGESTED_PROMPTS.map(({ text, icon: Icon }) => (
            <button
              key={text}
              type="button"
              className={cn(
                'flex items-center gap-3 rounded-xl border border-border px-4 py-3',
                'text-left text-sm text-foreground',
                'transition-colors hover:bg-accent hover:text-accent-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              onClick={() => onPromptClick?.(text)}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              {text}
            </button>
          ))}
        </div>

        {/* Quick navigation — uses Link for no useRouter re-renders */}
        <nav aria-label="Quick navigation" className="flex items-center justify-center gap-2">
          {QUICK_ACTIONS.map(({ label, path, icon: Icon }) => (
            <Link
              key={label}
              href={`/${workspaceSlug}/${path}`}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5',
                'text-xs font-medium text-muted-foreground',
                'transition-colors hover:bg-accent hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
