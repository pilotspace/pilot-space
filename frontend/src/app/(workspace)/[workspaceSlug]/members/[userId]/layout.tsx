import type { ReactNode } from 'react';

/**
 * Layout for [userId] — provides generateStaticParams for static export.
 *
 * Returns a placeholder param so that NEXT_TAURI=true builds succeed.
 * All actual navigation is client-side; the placeholder is never served.
 */

export function generateStaticParams() {
  return [{ userId: '_' }];
}

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return <>{children}</>;
}
