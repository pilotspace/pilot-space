/**
 * User-visible display labels for artifact types.
 *
 * Internal identifier keys (ISSUE, NOTE, ...) are the backend contract and MUST NOT change.
 * To surface a new display label, update this map — do NOT rename the backend.
 *
 * See .planning/PROJECT.md → "Out of Scope — Task/Topic Rename Cascade".
 * Extended in Phase 85 to cover all 12 artifact types + SKILL.
 */

export const ARTIFACT_TYPE_LABEL = {
  ISSUE: { singular: 'Task', plural: 'Tasks' },
  NOTE: { singular: 'Topic', plural: 'Topics' },
  SPEC: { singular: 'Spec', plural: 'Specs' },
  DECISION: { singular: 'Decision', plural: 'Decisions' },
  SKILL: { singular: 'Skill', plural: 'Skills' },
  MD: { singular: 'MD', plural: 'MD' },
  HTML: { singular: 'HTML', plural: 'HTML' },
  CODE: { singular: 'Code', plural: 'Code' },
  PDF: { singular: 'PDF', plural: 'PDF' },
  CSV: { singular: 'CSV', plural: 'CSV' },
  IMG: { singular: 'Image', plural: 'Images' },
  PPTX: { singular: 'Slides', plural: 'Slides' },
  LINK: { singular: 'Link', plural: 'Links' },
} as const;

export type ArtifactInternalType = keyof typeof ARTIFACT_TYPE_LABEL;

export function artifactLabel(type: ArtifactInternalType, plural = false): string {
  const entry = ARTIFACT_TYPE_LABEL[type];
  return plural ? entry.plural : entry.singular;
}
