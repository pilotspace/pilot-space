'use client';

/**
 * InlineContentRenderer — Dispatches to the correct renderer based on InlineRendererType.
 *
 * All heavy renderers are dynamically imported via next/dynamic to keep the initial
 * bundle small. The SkeletonPreviewCard is used as the loading fallback for all imports.
 *
 * Content truncation:
 * - code/json: first 30 lines when collapsed
 * - csv: first 11 lines (header + 10 data rows) when collapsed
 * - markdown: no truncation — scrolls within the 300px max-height container
 *
 * The `expanded` prop controls whether truncation is applied. When false (default),
 * only a preview subset of lines is rendered to keep DOM cost low.
 *
 * Renderers are wrapped in a container with reduced padding so they fit the inline
 * card context (existing renderers use p-6 which is too large for note context).
 */

import * as React from 'react';
import dynamic from 'next/dynamic';
import { SkeletonPreviewCard } from './SkeletonPreviewCard';
import type { InlineRendererType } from './is-inline-previewable';
import { getLanguageForFile } from '@/features/artifacts/utils/mime-type-router';

// ---------------------------------------------------------------------------
// Dynamic imports with SkeletonPreviewCard as fallback
// ---------------------------------------------------------------------------

const MarkdownContent = dynamic(
  () =>
    import('@/features/ai/ChatView/MessageList/MarkdownContent').then((m) => ({
      default: m.MarkdownContent,
    })),
  { loading: () => <SkeletonPreviewCard /> }
);

const CsvRenderer = dynamic(
  () =>
    import('@/features/artifacts/components/renderers/CsvRenderer').then((m) => ({
      default: m.CsvRenderer,
    })),
  { loading: () => <SkeletonPreviewCard /> }
);

// ---------------------------------------------------------------------------
// Truncation utilities
// ---------------------------------------------------------------------------

interface TruncateResult {
  truncated: string;
  totalLines: number;
  wasTruncated: boolean;
}

function truncateLines(content: string, maxLines: number): TruncateResult {
  const lines = content.split('\n');
  const totalLines = lines.length;
  if (totalLines <= maxLines) {
    return { truncated: content, totalLines, wasTruncated: false };
  }
  return {
    truncated: lines.slice(0, maxLines).join('\n'),
    totalLines,
    wasTruncated: true,
  };
}

export interface TruncationInfo {
  totalLines: number;
  totalRows: number;
  wasTruncated: boolean;
  /** Human-readable label for the "Show more" expand link. */
  label: string;
}

/**
 * Returns truncation metadata for the footer expand link.
 * CSV row counts are estimated from line count (header not counted in rows).
 * For markdown, truncation is not applied so this always returns wasTruncated: false.
 */
export function getTruncationInfo(
  content: string,
  rendererType: InlineRendererType,
  expanded: boolean
): TruncationInfo {
  if (rendererType === 'markdown') {
    return { totalLines: 0, totalRows: 0, wasTruncated: false, label: '' };
  }

  if (rendererType === 'csv') {
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    // lines[0] is the header; data rows start at index 1
    const totalRows = Math.max(0, lines.length - 1);
    const wasTruncated = !expanded && totalRows > 10;
    return {
      totalLines: lines.length,
      totalRows,
      wasTruncated,
      label: wasTruncated ? `Show more (${totalRows} rows)` : '',
    };
  }

  // code / json
  const lines = content.split('\n');
  const totalLines = lines.length;
  const wasTruncated = !expanded && totalLines > 30;
  return {
    totalLines,
    totalRows: 0,
    wasTruncated,
    label: wasTruncated ? `Show more (${totalLines} lines)` : '',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface InlineContentRendererProps {
  content: string;
  rendererType: InlineRendererType;
  filename: string;
  expanded: boolean;
}

export function InlineContentRenderer({
  content,
  rendererType,
  filename,
  expanded,
}: InlineContentRendererProps) {
  if (rendererType === 'markdown') {
    // Full content, scroll within the 300px card container.
    return (
      <div className="[&>div]:p-3 [&>div]:py-2">
        <React.Suspense fallback={<SkeletonPreviewCard />}>
          <MarkdownContent content={content} />
        </React.Suspense>
      </div>
    );
  }

  if (rendererType === 'code') {
    const { truncated } = truncateLines(content, expanded ? Infinity : 30);
    const language = getLanguageForFile(filename);
    const wrappedContent = '```' + language + '\n' + truncated + '\n```';
    return (
      <div className="[&>div]:p-3 [&>div]:py-2">
        <React.Suspense fallback={<SkeletonPreviewCard />}>
          <MarkdownContent content={wrappedContent} />
        </React.Suspense>
      </div>
    );
  }

  if (rendererType === 'json') {
    // Format JSON then truncate
    let formatted = content;
    try {
      formatted = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      // Malformed JSON — render as-is
    }
    const { truncated } = truncateLines(formatted, expanded ? Infinity : 30);
    const wrappedContent = '```json\n' + truncated + '\n```';
    return (
      <div className="[&>div]:p-3 [&>div]:py-2">
        <React.Suspense fallback={<SkeletonPreviewCard />}>
          <MarkdownContent content={wrappedContent} />
        </React.Suspense>
      </div>
    );
  }

  if (rendererType === 'csv') {
    // Truncate CSV to header + 10 data rows when collapsed.
    // Pass the truncated content string to CsvRenderer so it parses only what's needed.
    const truncated = expanded
      ? content
      : truncateLines(content, 11).truncated;
    return (
      <div className="[&>div]:p-0 overflow-x-auto">
        <React.Suspense fallback={<SkeletonPreviewCard />}>
          <CsvRenderer content={truncated} />
        </React.Suspense>
      </div>
    );
  }

  // Should be unreachable — rendererType is a union of the 4 cases above
  return null;
}
