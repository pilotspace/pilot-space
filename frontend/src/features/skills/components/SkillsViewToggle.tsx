/**
 * SkillsViewToggle — segmented [Cards | Graph] toggle (Phase 92 Plan 03 Task 1).
 *
 * Tabs primitive styled as a segmented control per UI-SPEC §Surface 3. Sits
 * in the Skills gallery header (right of the count badge) and emits a
 * SkillsViewMode change upward; the parent owns the URL-bound state via
 * `useSkillsViewQueryStringSync`.
 *
 * Content (TabsContent) is intentionally NOT rendered here — the gallery
 * page conditionally mounts the Cards grid or `<SkillGraphView />` so the
 * graph layout pipeline doesn't run while invisible (Design-Debt #9).
 *
 * Decision lock (UI-SPEC OQ1): no new shadcn primitive — Tabs already gives
 * us tablist semantics, arrow-key nav between triggers, and `aria-selected`.
 */
'use client';

import { GitFork, LayoutGrid } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SkillsViewMode } from '../hooks/useSkillsViewQueryStringSync';

export interface SkillsViewToggleProps {
  value: SkillsViewMode;
  onValueChange: (next: SkillsViewMode) => void;
}

export function SkillsViewToggle({
  value,
  onValueChange,
}: SkillsViewToggleProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onValueChange(v as SkillsViewMode)}
    >
      <TabsList aria-label="Skills view">
        <TabsTrigger value="cards">
          <LayoutGrid
            className="h-3.5 w-3.5"
            strokeWidth={1.5}
            aria-hidden
          />
          Cards
        </TabsTrigger>
        <TabsTrigger value="graph">
          <GitFork
            className="h-3.5 w-3.5 rotate-90"
            strokeWidth={1.5}
            aria-hidden
          />
          Graph
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
