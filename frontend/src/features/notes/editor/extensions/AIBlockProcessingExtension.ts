/**
 * AIBlockProcessingExtension - TipTap extension for AI block processing indicator
 *
 * Adds `.ai-block-processing` class to blocks being processed by AI.
 * Uses ProseMirror DecorationSet to apply node decorations.
 *
 * Processing block IDs are read from `editor.storage.aiBlockProcessing.processingBlockIds`.
 * NoteCanvas updates this storage when content_update SSE events arrive.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface AIBlockProcessingOptions {
  /** Block ID attribute name (must match BlockIdExtension) */
  attributeName: string;
}

export interface AIBlockProcessingStorage {
  /** Block IDs currently being processed by AI */
  processingBlockIds: string[];
}

const AI_BLOCK_PROCESSING_KEY = new PluginKey('aiBlockProcessing');

export const AIBlockProcessingExtension = Extension.create<AIBlockProcessingOptions>({
  name: 'aiBlockProcessing',

  addOptions() {
    return {
      attributeName: 'blockId',
    };
  },

  addStorage(): AIBlockProcessingStorage {
    return {
      processingBlockIds: [],
    };
  },

  addProseMirrorPlugins() {
    const { storage, options } = this;

    return [
      new Plugin({
        key: AI_BLOCK_PROCESSING_KEY,
        props: {
          decorations(state) {
            const typedStorage = storage as AIBlockProcessingStorage;
            const processingBlockIds = typedStorage.processingBlockIds;

            if (!processingBlockIds || processingBlockIds.length === 0) {
              return DecorationSet.empty;
            }

            const processingSet = new Set(processingBlockIds);
            const { attributeName } = options;
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              const blockId = node.attrs[attributeName] as string | undefined;
              if (blockId && processingSet.has(blockId)) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: 'ai-block-processing',
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

export default AIBlockProcessingExtension;
