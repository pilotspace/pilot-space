'use client';

/**
 * Member profile page — /[workspaceSlug]/members/[userId]
 *
 * Passes workspace/user context to the client MemberProfilePage.
 * workspaceId is resolved client-side from WorkspaceStore using the slug.
 *
 * Converted from server component to client component for static export
 * (NEXT_TAURI=true) compatibility. generateMetadata removed (not applicable
 * in static export; web mode uses client-side title updates instead).
 */

import { useParams } from 'next/navigation';
import { notFound } from 'next/navigation';
import { MemberProfilePage } from '@/features/members';

export default function MemberProfileRoute() {
  const params = useParams<{ workspaceSlug: string; userId: string }>();
  const { workspaceSlug, userId } = params;

  if (!workspaceSlug || !userId) {
    notFound();
  }

  return <MemberProfilePage workspaceSlug={workspaceSlug} userId={userId} />;
}
