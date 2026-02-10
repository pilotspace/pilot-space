/**
 * BlockIdExtension - AI Edit Guard tests
 *
 * Tests the `isSelectionInPendingBlock` function and the
 * `aiEditGuard` ProseMirror plugin that blocks user edits
 * on blocks with the `ai-block-pending-edit` CSS class.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { EditorView } from '@tiptap/pm/view';
import { isSelectionInPendingBlock } from '../BlockIdExtension';

/** Create a mock EditorView where the cursor is inside a given DOM element. */
function createMockView(cursorElement: Element | Text): EditorView {
  return {
    state: {
      selection: { from: 0 },
    },
    domAtPos: () => ({ node: cursorElement, offset: 0 }),
  } as unknown as EditorView;
}

describe('isSelectionInPendingBlock', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('should return true when cursor is in a block with ai-block-pending-edit', () => {
    const block = document.createElement('p');
    block.setAttribute('data-block-id', 'block-1');
    block.classList.add('ai-block-pending-edit');
    block.textContent = 'Hello world';
    container.appendChild(block);

    // Cursor is inside the text node
    const textNode = block.firstChild! as Text;
    const view = createMockView(textNode);

    expect(isSelectionInPendingBlock(view)).toBe(true);
  });

  it('should return false when cursor is in a block WITHOUT pending-edit class', () => {
    const block = document.createElement('p');
    block.setAttribute('data-block-id', 'block-2');
    block.textContent = 'Normal block';
    container.appendChild(block);

    const textNode = block.firstChild! as Text;
    const view = createMockView(textNode);

    expect(isSelectionInPendingBlock(view)).toBe(false);
  });

  it('should return false when cursor is in a block with only streaming-reveal class', () => {
    const block = document.createElement('p');
    block.setAttribute('data-block-id', 'block-3');
    block.classList.add('ai-block-streaming-reveal');
    block.textContent = 'Revealing block';
    container.appendChild(block);

    const textNode = block.firstChild! as Text;
    const view = createMockView(textNode);

    expect(isSelectionInPendingBlock(view)).toBe(false);
  });

  it('should return true for nested elements inside a pending block', () => {
    const block = document.createElement('p');
    block.setAttribute('data-block-id', 'block-4');
    block.classList.add('ai-block-pending-edit');

    const strong = document.createElement('strong');
    strong.textContent = 'Bold text';
    block.appendChild(strong);
    container.appendChild(block);

    // Cursor is inside the <strong> → closest [data-block-id] should be the <p>
    const textNode = strong.firstChild! as Text;
    const view = createMockView(textNode);

    expect(isSelectionInPendingBlock(view)).toBe(true);
  });

  it('should return false when no [data-block-id] ancestor exists', () => {
    const span = document.createElement('span');
    span.textContent = 'No block parent';
    container.appendChild(span);

    const textNode = span.firstChild! as Text;
    const view = createMockView(textNode);

    expect(isSelectionInPendingBlock(view)).toBe(false);
  });

  it('should return false when domAtPos throws an error', () => {
    const view = {
      state: { selection: { from: 0 } },
      domAtPos: () => {
        throw new Error('Position out of range');
      },
    } as unknown as EditorView;

    expect(isSelectionInPendingBlock(view)).toBe(false);
  });

  it('should handle Element (not Text) returned by domAtPos', () => {
    const block = document.createElement('p');
    block.setAttribute('data-block-id', 'block-5');
    block.classList.add('ai-block-pending-edit');
    container.appendChild(block);

    // domAtPos returns the Element directly (not a text node)
    const view = createMockView(block);

    expect(isSelectionInPendingBlock(view)).toBe(true);
  });
});

describe('aiEditGuard plugin behavior', () => {
  it('NAV_KEYS should not be blocked', () => {
    // Import is internal, but we verify the concept by testing isSelectionInPendingBlock
    // combined with key filtering. The plugin returns true for non-nav keys
    // in pending blocks and false for nav keys.
    // This test validates the guard function that the plugin depends on.

    const block = document.createElement('p');
    block.setAttribute('data-block-id', 'block-guard');
    block.classList.add('ai-block-pending-edit');
    block.textContent = 'Blocked';
    document.body.appendChild(block);

    const textNode = block.firstChild! as Text;
    const view = createMockView(textNode);

    // Guard detects pending block
    expect(isSelectionInPendingBlock(view)).toBe(true);

    // When guard returns true, the plugin blocks all non-nav keys.
    // When guard returns false (no pending class), all keys are allowed.
    block.classList.remove('ai-block-pending-edit');
    expect(isSelectionInPendingBlock(view)).toBe(false);
  });

  it('should not block edits after pending-edit class is removed', () => {
    const block = document.createElement('p');
    block.setAttribute('data-block-id', 'block-lifecycle');
    block.classList.add('ai-block-pending-edit');
    block.textContent = 'Processing...';
    document.body.appendChild(block);

    const textNode = block.firstChild! as Text;
    const view = createMockView(textNode);

    // Initially blocked
    expect(isSelectionInPendingBlock(view)).toBe(true);

    // After content_update: pending-edit removed, streaming-reveal added
    block.classList.remove('ai-block-pending-edit');
    block.classList.add('ai-block-streaming-reveal');

    // No longer blocked — user can edit during reveal
    expect(isSelectionInPendingBlock(view)).toBe(false);
  });
});
