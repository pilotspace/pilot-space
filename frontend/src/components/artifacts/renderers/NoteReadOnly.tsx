/**
 * NoteReadOnly — read-only TipTap render for a Note.
 *
 * Phase 86 peek/focus surface. Minimal extensions (StarterKit only) to keep
 * the drawer bundle lean; inline editing lives on the Note detail page.
 */
'use client';

import * as React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { Content } from '@tiptap/core';
import type { Note } from '@/types/note';
import { cn } from '@/lib/utils';

export interface NoteReadOnlyProps {
  note: Note;
  className?: string;
}

export function NoteReadOnly({ note, className }: NoteReadOnlyProps) {
  const content: Content = React.useMemo(() => {
    // Note.content is JSONContent-compatible; TipTap accepts it directly.
    return (note.content as Content) ?? { type: 'doc', content: [] };
  }, [note.content]);

  const editor = useEditor({
    editable: false,
    extensions: [StarterKit],
    content,
    immediatelyRender: false,
  });

  React.useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  return (
    <article className={cn('flex flex-col gap-3 px-5 py-4', className)}>
      <h1 className="text-xl font-semibold leading-tight">{note.title}</h1>
      {note.summary && <p className="text-sm text-muted-foreground">{note.summary}</p>}
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <EditorContent editor={editor} />
      </div>
    </article>
  );
}
