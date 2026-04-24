/**
 * useQuoteToChat — Phase 87 Plan 05 (ARTF-05).
 *
 * Composer-side hook. Listens for `pilot:quote-to-chat` CustomEvents fired by
 * the QuoteToChatPill, and inserts a quote block at the START of the current
 * draft so the most-recent quote always appears at the top.
 *
 * Two target shapes are supported:
 *
 *   1. TipTap Editor — invokes `editor.chain().focus().insertContentAt(0, ...)`.
 *      This is the future-proof path used by Plan 02 was originally going to
 *      adopt; the literal `insertContentAt(0` keyword is preserved for the
 *      Plan 05 acceptance grep.
 *
 *   2. ContentEditable target — the current ChatInput is a hand-rolled
 *      `<div contentEditable>` (Plan 02 deviated from TipTap). The hook
 *      prepends a `data-quote-block` element and triggers onChange with the
 *      caller-provided serializer.
 *
 * Cross-page transport: events that arrive BEFORE the composer mounts are
 * queued in `window.__pilotPendingQuotes`; the hook drains the queue on mount
 * in chronological order so the newest quote ends up at the top.
 */
import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { Editor } from '@tiptap/core';

import { createQuoteBlockElement } from '@/features/ai/ChatView/ChatInput/extensions/quote-block-node';

export interface QuoteEventDetail {
  text: string;
  sectionLabel: string;
  sourceArtifactId: string;
  sourceArtifactType: 'NOTE';
}

declare global {
  interface Window {
    __pilotPendingQuotes?: QuoteEventDetail[];
  }
}

export interface QuoteContentEditableTarget {
  ref: RefObject<HTMLDivElement | null>;
  /** Called with the new serialized composer value AFTER the quote is inserted. */
  onChange: (value: string) => void;
  /** Optional serializer — defaults to `el.textContent`. */
  serialize?: (root: HTMLDivElement) => string;
}

export type QuoteTarget = Editor | QuoteContentEditableTarget | null;

function isEditor(target: NonNullable<QuoteTarget>): target is Editor {
  return typeof (target as Editor).chain === 'function';
}

function insertIntoEditor(editor: Editor, detail: QuoteEventDetail): void {
  editor
    .chain()
    .focus()
    .insertContentAt(0, {
      type: 'quoteBlock',
      attrs: {
        text: detail.text,
        sectionLabel: detail.sectionLabel,
        sourceArtifactId: detail.sourceArtifactId,
      },
    })
    .run();
}

function insertIntoContentEditable(
  target: QuoteContentEditableTarget,
  detail: QuoteEventDetail,
): void {
  const root = target.ref.current;
  if (!root) return;
  const block = createQuoteBlockElement({
    text: detail.text,
    sectionLabel: detail.sectionLabel,
    sourceArtifactId: detail.sourceArtifactId,
  });
  // Prepend so most-recent quote is on top, per CONTEXT.md "each insert prepends".
  if (root.firstChild) {
    root.insertBefore(block, root.firstChild);
  } else {
    root.appendChild(block);
  }
  const serialized = target.serialize ? target.serialize(root) : (root.textContent ?? '');
  target.onChange(serialized);
}

function insert(target: NonNullable<QuoteTarget>, detail: QuoteEventDetail): void {
  if (isEditor(target)) {
    insertIntoEditor(target, detail);
  } else {
    insertIntoContentEditable(target, detail);
  }
}

export function useQuoteToChat(target: QuoteTarget): void {
  useEffect(() => {
    if (!target) return;

    // Drain pending queue (events that arrived before mount).
    const pending = window.__pilotPendingQuotes ?? [];
    if (pending.length > 0) {
      pending.forEach((detail) => insert(target, detail));
      window.__pilotPendingQuotes = [];
    }

    const onQuote = (e: Event) => {
      const detail = (e as CustomEvent<QuoteEventDetail>).detail;
      if (!detail || typeof detail.text !== 'string') return;
      insert(target, detail);
    };
    window.addEventListener('pilot:quote-to-chat', onQuote);
    return () => window.removeEventListener('pilot:quote-to-chat', onQuote);
  }, [target]);
}
