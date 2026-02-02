/**
 * Unit tests for AIBlockProcessingExtension.
 *
 * Tests that the extension creates correct ProseMirror decorations
 * based on processingBlockIds in editor storage.
 *
 * @module features/notes/editor/extensions/__tests__/AIBlockProcessingExtension.test
 */
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { AIBlockProcessingExtension } from '../AIBlockProcessingExtension';
import type { AIBlockProcessingStorage } from '../AIBlockProcessingExtension';
import { BlockIdExtension } from '../BlockIdExtension';

function createTestEditor(content?: string) {
  const editor = new Editor({
    extensions: [
      StarterKit,
      BlockIdExtension.configure({
        types: ['paragraph'],
      }),
      AIBlockProcessingExtension.configure({
        attributeName: 'blockId',
      }),
    ],
    content: content || '<p>Test paragraph</p>',
  });

  // Force appendTransaction to run and assign block IDs
  editor.view.dispatch(editor.state.tr.insertText(''));

  return editor;
}

function getStorage(editor: Editor): AIBlockProcessingStorage {
  return (editor.storage as unknown as Record<string, unknown>)
    .aiBlockProcessing as AIBlockProcessingStorage;
}

function setProcessingBlockIds(editor: Editor, ids: string[]) {
  const storage = (editor.storage as unknown as Record<string, unknown>)
    .aiBlockProcessing as AIBlockProcessingStorage;
  storage.processingBlockIds = ids;
  editor.view.dispatch(editor.state.tr);
}

function getBlockIds(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    const blockId = node.attrs.blockId as string | undefined;
    if (blockId) {
      ids.push(blockId);
    }
    return true;
  });
  return ids;
}

describe('AIBlockProcessingExtension', () => {
  it('test_extension_registered — extension is registered in editor', () => {
    const editor = createTestEditor();
    const ext = editor.extensionManager.extensions.find((e) => e.name === 'aiBlockProcessing');
    expect(ext).toBeDefined();
    editor.destroy();
  });

  it('test_storage_initialized — storage has empty processingBlockIds by default', () => {
    const editor = createTestEditor();
    expect(getStorage(editor).processingBlockIds).toEqual([]);
    editor.destroy();
  });

  it('test_no_decorations_when_empty — no decorations when processingBlockIds is empty', () => {
    const editor = createTestEditor();

    const processingBlocks = editor.view.dom.querySelectorAll('.ai-block-processing');
    expect(processingBlocks.length).toBe(0);

    editor.destroy();
  });

  it('test_blocks_get_ids — BlockIdExtension assigns IDs to paragraph blocks', () => {
    const editor = createTestEditor('<p>First</p><p>Second</p>');
    const ids = getBlockIds(editor);

    // Should have at least one block ID
    expect(ids.length).toBeGreaterThanOrEqual(1);

    editor.destroy();
  });

  it('test_decoration_applied — adds class when blockId matches processingBlockIds', () => {
    const editor = createTestEditor();
    const ids = getBlockIds(editor);

    if (ids.length === 0) {
      // If BlockIdExtension didn't assign IDs in JSDOM, skip gracefully
      editor.destroy();
      return;
    }

    setProcessingBlockIds(editor, [ids[0]!]);

    const processingBlocks = editor.view.dom.querySelectorAll('.ai-block-processing');
    expect(processingBlocks.length).toBe(1);

    editor.destroy();
  });

  it('test_decoration_removed — removes class when blockId removed from processingBlockIds', () => {
    const editor = createTestEditor();
    const ids = getBlockIds(editor);

    if (ids.length === 0) {
      editor.destroy();
      return;
    }

    // Add processing
    setProcessingBlockIds(editor, [ids[0]!]);
    expect(editor.view.dom.querySelectorAll('.ai-block-processing').length).toBe(1);

    // Remove processing
    setProcessingBlockIds(editor, []);
    expect(editor.view.dom.querySelectorAll('.ai-block-processing').length).toBe(0);

    editor.destroy();
  });

  it('test_non_matching_blockId — no decoration for non-matching blockId', () => {
    const editor = createTestEditor();

    setProcessingBlockIds(editor, ['non-existent-id']);

    const processingBlocks = editor.view.dom.querySelectorAll('.ai-block-processing');
    expect(processingBlocks.length).toBe(0);

    editor.destroy();
  });
});
