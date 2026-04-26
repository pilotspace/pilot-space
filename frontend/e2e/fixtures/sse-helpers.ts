/**
 * sse-helpers.ts — wait for typed SSE-emitted UI mutations.
 *
 * Phase 94 Plan 03 Task 1 — historical context: the planner specced a
 * `window.addEventListener('chat-sse', ...)` mechanism. That window
 * event does NOT exist in the codebase: SSE frames flow
 * `PilotSpaceStreamHandler` -> store actions (e.g. `applyAppliedEvent`,
 * `applyRevertedEvent`) -> React re-render. The store does NOT
 * dispatch a window CustomEvent.
 *
 * Re-grounded mechanism: predicate is a JSON-serializable shallow-equality
 * `match` object. NO runtime code-eval — only static value comparison.
 *
 * Two strategies are exposed:
 *   1. `waitForSseEvent` — wait for a HTTP response matching the SSE
 *      stream URL pattern, then parse server-sent frames.
 *   2. `waitForApiResponse` — wait for a specific apiClient POST/GET
 *      to complete (matching url substring + status). Predicate is the
 *      JSON-serializable `match` object applied to the parsed JSON body.
 *
 * Specs SHOULD prefer `expect(...).toBeVisible()` for UI-level assertions
 * (Playwright auto-retry is the cleanest mechanism). Use the helpers
 * here when an explicit network handshake is the synchronization
 * contract — e.g. proposal Accept must round-trip and re-render before
 * we assert the AppliedReceipt.
 */

import type { Page, Response } from '@playwright/test';

export interface WaitOptions {
  /**
   * JSON-serializable shallow-equality predicate. The helper checks
   *   `Object.entries(match).every(([k, v]) => bodyJson[k] === v)`
   * Only string/number/boolean/null comparisons are supported — keep
   * matching simple; the security model forbids runtime code-eval.
   */
  match?: Record<string, string | number | boolean | null>;
  timeoutMs?: number;
}

/**
 * Wait for a JSON HTTP response on a URL matching `urlSubstring` with
 * status `expectedStatus` and a body that satisfies the shallow-equality
 * `match` predicate.
 */
export async function waitForApiResponse<T = Record<string, unknown>>(
  page: Page,
  urlSubstring: string,
  options: WaitOptions & { expectedStatus?: number } = {}
): Promise<T> {
  const { match = {}, timeoutMs = 10_000, expectedStatus = 200 } = options;
  const response: Response = await page.waitForResponse(
    (r) => r.url().includes(urlSubstring) && r.status() === expectedStatus,
    { timeout: timeoutMs }
  );
  const body = (await response.json()) as Record<string, unknown>;
  for (const [k, v] of Object.entries(match)) {
    if (body[k] !== v) {
      throw new Error(
        `[sse-helpers] Response from ${urlSubstring} did not match: ` +
          `expected ${k}=${String(v)}, got ${String(body[k])}`
      );
    }
  }
  return body as T;
}

/**
 * Wait for an SSE event-type frame on the chat stream. The chat SSE
 * stream URL contains `/stream` with content-type text/event-stream.
 * Frames are parsed for `event: <eventType>` markers.
 *
 * Specs should call it BEFORE awaiting the action that triggers the
 * stream — store the promise, fire the click, then await.
 */
export async function waitForSseEvent<T = Record<string, unknown>>(
  page: Page,
  eventType: string,
  options: WaitOptions = {}
): Promise<T> {
  const { match = {}, timeoutMs = 15_000 } = options;
  const response = await page.waitForResponse(
    (r) =>
      r.url().includes('/stream') &&
      (r.headers()['content-type'] ?? '').includes('text/event-stream'),
    { timeout: timeoutMs }
  );
  let text = '';
  try {
    text = (await response.text()) ?? '';
  } catch {
    text = '';
  }
  // Server-sent frames: `event: <type>\ndata: <json>\n\n`
  const frames = text.split('\n\n');
  for (const frame of frames) {
    const lines = frame.split('\n');
    const eventLine = lines.find((l) => l.startsWith('event: '));
    const dataLine = lines.find((l) => l.startsWith('data: '));
    if (!eventLine || !dataLine) continue;
    const evType = eventLine.slice('event: '.length).trim();
    if (evType !== eventType) continue;
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(dataLine.slice('data: '.length)) as Record<string, unknown>;
    } catch {
      continue;
    }
    const ok = Object.entries(match).every(([k, v]) => payload[k] === v);
    if (ok) return payload as T;
  }
  throw new Error(
    `[sse-helpers] SSE frame '${eventType}' not observed within ${timeoutMs}ms ` +
      `or did not satisfy match=${JSON.stringify(match)}.`
  );
}
