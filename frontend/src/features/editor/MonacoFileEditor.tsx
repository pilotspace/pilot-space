'use client';

/**
 * MonacoFileEditor - Monaco editor for non-note source files.
 *
 * Supports:
 * - Language-specific syntax highlighting
 * - Monaco keybinding overrides for Cmd+Shift+P (command palette),
 *   Cmd+Shift+O (symbol outline), and Cmd+G (go-to-line)
 * - Action registration for edit and navigate categories
 * - Symbol outline navigation via DOM events
 */

import { useState, useCallback, useEffect } from 'react';
import Editor, { type OnMount, useMonaco } from '@monaco-editor/react';
import type * as monacoNs from 'monaco-editor';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { registerEditActions } from '@/features/command-palette/actions/editActions';
import { registerNavigateActions } from '@/features/command-palette/actions/navigateActions';
import { useMonacoTheme } from './hooks/useMonacoTheme';
import { useTypeScriptDefaults } from './hooks/useTypeScriptDefaults';
import type { OpenFile } from './types';

interface MonacoFileEditorProps {
  file: OpenFile;
  onChange?: (content: string) => void;
}

export default function MonacoFileEditor({ file, onChange }: MonacoFileEditorProps) {
  const monaco = useMonaco();
  const theme = useMonacoTheme(monaco);
  // Configure TS/JS IntelliSense before Editor renders (must precede model creation)
  useTypeScriptDefaults(monaco);
  // Use state (not refs) for values consumed in effects (React 19 refs rule)
  const [editorInstance, setEditorInstance] =
    useState<monacoNs.editor.IStandaloneCodeEditor | null>(null);

  const handleMount: OnMount = useCallback((editor) => {
    setEditorInstance(editor);
  }, []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined && onChange) {
        onChange(value);
      }
    },
    [onChange]
  );

  // Monaco keybinding overrides (intercept when editor focused)
  useEffect(() => {
    if (!editorInstance || !monaco) return;

    // Cmd+Shift+P: open command palette (override Monaco's built-in)
    editorInstance.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP,
      () => {
        window.dispatchEvent(new CustomEvent('command-palette:toggle'));
      }
    );

    // Cmd+Shift+O: toggle symbol outline (override Monaco's built-in go-to-symbol)
    editorInstance.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyO,
      () => {
        window.dispatchEvent(new CustomEvent('symbol-outline:toggle'));
      }
    );

    // Cmd+G: go-to-line using Monaco's built-in dialog
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
      editorInstance.getAction('editor.action.gotoLine')?.run();
    });
  }, [editorInstance, monaco]);

  // Register editor-dependent actions (edit, navigate)
  useEffect(() => {
    if (!editorInstance) return;
    const editor = editorInstance;

    const cleanups = [
      registerEditActions({
        undo: () => editor.trigger('command-palette', 'undo', null),
        redo: () => editor.trigger('command-palette', 'redo', null),
        find: () => editor.getAction('actions.find')?.run(),
        replace: () => editor.getAction('editor.action.startFindReplaceAction')?.run(),
      }),
      registerNavigateActions({
        goToFile: () => {
          window.dispatchEvent(new CustomEvent('quick-open:toggle'));
        },
        goToLine: () => {
          editor.getAction('editor.action.gotoLine')?.run();
        },
        goToSymbol: () => {
          window.dispatchEvent(new CustomEvent('symbol-outline:toggle'));
        },
      }),
    ];
    return () => cleanups.forEach((fn) => fn());
  }, [editorInstance]);

  // Listen for symbol-outline:navigate custom event
  useEffect(() => {
    if (!editorInstance) return;
    const editor = editorInstance;

    function handleNavigate(e: Event) {
      const detail = (e as CustomEvent<{ line: number }>).detail;
      editor.revealLineInCenter(detail.line);
      editor.setPosition({ lineNumber: detail.line, column: 1 });
      editor.focus();
    }
    window.addEventListener('symbol-outline:navigate', handleNavigate);
    return () => window.removeEventListener('symbol-outline:navigate', handleNavigate);
  }, [editorInstance]);

  return (
    <div className="relative h-full w-full" data-lenis-prevent>
      <Editor
        language={file.language}
        value={file.content}
        theme={theme}
        onMount={handleMount}
        onChange={handleChange}
        loading={<Skeleton className="h-full w-full" />}
        options={{
          fontSize: 14,
          lineHeight: 22.4,
          fontFamily: 'var(--font-mono)',
          wordWrap: 'off',
          minimap: { enabled: false },
          lineNumbers: 'on',
          scrollbar: {
            verticalScrollbarSize: 7,
            horizontalScrollbarSize: 7,
          },
          readOnly: file.isReadOnly,
          cursorStyle: 'line',
          cursorBlinking: 'smooth',
          smoothScrolling: true,
        }}
      />

      {/* Read-only badge */}
      {file.isReadOnly && (
        <Badge variant="secondary" className="absolute right-3 top-3 text-xs">
          Read-only
        </Badge>
      )}
    </div>
  );
}
