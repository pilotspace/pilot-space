'use client';

/**
 * Docs Index Route — redirects to the default documentation page.
 *
 * Route: /[workspaceSlug]/docs
 *
 * Converted from Server Component (which used server-only `redirect()`) to
 * client component for static export compatibility (NEXT_TAURI=true build mode).
 */

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { defaultDocSlug } from '@/features/docs';

export default function DocsIndexPage() {
  const params = useParams<{ workspaceSlug: string }>();
  const router = useRouter();

  useEffect(() => {
    if (params.workspaceSlug) {
      router.replace(`/${params.workspaceSlug}/docs/${defaultDocSlug}`);
    }
  }, [params.workspaceSlug, router]);

  return null;
}
