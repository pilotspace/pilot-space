/**
 * Phase 1 SDK Features (T57-T59) Unit Tests
 *
 * Tests for:
 * - T57: MemoryUpdateEvent type guard + handleMemoryUpdate (no-op pass-through)
 * - T58: CitationEvent type guard + handleCitation (attach citations to message)
 * - T59: ToolInputDeltaEvent type guard + handleToolInputDelta (progressive input rendering)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PilotSpaceStore } from '../PilotSpaceStore';
import { PilotSpaceStreamHandler } from '../PilotSpaceStreamHandler';
import type { AIStore } from '../AIStore';
import {
  isCitationEvent,
  isMemoryUpdateEvent,
  isToolInputDeltaEvent,
} from '../types/events';
import type {
  CitationEvent,
  MemoryUpdateEvent,
  ToolInputDeltaEvent,
} from '../types/events';

// Mock SSEClient
vi.mock('@/lib/sse-client', () => ({
  SSEClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
    isConnected: false,
  })),
}));

// Mock Supabase auth
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
          },
        },
      }),
    },
  },
}));

describe('Phase 1 SDK Features (T57-T59)', () => {
  let store: PilotSpaceStore;
  let handler: PilotSpaceStreamHandler;

  beforeEach(() => {
    const mockAIStore = {} as AIStore;
    store = new PilotSpaceStore(mockAIStore);
    store.setWorkspaceId('test-workspace-id');
    handler = new PilotSpaceStreamHandler(store);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ========================================
  // T58: Citation Event
  // ========================================

  describe('isCitationEvent type guard', () => {
    it('should return true for valid citation event', () => {
      const event = {
        type: 'citation' as const,
        data: {
          messageId: 'msg-1',
          citations: [],
        },
      };

      expect(isCitationEvent(event)).toBe(true);
    });

    it('should return false for non-citation event', () => {
      const event = {
        type: 'text_delta' as const,
        data: { delta: 'hello' },
      };

      expect(isCitationEvent(event)).toBe(false);
    });
  });

  // ========================================
  // T57: Memory Update Event
  // ========================================

  describe('isMemoryUpdateEvent type guard', () => {
    it('should return true for valid memory_update event', () => {
      const event = {
        type: 'memory_update' as const,
        data: {
          operation: 'write',
          key: 'user-pref',
          value: 'dark-mode',
        },
      };

      expect(isMemoryUpdateEvent(event)).toBe(true);
    });

    it('should return false for non-memory_update event', () => {
      const event = {
        type: 'text_delta' as const,
        data: { delta: 'hello' },
      };

      expect(isMemoryUpdateEvent(event)).toBe(false);
    });
  });

  // ========================================
  // T59: Tool Input Delta Event
  // ========================================

  describe('isToolInputDeltaEvent type guard', () => {
    it('should return true for valid tool_input_delta event', () => {
      const event = {
        type: 'tool_input_delta' as const,
        data: {
          toolUseId: 'tc-1',
          toolName: 'extract_issues',
          inputDelta: '{"note',
        },
      };

      expect(isToolInputDeltaEvent(event)).toBe(true);
    });

    it('should return false for non-tool_input_delta event', () => {
      const event = {
        type: 'text_delta' as const,
        data: { delta: 'hello' },
      };

      expect(isToolInputDeltaEvent(event)).toBe(false);
    });
  });

  // ========================================
  // T58: handleCitation
  // ========================================

  describe('handleCitation', () => {
    it('should attach citations to matching message', () => {
      // Seed a message in the store
      store.messages.push({
        id: 'msg-1',
        role: 'assistant',
        content: 'Here is the result.',
        timestamp: new Date(),
      });

      const citationEvent: CitationEvent = {
        type: 'citation',
        data: {
          messageId: 'msg-1',
          citations: [
            {
              sourceType: 'document',
              sourceId: 'note-123',
              sourceTitle: 'Test Note',
              citedText: 'some text',
            },
          ],
        },
      };

      handler.handleCitation(citationEvent);

      const msg = store.messages.find((m) => m.id === 'msg-1');
      expect(msg?.citations).toHaveLength(1);
      expect(msg?.citations?.[0]).toEqual({
        sourceType: 'document',
        sourceId: 'note-123',
        sourceTitle: 'Test Note',
        citedText: 'some text',
      });
    });

    it('should append citations to existing citations array', () => {
      store.messages.push({
        id: 'msg-2',
        role: 'assistant',
        content: 'Result with existing citations.',
        timestamp: new Date(),
        citations: [
          {
            sourceType: 'document',
            sourceId: 'note-100',
            sourceTitle: 'First Note',
            citedText: 'first cited text',
          },
        ],
      });

      const citationEvent: CitationEvent = {
        type: 'citation',
        data: {
          messageId: 'msg-2',
          citations: [
            {
              sourceType: 'issue',
              sourceId: 'issue-456',
              sourceTitle: 'Bug Report',
              citedText: 'second cited text',
            },
          ],
        },
      };

      handler.handleCitation(citationEvent);

      const msg = store.messages.find((m) => m.id === 'msg-2');
      expect(msg?.citations).toHaveLength(2);
      expect(msg?.citations?.[1].sourceId).toBe('issue-456');
    });

    it('should not crash when message ID does not match', () => {
      store.messages.push({
        id: 'msg-existing',
        role: 'assistant',
        content: 'Some content.',
        timestamp: new Date(),
      });

      const citationEvent: CitationEvent = {
        type: 'citation',
        data: {
          messageId: 'msg-nonexistent',
          citations: [
            {
              sourceType: 'document',
              sourceId: 'note-999',
              sourceTitle: 'Missing Note',
              citedText: 'text',
            },
          ],
        },
      };

      // Should not throw
      expect(() => handler.handleCitation(citationEvent)).not.toThrow();

      // Existing message should be unaffected
      const msg = store.messages.find((m) => m.id === 'msg-existing');
      expect(msg?.citations).toBeUndefined();
    });
  });

  // ========================================
  // T59: handleToolInputDelta
  // ========================================

  describe('handleToolInputDelta', () => {
    it('should append input delta to matching tool call', () => {
      // Seed a message with a tool call (input starts as empty string for progressive rendering)
      store.messages.push({
        id: 'msg-tc',
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: [
          {
            id: 'tc-1',
            name: 'extract_issues',
            input: '' as unknown as Record<string, unknown>,
            status: 'pending',
          },
        ],
      });

      const delta1: ToolInputDeltaEvent = {
        type: 'tool_input_delta',
        data: {
          toolUseId: 'tc-1',
          toolName: 'extract_issues',
          inputDelta: '{"note_id":',
        },
      };

      const delta2: ToolInputDeltaEvent = {
        type: 'tool_input_delta',
        data: {
          toolUseId: 'tc-1',
          toolName: 'extract_issues',
          inputDelta: '"note-123"}',
        },
      };

      handler.handleToolInputDelta(delta1);
      handler.handleToolInputDelta(delta2);

      const msg = store.messages[store.messages.length - 1];
      const tc = msg.toolCalls?.find((t) => t.id === 'tc-1');
      expect(tc?.input).toBe('{"note_id":"note-123"}');
    });

    it('should initialize input from null/undefined via fallback', () => {
      store.messages.push({
        id: 'msg-tc-null',
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: [
          {
            id: 'tc-2',
            name: 'summarize_note',
            input: undefined as unknown as Record<string, unknown>,
            status: 'pending',
          },
        ],
      });

      const delta: ToolInputDeltaEvent = {
        type: 'tool_input_delta',
        data: {
          toolUseId: 'tc-2',
          toolName: 'summarize_note',
          inputDelta: '{"text":"hello"}',
        },
      };

      handler.handleToolInputDelta(delta);

      const tc = store.messages[store.messages.length - 1].toolCalls?.find(
        (t) => t.id === 'tc-2'
      );
      expect(tc?.input).toBe('{"text":"hello"}');
    });

    it('should not crash when no matching tool call exists', () => {
      store.messages.push({
        id: 'msg-no-tc',
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: [
          {
            id: 'tc-other',
            name: 'other_tool',
            input: {} as Record<string, unknown>,
            status: 'pending',
          },
        ],
      });

      const delta: ToolInputDeltaEvent = {
        type: 'tool_input_delta',
        data: {
          toolUseId: 'tc-nonexistent',
          toolName: 'extract_issues',
          inputDelta: '{"data":true}',
        },
      };

      expect(() => handler.handleToolInputDelta(delta)).not.toThrow();
    });

    it('should not crash when last message has no tool calls', () => {
      store.messages.push({
        id: 'msg-plain',
        role: 'assistant',
        content: 'Just text, no tools.',
        timestamp: new Date(),
      });

      const delta: ToolInputDeltaEvent = {
        type: 'tool_input_delta',
        data: {
          toolUseId: 'tc-1',
          toolName: 'extract_issues',
          inputDelta: '{}',
        },
      };

      expect(() => handler.handleToolInputDelta(delta)).not.toThrow();
    });
  });

  // ========================================
  // T57: handleMemoryUpdate
  // ========================================

  describe('handleMemoryUpdate', () => {
    it('should not throw for write operation', () => {
      const event: MemoryUpdateEvent = {
        type: 'memory_update',
        data: {
          operation: 'write',
          key: 'user-preference',
          value: { theme: 'dark' },
        },
      };

      expect(() => handler.handleMemoryUpdate(event)).not.toThrow();
    });

    it('should not throw for read operation', () => {
      const event: MemoryUpdateEvent = {
        type: 'memory_update',
        data: {
          operation: 'read',
          key: 'user-preference',
        },
      };

      expect(() => handler.handleMemoryUpdate(event)).not.toThrow();
    });

    it('should not throw for delete operation', () => {
      const event: MemoryUpdateEvent = {
        type: 'memory_update',
        data: {
          operation: 'delete',
          key: 'user-preference',
        },
      };

      expect(() => handler.handleMemoryUpdate(event)).not.toThrow();
    });

    it('should not mutate store state', () => {
      const messagesBefore = store.messages.length;
      const errorBefore = store.error;

      const event: MemoryUpdateEvent = {
        type: 'memory_update',
        data: {
          operation: 'write',
          key: 'context',
          value: 'test',
        },
      };

      handler.handleMemoryUpdate(event);

      expect(store.messages.length).toBe(messagesBefore);
      expect(store.error).toBe(errorBefore);
    });
  });

  // ========================================
  // SSE Event Dispatch Integration
  // ========================================

  describe('handleSSEEvent dispatch', () => {
    it('should route citation event to handleCitation', () => {
      store.messages.push({
        id: 'msg-dispatch',
        role: 'assistant',
        content: 'Test',
        timestamp: new Date(),
      });

      handler.handleSSEEvent({
        type: 'citation',
        data: {
          messageId: 'msg-dispatch',
          citations: [
            {
              sourceType: 'document',
              sourceId: 'doc-1',
              sourceTitle: 'Doc',
              citedText: 'cited',
            },
          ],
        },
      });

      expect(store.messages[0].citations).toHaveLength(1);
    });

    it('should route tool_input_delta event to handleToolInputDelta', () => {
      store.messages.push({
        id: 'msg-tid',
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: [
          {
            id: 'tc-dispatch',
            name: 'test_tool',
            input: '' as unknown as Record<string, unknown>,
            status: 'pending',
          },
        ],
      });

      handler.handleSSEEvent({
        type: 'tool_input_delta',
        data: {
          toolUseId: 'tc-dispatch',
          toolName: 'test_tool',
          inputDelta: '{"key":"val"}',
        },
      });

      const tc = store.messages[0].toolCalls?.find((t) => t.id === 'tc-dispatch');
      expect(tc?.input).toBe('{"key":"val"}');
    });

    it('should route memory_update event to handleMemoryUpdate without error', () => {
      expect(() =>
        handler.handleSSEEvent({
          type: 'memory_update',
          data: {
            operation: 'write',
            key: 'pref',
            value: 42,
          },
        })
      ).not.toThrow();
    });
  });
});
