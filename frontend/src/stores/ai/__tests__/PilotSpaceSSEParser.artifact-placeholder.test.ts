/**
 * Phase 87.2 — PilotSpaceSSEParser placeholder lifecycle tests.
 *
 * Verifies three event paths in the direct-mode (fetch Response / dispatchEvent):
 *   1. artifact_generating → appendArtifactToStreamingMessage with status='generating'
 *   2. artifact_created + placeholder_id → swapPlaceholderWithArtifact (in-place swap)
 *   3. artifact_generation_failed → markArtifactFailed
 *   4. stream completion flushes dangling 'generating' placeholders
 *
 * Uses the internal `parseSSEBuffer` + `dispatchEvent` path (direct mode) because
 * that is the path exercised by `consumeSSEStream` and is the one we can trigger
 * synchronously without mocking ReadableStream.
 *
 * @module stores/ai/__tests__/PilotSpaceSSEParser.artifact-placeholder.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runInAction } from 'mobx';

// ---- Module mocks (must be hoisted before imports) --------------------------

vi.mock('@/lib/sse-client', () => ({
  SSEClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
    isConnected: false,
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

vi.mock('@/services/auth/providers', () => ({
  getAuthProviderSync: vi.fn(() => ({
    getToken: vi.fn().mockResolvedValue('test-token'),
  })),
}));

// ---- Imports ----------------------------------------------------------------

import { PilotSpaceStore } from '../PilotSpaceStore';
import { PilotSpaceSSEParser } from '../PilotSpaceSSEParser';
import type { AIStore } from '../AIStore';
import type { InlineArtifactRef } from '@/components/chat/InlineArtifactCard';

// ---- Helpers ----------------------------------------------------------------

function makeStore(): PilotSpaceStore {
  const mockAIStore = {} as AIStore;
  return new PilotSpaceStore(mockAIStore);
}

function addStreamingMessage(store: PilotSpaceStore, msgId = 'msg-stream-1'): void {
  runInAction(() => {
    store.messages = [
      {
        id: msgId,
        role: 'assistant',
        content: 'Generating…',
        timestamp: new Date(),
      },
    ];
    store.streamingState = {
      ...store.streamingState,
      isStreaming: true,
      currentMessageId: msgId,
    };
  });
}

function buildSSEFrame(eventType: string, data: Record<string, unknown>): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

function getArtifacts(store: PilotSpaceStore, msgId = 'msg-stream-1'): InlineArtifactRef[] {
  return store.messages.find((m) => m.id === msgId)?.artifacts ?? [];
}

// ---- Tests ------------------------------------------------------------------

describe('PilotSpaceSSEParser — Phase 87.2 placeholder lifecycle', () => {
  let store: PilotSpaceStore;
  let parser: PilotSpaceSSEParser;
  const onEvent = vi.fn();

  beforeEach(() => {
    store = makeStore();
    parser = new PilotSpaceSSEParser(store, onEvent);
    onEvent.mockReset();
    addStreamingMessage(store);
  });

  it('Test 1: artifact_generating → appends placeholder with status=generating', () => {
    const frame = buildSSEFrame('artifact_generating', {
      placeholder_id: 'ph-uuid-1',
      filename: 'report.md',
      format: 'md',
      mime_type: 'text/markdown',
    });

    const events = parser.parseSSEBuffer(frame);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('artifact_generating');

    // Simulate direct-mode dispatchEvent path
    for (const event of events) {
      // Access private method via any-cast (test introspection)
      (parser as unknown as { dispatchEvent: (e: typeof event) => void }).dispatchEvent(event);
    }

    const artifacts = getArtifacts(store);
    expect(artifacts).toHaveLength(1);
    const placeholder = artifacts[0]!;
    expect(placeholder.id).toBe('ph-uuid-1');
    expect(placeholder.status).toBe('generating');
    expect(placeholder.title).toBe('report.md');
    expect(placeholder.type).toBe('MD');
    // onEvent NOT called — generating is intercepted
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('Test 2: artifact_created with placeholder_id → in-place swap (status=ready, realArtifactId set)', () => {
    // First push a generating placeholder
    runInAction(() => {
      store.appendArtifactToStreamingMessage({
        id: 'ph-uuid-2',
        type: 'MD',
        title: 'spec.md',
        status: 'generating',
      });
    });

    const frame = buildSSEFrame('artifact_created', {
      artifact_id: 'real-art-uuid-2',
      placeholder_id: 'ph-uuid-2',
      filename: 'spec.md',
      mime_type: 'text/markdown',
      size_bytes: 512,
      format: 'md',
    });

    const events = parser.parseSSEBuffer(frame);
    for (const event of events) {
      (parser as unknown as { dispatchEvent: (e: typeof event) => void }).dispatchEvent(event);
    }

    const artifacts = getArtifacts(store);
    expect(artifacts).toHaveLength(1); // replaced in-place, not appended
    const swapped = artifacts[0]!;
    // React key (id) stays as placeholder_id — no remount
    expect(swapped.id).toBe('ph-uuid-2');
    expect(swapped.status).toBe('ready');
    expect(swapped.realArtifactId).toBe('real-art-uuid-2');
    expect(swapped.title).toBe('spec.md');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('Test 3: artifact_created WITHOUT placeholder_id → legacy append (backward compat)', () => {
    const frame = buildSSEFrame('artifact_created', {
      artifact_id: 'real-art-uuid-3',
      filename: 'notes.md',
      mime_type: 'text/markdown',
      size_bytes: 128,
      format: 'md',
    });

    const events = parser.parseSSEBuffer(frame);
    for (const event of events) {
      (parser as unknown as { dispatchEvent: (e: typeof event) => void }).dispatchEvent(event);
    }

    const artifacts = getArtifacts(store);
    expect(artifacts).toHaveLength(1);
    const appended = artifacts[0]!;
    // Legacy path: id = artifact_id directly
    expect(appended.id).toBe('real-art-uuid-3');
    expect(appended.status).toBeUndefined();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('Test 4: artifact_generation_failed → flips placeholder to status=failed', () => {
    // Push a generating placeholder first
    runInAction(() => {
      store.appendArtifactToStreamingMessage({
        id: 'ph-uuid-4',
        type: 'MD',
        title: 'broken.md',
        status: 'generating',
      });
    });

    const frame = buildSSEFrame('artifact_generation_failed', {
      placeholder_id: 'ph-uuid-4',
      error_code: 'FILE_TOO_LARGE',
      message: 'Content exceeds 10 MB limit',
    });

    const events = parser.parseSSEBuffer(frame);
    for (const event of events) {
      (parser as unknown as { dispatchEvent: (e: typeof event) => void }).dispatchEvent(event);
    }

    const artifacts = getArtifacts(store);
    expect(artifacts).toHaveLength(1);
    const failed = artifacts[0]!;
    expect(failed.id).toBe('ph-uuid-4');
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('Content exceeds 10 MB limit');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('Test 5: flushGeneratingPlaceholders flips dangling generating → failed on stream end', () => {
    // Two placeholders: one generating, one already ready
    runInAction(() => {
      store.appendArtifactToStreamingMessage({
        id: 'ph-uuid-5a',
        type: 'MD',
        title: 'pending.md',
        status: 'generating',
      });
      store.appendArtifactToStreamingMessage({
        id: 'ph-uuid-5b',
        type: 'MD',
        title: 'done.md',
        status: 'ready',
        realArtifactId: 'real-5b',
      });
    });

    runInAction(() => {
      store.flushGeneratingPlaceholders('Generation interrupted');
    });

    const artifacts = getArtifacts(store);
    const pending = artifacts.find((a) => a.id === 'ph-uuid-5a')!;
    const done = artifacts.find((a) => a.id === 'ph-uuid-5b')!;
    expect(pending.status).toBe('failed');
    expect(pending.errorMessage).toBe('Generation interrupted');
    // ready artifact untouched
    expect(done.status).toBe('ready');
  });

  it('Test 6: two concurrent placeholders — independent swap by id', () => {
    // Simulate two simultaneous create_file calls in one turn
    runInAction(() => {
      store.appendArtifactToStreamingMessage({
        id: 'ph-a',
        type: 'MD',
        title: 'file-a.md',
        status: 'generating',
      });
      store.appendArtifactToStreamingMessage({
        id: 'ph-b',
        type: 'HTML',
        title: 'file-b.html',
        status: 'generating',
      });
    });

    // Only swap ph-b
    runInAction(() => {
      store.swapPlaceholderWithArtifact('ph-b', 'real-b', {
        type: 'HTML',
        title: 'file-b.html',
        updatedAt: new Date().toISOString(),
      });
    });

    const artifacts = getArtifacts(store);
    expect(artifacts).toHaveLength(2);
    const a = artifacts.find((x) => x.id === 'ph-a')!;
    const b = artifacts.find((x) => x.id === 'ph-b')!;
    expect(a.status).toBe('generating'); // untouched
    expect(b.status).toBe('ready');
    expect(b.realArtifactId).toBe('real-b');
  });

  it('Test 7: malformed artifact_generating (missing placeholder_id) → dropped silently', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const frame = buildSSEFrame('artifact_generating', {
      filename: 'noid.md',
      format: 'md',
    });

    const events = parser.parseSSEBuffer(frame);
    for (const event of events) {
      (parser as unknown as { dispatchEvent: (e: typeof event) => void }).dispatchEvent(event);
    }

    const artifacts = getArtifacts(store);
    expect(artifacts).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dropped malformed artifact_generating'));
    warnSpy.mockRestore();
  });
});
