/**
 * Workspace-slug-scoped layout — Server Component wrapper.
 *
 * This Server Component exports generateStaticParams so that the static export
 * (NEXT_TAURI=true) build succeeds. The actual client-side layout logic lives
 * in workspace-slug-layout.tsx (a Client Component).
 *
 * generateStaticParams returns [] because workspace slugs are runtime user data
 * (not known at build time). All navigation is client-side via router.push();
 * useParams() resolves the slug after hydration.
 */

import type { ReactNode } from 'react';
import { WorkspaceSlugLayout } from './workspace-slug-layout';

export function generateStaticParams() {
  // Returns a minimal placeholder so that static export builds succeed.
  // This placeholder page is never served — all actual navigation is client-side
  // via router.push(), and useParams() resolves the real slug after hydration.
  // The Tauri WebView always starts at / and navigates client-side to the workspace.
  return [{ workspaceSlug: '_' }];
}

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return <WorkspaceSlugLayout>{children}</WorkspaceSlugLayout>;
}
