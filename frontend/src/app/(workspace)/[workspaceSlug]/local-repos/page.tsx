'use client';

/**
 * Local Repos Route - Desktop-only project dashboard.
 *
 * Route: /[workspaceSlug]/local-repos
 * Access: Desktop (Tauri) only — displays a fallback in the browser.
 *
 * Renders ProjectDashboard when running inside the Tauri shell.
 * Shows a graceful fallback message in browser context.
 *
 * Converted as a client component for static export (NEXT_TAURI=true) compatibility.
 */

import { ProjectDashboard } from '@/features/projects';
import { isTauri } from '@/lib/tauri';

export default function LocalReposPage() {
  if (!isTauri()) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Local repository management is only available in the desktop app.
        </p>
      </div>
    );
  }
  return <ProjectDashboard />;
}
