/**
 * ArtifactCard Visual Reference — Phase 85.
 *
 * Renders every type × density combination plus children slot, skeletons,
 * and an interactive card for manual keyboard/focus testing.
 *
 * Spec: `.planning/phases/85-unified-artifact-card-anatomy/85-UI-SPEC.md` §11.
 *
 * Route: /admin/design/artifact-card
 */
'use client';

import {
  ArtifactCard,
  ArtifactCardSkeleton,
  type ArtifactCardDensity,
} from '@/components/artifacts';
import { ARTIFACT_TYPE_TOKENS, type ArtifactTokenKey } from '@/lib/artifact-tokens';

interface SampleCard {
  type: ArtifactTokenKey;
  id: string;
  title: string;
  projectName: string;
  projectColor: string;
  snippet?: string;
  offsetMs: number;
}

const NOW = Date.now();

const SAMPLE_CARDS: SampleCard[] = [
  {
    type: 'NOTE',
    id: 'n1',
    title: 'Q4 planning — product roadmap and OKRs',
    projectName: 'Pilot Space',
    projectColor: '#29a386',
    snippet: 'Outline of H2 priorities across AI, platform, and growth.',
    offsetMs: 1000 * 60 * 60 * 3,
  },
  {
    type: 'ISSUE',
    id: 'i1',
    title: 'Flaky CI run on integration suite',
    projectName: 'Platform',
    projectColor: '#3b82f6',
    snippet: 'Intermittent timeout in WS reconnect tests on the main branch.',
    offsetMs: 1000 * 60 * 30,
  },
  {
    type: 'SPEC',
    id: 's1',
    title: 'Unified ArtifactCard anatomy',
    projectName: 'Design System',
    projectColor: '#8b5cf6',
    snippet: '12 types × 3 densities rendered through a single component.',
    offsetMs: 1000 * 60 * 60 * 24,
  },
  {
    type: 'DECISION',
    id: 'd1',
    title: 'Adopt TanStack Query for all server state',
    projectName: 'Architecture',
    projectColor: '#d9853f',
    snippet: 'Replaces ad-hoc fetch patterns; MobX reserved for UI state.',
    offsetMs: 1000 * 60 * 60 * 48,
  },
  {
    type: 'MD',
    id: 'md1',
    title: 'README.md — onboarding guide',
    projectName: 'Docs',
    projectColor: '#29a386',
    snippet: 'Setup, environment, and first-run workflow for new engineers.',
    offsetMs: 1000 * 60 * 60 * 8,
  },
  {
    type: 'HTML',
    id: 'h1',
    title: 'release-notes.html',
    projectName: 'Marketing',
    projectColor: '#e67e22',
    snippet: 'Generated changelog for v1.0.0-alpha5 stakeholder review.',
    offsetMs: 1000 * 60 * 60 * 12,
  },
  {
    type: 'CODE',
    id: 'c1',
    title: 'artifact-tokens.ts',
    projectName: 'Frontend',
    projectColor: '#1a1a2e',
    snippet: 'Single source of truth for artifact type colors.',
    offsetMs: 1000 * 60 * 5,
  },
  {
    type: 'PDF',
    id: 'p1',
    title: 'Q3-financials-report.pdf',
    projectName: 'Finance',
    projectColor: '#d9534f',
    snippet: '28-page report — revenue, burn, runway.',
    offsetMs: 1000 * 60 * 60 * 72,
  },
  {
    type: 'CSV',
    id: 'csv1',
    title: 'user-events-2026-04.csv',
    projectName: 'Analytics',
    projectColor: '#059669',
    snippet: '12,493 rows · event_type, user_id, ts, payload.',
    offsetMs: 1000 * 60 * 60 * 4,
  },
  {
    type: 'IMG',
    id: 'img1',
    title: 'onboarding-hero.png',
    projectName: 'Brand',
    projectColor: '#db2777',
    snippet: '2560×1440 hero shot for the welcome screen.',
    offsetMs: 1000 * 60 * 60 * 2,
  },
  {
    type: 'PPTX',
    id: 'pptx1',
    title: 'Investor deck — Series A.pptx',
    projectName: 'Exec',
    projectColor: '#be123c',
    snippet: '24 slides — traction, team, ask.',
    offsetMs: 1000 * 60 * 60 * 96,
  },
  {
    type: 'LINK',
    id: 'l1',
    title: 'Figma — ArtifactCard references',
    projectName: 'Design',
    projectColor: '#7c3aed',
    snippet: 'figma.com/file/.../artifact-card-v4',
    offsetMs: 1000 * 60 * 60 * 6,
  },
];

const TIER_1: ArtifactTokenKey[] = ['NOTE', 'ISSUE', 'SPEC', 'DECISION'];
const TIER_2: ArtifactTokenKey[] = ['MD', 'HTML', 'CODE', 'PDF', 'CSV', 'IMG', 'PPTX', 'LINK'];

function sampleFor(type: ArtifactTokenKey): SampleCard {
  const found = SAMPLE_CARDS.find((s) => s.type === type);
  if (!found) {
    throw new Error(`No sample for type ${type}`);
  }
  return found;
}

function cardProps(type: ArtifactTokenKey, density: ArtifactCardDensity) {
  const sample = sampleFor(type);
  return {
    type,
    id: sample.id,
    title: sample.title,
    projectName: sample.projectName,
    projectColor: sample.projectColor,
    snippet: sample.snippet,
    updatedAt: new Date(NOW - sample.offsetMs),
    density,
  };
}

export default function ArtifactCardVisualReferencePage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-10 border-b border-border pb-6">
        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Phase 85 · Design Reference
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          ArtifactCard — Visual Reference
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every artifact type rendered through a single component across three density variants.
          Consumers for Phases 86-91 (Peek drawer, chat inline, homepage refs, skills gallery)
          render through this component rather than bespoke cards.
        </p>
      </header>

      <Section
        eyebrow="Tier 1"
        title="Native artifacts — Full density"
        description="NOTE, ISSUE, SPEC, DECISION"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TIER_1.map((type) => (
            <ArtifactCard key={type} {...cardProps(type, 'full')} />
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Tier 2"
        title="File artifacts — Full density"
        description="MD, HTML, CODE, PDF, CSV, IMG, PPTX, LINK"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TIER_2.map((type) => (
            <ArtifactCard key={type} {...cardProps(type, 'full')} />
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Density"
        title="Preview density"
        description="72px gradient, p-3 body — chat inline and sprint cards (Phase 87)."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...TIER_1, ...TIER_2].map((type) => (
            <ArtifactCard key={type} {...cardProps(type, 'preview')} />
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Density"
        title="Compact density"
        description="No gradient, inline badge — homepage refs, search results, mentions."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[...TIER_1, ...TIER_2].map((type) => (
            <ArtifactCard key={type} {...cardProps(type, 'compact')} />
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Slot"
        title="Children slot — Tier 2 renderers"
        description="Bordered container under meta row, max-height 320px overflow-hidden."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ArtifactCard {...cardProps('ISSUE', 'full')}>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>- [ ] Reproduce on main</li>
              <li>- [ ] Bisect failing commit</li>
              <li>- [ ] Add regression test</li>
              <li>- [ ] Open PR</li>
            </ul>
          </ArtifactCard>

          <ArtifactCard {...cardProps('CSV', 'full')}>
            <div className="overflow-hidden rounded-md border border-border/60">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1">event_type</th>
                    <th className="px-2 py-1">user_id</th>
                    <th className="px-2 py-1">ts</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/60">
                    <td className="px-2 py-1 font-mono">page_view</td>
                    <td className="px-2 py-1 font-mono">u_9f3</td>
                    <td className="px-2 py-1 font-mono">16:04:12</td>
                  </tr>
                  <tr className="border-t border-border/60">
                    <td className="px-2 py-1 font-mono">click</td>
                    <td className="px-2 py-1 font-mono">u_2ab</td>
                    <td className="px-2 py-1 font-mono">16:04:18</td>
                  </tr>
                  <tr className="border-t border-border/60">
                    <td className="px-2 py-1 font-mono">signup</td>
                    <td className="px-2 py-1 font-mono">u_7cd</td>
                    <td className="px-2 py-1 font-mono">16:04:44</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ArtifactCard>

          <ArtifactCard {...cardProps('PDF', 'full')}>
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border/60 text-xs text-muted-foreground">
              [PDF thumbnail placeholder]
            </div>
          </ArtifactCard>
        </div>
      </Section>

      <Section
        eyebrow="States"
        title="Loading skeletons"
        description="role=status · aria-busy=true · one per density."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ArtifactCardSkeleton density="full" />
          <ArtifactCardSkeleton density="preview" />
          <ArtifactCardSkeleton density="compact" />
        </div>
      </Section>

      <Section
        eyebrow="Interactive"
        title="Keyboard & focus test"
        description="Tab to focus · Enter or Space fires onClick · hover for shadow."
      >
        <div className="max-w-md">
          <ArtifactCard
            {...cardProps('NOTE', 'full')}
            onClick={() => {
              console.log('ArtifactCard clicked');
            }}
          />
        </div>
      </Section>

      <Section
        eyebrow="Tokens"
        title="Token reference"
        description="Raw accent and gradient stops for each type (developer reference)."
      >
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Accent</th>
                <th className="px-3 py-2">Gradient</th>
                <th className="px-3 py-2">Badge</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(ARTIFACT_TYPE_TOKENS) as ArtifactTokenKey[]).map((key) => {
                const t = ARTIFACT_TYPE_TOKENS[key];
                return (
                  <tr key={key} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{key}</td>
                    <td className="px-3 py-2 text-xs">Tier {t.tier}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2 font-mono text-xs">
                        <span
                          className="h-4 w-4 rounded border border-border"
                          style={{ backgroundColor: t.accent }}
                          aria-hidden
                        />
                        {t.accent}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block h-6 w-24 rounded border border-border"
                        style={{ background: `linear-gradient(to bottom, ${t.gStart}, ${t.gEnd})` }}
                        aria-hidden
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
                        style={{ backgroundColor: t.badgeBg, color: t.badgeText }}
                      >
                        {key}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <div className="mb-4">
        <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
