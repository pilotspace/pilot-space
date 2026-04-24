/**
 * ArtifactMeta — Project chip + relative timestamp.
 *
 * Spec: `.planning/phases/85-unified-artifact-card-anatomy/85-UI-SPEC.md` §5.
 */
import { formatDistanceToNow } from 'date-fns';

export interface ArtifactMetaProps {
  projectName?: string;
  projectColor?: string;
  updatedAt: string | Date;
}

export function ArtifactMeta({ projectName, projectColor, updatedAt }: ArtifactMetaProps) {
  const date = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  const relative = formatDistanceToNow(date, { addSuffix: true });
  return (
    <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      {projectName && (
        <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: projectColor ?? 'currentColor' }}
            aria-hidden
          />
          {projectName}
        </span>
      )}
      {projectName && <span aria-hidden>·</span>}
      <time dateTime={date.toISOString()} title={date.toLocaleString()}>
        {relative}
      </time>
    </div>
  );
}
