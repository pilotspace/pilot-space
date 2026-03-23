'use client';

/**
 * MonacoNoteEditor - Main Monaco-based note editor component.
 *
 * Replaces NoteCanvasEditor (TipTap) with Monaco's canvas renderer.
 * Supports markdown content with:
 * - Pilot Space theme (light/dark)
 * - Inline markdown decorations (headings, bold, italic, code, lists, blockquotes)
 * - PM block view zones rendered as React portals
 * - Edit/Preview mode toggle with crossfade transition
 *
 * The `data-lenis-prevent` attribute prevents Lenis scroll hijacking on the editor.
 */

import { useState, useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as monacoNs from 'monaco-editor';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MarkdownPreview } from '@/features/markdown-preview/MarkdownPreview';
import { useMonacoTheme } from './hooks/useMonacoTheme';
import { useMonacoViewZones } from './hooks/useMonacoViewZones';
import { applyMarkdownDecorations } from './decorations/markdownDecorations';
import { EditorToolbar } from './EditorToolbar';
import type { EditorMode } from './types';

interface MonacoNoteEditorProps {
  noteId: string;
  initialContent: string;
  onChange?: (content: string) => void;
  isReadOnly?: boolean;
  className?: string;
}

export default function MonacoNoteEditor({
  noteId,
  initialContent,
  onChange,
  isReadOnly = false,
  className,
}: MonacoNoteEditorProps) {
  const [mode, setMode] = useState<EditorMode>('edit');
  const [content, setContent] = useState(initialContent);
  const [isDirty, setIsDirty] = useState(false);
  // Use state (not refs) for values consumed during render (React 19 refs rule)
  const [monacoInstance, setMonacoInstance] = useState<typeof monacoNs | null>(null);
  const [editorInstance, setEditorInstance] =
    useState<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<monacoNs.IDisposable | null>(null);

  const currentTheme = useMonacoTheme(monacoInstance);
  const viewZonePortals = useMonacoViewZones(editorInstance, content);

  const handleMount: OnMount = useCallback((editor, monacoInst) => {
    setEditorInstance(editor);
    setMonacoInstance(monacoInst);

    // Apply markdown decorations
    decorationsRef.current = applyMarkdownDecorations(editor, monacoInst);

    // Focus the editor
    editor.focus();
  }, []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      const newContent = value ?? '';
      setContent(newContent);
      setIsDirty(true);
      onChange?.(newContent);
    },
    [onChange]
  );

  // Suppress noteId unused warning -- used for keying
  void noteId;

  return (
    <div className={cn('flex flex-col h-full', className)} data-lenis-prevent>
      <EditorToolbar
        mode={mode}
        onModeChange={setMode}
        fileName="note.md"
        isDirty={isDirty}
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

        {/* Preview mode: MarkdownPreview */}
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-200 overflow-auto',
            mode === 'preview' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          )}
        >
          <MarkdownPreview content={content} className="py-8" />
        </div>
      </div>

      {/* View zone portals render into Monaco view zone DOM nodes */}
      {viewZonePortals}
    </div>
  );
}
