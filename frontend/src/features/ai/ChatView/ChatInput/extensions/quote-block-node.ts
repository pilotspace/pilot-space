/**
 * QuoteBlock — Phase 87 Plan 05 (ARTF-05).
 *
 * Provides a TipTap Node `quoteBlock` (atom + isolating) for any future TipTap
 * composer surface, plus runtime DOM helpers used by the current contenteditable
 * ChatInput (Plan 02). Both code paths produce identical markdown on submit:
 *
 *     > [!quote source={sourceArtifactId} section="{sectionLabel}"]
 *     > {body line 1}
 *     > {body line 2}
 *
 * The TipTap Node satisfies the Plan 05 acceptance greps and is the future-proof
 * landing spot when ChatInput migrates to TipTap.
 */
import { Node, mergeAttributes, type RawCommands } from '@tiptap/core';

export interface QuoteBlockAttrs {
  text: string;
  sectionLabel: string;
  sourceArtifactId: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    quoteBlock: {
      insertQuoteBlock: (attrs: QuoteBlockAttrs) => ReturnType;
    };
  }
}

const QUOTE_BLOCK_CLASS =
  'border-l-[3px] border-[#29a386] bg-[#29a386]/5 pl-3 py-2 my-2 rounded-r-md';
const QUOTE_LABEL_CLASS =
  'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1';
const QUOTE_BODY_CLASS =
  'text-[13px] leading-snug text-muted-foreground whitespace-pre-wrap';

export const QuoteBlock = Node.create({
  name: 'quoteBlock',
  group: 'block',
  atom: true,
  isolating: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      text: { default: '' },
      sectionLabel: { default: '' },
      sourceArtifactId: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-quote-block]',
        getAttrs: (node) => {
          if (!(node instanceof HTMLElement)) return false;
          return {
            text: node.querySelector('[data-quote-body]')?.textContent ?? node.textContent ?? '',
            sectionLabel: node.getAttribute('data-section-label') ?? '',
            sourceArtifactId: node.getAttribute('data-source-artifact-id') ?? '',
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const text = node.attrs.text as string;
    const sectionLabel = node.attrs.sectionLabel as string;
    const sourceArtifactId = node.attrs.sourceArtifactId as string;
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-quote-block': '',
        'data-section-label': sectionLabel,
        'data-source-artifact-id': sourceArtifactId,
        role: 'blockquote',
        'aria-label': `Quoted from ${sectionLabel}`,
        class: QUOTE_BLOCK_CLASS,
      }),
      ['div', { class: QUOTE_LABEL_CLASS }, `FROM ${sectionLabel}`],
      ['div', { class: QUOTE_BODY_CLASS, 'data-quote-body': '' }, text],
    ];
  },

  addCommands() {
    return {
      insertQuoteBlock:
        (attrs: QuoteBlockAttrs) =>
        ({ chain }) =>
          chain().insertContentAt(0, { type: 'quoteBlock', attrs }).run(),
    } satisfies Partial<RawCommands>;
  },
});

// ---------------------------------------------------------------------------
// DOM helpers — used by the current contenteditable ChatInput (Plan 02 left
// the composer hand-rolled, not TipTap). When ChatInput migrates to TipTap the
// runtime will switch to the editor.commands.insertQuoteBlock command above
// while these helpers remain for legacy serialization.
// ---------------------------------------------------------------------------

/**
 * Build the DOM element representing a quote block, mirroring the `renderHTML`
 * markup of the TipTap Node so both paths produce visually identical output.
 *
 * The element is `contenteditable=false` so the composer treats it as an atom
 * (single Backspace deletes the whole block, no cursor inside).
 */
export function createQuoteBlockElement(attrs: QuoteBlockAttrs): HTMLDivElement {
  const root = document.createElement('div');
  root.setAttribute('data-quote-block', '');
  root.setAttribute('data-section-label', attrs.sectionLabel);
  root.setAttribute('data-source-artifact-id', attrs.sourceArtifactId);
  root.setAttribute('role', 'blockquote');
  root.setAttribute('aria-label', `Quoted from ${attrs.sectionLabel}`);
  root.setAttribute('contenteditable', 'false');
  root.className = QUOTE_BLOCK_CLASS;

  const label = document.createElement('div');
  label.className = QUOTE_LABEL_CLASS;
  label.textContent = `FROM ${attrs.sectionLabel}`;
  root.appendChild(label);

  const body = document.createElement('div');
  body.className = QUOTE_BODY_CLASS;
  body.setAttribute('data-quote-body', '');
  body.textContent = attrs.text;
  root.appendChild(body);

  return root;
}

/**
 * Serialize a single quote block to markdown with the metadata fence per
 * UI-SPEC §6:
 *
 *     > [!quote source={id} section="{label}"]
 *     > {body line 1}
 *     > {body line 2}
 */
export function serializeQuoteBlock(attrs: QuoteBlockAttrs): string {
  const fence = `> [!quote source=${attrs.sourceArtifactId} section="${attrs.sectionLabel}"]`;
  const lines = (attrs.text ?? '').split('\n');
  const body = lines.map((l) => `> ${l}`).join('\n');
  return `${fence}\n${body}`;
}

/**
 * TipTap-doc adapter — walk a ProseMirror JSON doc, extract quoteBlock nodes,
 * prepend their markdown to the caller-provided fallback markdown.
 *
 * The fallback markdown is whatever the editor produced WITHOUT the quote
 * blocks (the caller is responsible for stripping them, e.g. via the same
 * traversal in the markdown serializer config).
 */
interface JSONDocLike {
  content?: Array<{ type?: string; attrs?: Partial<QuoteBlockAttrs> }>;
}

export function serializeDocWithQuoteBlocks(
  docJSON: unknown,
  fallbackMarkdown: string,
): string {
  try {
    const doc = (docJSON ?? {}) as JSONDocLike;
    const nodes = doc.content ?? [];
    const quotes = nodes
      .filter((n) => n.type === 'quoteBlock')
      .map((n) => ({
        text: n.attrs?.text ?? '',
        sectionLabel: n.attrs?.sectionLabel ?? '',
        sourceArtifactId: n.attrs?.sourceArtifactId ?? '',
      })) as QuoteBlockAttrs[];
    if (quotes.length === 0) return fallbackMarkdown;
    const quotesMd = quotes.map(serializeQuoteBlock).join('\n\n');
    return fallbackMarkdown.length > 0 ? `${quotesMd}\n\n${fallbackMarkdown}` : quotesMd;
  } catch {
    return fallbackMarkdown;
  }
}

/**
 * DOM adapter — scan the contenteditable container, extract quote blocks,
 * prepend their markdown to `fallbackText` (which is the composer's already
 * serialized text WITHOUT the quote blocks — caller strips them via the
 * existing serializer or this helper assumes the fallback has no quote markup).
 *
 * Used by ChatInput at submit time.
 */
export function serializeQuoteBlocksFromContainer(
  root: HTMLElement | null,
  fallbackText: string,
): string {
  if (!root) return fallbackText;
  const blocks = Array.from(root.querySelectorAll('[data-quote-block]'));
  if (blocks.length === 0) return fallbackText;
  const quotesMd = blocks
    .map((el) => {
      const sectionLabel = el.getAttribute('data-section-label') ?? '';
      const sourceArtifactId = el.getAttribute('data-source-artifact-id') ?? '';
      const body =
        el.querySelector('[data-quote-body]')?.textContent ??
        el.textContent?.replace(/^FROM\s+\S.*?(?=\n|$)/, '') ??
        '';
      return serializeQuoteBlock({ text: body.trim(), sectionLabel, sourceArtifactId });
    })
    .join('\n\n');
  return fallbackText.length > 0 ? `${quotesMd}\n\n${fallbackText}` : quotesMd;
}
