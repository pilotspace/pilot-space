import { NextResponse } from 'next/server';

/**
 * Health check endpoint for Docker/Kubernetes probes
 *
 * Returns:
 * - 200 OK when the application is healthy
 * - Used by Docker HEALTHCHECK and Kubernetes liveness/readiness probes
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'pilot-space-frontend',
    },
    { status: 200 }
  );
}

// force-static allows this route to be included in static export builds (NEXT_TAURI=true).
// In standalone (web) mode, route handlers always execute per-request regardless of this value.
export const dynamic = 'force-static';
