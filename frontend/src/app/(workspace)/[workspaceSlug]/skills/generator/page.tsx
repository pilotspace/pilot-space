/**
 * Skill Generator page route — create a new skill with graph + chat + preview.
 *
 * Route: /[workspaceSlug]/skills/generator
 */

'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const SkillGeneratorPage = dynamic(
  () =>
    import('@/features/skills/components/generator/SkillGeneratorPage').then(
      (mod) => mod.SkillGeneratorPage,
    ),
  { ssr: false },
);

export default function GeneratorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SkillGeneratorPage />
    </Suspense>
  );
}
