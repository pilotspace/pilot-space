/**
 * Skill Generator edit page route — edit an existing skill template.
 *
 * Route: /[workspaceSlug]/skills/generator/[skillId]
 */

'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const SkillGeneratorPage = dynamic(
  () =>
    import('@/features/skills/components/generator/SkillGeneratorPage').then(
      (mod) => mod.SkillGeneratorPage,
    ),
  { ssr: false },
);

export default function GeneratorEditPage() {
  const params = useParams();
  const skillId = params?.skillId as string;

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SkillGeneratorPage skillId={skillId} />
    </Suspense>
  );
}
