'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, FileText, LayoutGrid, FolderKanban, Sparkles, GitPullRequest } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PromptCategory {
  label: string;
  prompts: readonly { text: string; icon: typeof FileText }[];
}

const PROMPT_CATEGORIES: PromptCategory[] = [
  {
    label: 'Write',
    prompts: [
      { text: 'Create a new note', icon: FileText },
      { text: 'Draft a spec document', icon: FileText },
    ],
  },
  {
    label: 'Plan',
    prompts: [
      { text: 'Start a project plan', icon: FolderKanban },
      { text: 'Show my open issues', icon: LayoutGrid },
    ],
  },
  {
    label: 'Review',
    prompts: [
      { text: 'Review a pull request', icon: GitPullRequest },
      { text: 'What should I focus on today?', icon: Sparkles },
    ],
  },
];

const QUICK_ACTIONS = [
  { label: 'Notes', path: 'notes', icon: FileText },
  { label: 'Issues', path: 'issues', icon: LayoutGrid },
  { label: 'Projects', path: 'projects', icon: FolderKanban },
] as const;

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

interface ChatEmptyStateProps {
  onPromptClick?: (prompt: string) => void;
  userName?: string;
  sidebarCollapsed?: boolean;
}

export function ChatEmptyState({ onPromptClick, userName, sidebarCollapsed }: ChatEmptyStateProps) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const workspaceSlug = segments[0] ?? '';

  const greeting = userName
    ? `${getGreeting()}, ${userName.split(' ')[0]}.`
    : `${getGreeting()}.`;

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-auto px-4 py-6">
      <div className="w-full max-w-xl space-y-6 sm:space-y-8">
        {/* Greeting */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
              <Compass className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {greeting}
              </h2>
              <p className="text-sm text-muted-foreground">
                Write notes, plan projects, extract issues, review code.
              </p>
            </div>
          </div>
        </div>

        {/* Categorized prompts */}
        <div className="space-y-4">
          {PROMPT_CATEGORIES.map((category) => (
            <div key={category.label}>
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {category.label}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {category.prompts.map(({ text, icon: Icon }) => (
                  <button
                    key={text}
                    type="button"
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border border-border px-3.5 py-2.5',
                      'text-left text-sm text-foreground',
                      'transition-colors hover:bg-accent hover:text-accent-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    )}
                    onClick={() => onPromptClick?.(text)}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{text}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Quick navigation — only when sidebar is collapsed */}
        {sidebarCollapsed && (
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
        )}
      </div>
    </div>
  );
}
