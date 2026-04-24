/**
 * Tests for the quoteBlock TipTap Node + DOM helpers + markdown serializer.
 * Phase 87 Plan 05 (ARTF-05).
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, it, expect } from 'vitest';

import {
  QuoteBlock,
  createQuoteBlockElement,
  serializeQuoteBlock,
  serializeDocWithQuoteBlocks,
  serializeQuoteBlocksFromContainer,
} from '../quote-block-node';

function makeEditor() {
  return new Editor({
    extensions: [StarterKit, QuoteBlock],
    content: '<p></p>',
  });
}

describe('QuoteBlock TipTap Node', () => {
  it('Test 1: name === "quoteBlock"', () => {
    expect(QuoteBlock.name).toBe('quoteBlock');
  });

  it('Test 2: schema declares group/atom/isolating/selectable', () => {
    const editor = makeEditor();
    try {
      const spec = editor.schema.nodes.quoteBlock?.spec;
      expect(spec).toBeDefined();
      expect(spec?.group).toBe('block');
      expect(spec?.atom).toBe(true);
      expect(spec?.isolating).toBe(true);
      expect(spec?.selectable).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it('Test 3: attrs schema accepts text/sectionLabel/sourceArtifactId', () => {
    const editor = makeEditor();
    try {
      editor
        .chain()
        .insertContentAt(0, {
          type: 'quoteBlock',
          attrs: { text: 'hello', sectionLabel: 'Sec', sourceArtifactId: 'A1' },
        })
        .run();
      const json = editor.getJSON();
      const block = (json.content ?? []).find((n) => n.type === 'quoteBlock');
      expect(block?.attrs?.text).toBe('hello');
      expect(block?.attrs?.sectionLabel).toBe('Sec');
      expect(block?.attrs?.sourceArtifactId).toBe('A1');
    } finally {
      editor.destroy();
    }
  });

  it('Test 4 + 5: parseHTML matches data-quote-block; renderHTML produces FROM label + body', () => {
    const editor = makeEditor();
    try {
      editor.commands.setContent(
        '<div data-quote-block data-section-label="Intro" data-source-artifact-id="N1">' +
          '<div>FROM Intro</div><div>body text</div>' +
          '</div>',
      );
      const html = editor.getHTML();
      expect(html).toContain('data-quote-block');
      expect(html).toContain('FROM ');
    } finally {
      editor.destroy();
    }
  });

  it('Test 6: serializeQuoteBlock produces metadata fence', () => {
    const md = serializeQuoteBlock({
      text: 'body line 1',
      sectionLabel: 'Section 3',
      sourceArtifactId: 'ARTID',
    });
    expect(md).toContain('> [!quote source=ARTID section="Section 3"]');
    expect(md).toContain('> body line 1');
  });

  it('Test 7: multi-line body wraps each line with > prefix', () => {
    const md = serializeQuoteBlock({
      text: 'line one\nline two\nline three',
      sectionLabel: 'S',
      sourceArtifactId: 'X',
    });
    const lines = md.split('\n');
    expect(lines[0]).toBe('> [!quote source=X section="S"]');
    expect(lines[1]).toBe('> line one');
    expect(lines[2]).toBe('> line two');
    expect(lines[3]).toBe('> line three');
  });

  it('Test 8: serializeDocWithQuoteBlocks with no quoteBlock returns fallback unchanged', () => {
    const docJSON = { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] };
    expect(serializeDocWithQuoteBlocks(docJSON, 'hi')).toBe('hi');
  });

  it('Test 8b: serializeDocWithQuoteBlocks prepends quote markdown', () => {
    const docJSON = {
      content: [
        {
          type: 'quoteBlock',
          attrs: { text: 'quoted', sectionLabel: 'Sec', sourceArtifactId: 'A' },
        },
      ],
    };
    const out = serializeDocWithQuoteBlocks(docJSON, 'rest');
    expect(out).toContain('> [!quote source=A section="Sec"]');
    expect(out).toContain('> quoted');
    expect(out.endsWith('rest')).toBe(true);
  });
});

describe('createQuoteBlockElement (DOM builder for contentEditable composer)', () => {
  it('produces a div[data-quote-block] with FROM label and body text', () => {
    const el = createQuoteBlockElement({
      text: 'body content',
      sectionLabel: 'Hello',
      sourceArtifactId: 'N1',
    });
    expect(el.tagName).toBe('DIV');
    expect(el.getAttribute('data-quote-block')).not.toBeNull();
    expect(el.getAttribute('data-section-label')).toBe('Hello');
    expect(el.getAttribute('data-source-artifact-id')).toBe('N1');
    expect(el.textContent).toContain('FROM Hello');
    expect(el.textContent).toContain('body content');
    // Should be non-editable so the composer treats it as an atom
    expect(el.getAttribute('contenteditable')).toBe('false');
  });
});

describe('serializeQuoteBlocksFromContainer (DOM-side composer serializer)', () => {
  it('extracts quote blocks and returns markdown + remaining text', () => {
    const root = document.createElement('div');
    root.appendChild(
      createQuoteBlockElement({
        text: 'quoted body',
        sectionLabel: 'Intro',
        sourceArtifactId: 'A1',
      }),
    );
    const trailingText = document.createTextNode('user message');
    root.appendChild(trailingText);
    const result = serializeQuoteBlocksFromContainer(root, 'user message');
    expect(result).toContain('> [!quote source=A1 section="Intro"]');
    expect(result).toContain('> quoted body');
    expect(result.endsWith('user message')).toBe(true);
  });

  it('returns fallback unchanged when no quote blocks present', () => {
    const root = document.createElement('div');
    root.appendChild(document.createTextNode('plain message'));
    expect(serializeQuoteBlocksFromContainer(root, 'plain message')).toBe('plain message');
  });
});
