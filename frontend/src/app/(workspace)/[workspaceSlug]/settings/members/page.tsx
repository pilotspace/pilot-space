'use client';

/**
 * Settings members redirect — migrated to top-level /members route.
 *
 * Converted from server redirect to client redirect for static export
 * (NEXT_TAURI=true) compatibility.
 */

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MembersSettingsRedirect() {
  const params = useParams<{ workspaceSlug: string }>();
  const router = useRouter();

  useEffect(() => {
    if (params.workspaceSlug) {
      router.replace(`/${params.workspaceSlug}/members`);
    }
  }, [params.workspaceSlug, router]);

  return null;
}
