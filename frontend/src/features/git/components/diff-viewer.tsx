'use client';

import { observer } from 'mobx-react-lite';
import { useMemo } from 'react';
import { useGitStore } from '@/stores/RootStore';
import { Virtuoso } from 'react-virtuoso';
import { FileText, Binary, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiffLine {
  type: 'header' | 'hunk' | 'addition' | 'deletion' | 'context';
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

interface DiffViewerProps {
  /** Maximum height of the diff viewer. Defaults to '400px'. */
  maxHeight?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a unified diff text into typed line objects with running line numbers.
 * Handles --- / +++ header lines, @@ hunk headers, additions, deletions, and
 * context lines. Line number counters reset on each hunk header.
 */
function parseDiffLines(diffText: string): DiffLine[] {
  const rawLines = diffText.split('\n');
  const lines: DiffLine[] = [];

  let oldLineNo = 0;
  let newLineNo = 0;

  for (const raw of rawLines) {
    // Skip trailing empty line produced by split
    const lastLine = lines[lines.length - 1];
    if (raw === '' && lastLine !== undefined && lastLine.content === '') {
      continue;
    }

    // --- or +++ header lines (must check before single +/- check)
    if (raw.startsWith('---') || raw.startsWith('+++')) {
      lines.push({ type: 'header', content: raw, oldLineNo: null, newLineNo: null });
      continue;
    }

    // @@ hunk header — extract starting line numbers
    if (raw.startsWith('@@')) {
      // Parse @@ -oldStart[,oldCount] +newStart[,newCount] @@
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (match?.[1] && match?.[2]) {
        oldLineNo = parseInt(match[1], 10) - 1;
        newLineNo = parseInt(match[2], 10) - 1;
      }
      lines.push({ type: 'hunk', content: raw, oldLineNo: null, newLineNo: null });
      continue;
    }

    // Addition line
    if (raw.startsWith('+')) {
      newLineNo += 1;
      lines.push({
        type: 'addition',
        content: raw.slice(1),
        oldLineNo: null,
        newLineNo,
      });
      continue;
    }

    // Deletion line
    if (raw.startsWith('-')) {
      oldLineNo += 1;
      lines.push({
        type: 'deletion',
        content: raw.slice(1),
        oldLineNo,
        newLineNo: null,
      });
      continue;
    }

    // Context line (starts with space or is empty within a hunk)
    oldLineNo += 1;
    newLineNo += 1;
    lines.push({
      type: 'context',
      content: raw.startsWith(' ') ? raw.slice(1) : raw,
      oldLineNo,
      newLineNo,
    });
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface DiffLineRowProps {
  line: DiffLine;
}

function DiffLineRow({ line }: DiffLineRowProps) {
  const rowBg =
    line.type === 'addition'
      ? 'bg-green-500/10'
      : line.type === 'deletion'
        ? 'bg-red-500/10'
        : line.type === 'hunk'
          ? 'bg-blue-500/10'
          : undefined;

  const lineNoClass =
    line.type === 'addition'
      ? 'text-green-700 dark:text-green-400'
      : line.type === 'deletion'
        ? 'text-red-700 dark:text-red-400'
        : line.type === 'hunk'
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-muted-foreground';

  const contentClass =
    line.type === 'hunk'
      ? 'font-mono text-sm whitespace-pre text-blue-600 dark:text-blue-400 italic'
      : line.type === 'header'
        ? 'font-mono text-sm whitespace-pre text-muted-foreground italic'
        : 'font-mono text-sm whitespace-pre';

  return (
    <div className={`flex items-stretch min-w-0 ${rowBg ?? ''}`}>
      {/* Old line number gutter */}
      <div
        className={`w-12 shrink-0 select-none text-right pr-2 tabular-nums text-xs font-mono ${lineNoClass} border-r border-border/40 py-0.5`}
      >
        {line.type !== 'addition' && line.oldLineNo !== null ? line.oldLineNo : '\u00a0'}
      </div>

      {/* New line number gutter */}
      <div
        className={`w-12 shrink-0 select-none text-right pr-2 tabular-nums text-xs font-mono ${lineNoClass} border-r border-border/40 py-0.5`}
      >
        {line.type !== 'deletion' && line.newLineNo !== null ? line.newLineNo : '\u00a0'}
      </div>

      {/* Content */}
      <div className={`flex-1 pl-3 py-0.5 overflow-x-auto ${contentClass}`}>
        {line.content || '\u00a0'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const DiffViewer = observer(function DiffViewer({ maxHeight = '400px' }: DiffViewerProps) {
  const gitStore = useGitStore();

  const selectedPath = gitStore.selectedFilePath;
  const isLoading = gitStore.isLoadingDiff;
  const diffError = gitStore.diffError;

  // Find the FileDiff for the currently selected file path
  const fileDiff = selectedPath
    ? (gitStore.fileDiffs.find((d) => d.path === selectedPath) ?? null)
    : null;

  // Memoize parsed lines keyed on the diff text string

  const lines = useMemo(() => {
    if (!fileDiff || fileDiff.is_binary || !fileDiff.diff) return [];
    return parseDiffLines(fileDiff.diff);
  }, [fileDiff]);

  // --- Empty state: no file selected ---
  if (!selectedPath) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 text-muted-foreground"
        style={{ height: maxHeight }}
      >
        <FileText className="size-8 opacity-40" />
        <span className="text-sm">Select a file to view its diff</span>
      </div>
    );
  }

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height: maxHeight }}>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // --- Error state ---
  if (diffError) {
    return (
      <div className="flex items-center justify-center px-4" style={{ height: maxHeight }}>
        <p className="text-destructive text-sm text-center">{diffError}</p>
      </div>
    );
  }

  // --- No diff data yet (fileDiff not loaded) ---
  if (!fileDiff) {
    return (
      <div className="flex items-center justify-center" style={{ height: maxHeight }}>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // --- Binary file placeholder ---
  if (fileDiff.is_binary) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 text-muted-foreground"
        style={{ height: maxHeight }}
      >
        <Binary className="size-8 opacity-40" />
        <span className="text-sm">Binary file — no diff available</span>
      </div>
    );
  }

  // --- Empty diff (no changes) ---
  if (!fileDiff.diff) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height: maxHeight }}
      >
        <span className="text-sm italic">No changes</span>
      </div>
    );
  }

  // --- Normal diff: virtualized rendering ---
  return (
    <div
      className="rounded-md border border-border overflow-hidden bg-background"
      style={{ height: maxHeight }}
    >
      <Virtuoso
        style={{ height: maxHeight }}
        totalCount={lines.length}
        itemContent={(index) => <DiffLineRow line={lines[index]!} />}
      />
    </div>
  );
});
