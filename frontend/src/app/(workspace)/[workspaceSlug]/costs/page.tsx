'use client';

/**
 * AI Costs Route - Cost dashboard for workspace AI usage.
 *
 * Route: /[workspaceSlug]/costs
 * Access: Workspace admins only
 *
 * Displays:
 * - Cost summary cards
 * - Cost by agent chart
 * - Cost trends over time
 * - User cost breakdown table
 *
 * Converted from server component to client component for static export
 * (NEXT_TAURI=true) compatibility. Metadata removed (not applicable in
 * static export; workspaceSlug resolved via useParams at runtime).
 */

import { useParams } from 'next/navigation';
import { CostDashboardPage } from '@/features/costs/pages/cost-dashboard-page';

export default function CostsPage() {
  const params = useParams<{ workspaceSlug: string }>();
  // TODO: Resolve workspaceId from slug via workspace store
  const workspaceId = params.workspaceSlug;

  return <CostDashboardPage workspaceId={workspaceId} />;
}
