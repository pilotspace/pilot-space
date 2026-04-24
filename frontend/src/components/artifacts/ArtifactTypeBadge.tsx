/**
 * ArtifactTypeBadge — Uppercase monospace label chip for an artifact type.
 *
 * Spec: `.planning/phases/85-unified-artifact-card-anatomy/85-UI-SPEC.md` §5.
 * Label sourced from `artifactLabel()` (Phase 84 map, extended in Phase 85).
 * Colors sourced from `ARTIFACT_TYPE_TOKENS` (inline style — runtime hex values
 * cannot be interpolated into Tailwind classes).
 */
import { cn } from '@/lib/utils';
import { artifactLabel } from '@/lib/artifact-labels';
import { ARTIFACT_TYPE_TOKENS, type ArtifactTokenKey } from '@/lib/artifact-tokens';

export interface ArtifactTypeBadgeProps {
  type: ArtifactTokenKey;
  className?: string;
}

export function ArtifactTypeBadge({ type, className }: ArtifactTypeBadgeProps) {
  const tokens = ARTIFACT_TYPE_TOKENS[type];
  const label = artifactLabel(type, false).toUpperCase();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider',
        className,
      )}
      style={{ backgroundColor: tokens.badgeBg, color: tokens.badgeText }}
      aria-hidden
    >
      {label}
    </span>
  );
}
