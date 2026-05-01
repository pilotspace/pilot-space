/**
 * PilotSpace SSE Parser - SSE stream connection, parsing, and retry logic.
 *
 * Extracted from PilotSpaceStreamHandler to reduce file size.
 * Handles raw SSE stream connection/consumption and event parsing.
 *
 * @module stores/ai/PilotSpaceSSEParser
 */
import { runInAction } from 'mobx';
import { SSEClient, type SSEEvent } from '@/lib/sse-client';
import type { PilotSpaceStore } from './PilotSpaceStore';
import type { InlineArtifactRef } from '@/components/chat/InlineArtifactCard';
import type { ArtifactTokenKey } from '@/lib/artifact-tokens';

const ARTIFACT_FORMAT_TO_TOKEN: Record<string, ArtifactTokenKey> = {
  md: 'MD',
  html: 'HTML',
};

/**
 * Phase 87.1 Plan 04 — Map the SSE `artifact_created` wire payload (snake_case
 * from the `pilot-files` MCP server) to a frontend `InlineArtifactRef`.
 *
 * Phase 87.2 — when `placeholder_id` is present in the payload, this function
 * returns `null` and callers should use `mapArtifactCreatedSwapPayload` instead.
 *
 * Mirrors the helper in lib/sse-client.ts but is reused here because
 * `consumeSSEStream` / `parseSSEBuffer` paths bypass the SSEClient layer.
 */
function mapArtifactCreatedPayload(data: unknown): InlineArtifactRef | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const artifactId = d['artifact_id'];
  if (typeof artifactId !== 'string' || !artifactId) return null;
  const filenameRaw = d['filename'];
  const formatRaw = d['format'];
  const filename = typeof filenameRaw === 'string' ? filenameRaw : undefined;
  const formatKey = typeof formatRaw === 'string' ? formatRaw.toLowerCase() : '';
  const type: ArtifactTokenKey = ARTIFACT_FORMAT_TO_TOKEN[formatKey] ?? 'MD';
  return {
    id: artifactId,
    type,
    title: filename,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Phase 87.2 — Map the SSE `artifact_generating` wire payload to a placeholder
 * `InlineArtifactRef` with `status: 'generating'`.
 *
 * Wire shape: `{ placeholder_id, filename, format, mime_type }`
 * The `id` is set to `placeholder_id` so the React key stays stable
 * across the swap when `artifact_created` arrives.
 */
function mapArtifactGeneratingPayload(data: unknown): InlineArtifactRef | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const placeholderId = d['placeholder_id'];
  if (typeof placeholderId !== 'string' || !placeholderId) return null;
  const filenameRaw = d['filename'];
  const formatRaw = d['format'];
  const filename = typeof filenameRaw === 'string' ? filenameRaw : 'file';
  const formatKey = typeof formatRaw === 'string' ? formatRaw.toLowerCase() : '';
  const type: ArtifactTokenKey = ARTIFACT_FORMAT_TO_TOKEN[formatKey] ?? 'MD';
  return {
    id: placeholderId,
    type,
    title: filename,
    status: 'generating',
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

/** Maximum retry attempts for retryable errors */
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Manages SSE stream connection, parsing, and retry logic.
 */
export class PilotSpaceSSEParser {
  private client: SSEClient | null = null;
  private _retryCount = 0;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private store: PilotSpaceStore,
    private onEvent: (event: SSEEvent) => void
  ) {}

  /** Connect to a specific SSE stream URL (queue mode). */
  async connectToStream(streamUrl: string): Promise<void> {
    this.resetRetryState();
    const absoluteUrl = streamUrl.startsWith('http')
      ? streamUrl
      : `${API_BASE}${streamUrl.startsWith('/') ? '' : '/'}${streamUrl}`;

    this.client = new SSEClient({
      url: absoluteUrl,
      method: 'GET',
      onMessage: (event: SSEEvent) => this.onEvent(event),
      // Phase 87.1 Plan 04 — legacy append path (no placeholder_id).
      onArtifactCreated: (ref) =>
        runInAction(() => {
          this.store.appendArtifactToStreamingMessage(ref);
        }),
      // Phase 87.2 — swap path: artifact_created with placeholder_id.
      onArtifactCreatedSwap: (payload) =>
        runInAction(() => {
          const d = payload as Record<string, unknown>;
          const placeholderId = typeof d['placeholder_id'] === 'string' ? d['placeholder_id'] : null;
          const artifactId = typeof d['artifact_id'] === 'string' ? d['artifact_id'] : null;
          if (!placeholderId || !artifactId) return;
          const filenameRaw = d['filename'];
          const formatRaw = d['format'];
          const filename = typeof filenameRaw === 'string' ? filenameRaw : undefined;
          const formatKey = typeof formatRaw === 'string' ? formatRaw.toLowerCase() : '';
          const type: ArtifactTokenKey = ARTIFACT_FORMAT_TO_TOKEN[formatKey] ?? 'MD';
          this.store.swapPlaceholderWithArtifact(placeholderId, artifactId, {
            type,
            title: filename,
            updatedAt: new Date().toISOString(),
          });
        }),
      // Phase 87.2 — intercept artifact_generating: push placeholder.
      onArtifactGenerating: (payload) =>
        runInAction(() => {
          const ref = mapArtifactGeneratingPayload(payload);
          if (ref) this.store.appendArtifactToStreamingMessage(ref);
        }),
      // Phase 87.2 — intercept artifact_generation_failed: flip placeholder.
      onArtifactGenerationFailed: (payload) =>
        runInAction(() => {
          const d = payload as Record<string, unknown>;
          const placeholderId = typeof d['placeholder_id'] === 'string' ? d['placeholder_id'] : '';
          const msg = typeof d['message'] === 'string' ? d['message'] : 'Generation failed';
          if (placeholderId) this.store.markArtifactFailed(placeholderId, msg);
        }),
      onComplete: () => {
        runInAction(() => {
          // Phase 87.2 — flush any dangling 'generating' placeholders before
          // clearing streamingState so they don't spin forever.
          this.store.flushGeneratingPlaceholders('Generation interrupted');
          this.store.updateStreamingState({
            isStreaming: false,
            streamContent: '',
            currentMessageId: null,
          });
        });
      },
      onError: (err) => {
        runInAction(() => {
          // Phase 87.2 — flush dangling placeholders on connection error too.
          this.store.flushGeneratingPlaceholders('Generation interrupted');
          this.store.updateStreamingState({
            isStreaming: false,
            streamContent: '',
            currentMessageId: null,
          });
          this.store.error = err.message;
        });
      },
    });

    await this.client.connect();
  }

  /**
   * Consume SSE events from a fetch Response stream (direct mode).
   */
  async consumeSSEStream(response: Response): Promise<void> {
    this.resetRetryState();
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            const events = this.parseSSEBuffer(buffer + '\n\n');
            for (const event of events) {
              this.dispatchEvent(event);
            }
          }
          runInAction(() => {
            // Phase 87.2 — flush dangling 'generating' placeholders on normal completion.
            this.store.flushGeneratingPlaceholders('Generation interrupted');
            this.store.updateStreamingState({
              isStreaming: false,
              streamContent: '',
              currentMessageId: null,
            });
          });
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = this.parseSSEBuffer(buffer);

        const lastDoubleNewline = buffer.lastIndexOf('\n\n');
        if (lastDoubleNewline !== -1) {
          buffer = buffer.slice(lastDoubleNewline + 2);
        }

        for (const event of events) {
          this.dispatchEvent(event);
        }
      }
    } catch (err) {
      runInAction(() => {
        // Phase 87.2 — flush dangling placeholders on stream error too.
        this.store.flushGeneratingPlaceholders('Generation interrupted');
        this.store.updateStreamingState({
          isStreaming: false,
          streamContent: '',
          currentMessageId: null,
        });
        this.store.error = err instanceof Error ? err.message : 'Stream error';
      });
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Phase 87.1 Plan 04 — route a parsed event.
   * `artifact_created` updates the streaming message's artifacts[] directly
   * and is NOT forwarded to the regular onEvent handler.
   *
   * Phase 87.2 — also intercepts `artifact_generating` (push placeholder)
   * and `artifact_generation_failed` (flip placeholder to failed). Neither
   * is forwarded to `onEvent`.
   */
  private dispatchEvent(event: SSEEvent): void {
    if (event.type === 'artifact_generating') {
      const ref = mapArtifactGeneratingPayload(event.data);
      if (ref) {
        runInAction(() => {
          this.store.appendArtifactToStreamingMessage(ref);
        });
      } else {
        console.warn('[sse] dropped malformed artifact_generating event');
      }
      return;
    }

    if (event.type === 'artifact_created') {
      const d = event.data as Record<string, unknown> | null;
      const placeholderId = d && typeof d['placeholder_id'] === 'string' ? d['placeholder_id'] : null;
      const artifactId = d && typeof d['artifact_id'] === 'string' ? d['artifact_id'] : null;

      if (placeholderId && artifactId) {
        // Phase 87.2 — in-place swap: placeholder_id → real artifact.
        const filenameRaw = d?.['filename'];
        const formatRaw = d?.['format'];
        const filename = typeof filenameRaw === 'string' ? filenameRaw : undefined;
        const formatKey = typeof formatRaw === 'string' ? formatRaw.toLowerCase() : '';
        const type: ArtifactTokenKey = ARTIFACT_FORMAT_TO_TOKEN[formatKey] ?? 'MD';
        runInAction(() => {
          this.store.swapPlaceholderWithArtifact(placeholderId, artifactId, {
            type,
            title: filename,
            updatedAt: new Date().toISOString(),
          });
        });
      } else {
        // No placeholder_id — legacy append path (pre-87.2 or reload).
        const ref = mapArtifactCreatedPayload(event.data);
        if (ref) {
          runInAction(() => {
            this.store.appendArtifactToStreamingMessage(ref);
          });
        } else {
          console.warn('[sse] dropped malformed artifact_created event');
        }
      }
      return;
    }

    if (event.type === 'artifact_generation_failed') {
      const d = event.data as Record<string, unknown> | null;
      const placeholderId = d && typeof d['placeholder_id'] === 'string' ? d['placeholder_id'] : null;
      const msg = d && typeof d['message'] === 'string' ? d['message'] : 'Generation failed';
      if (placeholderId) {
        runInAction(() => {
          this.store.markArtifactFailed(placeholderId, msg);
        });
      } else {
        console.warn('[sse] dropped malformed artifact_generation_failed event');
      }
      return;
    }

    this.onEvent(event);
  }

  /** Parse SSE buffer into events. */
  parseSSEBuffer(buffer: string): SSEEvent[] {
    const events: SSEEvent[] = [];
    const eventBlocks = buffer.split('\n\n').filter((block) => block.trim());

    for (const block of eventBlocks) {
      const lines = block.split('\n');
      let eventType = '';
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          eventData += (eventData ? '\n' : '') + line.slice(5).trim();
        }
      }

      if (eventType && eventData) {
        try {
          const data = JSON.parse(eventData);
          events.push({ type: eventType, data });
        } catch {
          // Skip invalid JSON
        }
      }
    }

    return events;
  }

  /** Get Supabase auth headers and workspace context. */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    try {
      const { supabase } = await import('@/lib/supabase');
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch {
      console.warn('Failed to get auth session for chat request');
    }

    const workspaceId = this.store.workspaceId;
    if (workspaceId) {
      headers['X-Workspace-Id'] = workspaceId;
    }

    return headers;
  }

  /** Abort the active SSE client connection. */
  abortClient(): void {
    this.resetRetryState();
    this.client?.abort();
    this.client = null;
  }

  /** Retry connection with exponential backoff. Returns true if retrying. */
  handleRetryableError(errorCode: string, message: string, retryAfter?: number): boolean {
    if (this._retryCount >= MAX_RETRY_ATTEMPTS) {
      this._retryCount = 0;
      return false;
    }

    this._retryCount++;
    const delaySeconds = retryAfter ?? Math.pow(2, this._retryCount - 1);
    this.store.error = `[${errorCode}] ${message} — retrying in ${delaySeconds}s (${this._retryCount}/${MAX_RETRY_ATTEMPTS})`;

    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      if (this.client) {
        this.client.connect();
      }
    }, delaySeconds * 1000);

    return true;
  }

  /** Reset retry state. Call when starting a new stream. */
  resetRetryState(): void {
    this._retryCount = 0;
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
  }
}
