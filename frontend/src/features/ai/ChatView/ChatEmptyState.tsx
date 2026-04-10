'use client';

const SUGGESTED_PROMPTS = [
  'Create a new note',
  'Show my open issues',
  'Start a project plan',
  'Summarize recent activity',
] as const;

interface ChatEmptyStateProps {
  onPromptClick?: (prompt: string) => void;
}

export function ChatEmptyState({ onPromptClick }: ChatEmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            What can I help you with?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask anything, or try one of these suggestions
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-lg border border-border px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onPromptClick?.(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
