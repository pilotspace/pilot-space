import type { ReactNode } from 'react';
import ProjectDetailLayout from './project-detail-layout';

/**
 * Project detail layout — Server Component wrapper.
 *
 * Exports generateStaticParams with a placeholder so that static export
 * (NEXT_TAURI=true) builds succeed. The actual client-side layout logic
 * lives in project-detail-layout.tsx.
 *
 * All actual navigation is client-side via router.push().
 * The projectId '_' placeholder is never served in production.
 */

export function generateStaticParams() {
  return [{ projectId: '_' }];
}

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return <ProjectDetailLayout>{children}</ProjectDetailLayout>;
}
