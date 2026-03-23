'use client';

import { useCallback, useRef } from 'react';
import Editor, { type OnMount, useMonaco } from '@monaco-editor/react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useMonacoTheme } from './hooks/useMonacoTheme';
import type { OpenFile } from './types';

interface MonacoFileEditorProps {
  file: OpenFile;
  onChange?: (content: string) => void;
}

export default function MonacoFileEditor({ file, onChange }: MonacoFileEditorProps) {
  const monaco = useMonaco();
  const theme = useMonacoTheme(monaco);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined && onChange) {
        onChange(value);
      }
    },
    [onChange]
  );

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
