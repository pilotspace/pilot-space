/**
 * Phase 87.1 Plan 04 — SSE artifact_created event handler.
 *
 * Verifies SSEClient parser and the new onArtifactCreated callback:
 *  - artifact_created data shape (snake_case wire) is mapped to
 *    InlineArtifactRef shape (camelCase, ArtifactTokenKey type).
 *  - format='md' → type='MD'; format='html' → type='HTML'.
 *  - Missing artifact_id is dropped silently with a console.warn.
 *  - Multiple events accumulate in order (caller's responsibility, but
 *    the callback must fire once per event).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

vi.mock('@/services/auth/providers', () => ({
  getAuthProviderSync: () => ({ getToken: async () => null }),
}));

import { SSEClient, type SSEClientOptions } from '../sse-client';
import type { InlineArtifactRef } from '@/components/chat/InlineArtifactCard';

/**
 * Build a Response whose body streams a fixed series of SSE event blocks.
 */
function buildSSEResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const ev of events) {
        controller.enqueue(encoder.encode(ev));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function makeOptions(
  partial: Partial<SSEClientOptions> & {
    onArtifactCreated?: (ref: InlineArtifactRef) => void;
  } = {},
): SSEClientOptions & { onArtifactCreated?: (ref: InlineArtifactRef) => void } {
  return {
    url: 'http://localhost/test',
    onMessage: () => {},
    ...partial,
  };
}

describe('SSEClient — artifact_created event', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps format=md → InlineArtifactRef{type: "MD"}', async () => {
    const captured: InlineArtifactRef[] = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      buildSSEResponse([
        'event:artifact_created\ndata:{"artifact_id":"abc","filename":"r.md","mime_type":"text/markdown","size_bytes":12,"format":"md"}\n\n',
      ]),
    );
    const client = new SSEClient(
      makeOptions({
        onArtifactCreated: (ref) => captured.push(ref),
      }),
    );
    await client.connect();
    expect(fetchMock).toHaveBeenCalled();

    expect(captured).toHaveLength(1);
    const ref = captured[0]!;
    expect(ref.id).toBe('abc');
    expect(ref.type).toBe('MD');
    expect(ref.title).toBe('r.md');
    expect(typeof ref.updatedAt).toBe('string');
    // ISO-8601: "YYYY-MM-DDTHH:MM:SS"
    expect(ref.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('maps format=html → InlineArtifactRef{type: "HTML"}', async () => {
    const captured: InlineArtifactRef[] = [];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      buildSSEResponse([
        'event:artifact_created\ndata:{"artifact_id":"id-2","filename":"q.html","mime_type":"text/html","size_bytes":42,"format":"html"}\n\n',
      ]),
    );
    const client = new SSEClient(
      makeOptions({ onArtifactCreated: (r) => captured.push(r) }),
    );
    await client.connect();
    expect(captured).toHaveLength(1);
    expect(captured[0]!.type).toBe('HTML');
    expect(captured[0]!.title).toBe('q.html');
  });

  it('accumulates multiple artifact_created events in order', async () => {
    const captured: InlineArtifactRef[] = [];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      buildSSEResponse([
        'event:artifact_created\ndata:{"artifact_id":"a","filename":"a.md","mime_type":"text/markdown","size_bytes":1,"format":"md"}\n\n',
        'event:artifact_created\ndata:{"artifact_id":"b","filename":"b.html","mime_type":"text/html","size_bytes":2,"format":"html"}\n\n',
      ]),
    );
    const client = new SSEClient(
      makeOptions({ onArtifactCreated: (r) => captured.push(r) }),
    );
    await client.connect();
    expect(captured.map((r) => r.id)).toEqual(['a', 'b']);
    expect(captured.map((r) => r.type)).toEqual(['MD', 'HTML']);
  });

  it('drops events with missing artifact_id and warns to console', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const captured: InlineArtifactRef[] = [];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      buildSSEResponse([
        'event:artifact_created\ndata:{"filename":"oops.md","format":"md"}\n\n',
      ]),
    );
    const client = new SSEClient(
      makeOptions({ onArtifactCreated: (r) => captured.push(r) }),
    );
    await client.connect();
    expect(captured).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('still delivers non-artifact events to onMessage', async () => {
    const messages: { type: string; data: unknown }[] = [];
    const captured: InlineArtifactRef[] = [];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      buildSSEResponse([
        'event:text_delta\ndata:{"delta":"hi"}\n\n',
        'event:artifact_created\ndata:{"artifact_id":"x","filename":"r.md","mime_type":"text/markdown","size_bytes":1,"format":"md"}\n\n',
      ]),
    );
    const client = new SSEClient(
      makeOptions({
        onMessage: (e) => messages.push({ type: e.type, data: e.data }),
        onArtifactCreated: (r) => captured.push(r),
      }),
    );
    await client.connect();
    // Non-artifact event flows through onMessage; artifact_created is intercepted
    // by onArtifactCreated and SHOULD NOT also hit onMessage (avoid double-handling).
    expect(messages.find((m) => m.type === 'text_delta')).toBeTruthy();
    expect(messages.find((m) => m.type === 'artifact_created')).toBeFalsy();
    expect(captured).toHaveLength(1);
    expect(captured[0]!.id).toBe('x');
  });
});
