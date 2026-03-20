'use client';

/**
 * Project detail redirect — redirects to the project overview sub-page.
 *
 * Converted from server redirect to client redirect for static export
 * (NEXT_TAURI=true) compatibility.
 */

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProjectDetailPage() {
  const params = useParams<{ workspaceSlug: string; projectId: string }>();
  const router = useRouter();

  useEffect(() => {
    if (params.workspaceSlug && params.projectId) {
      router.replace(`/${params.workspaceSlug}/projects/${params.projectId}/overview`);
    }
  }, [params.workspaceSlug, params.projectId, router]);

  return null;
}
