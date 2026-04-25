/**
 * Skill detail route — Phase 91 Plan 04.
 *
 * Mounts SkillDetailPage; the page itself reads `skillSlug` and
 * `workspaceSlug` via `useParams()`, so this shim doesn't need to forward
 * them as props.
 */
import { SkillDetailPage } from '@/features/skills';

export default function SkillDetailRoute() {
  return <SkillDetailPage />;
}
