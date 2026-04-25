/**
 * SkillDetailPage — Phase 91 Plan 04, Task 3.
 *
 * Mounted by `/{workspaceSlug}/skills/[skillSlug]/page.tsx`. Renders a
 * 720px-centered article with:
 *   - Sticky back link to the gallery
 *   - SKILL hero (type chip + title + description + category/feature chips
 *     + monospace metadata row)
 *   - Markdown body via the existing chat MarkdownContent (no react-markdown
 *     newly installed for this surface)
 *   - SkillReferenceFiles collapsible whose row clicks open the Peek Drawer
 *     via `useArtifactPeekState().openSkillFilePeek`.
 *
 * State matrix (UI-SPEC §Surface 2):
 *   - isPending → 4-line skeleton
 *   - 404 (ApiError.status === 404) → "Skill not found" + back link
 *   - other error → "Couldn't load this skill." + Retry
 *   - data → article
 */
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ApiError } from '@/services/api/client';
import { ArtifactTypeBadge } from '@/components/artifacts/ArtifactTypeBadge';
import { MarkdownContent } from '@/features/ai/ChatView/MessageList/MarkdownContent';
import { useArtifactPeekState } from '@/hooks/use-artifact-peek-state';
import { useSkill } from '../hooks';
import { SkillReferenceFiles } from './SkillReferenceFiles';

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '—';
  }
}

export function SkillDetailPage() {
  const params = useParams<{ workspaceSlug: string; skillSlug: string }>();
  const workspaceSlug = params?.workspaceSlug ?? '';
  const skillSlug = params?.skillSlug ?? '';
  const galleryHref = `/${workspaceSlug}/skills`;

  const { data, isPending, isError, error, refetch } = useSkill(skillSlug);
  const peekState = useArtifactPeekState();
  const is404 = error instanceof ApiError && error.status === 404;

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-6 lg:py-10">
      {/* Sticky sub-header — back link */}
      <div className="sticky top-0 z-10 -mx-4 mb-6 flex items-center border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link
          href={galleryHref}
          aria-label="Back to skills gallery"
          className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-[#29a386] focus-visible:text-[#29a386] focus-visible:outline-none"
          data-testid="skill-detail-back-link"
        >
          ← Skills
        </Link>
      </div>

      {isPending && <DetailSkeleton />}

      {is404 && (
        <div className="py-12" data-testid="skill-detail-404">
          <h1 className="text-[15px] font-semibold text-foreground">
            Skill not found
          </h1>
          <p className="mt-2 text-[13px] font-medium text-muted-foreground">
            The skill you&apos;re looking for has been moved or doesn&apos;t exist.
          </p>
          <Link
            href={galleryHref}
            className="mt-4 inline-block text-[13px] font-medium text-[#29a386]"
          >
            ← Back to Skills
          </Link>
        </div>
      )}

      {isError && !is404 && (
        <div role="alert" className="py-12" data-testid="skill-detail-error">
          <h1 className="text-[13px] font-semibold text-foreground">
            Couldn&apos;t load this skill.
          </h1>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 text-[13px] font-medium text-[#29a386] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <article data-testid="skill-detail-article">
          <header className="mb-6">
            <ArtifactTypeBadge type="SKILL" />
            <h1 className="mt-3 text-[15px] font-semibold text-foreground">
              {data.name}
            </h1>
            {data.description && (
              <p className="mt-1 text-[13px] font-medium text-muted-foreground">
                {data.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {data.category && (
                <span
                  className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[13px] font-medium"
                  data-testid="skill-detail-category-chip"
                >
                  {data.category}
                </span>
              )}
              {data.feature_module?.[0] && (
                <span
                  className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[13px] font-medium"
                  data-testid="skill-detail-feature-chip"
                >
                  {data.feature_module[0]}
                </span>
              )}
            </div>
            <p
              className="mt-3 font-mono text-[10px] font-semibold text-muted-foreground"
              data-testid="skill-detail-metadata"
            >
              {(data.category || '—')}
              {' · '}
              {data.feature_module?.[0] ?? '—'}
              {' · Updated '}
              {relativeTime(data.updated_at)}
            </p>
          </header>

          <div
            className="chat-markdown max-w-none"
            data-testid="skill-detail-body"
          >
            <MarkdownContent content={data.body} />
          </div>

          <SkillReferenceFiles
            references={data.reference_files}
            onSelect={(path) => peekState.openSkillFilePeek(data.slug, path)}
          />
        </article>
      )}
    </main>
  );
}

function DetailSkeleton() {
  return (
    <div
      className="animate-pulse"
      role="status"
      aria-label="Loading skill"
      data-testid="skill-detail-skeleton"
    >
      <div className="h-[22px] w-16 rounded bg-muted" />
      <div className="mt-3 h-6 w-2/3 rounded bg-muted" />
      <div className="mt-2 h-4 w-1/2 rounded bg-muted" />
      <div className="mt-6 space-y-2">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-4/5 rounded bg-muted" />
        <div className="h-4 w-3/5 rounded bg-muted" />
      </div>
    </div>
  );
}
