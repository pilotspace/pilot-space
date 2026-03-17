/**
 * SSE streaming proxy for AI chat.
 *
 * Next.js rewrites buffer entire responses before forwarding, breaking SSE.
 * This route handler streams chunks from the backend in real-time using
 * ReadableStream, bypassing the rewrite proxy for this endpoint only.
 */

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();

  // Forward all relevant headers to backend
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  for (const key of ['authorization', 'x-workspace-id', 'x-correlation-id']) {
    const value = request.headers.get(key);
    if (value) {
      headers[key] = value;
    }
  }

  const backendResponse = await fetch(`${BACKEND_URL}/api/v1/ai/chat`, {
    method: 'POST',
    headers,
    body,
  });

  if (!backendResponse.ok || !backendResponse.body) {
    // Non-streaming error — forward as-is
    const errorBody = await backendResponse.text();
    return new Response(errorBody, {
      status: backendResponse.status,
      headers: {
        'Content-Type': backendResponse.headers.get('Content-Type') ?? 'application/json',
      },
    });
  }

  // Stream the SSE response through without buffering
  const stream = new ReadableStream({
    async start(controller) {
      const reader = backendResponse.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch {
        // Client disconnected or backend error — close cleanly
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
    cancel() {
      // Client disconnected — abort the backend request
      backendResponse.body?.cancel();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
