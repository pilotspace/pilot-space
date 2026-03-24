'use client';

/**
 * MonacoNoteEditor - Main Monaco-based note editor component.
 *
 * Replaces NoteCanvasEditor (TipTap) with Monaco's canvas renderer.
 * Supports markdown content with:
 * - Pilot Space theme (light/dark)
 * - Inline markdown decorations (headings, bold, italic, code, lists, blockquotes)
 * - PM block view zones rendered as React portals
 * - AI ghost text inline completions
 * - Slash commands (/) and @ mentions
 * - Yjs collaboration with remote cursors
 * - Edit/Preview mode toggle with crossfade transition
 *
 * All Monaco features are composed through the useMonacoNote hook.
 * The `data-lenis-prevent` attribute prevents Lenis scroll hijacking on the editor.
 */

import { useState, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as monacoNs from 'monaco-editor';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MarkdownPreview } from '@/features/markdown-preview/MarkdownPreview';
import { useMonacoNote } from './hooks/useMonacoNote';
import { EditorToolbar } from './EditorToolbar';
import type { EditorMode } from './types';
import type { GhostTextFetcher } from './hooks/useMonacoGhostText';
import type { MemberFetcher } from './hooks/useMonacoSlashCmd';
import type { CollabUser } from './hooks/useMonacoCollab';

interface MonacoNoteEditorProps {
  noteId: string;
  initialContent: string;
  onChange?: (content: string) => void;
  isReadOnly?: boolean;
  className?: string;
  /** Ghost text AI completion fetcher */
  ghostTextFetcher?: GhostTextFetcher;
  /** Workspace member fetcher for @ mentions */
  memberFetcher?: MemberFetcher;
  /** Enable Yjs collaboration */
  collabEnabled?: boolean;
  /** Supabase client for collaboration transport */
  supabase?: SupabaseClient;
  /** Current user for collaboration cursors */
  user?: CollabUser;
}

/** No-op ghost text fetcher (returns empty string) */
const noopGhostTextFetcher: GhostTextFetcher = async () => '';

/** Default anonymous user for collab */
const defaultUser: CollabUser = { id: 'anonymous', name: 'Anonymous' };

export default function MonacoNoteEditor({
  noteId,
  initialContent,
  onChange,
  isReadOnly = false,
  className,
  ghostTextFetcher = noopGhostTextFetcher,
  memberFetcher,
  collabEnabled = false,
  supabase,
  user = defaultUser,
}: MonacoNoteEditorProps) {
  const [mode, setMode] = useState<EditorMode>('edit');
  const [content, setContent] = useState(initialContent);
  // Use state (not refs) for values consumed during render (React 19 refs rule)
  const [monacoInstance, setMonacoInstance] = useState<typeof monacoNs | null>(null);
  const [editorInstance, setEditorInstance] =
    useState<monacoNs.editor.IStandaloneCodeEditor | null>(null);

  // Compose all Monaco features through the composite hook
  const { theme: currentTheme, viewZonePortals } = useMonacoNote({
    noteId,
    editor: editorInstance,
    monacoInstance,
    content,
    ghostTextFetcher,
    memberFetcher,
    collabEnabled: collabEnabled && !!supabase,
    supabase: supabase as SupabaseClient, // Safe: collab disabled when supabase is undefined
    user,
  });

  const handleMount: OnMount = useCallback((editor, monacoInst) => {
    setEditorInstance(editor);
    setMonacoInstance(monacoInst);

    // Focus the editor
    editor.focus();
  }, []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      const newContent = value ?? '';
      setContent(newContent);
      onChange?.(newContent);
    },
    [onChange]
  );

  return (
    <div className={cn('flex flex-col h-full', className)} data-lenis-prevent>
      <EditorToolbar
        mode={mode}
        onModeChange={setMode}
        fileName="note.md"
        isDirty={false}
        isReadOnly={isReadOnly}
        language="markdown"
      />

      {/* Crossfade wrapper: 200ms opacity transition per UI-SPEC */}
      <div className="flex-1 relative overflow-hidden">
        {/* Edit mode: Monaco editor */}
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-200',
            mode === 'edit' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          )}
        >
          <Editor
            defaultLanguage="markdown"
            defaultValue={initialContent}
            theme={currentTheme}
            onMount={handleMount}
            onChange={handleChange}
            loading={<Skeleton className="h-full w-full" />}
            options={{
              fontSize: 14,
              lineHeight: 22.4, // 14 * 1.6
              fontFamily: 'var(--font-mono)',
              wordWrap: 'on',
              minimap: { enabled: false },
              lineNumbers: 'on',
              glyphMargin: true,
              scrollbar: {
                verticalScrollbarSize: 7,
                horizontalScrollbarSize: 7,
                verticalHasArrows: false,
              },
              padding: { top: 16 },
              renderLineHighlight: 'line',
              cursorStyle: 'line',
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              readOnly: isReadOnly,
            }}
          />
        </div>

        {/* Preview mode: MarkdownPreview (unmounted in edit mode to avoid remark pipeline on every keystroke) */}
        {mode === 'preview' && (
          <div className="absolute inset-0 overflow-auto z-10">
            <MarkdownPreview content={content} className="py-8" />
          </div>
        )}
      </div>

      {/* View zone portals render into Monaco view zone DOM nodes */}
      {viewZonePortals}
    </div>
  );
}
