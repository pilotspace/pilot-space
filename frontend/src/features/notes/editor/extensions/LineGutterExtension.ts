/**
 * LineGutterExtension - VS Code-style line numbers with heading fold/unfold.
 *
 * Line numbers are clickable decoration widgets that highlight the block.
 * Fold widgets are ProseMirror decoration widgets on heading nodes.
 * Collapsed blocks receive `.line-gutter-hidden` class via node decorations.
 * Selected block highlight uses ProseMirror plugin state field (not mutable storage)
 * to guarantee decorations stay in sync.
 *
 * @module features/notes/editor/extensions/LineGutterExtension
 */
import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';

export interface LineGutterOptions {
  /** Node types that can be folded (default: ['heading']) */
  foldableTypes: string[];
}

export interface LineGutterStorage {
  /** Block IDs currently collapsed */
  collapsedBlocks: Set<string>;
}

// TipTap command type augmentation
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineGutter: {
      toggleFold: (blockId: string) => ReturnType;
      expandAll: () => ReturnType;
      collapseAll: () => ReturnType;
      selectBlock: (blockId: string) => ReturnType;
    };
  }
}

const LINE_GUTTER_KEY = new PluginKey('lineGutter');

/** Transaction metadata key for setting the selected block */
const SELECT_BLOCK_META = 'lineGutterSelectBlock';

/** Plugin state: tracks which block is highlighted */
interface LineGutterPluginState {
  selectedBlockId: string | null;
}

/**
 * Given a collapsed heading, returns the set of blockIds that should be hidden.
 * Hides all content between the heading and the next heading of same or higher level.
 */
function computeHiddenBlockIds(doc: ProseMirrorNode, collapsedBlocks: Set<string>): Set<string> {
  const hidden = new Set<string>();
  let hideUntilLevel: number | null = null;

  doc.descendants((node) => {
    const blockId = node.attrs.blockId as string | undefined;

    if (node.type.name === 'heading') {
      const level = node.attrs.level as number;

      if (hideUntilLevel !== null && level <= hideUntilLevel) {
        hideUntilLevel = null;
      }

      if (hideUntilLevel !== null && blockId) {
        hidden.add(blockId);
      }

      if (blockId && collapsedBlocks.has(blockId) && hideUntilLevel === null) {
        hideUntilLevel = level;
      }
    } else {
      if (hideUntilLevel !== null && blockId) {
        hidden.add(blockId);
      }
    }

    return true;
  });

  return hidden;
}

function createFoldWidget(blockId: string, isCollapsed: boolean, toggle: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'line-gutter-fold-widget';
  btn.setAttribute('aria-label', isCollapsed ? 'Expand section' : 'Collapse section');
  btn.setAttribute('data-fold-block', blockId);
  btn.textContent = isCollapsed ? '▸' : '▾';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });

  return btn;
}

function createLineNumberWidget(
  lineNum: number,
  blockId: string,
  blockPos: number,
  editorInstance: Editor
): HTMLElement {
  const span = document.createElement('span');
  span.className = 'line-gutter-number';
  span.textContent = String(lineNum);
  span.setAttribute('role', 'button');
  span.setAttribute('tabindex', '-1');
  span.setAttribute('aria-label', `Select line ${lineNum}`);
  span.setAttribute('data-line-block', blockId);

  // mousedown on the widget element itself — stopPropagation prevents
  // the event from reaching view.dom, so ProseMirror's internal
  // mousedown handler never fires and can't override our selection.
  span.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const view = editorInstance.view;
    const state = view.state;

    // Place cursor at start of block + set selected block via transaction meta
    const cursorPos = blockPos + 1;
    const tr = state.tr.setSelection(TextSelection.create(state.doc, cursorPos));
    tr.setMeta(SELECT_BLOCK_META, blockId);
    view.dispatch(tr);
    view.focus();
  });

  return span;
}

export const LineGutterExtension = Extension.create<LineGutterOptions, LineGutterStorage>({
  name: 'lineGutter',

  addOptions() {
    return {
      foldableTypes: ['heading'],
    };
  },

  addStorage(): LineGutterStorage {
    return {
      collapsedBlocks: new Set<string>(),
    };
  },

  addCommands() {
    return {
      toggleFold:
        (blockId: string) =>
        ({
          dispatch,
          state,
        }: {
          dispatch: ((tr: Transaction) => void) | undefined;
          state: EditorState;
        }) => {
          if (!dispatch) return false;
          const typedStorage = this.storage as LineGutterStorage;

          if (typedStorage.collapsedBlocks.has(blockId)) {
            typedStorage.collapsedBlocks.delete(blockId);
          } else {
            typedStorage.collapsedBlocks.add(blockId);
          }

          dispatch(state.tr);
          return true;
        },

      expandAll:
        () =>
        ({
          dispatch,
          state,
        }: {
          dispatch: ((tr: Transaction) => void) | undefined;
          state: EditorState;
        }) => {
          if (!dispatch) return false;
          const typedStorage = this.storage as LineGutterStorage;
          typedStorage.collapsedBlocks.clear();
          dispatch(state.tr);
          return true;
        },

      collapseAll:
        () =>
        ({
          dispatch,
          state,
        }: {
          dispatch: ((tr: Transaction) => void) | undefined;
          state: EditorState;
        }) => {
          if (!dispatch) return false;
          const typedStorage = this.storage as LineGutterStorage;

          state.doc.descendants((node: ProseMirrorNode) => {
            if (this.options.foldableTypes.includes(node.type.name) && node.attrs.blockId) {
              typedStorage.collapsedBlocks.add(node.attrs.blockId as string);
            }
            return true;
          });

          dispatch(state.tr);
          return true;
        },

      selectBlock:
        (blockId: string) =>
        ({
          dispatch,
          state,
        }: {
          dispatch: ((tr: Transaction) => void) | undefined;
          state: EditorState;
        }) => {
          if (!dispatch) return false;

          let targetPos: number | null = null;

          state.doc.descendants((node: ProseMirrorNode, pos: number) => {
            if (targetPos !== null) return false;
            const bid = node.attrs.blockId as string | undefined;
            if (bid === blockId) {
              targetPos = pos;
              return false;
            }
            return true;
          });

          if (targetPos === null) return false;

          const tr = state.tr.setSelection(TextSelection.create(state.doc, targetPos + 1));
          tr.setMeta(SELECT_BLOCK_META, blockId);
          dispatch(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const { storage, options, editor } = this;

    return [
      new Plugin({
        key: LINE_GUTTER_KEY,

        state: {
          init(): LineGutterPluginState {
            return { selectedBlockId: null };
          },

          apply(tr, prev): LineGutterPluginState {
            // Check for explicit select/clear via transaction metadata
            const selectMeta = tr.getMeta(SELECT_BLOCK_META) as string | null | undefined;
            if (selectMeta !== undefined) {
              return { selectedBlockId: selectMeta };
            }

            // Any other transaction (typing, clicking in content) clears selection
            // unless it's a collapseAll/expandAll/toggleFold (no selection change)
            if (prev.selectedBlockId !== null && tr.selectionSet) {
              return { selectedBlockId: null };
            }

            return prev;
          },
        },

        props: {
          decorations(state) {
            const typedStorage = storage as LineGutterStorage;
            const pluginState = LINE_GUTTER_KEY.getState(state) as
              | LineGutterPluginState
              | undefined;
            const selectedBlockId = pluginState?.selectedBlockId ?? null;
            const hiddenBlocks = computeHiddenBlockIds(state.doc, typedStorage.collapsedBlocks);
            const decorations: Decoration[] = [];
            let lineNum = 0;

            state.doc.descendants((node, pos) => {
              const blockId = node.attrs.blockId as string | undefined;
              if (!blockId) return true;

              lineNum++;

              // Line number widget inside block (pos+1 = inside block content)
              // so it positions relative to the block's `position: relative`
              const contentPos = pos + 1;

              const numWidget = createLineNumberWidget(lineNum, blockId, pos, editor);

              decorations.push(
                Decoration.widget(contentPos, numWidget, {
                  side: -1,
                  key: `num-${blockId}`,
                })
              );

              // Fold widget for foldable nodes (headings)
              if (options.foldableTypes.includes(node.type.name)) {
                const isCollapsed = typedStorage.collapsedBlocks.has(blockId);

                const widget = createFoldWidget(blockId, isCollapsed, () => {
                  editor.commands.toggleFold(blockId);
                });

                decorations.push(
                  Decoration.widget(contentPos, widget, {
                    side: -1,
                    key: `fold-${blockId}`,
                  })
                );
              }

              // Highlight selected block (VS Code-style current line)
              if (selectedBlockId === blockId) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: 'line-gutter-selected',
                  })
                );
              }

              // Hide collapsed blocks
              if (hiddenBlocks.has(blockId)) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: 'line-gutter-hidden',
                  })
                );
              }

              return true;
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
